import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { financialReconciliation, mercadoPagoPayments } from "../../../db/schema";
import type { AIPermissionMode } from "../../ai/types";
import { evaluateAIToolAccess } from "./ai-policy";
import {
  createUserDocument,
  deleteUserDocument,
  getUserDocument,
  listUserCollection,
  patchUserDocument,
  type FirebaseIdentity,
} from "./firebase-rest";
import { createConfirmation, logAIAudit } from "./ai-store";

export type AIToolContext = {
  identity: FirebaseIdentity;
  conversationId?: string;
  permissionMode: AIPermissionMode;
  confirmed?: boolean;
};

type ToolArguments = Record<string, unknown>;

type ToolDeclaration = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type ToolDefinition = {
  declaration: ToolDeclaration;
  riskLevel: 1 | 2 | 3;
  requiredPermission: AIPermissionMode;
  requiresConfirmation: boolean;
  execute: (context: AIToolContext, args: ToolArguments) => Promise<unknown>;
  preview?: (context: AIToolContext, args: ToolArguments) => Promise<Record<string, unknown>>;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const monthKey = (offset = 0) => {
  const [year, month] = today().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

function text(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function number(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function recordDate(record: Record<string, unknown>) {
  const explicit = text(record.transactionDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const created = text(record.createdAt) || text(record._createTime);
  const parsed = new Date(created);
  return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().slice(0, 10);
}
function inMonth(record: Record<string, unknown>, month: string) { return recordDate(record).startsWith(month); }
function isOverdue(order: Record<string, unknown>) { return text(order.status) !== "Entregue" && text(order.dueDate) < today(); }
function requiredString(args: ToolArguments, key: string) {
  const value = text(args[key]);
  if (!value) throw new Error(`${key} é obrigatório.`);
  return value;
}
function finiteAmount(args: ToolArguments, key: string) {
  const value = number(args[key], NaN);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000_000) throw new Error(`${key} inválido.`);
  return Math.round(value * 100) / 100;
}

async function getBusinessData(identity: FirebaseIdentity) {
  const [orders, transactions, customers, bills] = await Promise.all([
    listUserCollection(identity, "orders"),
    listUserCollection(identity, "transactions", 500),
    listUserCollection(identity, "customers"),
    listUserCollection(identity, "bills"),
  ]);
  return { orders, transactions, customers, bills };
}

const getDashboardSummary: ToolDefinition = {
  declaration: { type: "function", name: "get_dashboard_summary", description: "Obtém um resumo executivo real da empresa, incluindo caixa, pedidos, valores a receber e prioridades.", parameters: { type: "object", properties: {} } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }) => {
    const { orders, transactions, customers, bills } = await getBusinessData(identity);
    const month = monthKey();
    const business = transactions.filter((item) => text(item.account) === "business");
    const monthTransactions = business.filter((item) => inMonth(item, month));
    const income = monthTransactions.filter((item) => text(item.type) === "income").reduce((sum, item) => sum + number(item.amount), 0);
    const expenses = monthTransactions.filter((item) => text(item.type) === "expense").reduce((sum, item) => sum + number(item.amount), 0);
    const allIncome = business.filter((item) => text(item.type) === "income").reduce((sum, item) => sum + number(item.amount), 0);
    const allExpenses = business.filter((item) => text(item.type) === "expense").reduce((sum, item) => sum + number(item.amount), 0);
    const transfers = transactions.filter((item) => text(item.type) === "transfer").reduce((sum, item) => sum + number(item.amount), 0);
    const pending = orders.reduce((sum, order) => sum + Math.max(0, number(order.total) - number(order.paid)), 0);
    const overdue = orders.filter(isOverdue);
    return {
      asOf: new Date().toISOString(), month, revenue: income, expenses, result: income - expenses,
      availableBalance: allIncome - allExpenses - transfers, receivable: pending,
      activeOrders: orders.filter((item) => text(item.status) !== "Entregue").length,
      overdueOrders: overdue.slice(0, 12).map((item) => ({ id: item.id, customer: text(item.customer), dueDate: item.dueDate, pending: Math.max(0, number(item.total) - number(item.paid)) })),
      clients: customers.length, recurringBills: bills.length,
      dataQuality: { ordersWithoutValue: orders.filter((item) => number(item.total) <= 0).length, transactionsWithoutCategory: transactions.filter((item) => !text(item.category)).length },
    };
  },
};

const getFinancialSummary: ToolDefinition = {
  declaration: { type: "function", name: "get_financial_summary", description: "Calcula entradas, saídas, resultado, saldo e despesas por categoria em um mês específico.", parameters: { type: "object", properties: { month: { type: "string", description: "Mês no formato AAAA-MM. Omitir para o mês atual." }, account: { type: "string", enum: ["business", "personal"], description: "Conta empresarial ou pessoal." } } } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }, args) => {
    const month = /^\d{4}-\d{2}$/.test(text(args.month)) ? text(args.month) : monthKey();
    const account = text(args.account) === "personal" ? "personal" : "business";
    const transactions = (await listUserCollection(identity, "transactions", 500)).filter((item) => text(item.account) === account && inMonth(item, month));
    const income = transactions.filter((item) => text(item.type) === "income" || (account === "personal" && text(item.type) === "transfer")).reduce((sum, item) => sum + number(item.amount), 0);
    const expenses = transactions.filter((item) => text(item.type) === "expense" || (account === "business" && text(item.type) === "transfer")).reduce((sum, item) => sum + number(item.amount), 0);
    const categories = new Map<string, number>();
    transactions.filter((item) => text(item.type) === "expense").forEach((item) => categories.set(text(item.category, "Outros"), (categories.get(text(item.category, "Outros")) ?? 0) + number(item.amount)));
    return { asOf: new Date().toISOString(), month, account, income, expenses, result: income - expenses, transactionCount: transactions.length, expenseCategories: [...categories].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount) };
  },
};

const getTransactions: ToolDefinition = {
  declaration: { type: "function", name: "get_transactions", description: "Busca movimentações financeiras reais com filtros e limite seguro.", parameters: { type: "object", properties: { month: { type: "string", description: "AAAA-MM" }, account: { type: "string", enum: ["business", "personal"] }, type: { type: "string", enum: ["income", "expense", "transfer"] }, query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } } } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }, args) => {
    const month = text(args.month);
    const query = text(args.query).toLocaleLowerCase("pt-BR");
    const limit = Math.min(50, Math.max(1, number(args.limit, 20)));
    const records = (await listUserCollection(identity, "transactions", 500)).filter((item) => {
      if (month && !inMonth(item, month)) return false;
      if (args.account && text(item.account) !== text(args.account)) return false;
      if (args.type && text(item.type) !== text(args.type)) return false;
      if (query && !`${text(item.description)} ${text(item.category)} ${item.id}`.toLocaleLowerCase("pt-BR").includes(query)) return false;
      return true;
    }).sort((a, b) => recordDate(b).localeCompare(recordDate(a))).slice(0, limit);
    return { count: records.length, transactions: records.map((item) => ({ id: item.id, date: recordDate(item), description: text(item.description), amount: number(item.amount), type: text(item.type), account: text(item.account), category: text(item.category, "Sem categoria"), orderId: text(item.orderId) })) };
  },
};

