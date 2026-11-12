export const cashQuestion = "Consulte contas a pagar, prazos e caixa registrado. Priorize as contas e mostre o impacto no caixa com premissas claras.";

function normalizeQuestion(question: string) {
  return question.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
}

const cashQuestions = new Set([
  cashQuestion,
  "Quais contas pagar primeiro?",
  "Quais contas devo pagar primeiro?",
  "Qual é a projeção de caixa?",
  "Atualizar projeção de caixa",
].map(normalizeQuestion));

export function isCashQuestion(question: string) {
  return cashQuestions.has(normalizeQuestion(question));
}
