import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export type FirebaseIdentity = {
  uid: string;
  email: string;
  displayName: string;
  idToken: string;
  emailVerified: boolean;
  signInProvider: string;
  admin: boolean;
  decodedToken: DecodedIdToken;
};

export class FirebaseAdminConfigurationError extends Error {
  constructor() {
    super("FIREBASE_ADMIN_NOT_CONFIGURED");
    this.name = "FirebaseAdminConfigurationError";
  }
}

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey) throw new FirebaseAdminConfigurationError();
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}

export function getAdminFirestore(): Firestore {
  return getFirestore(adminApp());
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdentity> {
  const decodedToken = await getAuth(adminApp()).verifyIdToken(idToken, true);
  const signInProvider = typeof decodedToken.firebase?.sign_in_provider === "string"
    ? decodedToken.firebase.sign_in_provider
    : "";

  return {
    uid: decodedToken.uid,
    email: typeof decodedToken.email === "string" ? decodedToken.email : "",
    displayName: typeof decodedToken.name === "string" ? decodedToken.name : "",
    idToken,
    emailVerified: decodedToken.email_verified === true,
    signInProvider,
    admin: decodedToken.admin === true,
    decodedToken,
  };
}
