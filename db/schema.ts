import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
}, (table) => [index("ai_conversations_user_updated_idx").on(table.userId, table.updatedAt)]);

export const aiMessages = sqliteTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  toolNames: text("tool_names").notNull().default("[]"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (table) => [index("ai_messages_conversation_created_idx").on(table.conversationId, table.createdAt)]);

export const aiSettings = sqliteTable("ai_settings", {
  userId: text("user_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  permissionMode: text("permission_mode", { enum: ["read_only", "administrative", "financial_confirm"] }).notNull().default("read_only"),
  saveHistory: integer("save_history", { mode: "boolean" }).notNull().default(true),
  showDashboardSummary: integer("show_dashboard_summary", { mode: "boolean" }).notNull().default(true),
  financialAnalysis: integer("financial_analysis", { mode: "boolean" }).notNull().default(true),
  mercadoPagoEnabled: integer("mercado_pago_enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const aiAuditLogs = sqliteTable("ai_audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  tool: text("tool").notNull(),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  argumentsSanitized: text("arguments_sanitized").notNull().default("{}"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  status: text("status").notNull(),
  riskLevel: integer("risk_level").notNull(),
  requiresConfirmation: integer("requires_confirmation", { mode: "boolean" }).notNull().default(false),
  approvedBy: text("approved_by"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (table) => [index("ai_audit_user_created_idx").on(table.userId, table.createdAt)]);

export const aiConfirmations = sqliteTable("ai_confirmations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  tool: text("tool").notNull(),
  argumentsJson: text("arguments_json").notNull(),
  previewJson: text("preview_json").notNull(),
  status: text("status", { enum: ["pending", "confirmed", "cancelled", "expired"] }).notNull().default("pending"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (table) => [index("ai_confirmations_user_status_idx").on(table.userId, table.status)]);

export const aiUsage = sqliteTable("ai_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  toolCalls: integer("tool_calls").notNull().default(0),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (table) => [index("ai_usage_user_created_idx").on(table.userId, table.createdAt)]);

export const aiRateLimits = sqliteTable("ai_rate_limits", {
  userId: text("user_id").notNull(),
  windowStart: integer("window_start").notNull(),
  requestCount: integer("request_count").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.userId, table.windowStart] })]);

export const mercadoPagoPayments = sqliteTable("mercado_pago_payments", {
  paymentId: text("payment_id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  externalReference: text("external_reference"),
  description: text("description"),
  status: text("status").notNull(),
  statusDetail: text("status_detail"),
  amountCents: integer("amount_cents").notNull(),
  netAmountCents: integer("net_amount_cents"),
  feeCents: integer("fee_cents"),
  paymentMethod: text("payment_method"),
  dateCreated: text("date_created"),
  dateApproved: text("date_approved"),
  rawSummaryJson: text("raw_summary_json").notNull().default("{}"),
  lastSyncedAt: integer("last_synced_at").notNull().default(sql`(unixepoch())`),
}, (table) => [
  index("mp_payments_owner_date_idx").on(table.ownerUserId, table.dateCreated),
  index("mp_payments_external_reference_idx").on(table.externalReference),
]);

export const integrationEvents = sqliteTable("integration_events", {
  eventKey: text("event_key").primaryKey(),
  provider: text("provider").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  providerEntityId: text("provider_entity_id"),
  action: text("action"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  receivedAt: integer("received_at").notNull().default(sql`(unixepoch())`),
  processedAt: integer("processed_at"),
}, (table) => [index("integration_events_owner_received_idx").on(table.ownerUserId, table.receivedAt)]);

export const integrationSyncState = sqliteTable("integration_sync_state", {
  ownerUserId: text("owner_user_id").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("not_configured"),
  lastSyncedAt: integer("last_synced_at"),
  lastError: text("last_error"),
  recordsChecked: integer("records_checked").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
}, (table) => [primaryKey({ columns: [table.ownerUserId, table.provider] })]);

export const financialReconciliation = sqliteTable("financial_reconciliation", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  systemTransactionId: text("system_transaction_id"),
  providerPaymentId: text("provider_payment_id"),
  status: text("status").notNull(),
  systemAmountCents: integer("system_amount_cents"),
  providerAmountCents: integer("provider_amount_cents"),
  differenceCents: integer("difference_cents"),
  confidence: text("confidence").notNull().default("high"),
  reason: text("reason"),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
}, (table) => [
  index("reconciliation_owner_status_idx").on(table.ownerUserId, table.status),
  index("reconciliation_provider_payment_idx").on(table.providerPaymentId),
]);
