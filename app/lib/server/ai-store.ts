import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { integrationSyncState } from "../../../db/schema";
import type { AIConversation, AIMessage, AIResponsePayload, AISettings } from "../../ai/types";
import type { FirebaseIdentity } from "./firebase-rest";
import { deleteUserDocument, getUserDocument, listUserCollection, patchUserDocument, setUserDocument } from "./firebase-rest";

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  permissionMode: "read_only",
  saveHistory: true,
  showDashboardSummary: true,
  financialAnalysis: true,
  mercadoPagoEnabled: false,
};

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getAISettings(identity: FirebaseIdentity): Promise<AISettings> {
  const row = await getUserDocument(identity, "aiSettings", "settings");
  if (!row) return DEFAULT_AI_SETTINGS;
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : DEFAULT_AI_SETTINGS.enabled,
    permissionMode: ["read_only", "administrative", "financial_confirm"].includes(String(row.permissionMode)) ? row.permissionMode as AISettings["permissionMode"] : DEFAULT_AI_SETTINGS.permissionMode,
    saveHistory: typeof row.saveHistory === "boolean" ? row.saveHistory : DEFAULT_AI_SETTINGS.saveHistory,
    showDashboardSummary: typeof row.showDashboardSummary === "boolean" ? row.showDashboardSummary : DEFAULT_AI_SETTINGS.showDashboardSummary,
    financialAnalysis: typeof row.financialAnalysis === "boolean" ? row.financialAnalysis : DEFAULT_AI_SETTINGS.financialAnalysis,
    mercadoPagoEnabled: typeof row.mercadoPagoEnabled === "boolean" ? row.mercadoPagoEnabled : DEFAULT_AI_SETTINGS.mercadoPagoEnabled,
  };
}

export async function saveAISettings(identity: FirebaseIdentity, settings: Partial<AISettings>) {
  const next = { ...await getAISettings(identity), ...settings };
  await setUserDocument(identity, "aiSettings", "settings", { ...next, updatedAt: Math.floor(Date.now() / 1000) });
  return next;
}

export async function checkRateLimit(identity: FirebaseIdentity, limit = 24) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % 60);
  const id = String(windowStart);
  const row = await getUserDocument(identity, "aiRateLimits", id);
  const requestCount = numberValue(row?.requestCount) + 1;
  await setUserDocument(identity, "aiRateLimits", id, { windowStart, requestCount, updatedAt: now });
  return { allowed: requestCount <= limit, remaining: Math.max(0, limit - requestCount), retryAfter: 60 - (now - windowStart) };
}

export async function listConversations(identity: FirebaseIdentity): Promise<AIConversation[]> {
  const rows = await listUserCollection(identity, "aiConversations", 100);
  return rows.map((row) => ({
    id: row.id,
    title: String(row.title ?? "Nova conversa"),
    summary: String(row.summary ?? ""),
    createdAt: numberValue(row.createdAt),
    updatedAt: numberValue(row.updatedAt),
  })).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 50);
}

async function createConversation(identity: FirebaseIdentity, title = "Nova conversa") {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await setUserDocument(identity, "aiConversations", id, { title, summary: "", createdAt: now, updatedAt: now });
  return { id, title, createdAt: now, updatedAt: now } satisfies AIConversation;
}

export async function ensureConversation(identity: FirebaseIdentity, conversationId?: string, title?: string) {
  if (conversationId) {
    const existing = await getUserDocument(identity, "aiConversations", conversationId);
    if (existing) return {
      id: existing.id,
      title: String(existing.title ?? "Nova conversa"),
      summary: String(existing.summary ?? ""),
      createdAt: numberValue(existing.createdAt),
      updatedAt: numberValue(existing.updatedAt),
    };
  }
  return createConversation(identity, title);
}

export async function getConversationMessages(identity: FirebaseIdentity, conversationId: string): Promise<AIMessage[]> {
  const rows = await listUserCollection(identity, "aiMessages", 500);
  return rows.filter((row) => row.conversationId === conversationId).map((row) => ({
    id: row.id,
    role: row.role === "user" ? "user" as const : "assistant" as const,
    content: String(row.content ?? ""),
    payload: row.payload && typeof row.payload === "object" ? row.payload as AIResponsePayload : undefined,
    toolNames: Array.isArray(row.toolNames) ? row.toolNames.map(String) : [],
    createdAt: numberValue(row.createdAt),
  })).sort((left, right) => left.createdAt - right.createdAt).slice(-80);
}

