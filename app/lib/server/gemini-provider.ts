import { aiViewTargets } from "../../ai/types";
import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import type { AIProvider, ProviderFunctionResult, ProviderInteraction } from "./ai-provider";

const responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Resposta principal clara em português do Brasil, com parágrafos curtos." },
    severity: { type: "string", enum: ["normal", "info", "warning", "critical"] },
    metrics: { type: "array", maxItems: 6, items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, trend: { type: "string" }, tone: { type: "string", enum: ["positive", "negative", "neutral"] } }, required: ["label", "value"] } },
    alerts: { type: "array", maxItems: 8, items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, severity: { type: "string", enum: ["critical", "warning", "info", "success"] }, entityType: { type: "string", enum: ["order", "transaction", "client", "finance"] }, entityId: { type: "string" } }, required: ["title", "detail", "severity"] } },
    recommendations: { type: "array", maxItems: 8, items: { type: "string" } },
    actions: { type: "array", maxItems: 6, items: { type: "object", properties: { label: { type: "string" }, type: { type: "string", enum: ["navigate", "prompt"] }, target: { type: "string", enum: [...aiViewTargets] }, prompt: { type: "string" } }, required: ["label", "type"] } },
    confidence: { type: "string", enum: ["alta", "média", "baixa"] },
    sources: { type: "array", maxItems: 8, items: { type: "string" } },
  },
  required: ["summary", "severity", "metrics", "alerts", "recommendations", "actions"],
};

export class GeminiLimitError extends Error {
  readonly retryAt: number;

  constructor(code: string, retrySeconds: number) {
    super(code);
    this.retryAt = Date.now() + Math.max(1000, Math.min(86_400_000, retrySeconds * 1000));
  }
}

export function normalizeGeminiError(error: unknown) {
  if (error instanceof Error && error.message.startsWith("GEMINI_")) return error;
  const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = Number(details.status ?? details.statusCode ?? details.code ?? 0);
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (status === 401 || status === 403 || message.includes("api key not valid")) return new Error("GEMINI_KEY_INVALID");
  if (status === 429 || message.includes("quota")) {
    const retrySeconds = Number(message.match(/"retrydelay"\s*:\s*"([\d.]+)s"/)?.[1]) || 60;
    if (/requestsperday|tokensper[a-z]*day/.test(message)) return new GeminiLimitError("GEMINI_DAILY_QUOTA", retrySeconds);
    if (/requestsperminute|tokensper[a-z]*minute/.test(message)) return new GeminiLimitError("GEMINI_MINUTE_QUOTA", retrySeconds);
    return new GeminiLimitError("GEMINI_QUOTA_EXCEEDED", retrySeconds);
  }
  if (status === 404 || message.includes("model") && message.includes("not found")) return new Error("GEMINI_MODEL_NOT_FOUND");
  if (status === 400) return new Error("GEMINI_REQUEST_INVALID");
  if (status >= 500) return new Error("GEMINI_UNAVAILABLE");
  return new Error("GEMINI_REQUEST_FAILED");
}

export class GeminiProvider implements AIProvider {
  readonly model: string;
  private client: GoogleGenAI;
  private contents: Content[] = [];
  private lastResponseId = "";

  constructor(apiKey: string, model = "gemini-3.6-flash", private readonly outputSchema: Record<string, unknown> = responseSchema) {
    this.model = model;
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 45000, retryOptions: { attempts: 2, httpStatusCodes: [408, 500, 502, 503, 504] } },
    });
  }

  private async generate(systemInstruction: string, tools: Array<Record<string, unknown>>): Promise<ProviderInteraction> {
    try {
      const declarations = tools.map(({ name, description, parameters }) => ({ name, description, parametersJsonSchema: parameters })) as FunctionDeclaration[];
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.contents,
        config: {
          systemInstruction: systemInstruction + "\nNa resposta final, devolva somente JSON neste formato: " + JSON.stringify(this.outputSchema),
          maxOutputTokens: 4200,
          ...(declarations.length ? { tools: [{ functionDeclarations: declarations }] } : { responseMimeType: "application/json", responseJsonSchema: this.outputSchema }),
        },
      });
      const content = response.candidates?.[0]?.content;
      const outputText = response.text ?? "";
      const functionCalls = (response.functionCalls ?? []).flatMap((call, index) => call.name
        ? [{ id: call.id ?? String(index), name: call.name, arguments: call.args ?? {} }] : []);
      if (!content || (!outputText.trim() && !functionCalls.length)) throw new Error("GEMINI_EMPTY_RESPONSE");
      this.contents.push(content);
      this.lastResponseId = response.responseId || crypto.randomUUID();
      const usage = response.usageMetadata;
      return {
        id: this.lastResponseId, status: "completed", outputText, functionCalls,
        usage: { inputTokens: usage?.promptTokenCount ?? 0, outputTokens: usage?.candidatesTokenCount ?? 0, totalTokens: usage?.totalTokenCount ?? 0 },
      };
    } catch (error) { throw normalizeGeminiError(error); }
  }

  async create(input: string, systemInstruction: string, tools: Array<Record<string, unknown>>) {
    this.contents = [{ role: "user", parts: [{ text: input }] }];
    return this.generate(systemInstruction, tools);
  }

  async continue(previousInteractionId: string, results: ProviderFunctionResult[], systemInstruction: string, tools: Array<Record<string, unknown>>) {
    if (previousInteractionId !== this.lastResponseId) throw new Error("GEMINI_REQUEST_INVALID");
    const calls = this.contents.at(-1)?.parts?.flatMap(part => part.functionCall ? [part.functionCall] : []) ?? [];
    const parts: Part[] = results.map(item => {
      const call = calls.find((candidate, index) => (candidate.id ?? String(index)) === item.id);
      return { functionResponse: { ...(call?.id ? { id: call.id } : {}), name: item.name, response: { result: item.result } } };
    });
    this.contents.push({ role: "user", parts });
    return this.generate(systemInstruction, tools);
  }
}
