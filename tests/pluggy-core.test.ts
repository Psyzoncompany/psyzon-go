import assert from "node:assert/strict";
import test from "node:test";
import { classifyPluggyTransaction } from "../app/lib/server/pluggy";

test("identifica Pix pelos metadados do pagamento", () => {
  assert.equal(classifyPluggyTransaction({
    type: "CREDIT",
    description: "Crédito recebido",
    operationType: null,
    paymentData: { paymentMethod: "PIX", boletoMetadata: null },
  }), "pix");
});

test("identifica TED, DOC e transferências sem confundir lançamentos comuns", () => {
  assert.equal(classifyPluggyTransaction({ type: "DEBIT", description: "TED enviada", operationType: null }), "transfer");
  assert.equal(classifyPluggyTransaction({ type: "CREDIT", description: "Venda balcão", operationType: null }), "income");
  assert.equal(classifyPluggyTransaction({ type: "DEBIT", description: "Compra de material", operationType: null }), "expense");
});