const getOrders: ToolDefinition = {
  declaration: { type: "function", name: "get_orders", description: "Consulta pedidos reais, atrasos, pendências e produção.", parameters: { type: "object", properties: { status: { type: "string" }, overdueOnly: { type: "boolean" }, query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } } } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }, args) => {
    const query = text(args.query).toLocaleLowerCase("pt-BR");
    const limit = Math.min(50, Math.max(1, number(args.limit, 20)));
    const orders = (await listUserCollection(identity, "orders", 500)).filter((item) => {
      if (args.status && text(item.status) !== text(args.status)) return false;
      if (args.overdueOnly === true && !isOverdue(item)) return false;
      if (query && !`${item.id} ${text(item.customer)} ${text(item.product)}`.toLocaleLowerCase("pt-BR").includes(query)) return false;
      return true;
    }).sort((a, b) => text(a.dueDate).localeCompare(text(b.dueDate))).slice(0, limit);
    return { count: orders.length, orders: orders.map((item) => ({ id: item.id, customer: text(item.customer), product: text(item.product), quantity: number(item.quantity), total: number(item.total), paid: number(item.paid), pending: Math.max(0, number(item.total) - number(item.paid)), dueDate: text(item.dueDate), status: text(item.status), overdue: isOverdue(item) })) };
  },
};

