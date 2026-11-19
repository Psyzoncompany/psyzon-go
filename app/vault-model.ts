export const vaultCategories = ["Pessoal", "Bancária", "Cartões", "Empresarial"] as const;
export type VaultEntry = { id: string; category: typeof vaultCategories[number]; title: string; login: string; secret: string };

type EncryptedVault = { version: 1; salt: string; iv: string; data: string };
const encoder = new TextEncoder();
export const maxVaultSize = 1_000_000;
export const vaultKey = (uid: string) => `psyzon:private-vault:v1:${uid}`;

export function parseVault(serialized: string): EncryptedVault {
  if (serialized.length > maxVaultSize) throw new Error("Arquivo grande demais.");
  const value: Partial<EncryptedVault> | null = JSON.parse(serialized);
  if (!value || value.version !== 1 || typeof value.salt !== "string" || typeof value.iv !== "string" || typeof value.data !== "string" ||
    atob(value.salt).length !== 16 || atob(value.iv).length !== 12 || atob(value.data).length < 16) throw new Error("Cópia de segurança inválida.");
  return { version: 1, salt: value.salt, iv: value.iv, data: value.data };
}

const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
function encode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const newVaultSalt = () => encode(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveVaultKey(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: decode(salt), iterations: 600_000, hash: "SHA-256" }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptVault(entries: VaultEntry[], key: CryptoKey, salt: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(entries)));
  const result = JSON.stringify({ version: 1, salt, iv: encode(iv), data: encode(new Uint8Array(data)) });
  if (result.length > maxVaultSize) throw new Error("O cofre atingiu o limite de armazenamento.");
  return result;
}

export async function decryptVault(value: EncryptedVault, key: CryptoKey): Promise<VaultEntry[]> {
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(value.iv) }, key, decode(value.data));
  const entries: VaultEntry[] = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(entries) || entries.some(item => !item || typeof item.id !== "string" || !vaultCategories.includes(item.category) ||
    typeof item.title !== "string" || typeof item.login !== "string" || typeof item.secret !== "string") ||
    new Set(entries.map(item => item.id)).size !== entries.length) throw new Error("Dados do cofre inválidos.");
  return entries;
}

export function searchVault(entries: VaultEntry[], query: string, category: VaultEntry["category"] | "Todas") {
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
  const terms = normalize(query.trim()).split(/\s+/);
  return entries.filter(item => (category === "Todas" || category === item.category) &&
    terms.every(term => normalize(`${item.title} ${item.login} ${item.category}`).includes(term)));
}
