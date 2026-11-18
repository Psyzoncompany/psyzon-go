import { onSnapshot, type DocumentReference, type DocumentSnapshot } from "firebase/firestore";

// Offline writes become usable once Firestore has applied them to its local cache.
export function acceptFirestoreWrite(
  ref: DocumentReference,
  write: Promise<void>,
  onRejectedAfterLocalSave: (error: unknown) => void,
  deleted = false,
) {
  return new Promise<void>((resolve, reject) => {
    let savedLocally = false;
    const unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, (snapshot: DocumentSnapshot) => {
      if (!snapshot.metadata.fromCache && navigator.onLine) return;
      if (deleted ? snapshot.exists() : !snapshot.metadata.hasPendingWrites) return;
      savedLocally = true;
      unsubscribe();
      resolve();
    }, () => { /* The write promise reports the authoritative failure. */ });
    void write.then(() => {
      unsubscribe();
      resolve();
    }, error => {
      unsubscribe();
      if (savedLocally) onRejectedAfterLocalSave(error);
      else reject(error);
    });
  });
}