const getClients: ToolDefinition = {
  declaration: { type: "function", name: "get_clients", description: "Consulta clientes e calcula histórico real de compras e valores pendentes.", parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 30 } } } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }, args) => {
    const [clients, orders] = await Promise.all([listUserCollection(identity, "customers"), listUserCollection(identity, "orders", 500)]);
    const query = text(args.query).toLocaleLowerCase("pt-BR");
    const rows = clients.map((client) => {
      const related = orders.filter((order) => text(order.customer).toLocaleLowerCase("pt-BR") === text(client.name).toLocaleLowerCase("pt-BR"));
      return { id: client.id, name: text(client.name), company: text(client.company), orders: related.length, totalPurchased: related.reduce((sum, item) => sum + number(item.total), 0), pending: related.reduce((sum, item) => sum + Math.max(0, number(item.total) - number(item.paid)), 0) };
    }).filter((item) => !query || `${item.name} ${item.company}`.toLocaleLowerCase("pt-BR").includes(query)).sort((a, b) => b.totalPurchased - a.totalPurchased).slice(0, Math.min(30, Math.max(1, number(args.limit, 15))));
    return { count: rows.length, clients: rows };
  },
};

const getMonthlyComparison: ToolDefinition = {
  declaration: { type: "function", name: "get_monthly_comparison", description: "Compara dois meses de forma determinística: receitas, despesas, resultado, pedidos e ticket médio.", parameters: { type: "object", properties: { currentMonth: { type: "string", description: "AAAA-MM" }, previousMonth: { type: "string", description: "AAAA-MM" } } } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }, args) => {
    const currentMonth = /^\d{4}-\d{2}$/.test(text(args.currentMonth)) ? text(args.currentMonth) : monthKey();
    const previousMonth = /^\d{4}-\d{2}$/.test(text(args.previousMonth)) ? text(args.previousMonth) : monthKey(-1);
    const { orders, transactions } = await getBusinessData(identity);
    const calculate = (month: string) => {
      const monthTransactions = transactions.filter((item) => text(item.account) === "business" && inMonth(item, month));
      const monthOrders = orders.filter((item) => recordDate(item).startsWith(month));
      const income = monthTransactions.filter((item) => text(item.type) === "income").reduce((sum, item) => sum + number(item.amount), 0);
      const expenses = monthTransactions.filter((item) => text(item.type) === "expense").reduce((sum, item) => sum + number(item.amount), 0);
      const sales = monthOrders.reduce((sum, item) => sum + number(item.total), 0);
      return { month, income, expenses, result: income - expenses, orders: monthOrders.length, sales, averageTicket: monthOrders.length ? sales / monthOrders.length : 0 };
    };
    const current = calculate(currentMonth); const previous = calculate(previousMonth);
    const variation = (next: number, prior: number) => prior ? ((next - prior) / Math.abs(prior)) * 100 : null;
    return { current, previous, variations: { incomePercent: variation(current.income, previous.income), expensesPercent: variation(current.expenses, previous.expenses), resultPercent: variation(current.result, previous.result), ordersPercent: variation(current.orders, previous.orders), averageTicketPercent: variation(current.averageTicket, previous.averageTicket) } };
  },
};

const getPriorityActions: ToolDefinition = {
  declaration: { type: "function", name: "get_priority_actions", description: "Analisa dados reais e retorna o que precisa ser resolvido hoje, priorizando dinheiro, clientes e prazos.", parameters: { type: "object", properties: {} } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }) => {
    const { orders, transactions } = await getBusinessData(identity);
    const overdue = orders.filter(isOverdue).map((item) => ({ priority: "urgent", type: "order_overdue", entityId: item.id, title: `Pedido #${item.id} atrasado`, detail: `${text(item.customer)} · prazo ${text(item.dueDate)}`, impact: Math.max(0, number(item.total) - number(item.paid)) }));
    const receivables = orders.filter((item) => number(item.total) > number(item.paid)).sort((a, b) => (number(b.total) - number(b.paid)) - (number(a.total) - number(a.paid))).slice(0, 8).map((item) => ({ priority: "important", type: "receivable", entityId: item.id, title: `Cobrar pedido #${item.id}`, detail: text(item.customer), impact: number(item.total) - number(item.paid) }));
    const duplicates = new Map<string, Record<string, unknown>[]>();
    transactions.forEach((item) => { const key = `${recordDate(item)}|${number(item.amount).toFixed(2)}|${text(item.description).toLocaleLowerCase("pt-BR")}`; duplicates.set(key, [...(duplicates.get(key) ?? []), item]); });
    const possibleDuplicates = [...duplicates.values()].filter((items) => items.length > 1).map((items) => ({ priority: "urgent", type: "possible_duplicate", entityId: items[0].id, title: "Possível movimentação duplicada", detail: `${text(items[0].description)} · ${money.format(number(items[0].amount))}`, impact: number(items[0].amount) }));
    return { asOf: new Date().toISOString(), items: [...possibleDuplicates, ...overdue, ...receivables].slice(0, 20), totals: { overdueOrders: overdue.length, receivable: receivables.reduce((sum, item) => sum + item.impact, 0), possibleDuplicates: possibleDuplicates.length } };
  },
};

