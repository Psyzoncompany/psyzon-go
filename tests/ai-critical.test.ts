import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAIToolAccess } from "../app/lib/server/ai-policy.ts";
import { GroqProvider } from "../app/lib/server/groq-provider.ts";
import { mercadoPagoEventKey, signMercadoPagoManifest, verifyMercadoPagoSignature } from "../app/lib/server/mercado-pago-webhook.ts";
import { buildMercadoPagoReconciliation, type ProviderPayment, type SystemTransaction } from "../app/lib/server/reconciliation-core.ts";

const local = (overrides: Partial<SystemTransaction> = {}): SystemTransaction => ({
  id: "local-1",
  amountCents: 12_500,
  date: "2026-08-12",
  orderId: "PED-42",
  providerId: "mp-42",
  description: "Pedido 42",
  type: "income",
  ...overrides,
});

const payment = (overrides: Partial<ProviderPayment> = {}): ProviderPayment => ({
  paymentId: "mp-42",
  ownerUserId: "user-1",
  externalReference: "PED-42",
  description: "Pedido 42",
  status: "approved",
  statusDetail: "accredited",
  amountCents: 12_500,
  netAmountCents: 12_000,
  feeCents: 500,
  paymentMethod: "pix",
  dateCreated: "2026-08-12T14:00:00Z",
  dateApproved: "2026-08-12T14:01:00Z",
  rawSummaryJson: "{}",
  lastSyncedAt: 1,
  ...overrides,
});

test("AI permission policy blocks writes and requires explicit confirmation", () => {
  const administrative = { requiredPermission: "administrative", riskLevel: 2, requiresConfirmation: false } as const;
  const financial = { requiredPermission: "financial_confirm", riskLevel: 3, requiresConfirmation: true } as const;

  assert.equal(evaluateAIToolAccess(administrative, "read_only").allowed, false);
  assert.equal(evaluateAIToolAccess(administrative, "administrative").allowed, true);
  assert.equal(evaluateAIToolAccess(financial, "financial_confirm").confirmationRequired, true);
  assert.equal(evaluateAIToolAccess(financial, "financial_confirm", true).allowed, true);
});

test("Mercado Pago signature validation accepts valid HMAC and rejects tampering or stale timestamps", async () => {
  const timestamp = "1786636800";
  const digest = await signMercadoPagoManifest("secret", "MP-42", "req-1", timestamp);
  const signature = `ts=${timestamp},v1=${digest}`;

  assert.equal(await verifyMercadoPagoSignature("secret", "MP-42", "req-1", signature, Number(timestamp) + 10), true);
  assert.equal(await verifyMercadoPagoSignature("secret", "MP-99", "req-1", signature, Number(timestamp) + 10), false);
  assert.equal(await verifyMercadoPagoSignature("secret", "MP-42", "req-1", signature, Number(timestamp) + 901), false);
  assert.equal(mercadoPagoEventKey("event-1", "req-1", "payment.updated"), mercadoPagoEventKey("event-1", "req-2", "payment.updated"));
});

test("reconciliation classifies exact, divergent and unmatched records deterministically", () => {
  const exact = buildMercadoPagoReconciliation("user-1", [local()], [payment()], 1);
  assert.deepEqual(exact.map((item) => item.status), ["CONCILIADO"]);

  const divergent = buildMercadoPagoReconciliation("user-1", [local()], [payment({ amountCents: 13_000 })], 1);
  assert.equal(divergent[0].status, "VALOR_DIVERGENTE");
  assert.equal(divergent[0].differenceCents, -500);

  const unmatched = buildMercadoPagoReconciliation(
    "user-1",
    [local({ providerId: "", orderId: "", amountCents: 10_000 })],
    [payment({ paymentId: "mp-other", externalReference: null, amountCents: 20_000 })],
    1,
  );
  assert.deepEqual(unmatched.map((item) => item.status).sort(), ["NAO_CADASTRADO_SISTEMA", "NAO_ENCONTRADO_MERCADO_PAGO"].sort());
});

test("approximate matches stay pending and ambiguous matches are never auto-reconciled", () => {
  const pending = buildMercadoPagoReconciliation(
    "user-1",
    [local({ providerId: "", orderId: "" })],
    [payment({ paymentId: "mp-other", externalReference: null })],
    1,
  );
  assert.equal(pending[0].status, "AGUARDANDO_ANALISE");
  assert.equal(pending[0].confidence, "medium");

  const duplicate = buildMercadoPagoReconciliation(
    "user-1",
    [local({ id: "a", providerId: "", orderId: "" }), local({ id: "b", providerId: "", orderId: "" })],
    [payment({ paymentId: "mp-other", externalReference: null })],
    1,
  );
  assert.ok(duplicate.some((item) => item.status === "POSSIVEL_DUPLICIDADE"));
  assert.ok(!duplicate.some((item) => item.status === "CONCILIADO"));
});

test("Groq provider preserves the tool loop and formats the final answer", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  const responses = [
    { id: "groq-1", choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "get_financial_summary", arguments: '{"month":"2026-08"}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
    { id: "groq-2", choices: [{ message: { role: "assistant", content: "Entradas de R$ 1.000 e saídas de R$ 400." } }], usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 } },
    { id: "groq-3", choices: [{ message: { role: "assistant", content: '{"summary":"Resultado de R$ 600.","severity":"info","metrics":[],"alerts":[],"recommendations":[],"actions":[]}' } }], usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 } },
  ];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json(responses.shift());
  };

  try {
    const provider = new GroqProvider("test-key");
    const tools = [{ type: "function", name: "get_financial_summary", description: "Resumo", parameters: { type: "object", properties: {} } }];
    const first = await provider.create("Como está meu financeiro?", "Use dados reais.", tools);
    assert.equal(first.functionCalls[0]?.name, "get_financial_summary");
    const final = await provider.continue(first.id, [{ id: "call-1", name: "get_financial_summary", result: { income: 1000, expenses: 400 } }], "Use dados reais.", tools);
    assert.equal(JSON.parse(final.outputText).summary, "Resultado de R$ 600.");
    assert.equal(final.usage.totalTokens, 49);
    assert.equal(((requests[0].tools as Array<{ function: { name: string } }>)[0]).function.name, "get_financial_summary");
    assert.ok((requests[1].messages as Array<{ role: string }>).some((message) => message.role === "tool"));
    assert.equal((requests[2].response_format as { type: string }).type, "json_schema");
    assert.equal(requests[2].tools, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
