const pricingPerMillionTokens: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 }
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const pricing = pricingPerMillionTokens[model] ?? pricingPerMillionTokens["gpt-4.1-mini"];
  return Number(((inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output).toFixed(6));
}

export function extractTokenUsage(response: unknown) {
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}