const getProfitAnalysis: ToolDefinition = {
  declaration: { type: "function", name: "get_profit_analysis", description: "Calcula lucro estimado e margem com os dados disponíveis e informa lacunas de qualidade.", parameters: { type: "object", properties: { month: { type: "string", description: "AAAA-MM" } } } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }, args) => {
    const month = /^\d{4}-\d{2}$/.test(text(args.month)) ? text(args.month) : monthKey();
    const { orders, transactions, bills } = await getBusinessData(identity);
    const monthOrders = orders.filter((item) => recordDate(item).startsWith(month));
    const sales = monthOrders.reduce((sum, item) => sum + number(item.total), 0);
    const received = transactions.filter((item) => text(item.account) === "business" && text(item.type) === "income" && inMonth(item, month)).reduce((sum, item) => sum + number(item.amount), 0);
    const costs = transactions.filter((item) => text(item.account) === "business" && text(item.type) === "expense" && inMonth(item, month)).reduce((sum, item) => sum + number(item.amount), 0);
    const missingCostOrders = monthOrders.filter((item) => !item.notes || !/custo/i.test(text(item.notes))).length;
    const estimatedProfit = sales - costs;
    return { month, sales, received, registeredCosts: costs, estimatedProfit, estimatedMarginPercent: sales ? (estimatedProfit / sales) * 100 : null, orders: monthOrders.length, recurringBillsRegistered: bills.length, dataCompleteness: missingCostOrders ? "partial" : "good", limitations: missingCostOrders ? [`${missingCostOrders} pedido(s) não possuem custo detalhado identificável; o lucro é uma estimativa global.`] : [] };
  },
};

const searchSystem: ToolDefinition = {
  declaration: { type: "function", name: "search_system", description: "Busca de forma controlada em pedidos, clientes, movimentações e notas.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }, args) => {
    const query = requiredString(args, "query").toLocaleLowerCase("pt-BR");
    const [orders, clients, transactions, notes] = await Promise.all([listUserCollection(identity, "orders"), listUserCollection(identity, "customers"), listUserCollection(identity, "transactions"), listUserCollection(identity, "notes")]);
    const match = (item: Record<string, unknown>, fields: string[]) => fields.some((field) => text(item[field]).toLocaleLowerCase("pt-BR").includes(query)) || String(item.id ?? "").toLocaleLowerCase().includes(query);
    return {
      orders: orders.filter((item) => match(item, ["customer", "product", "notes"])).slice(0, 10).map((item) => ({ id: item.id, customer: item.customer, product: item.product, status: item.status })),
      clients: clients.filter((item) => match(item, ["name", "company"])).slice(0, 10).map((item) => ({ id: item.id, name: item.name, company: item.company })),
      transactions: transactions.filter((item) => match(item, ["description", "category"])).slice(0, 10).map((item) => ({ id: item.id, description: item.description, amount: item.amount, type: item.type })),
      notes: notes.filter((item) => match(item, ["title", "content"])).slice(0, 5).map((item) => ({ id: item.id, title: item.title, category: item.category })),
    };
  },
};

const getMercadoPagoSummary: ToolDefinition = {
  declaration: { type: "function", name: "get_mercado_pago_summary", description: "Consulta o estado real da integração Mercado Pago e os resultados da última conciliação.", parameters: { type: "object", properties: {} } },
  riskLevel: 1, requiredPermission: "read_only", requiresConfirmation: false,
  execute: async ({ identity }) => {
    const ownerUserId = process.env.MERCADO_PAGO_OWNER_FIREBASE_UID?.trim() ?? "";
    if (!ownerUserId || ownerUserId !== identity.uid) return { configured: false, restricted: true, message: "A integração Mercado Pago ainda não foi vinculada a esta conta proprietária." };
    const payments = await getDb().select().from(mercadoPagoPayments).where(eq(mercadoPagoPayments.ownerUserId, identity.uid)).orderBy(desc(mercadoPagoPayments.lastSyncedAt)).limit(100);
    const reconciliation = await getDb().select().from(financialReconciliation).where(eq(financialReconciliation.ownerUserId, identity.uid)).limit(200);
    const byStatus = reconciliation.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {});
    return { configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN), paymentCount: payments.length, approvedGross: payments.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amountCents, 0) / 100, fees: payments.reduce((sum, item) => sum + (item.feeCents ?? 0), 0) / 100, reconciliation: byStatus, lastSyncedAt: payments[0]?.lastSyncedAt ?? null };
  },
};