export async function saveMessage(identity: FirebaseIdentity, conversationId: string, role: "user" | "assistant", content: string, payload?: AIResponsePayload, toolNames: string[] = []) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await setUserDocument(identity, "aiMessages", id, { conversationId, role, content, payload: payload ?? null, toolNames, createdAt: now });
  await patchUserDocument(identity, "aiConversations", conversationId, { updatedAt: now });
  return { id, role, content, payload, toolNames, createdAt: now } satisfies AIMessage;
}

export async function titleConversation(identity: FirebaseIdentity, conversationId: string, title: string) {
  const cleanTitle = title.replace(/\s+/g, " ").trim().slice(0, 70) || "Conversa com a PSYZON AI";
  await patchUserDocument(identity, "aiConversations", conversationId, { title: cleanTitle });
  return cleanTitle;
}

export async function deleteConversation(identity: FirebaseIdentity, conversationId: string) {
  const messages = await listUserCollection(identity, "aiMessages", 500);
  await Promise.all(messages.filter((row) => row.conversationId === conversationId).map((row) => deleteUserDocument(identity, "aiMessages", row.id)));
  await deleteUserDocument(identity, "aiConversations", conversationId);
}

export async function createConfirmation(input: { identity: FirebaseIdentity; conversationId?: string; tool: string; arguments: unknown; preview: unknown }) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 900;
  await setUserDocument(input.identity, "aiConfirmations", id, { conversationId: input.conversationId ?? null, tool: input.tool, arguments: input.arguments, preview: input.preview, status: "pending", expiresAt, createdAt: now });
  return { id, expiresAt, preview: input.preview };
}

export async function getPendingConfirmation(identity: FirebaseIdentity, id: string) {
  const row = await getUserDocument(identity, "aiConfirmations", id);
  const now = Math.floor(Date.now() / 1000);
  if (!row || row.status !== "pending" || numberValue(row.expiresAt) < now) return null;
  return {
    id: row.id,
    conversationId: typeof row.conversationId === "string" ? row.conversationId : null,
    tool: String(row.tool ?? ""),
    arguments: row.arguments && typeof row.arguments === "object" ? row.arguments as Record<string, unknown> : {},
    preview: row.preview && typeof row.preview === "object" ? row.preview as Record<string, unknown> : {},
    expiresAt: numberValue(row.expiresAt),
  };
}

export async function resolveConfirmation(identity: FirebaseIdentity, id: string, status: "confirmed" | "cancelled") {
  const row = await getUserDocument(identity, "aiConfirmations", id);
  if (row?.status === "pending") await patchUserDocument(identity, "aiConfirmations", id, { status });
}

export async function logAIAudit(input: {
  identity: FirebaseIdentity;
  conversationId?: string;
  tool: string;
  action: string;
  entity?: string;
  entityId?: string;
  arguments?: unknown;
  previousValue?: unknown;
  newValue?: unknown;
  status: string;
  riskLevel: number;
  requiresConfirmation?: boolean;
  approvedBy?: string;
}) {
  const id = crypto.randomUUID();
  await setUserDocument(input.identity, "aiAuditLogs", id, {
    conversationId: input.conversationId ?? null,
    tool: input.tool,
    action: input.action,
    entity: input.entity ?? null,
    entityId: input.entityId ?? null,
    arguments: input.arguments ?? {},
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    status: input.status,
    riskLevel: input.riskLevel,
    requiresConfirmation: input.requiresConfirmation ?? false,
    approvedBy: input.approvedBy ?? null,
    createdAt: Math.floor(Date.now() / 1000),
  });
}

export async function saveAIUsage(input: { identity: FirebaseIdentity; conversationId?: string; model: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; toolCalls: number }) {
  const id = crypto.randomUUID();
  await setUserDocument(input.identity, "aiUsage", id, {
    conversationId: input.conversationId ?? null,
    model: input.model,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    totalTokens: input.totalTokens ?? 0,
    toolCalls: input.toolCalls,
    createdAt: Math.floor(Date.now() / 1000),
  });
}

export async function getIntegrationStatus(userId: string) {
  try {
    const [row] = await getDb().select().from(integrationSyncState).where(and(eq(integrationSyncState.ownerUserId, userId), eq(integrationSyncState.provider, "mercado_pago"))).limit(1);
    return row ?? { status: "not_configured", lastSyncedAt: null, lastError: null, recordsChecked: 0 };
  } catch (error) {
    if (error instanceof Error && error.message === "AI_DATABASE_NOT_CONFIGURED") return { status: "not_configured", lastSyncedAt: null, lastError: null, recordsChecked: 0 };
    throw error;
  }
}
