import type { AIMetric, AIMessage, AIResponsePayload } from "./types";

const unavailable = "Não foi possível organizar esta resposta. Envie a pergunta novamente para atualizar a análise.";
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatAIAmount(amount: number) {
  return currency.format(amount);
}

export function formatAIDate(date: string) {
  return date.split("-").reverse().join("/");
}

function cleanString(value: unknown, max = 6000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cleanPayload(value: unknown): AIResponsePayload {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const severity = ["normal", "info", "warning", "critical"].includes(String(raw.severity)) ? raw.severity as AIResponsePayload["severity"] : "normal";
  const confidence = ["alta", "média", "baixa"].includes(String(raw.confidence)) ? raw.confidence as AIResponsePayload["confidence"] : undefined;
  const metrics = Array.isArray(raw.metrics) ? raw.metrics.slice(0, 6).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({ label: cleanString(item.label, 80), value: cleanString(item.value, 80), trend: cleanString(item.trend, 80) || undefined, tone: ["positive", "negative", "neutral", "info"].includes(String(item.tone)) ? item.tone as AIMetric["tone"] : undefined })).filter((item) => item.label && item.value) : [];
  const alerts = Array.isArray(raw.alerts) ? raw.alerts.slice(0, 8).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({ title: cleanString(item.title, 120), detail: cleanString(item.detail, 320), severity: ["critical", "warning", "info", "success"].includes(String(item.severity)) ? item.severity as "critical" | "warning" | "info" | "success" : "info" as const, entityType: ["order", "transaction", "client", "finance"].includes(String(item.entityType)) ? item.entityType as "order" | "transaction" | "client" | "finance" : undefined, entityId: cleanString(item.entityId, 100) || undefined })).filter((item) => item.title && item.detail) : [];
  const recommendations = Array.isArray(raw.recommendations) ? raw.recommendations.map((item) => cleanString(item, 360)).filter(Boolean).slice(0, 8) : [];
  const actions = Array.isArray(raw.actions) ? raw.actions.slice(0, 6).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({ label: cleanString(item.label, 80), type: item.type === "prompt" ? "prompt" as const : "navigate" as const, target: ["inicio", "producao", "clientes", "financeiro", "pessoal", "ai"].includes(String(item.target)) ? item.target as "inicio" | "producao" | "clientes" | "financeiro" | "pessoal" | "ai" : undefined, prompt: cleanString(item.prompt, 300) || undefined })).filter((item) => item.label && (item.type === "prompt" ? item.prompt : item.target)) : [];
  const sources = Array.isArray(raw.sources) ? raw.sources.map((item) => cleanString(item, 100)).filter(Boolean).slice(0, 8) : [];
  return { summary: cleanString(raw.summary, 6000) || "Não foi possível organizar a resposta da IA.", severity, metrics, alerts, recommendations, actions, confidence, sources };
}

function structuredAnswer(text: string): AIResponsePayload | undefined {
  const fenced = Array.from(text.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/gi), (match) => match[1]);
  for (const candidate of [text, ...fenced]) {
    try {
      const value = JSON.parse(candidate.trim()) as Partial<AIResponsePayload> | null;
      if (typeof value?.summary === "string" && value.summary.trim()) return cleanPayload(value);
    } catch {
      // Gemini can return Markdown around an otherwise valid response.
    }
  }
}

function looksLikeBrokenEnvelope(text: string) {
  return /^(?:```(?:json)?\s*)?\{\s*"(?:summary|severity|metrics|alerts|recommendations|actions|confidence|sources)"\s*:/i.test(text);
}

export function parseAIAnswer(text: string): AIResponsePayload {
  const summary = text.trim();
  return structuredAnswer(summary) ?? cleanPayload({ summary: !summary || looksLikeBrokenEnvelope(summary) ? unavailable : summary });
}

export function readAIAnswer(message: AIMessage): AIResponsePayload {
  const summary = (message.payload?.summary || message.content).trim();
  const recovered = structuredAnswer(summary);
  if (recovered) return { ...recovered, cashPlan: message.payload?.cashPlan, confirmation: message.payload?.confirmation };
  if (!message.payload) return parseAIAnswer(summary);
  return { ...message.payload, summary: looksLikeBrokenEnvelope(summary) ? unavailable : summary };
}

export function exportAIMessage(message: AIMessage): string {
  if (message.role === "user") return message.content;
  const answer = readAIAnswer(message);
  const plan = answer.cashPlan;
  const sections = [
    answer.summary,
    answer.metrics.length && ["Indicadores", ...answer.metrics.map(({ label, value, trend }) => `• ${label} — ${value}${trend ? ` · ${trend}` : ""}`)].join("\n"),
    answer.alerts.length && ["Atenção", ...answer.alerts.map(({ title, detail }) => `• ${title} — ${detail}`)].join("\n"),
    plan && [
      `Caixa registrado em ${formatAIDate(plan.asOf)} — ${formatAIAmount(plan.balance)}`,
      `Total em aberto — ${formatAIAmount(plan.totalPayables)} · Vencidas — ${formatAIAmount(plan.overdueTotal)}`,
      "",
      "Contas por prioridade",
      ...plan.payables.map(({ description, dueDate, amount }, index) => `${index + 1}. ${description} · ${dueDate ? formatAIDate(dueDate) : "Sem vencimento"} · ${formatAIAmount(amount)}`),
      "",
      "Projeção de caixa (conservador | provável | otimista)",
      ...plan.projections.map((point) => `${point.days} dias · ${[point.conservative, point.likely, point.optimistic].map(formatAIAmount).join(" | ")}`),
      "",
      "Premissas",
      ...plan.assumptions.map((item) => `• ${item}`),
    ].join("\n"),
    answer.recommendations.length && ["Próximos passos", ...answer.recommendations.map((item, index) => `${index + 1}. ${item}`)].join("\n"),
    answer.confirmation && ["Confirmação necessária", answer.confirmation.action, answer.confirmation.currentValue, answer.confirmation.newValue, answer.confirmation.reason, answer.confirmation.impact].filter(Boolean).join("\n"),
    answer.sources?.length && `Fontes — ${answer.sources.join(" · ")}`,
    answer.confidence && `Confiança ${answer.confidence}`,
  ];
  return sections.filter(Boolean).join("\n\n");
}
