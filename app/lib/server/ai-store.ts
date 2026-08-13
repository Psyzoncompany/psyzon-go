import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  aiAuditLogs,
  aiConfirmations,
  aiConversations,
  aiMessages,
  aiRateLimits,
  aiSettings,
  aiUsage,
  integrationSyncState,
} from "../../../db/schema";
import type { AIConversation, AIMessage, AIResponsePayload, AISettings } from "../../ai/types";

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  permissionMode: "read_only",
  saveHistory: true,
  showDashboardSummary: true,
  financialAnalysis: true,
  mercadoPagoEnabled: false,
};

export async function getAISettings(userId: string): Promise<AISettings> {
  const [row] = await getDb().select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);
  if (!row) return DEFAULT_AI_SETTINGS;
  return {
    enabled: row.enabled,
    permissionMode: row.permissionMode,
    saveHistory: row.saveHistory,
    showDashboardSummary: row.showDashboardSummary,
    financialAnalysis: row.financialAnalysis,
    mercadoPagoEnabled: row.mercadoPagoEnabled,
  };
}

export async function saveAISettings(userId: string, settings: Partial<AISettings>) {
  const current = await getAISettings(userId);
  const next = { ...current, ...settings };
  await getDb().insert(aiSettings).values({ userId, ...next, updatedAt: Math.floor(Date.now() / 1000) }).onConflictDoUpdate({
    target: aiSettings.userId,
    set: { ...next, updatedAt: Math.floor(Date.now() / 1000) },
  });
  return next;
}

export async function checkRateLimit(userId: string, limit = 24) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % 60);
  const db = getDb();
  await db.insert(aiRateLimits).values({ userId, windowStart, requestCount: 1 }).onConflictDoUpdate({
    target: [aiRateLimits.userId, aiRateLimits.windowStart],
    set: { requestCount: sql`${aiRateLimits.requestCount} + 1` },
  });
  const [row] = await db.select().from(aiRateLimits).where(and(eq(aiRateLimits.userId, userId), eq(aiRateLimits.windowStart, windowStart))).limit(1);
  return { allowed: (row?.requestCount ?? 1) <= limit, remaining: Math.max(0, limit - (row?.requestCount ?? 1)), retryAfter: 60 - (now - windowStart) };
}

export async function listConversations(userId: string): Promise<AIConversation[]> {
  const rows = await getDb().select().from(aiConversations).where(eq(aiConversations.userId, userId)).orderBy(desc(aiConversations.updatedAt)).limit(50);
  return rows.map((row) => ({ id: row.id, title: row.title, summary: row.summary, createdAt: row.createdAt, updatedAt: row.updatedAt }));
}

export async function createConversation(userId: string, title = "Nova conversa") {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await getDb().insert(aiConversations).values({ id, userId, title, createdAt: now, updatedAt: now });
  return { id, title, createdAt: now, updatedAt: now } satisfies AIConversation;
}

export async function ensureConversation(userId: string, conversationId?: string, title?: string) {
  if (conversationId) {
    const [existing] = await getDb().select().from(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId))).limit(1);
    if (existing) return { id: existing.id, title: existing.title, summary: existing.summary, createdAt: existing.createdAt, updatedAt: existing.updatedAt };
  }
  return createConversation(userId, title);
}

export async function getConversationMessages(userId: string, conversationId: string): Promise<AIMessage[]> {
  const rows = await getDb().select().from(aiMessages).where(and(eq(aiMessages.userId, userId), eq(aiMessages.conversationId, conversationId))).orderBy(aiMessages.createdAt).limit(80);
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    payload: JSON.parse(row.payloadJson || "{}") as AIResponsePayload,
    toolNames: JSON.parse(row.toolNames || "[]") as string[],
    createdAt: row.createdAt,
  }));
}

export async function saveMessage(userId: string, conversationId: string, role: "user" | "assistant", content: string, payload?: AIResponsePayload, toolNames: string[] = []) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await getDb().insert(aiMessages).values({ id, userId, conversationId, role, content, payloadJson: JSON.stringify(payload ?? {}), toolNames: JSON.stringify(toolNames), createdAt: now });
  await getDb().update(aiConversations).set({ updatedAt: now }).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
  return { id, role, content, payload, toolNames, createdAt: now } satisfies AIMessage;
}

export async function titleConversation(userId: string, conversationId: string, title: string) {
  const cleanTitle = title.replace(/\s+/g, " ").trim().slice(0, 70) || "Conversa com a PSYZON AI";
  await getDb().update(aiConversations).set({ title: cleanTitle }).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
  return cleanTitle;
}

export async function deleteConversation(userId: string, conversationId: string) {
  const db = getDb();
  await db.delete(aiMessages).where(and(eq(aiMessages.userId, userId), eq(aiMessages.conversationId, conversationId)));
  await db.delete(aiConversations).where(and(eq(aiConversations.userId, userId), eq(aiConversations.id, conversationId)));
}

export async function createConfirmation(input: { userId: string; conversationId?: string; tool: string; arguments: unknown; preview: unknown }) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 900;
  await getDb().insert(aiConfirmations).values({ id, userId: input.userId, conversationId: input.conversationId, tool: input.tool, argumentsJson: JSON.stringify(input.arguments), previewJson: JSON.stringify(input.preview), expiresAt, createdAt: now });
  return { id, expiresAt, preview: input.preview };
}

export async function getPendingConfirmation(userId: string, id: string) {
  const now = Math.floor(Date.now() / 1000);
  const [row] = await getDb().select().from(aiConfirmations).where(and(eq(aiConfirmations.id, id), eq(aiConfirmations.userId, userId), eq(aiConfirmations.status, "pending"), gte(aiConfirmations.expiresAt, now))).limit(1);
  return row ? { ...row, arguments: JSON.parse(row.argumentsJson) as Record<string, unknown>, preview: JSON.parse(row.previewJson) as Record<string, unknown> } : null;
}

export async function resolveConfirmation(userId: string, id: string, status: "confirmed" | "cancelled") {
  await getDb().update(aiConfirmations).set({ status }).where(and(eq(aiConfirmations.id, id), eq(aiConfirmations.userId, userId), eq(aiConfirmations.status, "pending")));
}

export async function logAIAudit(input: {
  userId: string;
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
  await getDb().insert(aiAuditLogs).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    conversationId: input.conversationId,
    tool: input.tool,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    argumentsSanitized: JSON.stringify(input.arguments ?? {}),
    previousValue: input.previousValue === undefined ? null : JSON.stringify(input.previousValue),
    newValue: input.newValue === undefined ? null : JSON.stringify(input.newValue),
    status: input.status,
    riskLevel: input.riskLevel,
    requiresConfirmation: input.requiresConfirmation ?? false,
    approvedBy: input.approvedBy,
  });
}

export async function saveAIUsage(input: { userId: string; conversationId?: string; model: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; toolCalls: number }) {
  await getDb().insert(aiUsage).values({ id: crypto.randomUUID(), ...input });
}

export async function getIntegrationStatus(userId: string) {
  const [row] = await getDb().select().from(integrationSyncState).where(and(eq(integrationSyncState.ownerUserId, userId), eq(integrationSyncState.provider, "mercado_pago"))).limit(1);
  return row ?? { status: "not_configured", lastSyncedAt: null, lastError: null, recordsChecked: 0 };
}
