export type FinancialScope = "personal" | "business";
export type FinancialCategoryKind = "income" | "expense" | "both";

export type FinancialCategorySeed = {
  id: string;
  name: string;
  scope: FinancialScope;
  kind: FinancialCategoryKind;
  icon: string;
  color: string;
  parentId: string | null;
  sortOrder: number;
};

export type FinancialRuleLike = {
  id: string;
  scope: FinancialScope;
  pattern: string;
  categoryId: string;
  enabled?: boolean;
};

export type TransferCandidate = {
  id: string;
  accountId: string;
  amount: number;
  direction: "CREDIT" | "DEBIT";
  date: string;
  currencyCode?: string;
  status?: string;
  internalTransfer?: boolean;
};

const businessIncome = [
  ["venda-camisas", "Venda de camisas", "shirt", "#16a34a"],
  ["serigrafia", "Serigrafia", "palette", "#0d9488"],
  ["dtf-receita", "DTF", "printer", "#2563eb"],
  ["sublimacao", "Sublimação", "sparkles", "#7c3aed"],
  ["outros-servicos", "Outros serviços", "briefcase", "#64748b"],
] as const;

const businessProduction = [
  ["malha", "Malha", "layers", "#d97706"],
  ["tinta", "Tinta", "droplets", "#db2777"],
  ["dtf-producao", "DTF", "printer", "#2563eb"],
  ["embalagens", "Embalagens", "package", "#9333ea"],
  ["aviamentos", "Aviamentos", "scissors", "#0891b2"],
  ["terceirizacao", "Terceirização", "users", "#475569"],
] as const;

const businessExpenses = [
  ["energia", "Energia", "zap", "#ea580c"],
  ["internet", "Internet", "wifi", "#2563eb"],
  ["transporte-empresa", "Transporte", "truck", "#0f766e"],
  ["manutencao", "Manutenção", "wrench", "#b45309"],
  ["software", "Software", "monitor", "#7c3aed"],
  ["marketing", "Marketing", "megaphone", "#db2777"],
  ["impostos", "Impostos", "landmark", "#dc2626"],
] as const;

const personalExpenses = [
  ["alimentacao", "Alimentação", "utensils", "#ea580c"],
  ["transporte-pessoal", "Transporte", "car", "#0891b2"],
  ["lazer", "Lazer", "gamepad", "#7c3aed"],
  ["compras", "Compras", "shopping-bag", "#db2777"],
  ["casa", "Casa", "house", "#d97706"],
  ["saude", "Saúde", "heart-pulse", "#dc2626"],
  ["educacao", "Educação", "graduation-cap", "#2563eb"],
] as const;

function children(
  scope: FinancialScope,
  kind: FinancialCategoryKind,
  parentId: string,
  rows: ReadonlyArray<readonly [string, string, string, string]>,
  start: number,
): FinancialCategorySeed[] {
  return rows.map(([id, name, icon, color], index) => ({
    id: `${scope}-${id}`,
    name,
    scope,
    kind,
    icon,
    color,
    parentId,
    sortOrder: start + index,
  }));
}
export const DEFAULT_FINANCIAL_CATEGORIES: FinancialCategorySeed[] = [
  { id: "business-receitas", name: "Receitas", scope: "business", kind: "income", icon: "trending-up", color: "#16a34a", parentId: null, sortOrder: 10 },
  ...children("business", "income", "business-receitas", businessIncome, 20),
  { id: "business-producao", name: "Produção", scope: "business", kind: "expense", icon: "factory", color: "#d97706", parentId: null, sortOrder: 100 },
  ...children("business", "expense", "business-producao", businessProduction, 110),
  { id: "business-despesas", name: "Despesas", scope: "business", kind: "expense", icon: "receipt", color: "#dc2626", parentId: null, sortOrder: 200 },
  ...children("business", "expense", "business-despesas", businessExpenses, 210),
  { id: "business-outros", name: "Outros", scope: "business", kind: "both", icon: "circle-dot", color: "#64748b", parentId: null, sortOrder: 900 },
  { id: "personal-receitas", name: "Receitas pessoais", scope: "personal", kind: "income", icon: "wallet", color: "#16a34a", parentId: null, sortOrder: 10 },
  { id: "personal-salario", name: "Salário", scope: "personal", kind: "income", icon: "badge-dollar-sign", color: "#16a34a", parentId: "personal-receitas", sortOrder: 20 },
  { id: "personal-freelance", name: "Freelance", scope: "personal", kind: "income", icon: "laptop", color: "#2563eb", parentId: "personal-receitas", sortOrder: 21 },
  { id: "personal-rendimentos", name: "Rendimentos", scope: "personal", kind: "income", icon: "chart-no-axes-combined", color: "#0d9488", parentId: "personal-receitas", sortOrder: 22 },
  { id: "personal-despesas", name: "Despesas pessoais", scope: "personal", kind: "expense", icon: "receipt", color: "#dc2626", parentId: null, sortOrder: 100 },
  ...children("personal", "expense", "personal-despesas", personalExpenses, 110),
  { id: "personal-outros", name: "Outros", scope: "personal", kind: "both", icon: "circle-dot", color: "#64748b", parentId: null, sortOrder: 900 },
];

export function normalizeFinancialText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchingFinancialRule(
  rules: FinancialRuleLike[],
  scope: FinancialScope,
  values: unknown[],
) {
  const haystack = normalizeFinancialText(values.filter(Boolean).join(" "));
  return rules
    .filter((rule) => rule.scope === scope && rule.enabled !== false)
    .sort((left, right) => normalizeFinancialText(right.pattern).length - normalizeFinancialText(left.pattern).length)
    .find((rule) => {
      const pattern = normalizeFinancialText(rule.pattern);
      return pattern.length >= 2 && haystack.includes(pattern);
    }) ?? null;
}

function dateDistance(left: string, right: string) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? Math.abs(leftTime - rightTime) / 86_400_000
    : Number.POSITIVE_INFINITY;
}

export function findInternalTransferSuggestions(transactions: TransferCandidate[]) {
  const suggestions = new Map<string, string>();
  const eligible = transactions.filter((transaction) =>
    transaction.status !== "PENDING"
    && !transaction.internalTransfer
    && Number(transaction.amount) > 0,
  );

  for (const transaction of eligible) {
    const matches = eligible.filter((candidate) =>
      candidate.id !== transaction.id
      && candidate.accountId !== transaction.accountId
      && candidate.direction !== transaction.direction
      && Math.round(candidate.amount * 100) === Math.round(transaction.amount * 100)
      && (candidate.currencyCode ?? "BRL") === (transaction.currencyCode ?? "BRL")
      && dateDistance(candidate.date, transaction.date) <= 2,
    );
    if (matches.length === 1) suggestions.set(transaction.id, matches[0].id);
  }

  return suggestions;
}

export function isValidInternalTransferPair(left: TransferCandidate, right: TransferCandidate) {
  return left.id !== right.id
    && left.accountId !== right.accountId
    && left.direction !== right.direction
    && left.status !== "PENDING"
    && right.status !== "PENDING"
    && Math.round(Number(left.amount) * 100) === Math.round(Number(right.amount) * 100)
    && (left.currencyCode ?? "BRL") === (right.currencyCode ?? "BRL")
    && dateDistance(left.date, right.date) <= 2;
}
