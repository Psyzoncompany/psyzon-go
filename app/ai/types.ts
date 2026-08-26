export type AIPermissionMode = "read_only" | "administrative" | "financial_confirm";
export type AIProviderPreference = "auto" | "deepseek" | "groq" | "gemini";

export type AISettings = {
  enabled: boolean;
  permissionMode: AIPermissionMode;
  preferredProvider: AIProviderPreference;
  saveHistory: boolean;
  showDashboardSummary: boolean;
  financialAnalysis: boolean;
  mercadoPagoEnabled: boolean;
};

export type AIMetric = {
  label: string;
  value: string;
  trend?: string;
  tone?: "positive" | "negative" | "neutral";
};

export type AIAlert = {
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info" | "success";
  entityType?: "order" | "transaction" | "client" | "finance";
  entityId?: string;
};

export type AIAction = {
  label: string;
  type: "navigate" | "prompt";
  target?: "inicio" | "producao" | "clientes" | "financeiro" | "pessoal" | "ai";
  prompt?: string;
};

export type AIConfirmation = {
  id: string;
  action: string;
  currentValue?: string;
  newValue?: string;
  reason: string;
  impact: string;
  expiresAt: number;
};

export type AIResponsePayload = {
  summary: string;
  severity: "normal" | "info" | "warning" | "critical";
  metrics: AIMetric[];
  alerts: AIAlert[];
  recommendations: string[];
  actions: AIAction[];
  confidence?: "alta" | "média" | "baixa";
  sources?: string[];
  confirmation?: AIConfirmation;
};

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  payload?: AIResponsePayload;
  toolNames?: string[];
  createdAt: number;
};

export type AIConversation = {
  id: string;
  title: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
};

export type AIIntegrationStatus = {
  ai: {
    configured: boolean;
    provider: string;
    model: string;
    options: Array<{ id: Exclude<AIProviderPreference, "auto">; label: string; model: string; configured: boolean }>;
  };
  mercadoPago: {
    configured: boolean;
    enabled: boolean;
    status: string;
    lastSyncedAt: number | null;
    lastError: string | null;
    recordsChecked: number;
  };
};
