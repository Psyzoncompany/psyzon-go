import type { AIProvider, ProviderFunctionResult, ProviderInteraction } from "./ai-provider";

type GroqToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type GroqMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: GroqToolCall[];
};

type GroqCompletion = {
  id?: string;
  choices?: Array<{ message?: GroqMessage; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

const responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
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

class GroqHttpError extends Error {
  constructor(readonly status: number) { super(`GROQ_HTTP_${status}`); }
}

function normalizeGroqError(error: unknown) {
  const status = error instanceof GroqHttpError ? error.status : 0;
  if (status === 401 || status === 403) return new Error("GROQ_KEY_INVALID");
  if (status === 429) return new Error("GROQ_QUOTA_EXCEEDED");
  if (status === 404) return new Error("GROQ_MODEL_NOT_FOUND");
  if (status === 400) return new Error("GROQ_REQUEST_INVALID");
  if (status >= 500) return new Error("GROQ_UNAVAILABLE");
  return new Error("GROQ_REQUEST_FAILED");
}

function groqTools(tools: Array<Record<string, unknown>>) {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

function usage(completion: GroqCompletion) {
  return {
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
  };
}

function functionCalls(message: GroqMessage) {
  return (message.tool_calls ?? []).map((call) => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || "{}"); }
    catch { throw new Error("GROQ_INVALID_TOOL_CALL"); }
    return { id: call.id, name: call.function.name, arguments: args };
  });
}

export class GroqProvider implements AIProvider {
  readonly model: string;
  private readonly histories = new Map<string, GroqMessage[]>();

  constructor(private readonly apiKey: string, model = "openai/gpt-oss-120b") {
    this.model = model;
  }

  private async request(messages: GroqMessage[], tools?: Array<Record<string, unknown>>, jsonOutput = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          reasoning_effort: "low",
          max_completion_tokens: tools?.length ? 700 : 1400,
          ...(tools?.length ? { tools: groqTools(tools), tool_choice: "auto", parallel_tool_calls: true } : {}),
          ...(jsonOutput ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!response.ok) throw new GroqHttpError(response.status);
      return await response.json() as GroqCompletion;
    } catch (error) {
      throw normalizeGroqError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  private async run(messages: GroqMessage[], systemInstruction: string, tools: Array<Record<string, unknown>>) {
    const completion = await this.request(messages, tools);
    const message = completion.choices?.[0]?.message;
    if (!message) throw new Error("GROQ_EMPTY_RESPONSE");
    const calls = functionCalls(message);
    if (!calls.length) return { id: completion.id ?? crypto.randomUUID(), status: "completed", outputText: message.content ?? "", functionCalls: [], usage: usage(completion) } satisfies ProviderInteraction;
    const id = completion.id ?? crypto.randomUUID();
    this.histories.set(id, [...messages, message]);
    return { id, status: "requires_action", outputText: message.content ?? "", functionCalls: calls, usage: usage(completion) } satisfies ProviderInteraction;
  }

  async create(input: string, systemInstruction: string, tools: Array<Record<string, unknown>>) {
    return this.run([{ role: "system", content: systemInstruction }, { role: "user", content: input }], systemInstruction, tools);
  }

  async continue(previousInteractionId: string, results: ProviderFunctionResult[], systemInstruction: string, tools: Array<Record<string, unknown>>) {
    const history = this.histories.get(previousInteractionId);
    if (!history) throw new Error("GROQ_STATE_LOST");
    this.histories.delete(previousInteractionId);
    const messages = [
      ...history,
      ...results.map<GroqMessage>((item) => ({ role: "tool", tool_call_id: item.id, name: item.name, content: JSON.stringify(item.result) })),
      { role: "system" as const, content: `Responda agora SOMENTE como JSON válido neste formato: ${JSON.stringify(responseSchema)}. Preserve os fatos dos resultados e não invente dados.` },
    ];
    const completion = await this.request(messages, undefined, true);
    const message = completion.choices?.[0]?.message;
    if (!message) throw new Error("GROQ_EMPTY_RESPONSE");
    return { id: completion.id ?? crypto.randomUUID(), status: "completed", outputText: message.content ?? "", functionCalls: [], usage: usage(completion) } satisfies ProviderInteraction;
  }
}
