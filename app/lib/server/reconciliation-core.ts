export type SystemTransaction = {
  id: string;
  amountCents: number;
  date: string;
  orderId: string;
  providerId: string;
  description: string;
  type: string;
};

export type ProviderPayment = {
  paymentId: string;
  ownerUserId: string;
  externalReference: string | null;
  description: string | null;
  status: string;
  statusDetail: string | null;
  amountCents: number;
  netAmountCents: number | null;
  feeCents: number;
  paymentMethod: string | null;
  dateCreated: string | null;
  dateApproved: string | null;
  rawSummaryJson: string;
  lastSyncedAt: number;
};

export type ReconciliationResult = {
  id: string;
  ownerUserId: string;
  systemTransactionId: string | null;
  providerPaymentId: string | null;
  status: string;
  systemAmountCents: number | null;
  providerAmountCents: number | null;
  differenceCents: number | null;
  confidence: string;
  reason: string;
  updatedAt: number;
};

function dayDistance(left: string, right?: string | null) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const systemDate = new Date(`${left}T12:00:00Z`).getTime();
  const providerDate = new Date(right).getTime();
  return Math.abs(systemDate - providerDate) / 86_400_000;
}

export function buildMercadoPagoReconciliation(
  ownerUserId: string,
  local: SystemTransaction[],
  payments: ProviderPayment[],
  updatedAt = Math.floor(Date.now() / 1000),
) {
  const usedLocal = new Set<string>();
  const usedProvider = new Set<string>();
  const results: ReconciliationResult[] = [];
  const add = (system: SystemTransaction | null, provider: ProviderPayment | null, status: string, confidence: string, reason: string) => {
    if (system) usedLocal.add(system.id);
    if (provider) usedProvider.add(provider.paymentId);
    results.push({
      id: `${ownerUserId}:${system?.id ?? "none"}:${provider?.paymentId ?? "none"}`,
      ownerUserId,
      systemTransactionId: system?.id ?? null,
      providerPaymentId: provider?.paymentId ?? null,
      status,
      systemAmountCents: system?.amountCents ?? null,
      providerAmountCents: provider?.amountCents ?? null,
      differenceCents: system && provider ? system.amountCents - provider.amountCents : null,
      confidence,
      reason,
      updatedAt,
    });
  };

  for (const provider of payments) {
    const exact = local.find((system) =>
      !usedLocal.has(system.id)
      && (system.providerId === provider.paymentId
        || Boolean(provider.externalReference && (system.orderId === provider.externalReference || system.id === provider.externalReference))),
    );
    if (!exact) continue;
    const status = exact.amountCents !== provider.amountCents
      ? "VALOR_DIVERGENTE"
      : provider.status !== "approved" ? "STATUS_DIVERGENTE" : "CONCILIADO";
    add(
      exact,
      provider,
      status,
      "high",
      status === "CONCILIADO"
        ? "Identificador/referência e valor conferem."
        : status === "VALOR_DIVERGENTE"
          ? "Identificador confere, mas os valores são diferentes."
          : "Identificador e valor conferem, mas o status externo não está aprovado.",
    );
  }

  for (const provider of payments.filter((item) => !usedProvider.has(item.paymentId))) {
    const candidates = local.filter((system) =>
      !usedLocal.has(system.id)
      && system.amountCents === provider.amountCents
      && dayDistance(system.date, provider.dateCreated) <= 2,
    );
    if (candidates.length === 1) {
      add(candidates[0], provider, "AGUARDANDO_ANALISE", "medium", "Possível correspondência por valor e proximidade de data; faltam identificadores únicos.");
    } else if (candidates.length > 1) {
      add(null, provider, "POSSIVEL_DUPLICIDADE", "low", "Existem várias movimentações com o mesmo valor em datas próximas.");
    }
  }

  local.filter((item) => !usedLocal.has(item.id)).forEach((item) => {
    add(item, null, "NAO_ENCONTRADO_MERCADO_PAGO", "high", "Entrada local sem pagamento externo identificado.");
  });
  payments.filter((item) => !usedProvider.has(item.paymentId)).forEach((item) => {
    add(null, item, "NAO_CADASTRADO_SISTEMA", "high", "Pagamento Mercado Pago sem entrada local identificada.");
  });
  return results;
}
