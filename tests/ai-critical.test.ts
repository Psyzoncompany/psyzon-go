import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAIToolAccess } from "../app/lib/server/ai-policy.ts";
import { DeepSeekProvider } from "../app/lib/server/deepseek-provider.ts";
import { GroqProvider } from "../app/lib/server/groq-provider.ts";
import { configuredAIProviders, getAIProviderSummary } from "../app/lib/server/ai-agent.ts";
import { readFile } from "node:fs/promises";
import { mercadoPagoEventKey, signMercadoPagoManifest, verifyMercadoPagoSignature } from "../app/lib/server/mercado-pago-webhook.ts";
import { mercadoPagoImportPreview } from "../app/lib/server/mercado-pago.ts";
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

test("Mercado Pago import preview normalizes fixed financial fields", () => {
  const preview = mercadoPagoImportPreview({
    id: 123456789,
    description: "Pedido Ana",
    status: "approved",
    status_detail: "accredited",
    transaction_amount: 125.5,
    transaction_details: { net_received_amount: 120 },
    fee_details: [{ amount: 5.5 }],
    payment_method_id: "pix",
    payment_type_id: "bank_transfer",
    date_approved: "2026-08-13T14:05:00-03:00",
  });
  assert.deepEqual(preview, {
    paymentId: "123456789",
    externalReference: null,
    description: "Pedido Ana",
    status: "approved",
    statusDetail: "accredited",
    approved: true,
    amount: 125.5,
    netAmount: 120,
    feeAmount: 5.5,
    paymentMethod: "pix · bank_transfer",
    transactionDate: "2026-08-13",
  });
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
    { id: "groq-2", choices: [{ message: { role: "assistant", content: '{"summary":"Resultado de R$ 600.","severity":"info","metrics":[],"alerts":[],"recommendations":[],"actions":[]}' } }], usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 } },
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
    assert.equal(final.usage.totalTokens, 28);
    assert.equal(((requests[0].tools as Array<{ function: { name: string } }>)[0]).function.name, "get_financial_summary");
    assert.ok((requests[1].messages as Array<{ role: string }>).some((message) => message.role === "tool"));
    assert.equal((requests[1].response_format as { type: string }).type, "json_object");
    assert.equal(requests[1].tools, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepSeek provider preserves the tool loop and formats the final answer", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const responses = [
    { id: "deepseek-1", choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "get_financial_summary", arguments: '{"month":"2026-08"}' } }] } }], usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } },
    { id: "deepseek-2", choices: [{ message: { role: "assistant", content: '{"summary":"Resultado de R$ 600.","severity":"info","metrics":[],"alerts":[],"recommendations":[],"actions":[]}' } }], usage: { prompt_tokens: 22, completion_tokens: 9, total_tokens: 31 } },
  ];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return Response.json(responses.shift());
  };

  try {
    const provider = new DeepSeekProvider("test-key");
    const tools = [{ type: "function", name: "get_financial_summary", description: "Resumo", parameters: { type: "object", properties: {} } }];
    const first = await provider.create("Como está meu financeiro?", "Use dados reais.", tools);
    assert.equal(first.functionCalls[0]?.name, "get_financial_summary");
    const final = await provider.continue(first.id, [{ id: "call-1", name: "get_financial_summary", result: { income: 1000, expenses: 400 } }], "Use dados reais.", tools);
    assert.equal(JSON.parse(final.outputText).summary, "Resultado de R$ 600.");
    assert.equal(final.usage.totalTokens, 31);
    assert.equal(requests[0].url, "https://api.deepseek.com/chat/completions");
    assert.equal(requests[0].body.model, "deepseek-v4-pro");
    assert.equal(((requests[0].body.tools as Array<{ function: { name: string } }>)[0]).function.name, "get_financial_summary");
    assert.ok((requests[1].body.messages as Array<{ role: string }>).some((message) => message.role === "tool"));
    assert.equal((requests[1].body.response_format as { type: string }).type, "json_object");
    assert.equal(requests[1].body.tools, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI provider pool prioritizes DeepSeek, accepts multiple Gemini projects and removes duplicate keys", () => {
  const env = {
    DEEPSEEK_API_KEY: "deepseek-one",
    GROQ_API_KEY: "groq-one",
    GEMINI_API_KEY: "gemini-one",
    GEMINI_API_KEY_2: "gemini-two",
    GEMINI_API_KEYS: "gemini-two, gemini-three",
  } as NodeJS.ProcessEnv;
  const providers = configuredAIProviders(env);
  assert.deepEqual(providers.map((item) => item.id), ["deepseek-1", "groq-1", "gemini-1", "gemini-2", "gemini-3"]);
  assert.deepEqual(getAIProviderSummary(env), { configured: true, provider: "1 DeepSeek + 1 Groq + 3 Gemini", model: "deepseek-v4-pro / openai/gpt-oss-120b / gemini-3.6-flash" });
});

test("Mercado Pago AI tool exposes transaction values and observations for divergences", async () => {
  const source = await readFile(new URL("../app/lib/server/ai-tools.ts", import.meta.url), "utf8");
  assert.match(source, /divergences/);
  assert.match(source, /amountFormatted: formatMoney\(amount\)/);
  assert.match(source, /providerAmountFormatted/);
  assert.match(source, /systemAmountFormatted/);
  assert.match(source, /differenceFormatted/);
  assert.match(source, /description: payment\?\.description/);
  assert.match(source, /observation: payment\?\.statusDetail/);
  assert.match(source, /mercadoPagoId: item\.providerPaymentId/);
  assert.match(source, /externalReference: payment\?\.externalReference/);
  assert.match(source, /outgoingAudit/);
  assert.match(source, /Possível saída duplicada/);
  assert.match(source, /missingExternalPayment/);
  assert.match(source, /internalOrderId/);
  assert.match(source, /likelyCause/);
});

test("AI prompt requires Brazilian currency punctuation and separates outgoing audit", async () => {
  const source = await readFile(new URL("../app/lib/server/ai-agent.ts", import.meta.url), "utf8");
  assert.match(source, /R\$ 5,20; R\$ 1\.875,00; R\$ 12\.870,00/);
  assert.match(source, /auditoria das saídas internas/);
});

test("Mercado Pago synchronization backfills one year and paginates payment search", async () => {
  const source = await readFile(new URL("../app/lib/server/mercado-pago.ts", import.meta.url), "utf8");
  assert.match(source, /365 \* 86_400_000/);
  assert.match(source, /maximumPayments = 1_000/);
  assert.match(source, /offset: String\(offset\)/);
  assert.match(source, /fullBackfillCompletedAt/);
});
