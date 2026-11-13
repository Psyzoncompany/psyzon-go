export const prepareReloadEvent="psyzon-prepare-reload";
export type PrepareReload = { waitUntil: (saving: Promise<boolean>) => void };
