export const openFinanceQuestion = "Mostre as contas a pagar e a receber em aberto. Priorize os vencimentos e destaque as contas atrasadas.";

function normalizeQuestion(question: string) {
  return question.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
}

const financeQuestions = new Set([
  openFinanceQuestion,
  "Quais contas pagar primeiro?",
  "Quais contas devo pagar primeiro?",
  "Quanto tenho a pagar e a receber?",
].map(normalizeQuestion));

export function isOpenFinanceQuestion(question: string) {
  return financeQuestions.has(normalizeQuestion(question));
}
