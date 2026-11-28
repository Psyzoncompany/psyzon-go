export type BackupKind = "weekly" | "manual" | "before-restore";
export type BackupInfo = {
  id: string; kind: BackupKind; createdAt: string; verifiedAt: string;
  documents: number; bytes: number; counts: Record<string, number>;
};
export type BackupStatus = {
  enabled: boolean; nextRun: string; backups: BackupInfo[];
  lastError?: string; working?: boolean;
};
export type RestorePreview = {
  token: string; backup: BackupInfo; expiresAt: string;
  added: number; changed: number; removed: number; unchanged: number;
};

export function nextWeeklyBackup(now = new Date()) {
  // Bahia is UTC-03:00. Sunday 03:00 is Sunday 06:00 UTC.
  const next = new Date(now);
  next.setUTCHours(6, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + (7 - next.getUTCDay()) % 7);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString();
}

export function weeklyBackupId(now = new Date()) {
  const start = new Date(now.getTime() - 3 * 3600_000);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return "weekly-" + start.toISOString().slice(0, 10);
}
