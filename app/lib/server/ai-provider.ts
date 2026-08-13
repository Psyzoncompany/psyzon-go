export type ProviderFunctionCall = { id: string; name: string; arguments: Record<string, unknown> };

export type ProviderUsage = { inputTokens: number; outputTokens: number; totalTokens: number };

export type ProviderInteraction = {
  id: string;
  status: string;
  outputText: string;
  functionCalls: ProviderFunctionCall[];
  usage: ProviderUsage;
};

export type ProviderFunctionResult = { id: string; name: string; result: unknown };

export interface AIProvider {
  readonly model: string;
  create(input: string, systemInstruction: string, tools: Array<Record<string, unknown>>): Promise<ProviderInteraction>;
  continue(previousInteractionId: string, results: ProviderFunctionResult[], systemInstruction: string, tools: Array<Record<string, unknown>>): Promise<ProviderInteraction>;
}
