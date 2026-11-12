// Pure AI cost helpers (no Deno APIs): shared by the usage logger and the app tests.

export type AiProvider = 'anthropic' | 'openai' | 'lovable_ai' | 'elevenlabs' | 'outro';

export interface AiPrice {
  input_per_mtok: number | string | null;
  output_per_mtok: number | string | null;
  cache_write_per_mtok?: number | string | null;
  cache_read_per_mtok?: number | string | null;
  per_1k_chars?: number | string | null;
  long_context_threshold?: number | string | null;
  long_input_per_mtok?: number | string | null;
  long_output_per_mtok?: number | string | null;
  long_cache_write_per_mtok?: number | string | null;
  long_cache_read_per_mtok?: number | string | null;
}

export interface AiUsageQuantities {
  /** Input tokens billed at the base input rate (cache tokens excluded). */
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** Characters sent to a text-to-speech model. */
  characters: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown) => Math.max(0, Math.round(num(v) ?? 0));

export const emptyQuantities = (): AiUsageQuantities => ({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, characters: 0 });

/** Anthropic `usage`: input_tokens already excludes cache writes/reads. */
export function anthropicQuantities(usage: any): AiUsageQuantities {
  return {
    ...emptyQuantities(),
    inputTokens: int(usage?.input_tokens),
    outputTokens: int(usage?.output_tokens),
    cacheWriteTokens: int(usage?.cache_creation_input_tokens),
    cacheReadTokens: int(usage?.cache_read_input_tokens),
  };
}

/** OpenAI-compatible `usage` (OpenAI and the Lovable AI gateway): prompt_tokens includes cached tokens. */
export function openAiQuantities(usage: any): AiUsageQuantities {
  const prompt = int(usage?.prompt_tokens ?? usage?.input_tokens);
  const cached = Math.min(prompt, int(usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens));
  return {
    ...emptyQuantities(),
    inputTokens: prompt - cached,
    outputTokens: int(usage?.completion_tokens ?? usage?.output_tokens),
    cacheReadTokens: cached,
  };
}

export function usageQuantities(provider: AiProvider, usage: any): AiUsageQuantities {
  if (provider === 'anthropic') return anthropicQuantities(usage);
  if (provider === 'openai' || provider === 'lovable_ai') return openAiQuantities(usage);
  return emptyQuantities();
}

/**
 * Cost in USD from the editable price row. Prices are per 1M tokens (and per
 * 1k characters for voice). A prompt above `long_context_threshold` (input +
 * cache writes + cache reads) pays the long-context prices for the whole
 * request, as the providers bill it. Missing cache prices fall back to the
 * provider defaults (writes 1.25× input, reads = input). Null when there is no
 * price for the model, so an unknown cost is never shown as zero.
 */
export function computeAiCostUsd(price: AiPrice | null | undefined, q: Partial<AiUsageQuantities>): number | null {
  if (!price) return null;
  const input = int(q.inputTokens);
  const output = int(q.outputTokens);
  const cw = int(q.cacheWriteTokens);
  const cr = int(q.cacheReadTokens);
  const chars = int(q.characters);
  const threshold = num(price.long_context_threshold);
  const long = threshold != null && threshold > 0 && input + cw + cr > threshold;
  const pick = (base: unknown, longer: unknown) => (long ? num(longer) ?? num(base) : num(base));
  const inRate = pick(price.input_per_mtok, price.long_input_per_mtok) ?? 0;
  const outRate = pick(price.output_per_mtok, price.long_output_per_mtok) ?? 0;
  const cwRate = pick(price.cache_write_per_mtok, price.long_cache_write_per_mtok) ?? inRate * 1.25;
  const crRate = pick(price.cache_read_per_mtok, price.long_cache_read_per_mtok) ?? inRate;
  const charRate = num(price.per_1k_chars) ?? 0;
  const usd = (input * inRate + output * outRate + cw * cwRate + cr * crRate) / 1_000_000 + (chars / 1000) * charRate;
  return Math.round(usd * 1e8) / 1e8;
}

/** Images sent in a request (Anthropic `image` blocks or OpenAI `image_url` parts), at any depth. */
export function countImageBlocks(value: unknown, depth = 0): number {
  if (!value || typeof value !== 'object' || depth > 6) return 0;
  if (Array.isArray(value)) return value.reduce((n, v) => n + countImageBlocks(v, depth + 1), 0);
  const v = value as Record<string, unknown>;
  if (v.type === 'image' || v.type === 'image_url' || v.type === 'input_image') return 1;
  let n = 0;
  for (const key of ['messages', 'content']) if (key in v) n += countImageBlocks(v[key], depth + 1);
  return n;
}

export function providerForUrl(url: string): AiProvider {
  if (/api\.anthropic\.com/i.test(url)) return 'anthropic';
  if (/api\.openai\.com/i.test(url)) return 'openai';
  if (/ai\.gateway\.lovable\.dev/i.test(url)) return 'lovable_ai';
  if (/api\.elevenlabs\.io/i.test(url)) return 'elevenlabs';
  return 'outro';
}