const updateOrderStatus: ToolDefinition = {
  declaration: { type: "function", name: "update_order_status", description: "Atualiza o status de um pedido. É uma alteração administrativa auditada.", parameters: { type: "object", properties: { orderId: { type: "string" }, status: { type: "string", enum: ["Orçamento", "Aprovado", "Aguardando material", "Produção", "Finalização", "Pronto", "Entregue"] }, reason: { type: "string" } }, required: ["orderId", "status", "reason"] } },
  riskLevel: 2, requiredPermission: "administrative", requiresConfirmation: false,
  execute: async (context, args) => {
    const orderId = requiredString(args, "orderId"); const status = requiredString(args, "status");
    const previous = await getUserDocument(context.identity, "orders", orderId);
    if (!previous) throw new Error("Pedido não encontrado.");
    const updated = await patchUserDocument(context.identity, "orders", orderId, { status });
    await logAIAudit({ identity: context.identity, conversationId: context.conversationId, tool: "update_order_status", action: "update", entity: "order", entityId: orderId, arguments: { status, reason: text(args.reason) }, previousValue: { status: previous.status }, newValue: { status }, status: "success", riskLevel: 2 });
    return { success: true, orderId, previousStatus: previous.status, status: updated.status };
  },
};

const updateTransactionCategory: ToolDefinition = {
  declaration: { type: "function", name: "update_transaction_category", description: "Corrige somente a categoria de uma movimentação, com auditoria.", parameters: { type: "object", properties: { transactionId: { type: "string" }, category: { type: "string" }, reason: { type: "string" } }, required: ["transactionId", "category", "reason"] } },
  riskLevel: 2, requiredPermission: "administrative", requiresConfirmation: false,
  execute: async (context, args) => {
    const transactionId = requiredString(args, "transactionId"); const category = requiredString(args, "category").slice(0, 80);
    const previous = await getUserDocument(context.identity, "transactions", transactionId);
    if (!previous) throw new Error("Movimentação não encontrada.");
    await patchUserDocument(context.identity, "transactions", transactionId, { category });
    await logAIAudit({ identity: context.identity, conversationId: context.conversationId, tool: "update_transaction_category", action: "update", entity: "transaction", entityId: transactionId, arguments: { category, reason: text(args.reason) }, previousValue: { category: previous.category }, newValue: { category }, status: "success", riskLevel: 2 });
    return { success: true, transactionId, previousCategory: previous.category, category };
  },
};

const createFinancialAdjustment: ToolDefinition = {
  declaration: { type: "function", name: "create_financial_adjustment", description: "Cria uma entrada ou despesa de ajuste financeiro. Sempre exige confirmação explícita.", parameters: { type: "object", properties: { description: { type: "string" }, amount: { type: "number" }, type: { type: "string", enum: ["income", "expense"] }, account: { type: "string", enum: ["business", "personal"] }, category: { type: "string" }, date: { type: "string", description: "AAAA-MM-DD" }, reason: { type: "string" } }, required: ["description", "amount", "type", "account", "category", "reason"] } },
  riskLevel: 3, requiredPermission: "financial_confirm", requiresConfirmation: true,
  preview: async (_context, args) => ({ action: "Criar ajuste financeiro", currentValue: "Nenhum lançamento", newValue: `${text(args.type) === "expense" ? "Saída" : "Entrada"} de ${money.format(finiteAmount(args, "amount"))} — ${requiredString(args, "description")}`, reason: requiredString(args, "reason"), impact: `O saldo da conta ${text(args.account) === "personal" ? "pessoal" : "empresarial"} será alterado em ${money.format(finiteAmount(args, "amount"))}.` }),
  execute: async (context, args) => {
    const amount = finiteAmount(args, "amount"); const description = requiredString(args, "description").slice(0, 160);
    const type = text(args.type) === "expense" ? "expense" : "income"; const account = text(args.account) === "personal" ? "personal" : "business";
    const created = await createUserDocument(context.identity, "transactions", { description, amount, type, account, category: requiredString(args, "category").slice(0, 80), transactionDate: /^\d{4}-\d{2}-\d{2}$/.test(text(args.date)) ? text(args.date) : today(), source: "ai_adjustment", createdAt: new Date().toISOString() });
    await logAIAudit({ identity: context.identity, conversationId: context.conversationId, tool: "create_financial_adjustment", action: "create", entity: "transaction", entityId: created.id, arguments: { description, amount, type, account, category: text(args.category), reason: text(args.reason) }, newValue: created, status: "success", riskLevel: 3, requiresConfirmation: true, approvedBy: context.identity.uid });
    return { success: true, transactionId: created.id, description, amount, type, account };
  },
};

