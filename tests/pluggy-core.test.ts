import assert from "node:assert/strict";
import test from "node:test";
import { classifyPluggyTransaction } from "../app/lib/server/pluggy";
import {
  DEFAULT_FINANCIAL_CATEGORIES,
  findInternalTransferSuggestions,
  isValidInternalTransferPair,
  matchingFinancialRule,
  normalizeFinancialText,
} from "../app/lib/server/financial-center";

test("identifica Pix pelos metadados do pagamento", () => {
  assert.equal(classifyPluggyTransaction({
    type: "CREDIT",
    description: "Crédito recebido",
    operationType: null,
    paymentData: { paymentMethod: "PIX", boletoMetadata: null },
  }), "pix");
});

test("mantem categorias pessoais e empresariais independentes", () => {
  const personal = DEFAULT_FINANCIAL_CATEGORIES.filter((category) => category.scope === "personal");
  const business = DEFAULT_FINANCIAL_CATEGORIES.filter((category) => category.scope === "business");

  assert.ok(personal.some((category) => category.id === "personal-alimentacao"));
  assert.ok(business.some((category) => category.id === "business-venda-camisas"));
  assert.ok(!personal.some((category) => category.id === "business-venda-camisas"));
});

test("aplica a regra mais especifica apenas no escopo correspondente", () => {
  const rules = [
    { id: "generic", scope: "business" as const, pattern: "mercado", categoryId: "generic" },
    { id: "specific", scope: "business" as const, pattern: "Mercado Sao Jose", categoryId: "specific" },
    { id: "personal", scope: "personal" as const, pattern: "Mercado Sao Jose", categoryId: "personal" },
  ];

  assert.equal(normalizeFinancialText("Mercado S\u00e3o Jos\u00e9"), "mercado sao jose");
  assert.equal(matchingFinancialRule(rules, "business", ["PIX - Mercado S\u00e3o Jos\u00e9"])?.id, "specific");
  assert.equal(matchingFinancialRule(rules, "personal", ["PIX - Mercado S\u00e3o Jos\u00e9"])?.id, "personal");
});

test("sugere e valida transferencia interna apenas entre contas diferentes", () => {
  const debit = { id: "out", accountId: "account-a", amount: 1_000, direction: "DEBIT" as const, date: "2026-08-20", currencyCode: "BRL" };
  const credit = { id: "in", accountId: "account-b", amount: 1_000, direction: "CREDIT" as const, date: "2026-08-21", currencyCode: "BRL" };
  const unrelated = { id: "other", accountId: "account-c", amount: 850, direction: "CREDIT" as const, date: "2026-08-21", currencyCode: "BRL" };
  const suggestions = findInternalTransferSuggestions([debit, credit, unrelated]);

  assert.equal(suggestions.get("out"), "in");
  assert.equal(suggestions.get("in"), "out");
  assert.equal(suggestions.has("other"), false);
  assert.equal(isValidInternalTransferPair(debit, credit), true);
  assert.equal(isValidInternalTransferPair(debit, { ...credit, accountId: "account-a" }), false);
});

test("identifica TED, DOC e transferências sem confundir lançamentos comuns", () => {
  assert.equal(classifyPluggyTransaction({ type: "DEBIT", description: "TED enviada", operationType: null }), "transfer");
  assert.equal(classifyPluggyTransaction({ type: "CREDIT", description: "Venda balcão", operationType: null }), "income");
  assert.equal(classifyPluggyTransaction({ type: "DEBIT", description: "Compra de material", operationType: null }), "expense");
});
