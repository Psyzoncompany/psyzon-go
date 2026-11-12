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
  tone?: "positive" | "negative" | "neutral" | "info";
};

export type AIAlert = {
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info" | "success";
  entityType?: "order" | "transaction" | "client" | "finance";
  entityId?: string;
};

export type AIViewTarget = "inicio" | "producao" | "clientes" | "financeiro" | "pessoal" | "notas" | "materiais" | "reposicao" | "costureiras" | "afazeres" | "dtf" | "historico" | "ai";

export const aiViewTargets: ReadonlySet<string> = new Set(["inicio", "producao", "clientes", "financeiro", "pessoal", "notas", "materiais", "reposicao", "costureiras", "afazeres", "dtf", "historico", "ai"]);

export type AIAction = {
  label: string;
  type: "navigate" | "prompt";
  target?: AIViewTarget;
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

export type AIFinanceEntry = { id: string; description: string; dueDate: string | null; amount: number; category: string };

export type AIFinanceReport = {
  asOf: string;
  overdueTotal: number;
  totalPayables: number;
  totalReceivables: number;
  payableCount: number;
  receivableCount: number;
  payables: AIFinanceEntry[];
  receivables: AIFinanceEntry[];
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
  financeReport?: AIFinanceReport;
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