const deleteTransaction: ToolDefinition = {
  declaration: { type: "function", name: "delete_transaction", description: "Exclui uma movimentação financeira. Sempre exige confirmação explícita.", parameters: { type: "object", properties: { transactionId: { type: "string" }, reason: { type: "string" } }, required: ["transactionId", "reason"] } },
  riskLevel: 3, requiredPermission: "financial_confirm", requiresConfirmation: true,
  preview: async ({ identity }, args) => {
    const transaction = await getUserDocument(identity, "transactions", requiredString(args, "transactionId"));
    if (!transaction) throw new Error("Movimentação não encontrada.");
    return { action: "Excluir movimentação", currentValue: `${text(transaction.description)} · ${money.format(number(transaction.amount))}`, newValue: "Movimentação removida", reason: requiredString(args, "reason"), impact: `O histórico e o saldo da conta ${text(transaction.account) === "personal" ? "pessoal" : "empresarial"} serão alterados.` };
  },
  execute: async (context, args) => {
    const transactionId = requiredString(args, "transactionId");
    const previous = await getUserDocument(context.identity, "transactions", transactionId);
    if (!previous) throw new Error("Movimentação não encontrada.");
    await deleteUserDocument(context.identity, "transactions", transactionId);
    await logAIAudit({ identity: context.identity, conversationId: context.conversationId, tool: "delete_transaction", action: "delete", entity: "transaction", entityId: transactionId, arguments: { reason: text(args.reason) }, previousValue: previous, status: "success", riskLevel: 3, requiresConfirmation: true, approvedBy: context.identity.uid });
    return { success: true, transactionId, deleted: true };
  },
};

const tools = [getDashboardSummary, getFinancialSummary, getTransactions, getOrders, getClients, getMonthlyComparison, getPriorityActions, getProfitAnalysis, searchSystem, getMercadoPagoSummary, updateOrderStatus, updateTransactionCategory, createFinancialAdjustment, deleteTransaction];
const registry = new Map(tools.map((tool) => [tool.declaration.name, tool]));
export const geminiToolDeclarations = tools.map((tool) => tool.declaration);

export async function executeAITool(name: string, args: ToolArguments, context: AIToolContext) {
  const tool = registry.get(name);
  if (!tool) throw new Error("Ferramenta não autorizada.");
  const access = evaluateAIToolAccess(tool, context.permissionMode, context.confirmed);
  if (!access.allowed && !access.confirmationRequired) return { blocked: true, reason: access.reason };
  if (access.confirmationRequired) {
    const preview = await tool.preview?.(context, args) ?? { action: name, reason: text(args.reason), impact: "Alteração financeira importante." };
    const confirmation = await createConfirmation({ identity: context.identity, conversationId: context.conversationId, tool: name, arguments: args, preview });
    await logAIAudit({ identity: context.identity, conversationId: context.conversationId, tool: name, action: "confirmation_requested", arguments: args, status: "pending", riskLevel: tool.riskLevel, requiresConfirmation: true });
    return { confirmationRequired: true, confirmation: { id: confirmation.id, ...preview, expiresAt: confirmation.expiresAt } };
  }
  try {
    return await tool.execute(context, args);
  } catch (error) {
    await logAIAudit({ identity: context.identity, conversationId: context.conversationId, tool: name, action: "execute", arguments: args, status: "error", riskLevel: tool.riskLevel, requiresConfirmation: tool.requiresConfirmation });
    throw error;
  }
}

export async function executeConfirmedTool(name: string, args: ToolArguments, context: AIToolContext) {
  const tool = registry.get(name);
  if (!tool || !tool.requiresConfirmation) throw new Error("Confirmação inválida.");
  return tool.execute({ ...context, confirmed: true }, args);
}
