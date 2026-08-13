import { GoogleGenAI } from "@google/genai";
import type { AIProvider, ProviderFunctionResult, ProviderInteraction } from "./ai-provider";

const responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Resposta principal clara em português do Brasil, com parágrafos curtos." },
    severity: { type: "string", enum: ["normal", "info", "warning", "critical"] },
    metrics: { type: "array", maxItems: 6, items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, trend: { type: "string" }, tone: { type: "string", enum: ["positive", "negative", "neutral"] } }, required: ["label", "value"] } },
    alerts: { type: "array", maxItems: 8, items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, severity: { type: "string", enum: ["critical", "warning", "info", "success"] }, entityType: { type: "string", enum: ["order", "transaction", "client", "finance"] }, entityId: { type: "string" } }, required: ["title", "detail", "severity"] } },
    recommendations: { type: "array", maxItems: 8, items: { type: "string" } },
    actions: { type: "array", maxItems: 6, items: { type: "object", properties: { label: { type: "string" }, type: { type: "string", enum: ["navigate", "prompt"] }, target: { type: "string", enum: ["inicio", "producao", "clientes", "financeiro", "pessoal", "ai"] }, prompt: { type: "string" } }, required: ["label", "type"] } },
    confidence: { type: "string", enum: ["alta", "média", "baixa"] },
    sources: { type: "array", maxItems: 8, items: { type: "string" } },
  },
  required: ["summary", "severity", "metrics", "alerts", "recommendations", "actions"],
};

function normalizeInteraction(interaction: Awaited<ReturnType<GoogleGenAI["interactions"]["create"]>>): ProviderInteraction {
  if (Symbol.asyncIterator in Object(interaction)) throw new Error("Resposta streaming inesperada.");
  const result = interaction as Exclude<typeof interaction, AsyncIterable<unknown>>;
  const calls = (result.steps ?? []).filter((step) => step.type === "function_call").map((step) => {
    const call = step as { id: string; name: string; arguments: Record<string, unknown> };
    return { id: call.id, name: call.name, arguments: call.arguments ?? {} };
  });
  return {
    id: result.id ?? "",
    status: result.status ?? "completed",
    outputText: result.output_text ?? "",
    functionCalls: calls,
    usage: { inputTokens: result.usage?.total_input_tokens ?? 0, outputTokens: result.usage?.total_output_tokens ?? 0, totalTokens: result.usage?.total_tokens ?? 0 },
  };
}

function normalizeGeminiError(error: unknown) {
  const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = Number(details.status ?? details.statusCode ?? details.code ?? 0);
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (status === 401 || status === 403 || message.includes("api key not valid")) return new Error("GEMINI_KEY_INVALID");
  if (status === 429 || message.includes("quota")) return new Error("GEMINI_QUOTA_EXCEEDED");
  if (status === 404 || message.includes("model") && message.includes("not found")) return new Error("GEMINI_MODEL_NOT_FOUND");
  if (status === 400) return new Error("GEMINI_REQUEST_INVALID");
  if (status >= 500) return new Error("GEMINI_UNAVAILABLE");
  return new Error("GEMINI_REQUEST_FAILED");
}

export class GeminiProvider implements AIProvider {
  readonly model: string;
  private client: GoogleGenAI;

  constructor(apiKey: string, model = "gemini-3.6-flash") {
    this.model = model;
    this.client = new GoogleGenAI({ apiKey, apiVersion: "v1" });
  }

  private common(systemInstruction: string, tools: Array<Record<string, unknown>>) {
    return {
      model: this.model,
      store: false,
      system_instruction: systemInstruction,
      tools,
      response_format: { type: "text", mime_type: "application/json", schema: responseSchema },
      generation_config: { max_output_tokens: 2600, thinking_level: "medium" as const, thinking_summaries: "none" as const, tool_choice: "auto" as const },
    };
  }

  async create(input: string, systemInstruction: string, tools: Array<Record<string, unknown>>) {
    const params = { ...this.common(systemInstruction, tools), input } as unknown as Parameters<typeof this.client.interactions.create>[0];
    try {
      const interaction = await this.client.interactions.create(params);
      return normalizeInteraction(interaction);
    } catch (error) {
      throw normalizeGeminiError(error);
    }
  }

  async continue(previousInteractionId: string, results: ProviderFunctionResult[], systemInstruction: string, tools: Array<Record<string, unknown>>) {
    const input = results.map((item) => ({ type: "function_result" as const, name: item.name, call_id: item.id, result: [{ type: "text" as const, text: JSON.stringify(item.result) }] }));
    const params = { ...this.common(systemInstruction, tools), previous_interaction_id: previousInteractionId, input } as unknown as Parameters<typeof this.client.interactions.create>[0];
    try {
      const interaction = await this.client.interactions.create(params);
      return normalizeInteraction(interaction);
    } catch (error) {
      throw normalizeGeminiError(error);
    }
  }
}
