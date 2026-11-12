// AI usage logger: every provider call is recorded in ai_usage_logs (service
// role) in the background, so it never delays or breaks the response.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  computeAiCostUsd, countImageBlocks, emptyQuantities, providerForUrl, usageAttribution, usageQuantities,
  type AiPrice, type AiProvider, type AiUsageQuantities,
} from './aiCost.ts';

export interface AiUsageScope {
  feature: string;
  functionName: string;
  authHeader: string | null;
  actorId?: string | null;
  targetStudentId?: string | null;
  requestId?: string | null;
}

export interface AiUsageRecord extends Partial<AiUsageQuantities> {
  provider: AiProvider;
  model: string;
  imageCount?: number;
  ok: boolean;
  error?: string | null;
  durationMs?: number | null;
  /** Overrides the function's feature for this call (e.g. one food-scanner action). */
  feature?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storage = new AsyncLocalStorage<AiUsageScope>();
let defaults: Pick<AiUsageScope, 'feature' | 'functionName'> = { feature: 'outra_ia', functionName: '' };

type Handler = (req: Request) => Response | Promise<Response>;

/** Wraps a function's request handler so every AI call inside it is attributed to this request. */
export function withAiUsage(feature: string, functionName: string, handler: Handler): Handler {
  defaults = { feature, functionName };
  return (req: Request) => {
    const scope: AiUsageScope = {
      feature,
      functionName,
      authHeader: req.headers.get('Authorization'),
      requestId: req.headers.get('x-request-id') ?? req.headers.get('sb-request-id') ?? crypto.randomUUID(),
    };
    return storage.run(scope, () => handler(req));
  };
}

export const currentAiUsageScope = (): AiUsageScope | undefined => storage.getStore();

/** Student the current request is about (admin generating for them, a plan's owner, ...). */
export function setAiUsageStudent(id: unknown) {
  const scope = storage.getStore();
  if (scope && typeof id === 'string' && UUID.test(id)) scope.targetStudentId = id;
}

/** Looks for the usual student id fields of a request body. */
export function setAiUsageStudentFrom<T>(body: T): T {
  if (!body || typeof body !== 'object') return body;
  const b = body as any;
  const ctx = b.studentContext && typeof b.studentContext === 'object' ? b.studentContext : {};
  for (const v of [b.studentId, b.student_id, b.alunoId, b.aluno_id, ctx.studentId, ctx.student_id, ctx.user_id]) {
    if (typeof v === 'string' && UUID.test(v)) { setAiUsageStudent(v); break; }
  }
  return body;
}

/** Caller already authenticated by the function: skips resolving the token again. */
export function setAiUsageActor(id: unknown) {
  const scope = storage.getStore();
  if (scope && typeof id === 'string' && UUID.test(id)) scope.actorId = id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;
const service = (): any => {
  if (!client) {
    client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false },
    });
  }
  return client;
};

const priceCache = new Map<string, { at: number; price: AiPrice | null }>();
async function priceFor(provider: string, model: string): Promise<AiPrice | null> {
  const key = `${provider}|${model}`;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.price;
  const { data } = await service().from('ai_model_prices').select('*').eq('provider', provider).eq('model', model).maybeSingle();
  const price = (data as AiPrice | null) ?? null;
  priceCache.set(key, { at: Date.now(), price });
  return price;
}

type Actor = { id: string | null; role: 'aluno' | 'admin' | 'sistema' };
const actorCache = new Map<string, Actor>();
async function roleOf(id: string): Promise<Actor> {
  const cached = actorCache.get(`id:${id}`);
  if (cached) return cached;
  const { data } = await service().from('user_roles').select('role').eq('user_id', id).eq('role', 'admin').maybeSingle();
  const actor: Actor = { id, role: data ? 'admin' : 'aluno' };
  if (actorCache.size > 500) actorCache.clear();
  actorCache.set(`id:${id}`, actor);
  return actor;
}
async function resolveActor(scope: AiUsageScope | undefined): Promise<Actor> {
  if (scope?.actorId) return await roleOf(scope.actorId);
  const token = (scope?.authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  const internal = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('SUPABASE_ANON_KEY')].filter(Boolean);
  if (!token || internal.includes(token) || token.split('.').length !== 3) return { id: null, role: 'sistema' };
  const cached = actorCache.get(`t:${token}`);
  if (cached) return cached;
  const { data } = await service().auth.getUser(token);
  const actor = data?.user?.id ? await roleOf(data.user.id) : { id: null, role: 'sistema' as const };
  actorCache.set(`t:${token}`, actor);
  return actor;
}

async function persist(scope: AiUsageScope | undefined, rec: AiUsageRecord) {
  const actor = await resolveActor(scope);
  const price = rec.model ? await priceFor(rec.provider, rec.model) : null;
  const q: AiUsageQuantities = { ...emptyQuantities(), ...rec };
  const cost = computeAiCostUsd(price, q);
  const { error } = await service().from('ai_usage_logs').insert({
    ...usageAttribution(actor.role, actor.id, scope?.targetStudentId),
    actor_id: actor.id,
    actor_role: actor.role,
    feature: rec.feature ?? scope?.feature ?? defaults.feature,
    function_name: scope?.functionName ?? defaults.functionName,
    provider: rec.provider,
    model: rec.model ?? '',
    input_tokens: q.inputTokens,
    output_tokens: q.outputTokens,
    cache_write_tokens: q.cacheWriteTokens,
    cache_read_tokens: q.cacheReadTokens,
    characters: q.characters,
    image_count: Math.max(0, Math.round(rec.imageCount ?? 0)),
    cost_usd: cost,
    price_found: !!price,
    request_id: scope?.requestId ?? null,
    ok: rec.ok,
    error: rec.error ? String(rec.error).slice(0, 300) : null,
    duration_ms: rec.durationMs == null ? null : Math.round(rec.durationMs),
  });
  if (error) console.error('ai usage log insert failed', error.message);
}

function background(task: Promise<unknown>) {
  const safe = task.catch((e) => console.error('ai usage log failed', String(e)));
  try {
    (globalThis as any).EdgeRuntime?.waitUntil?.(safe);
  } catch {
    /* runtime without waitUntil: the promise still settles on its own */
  }
}

/** Records one provider call without blocking. Pass the scope captured before the call when it runs inside a stream. */
export function recordAiUsage(rec: AiUsageRecord, scope: AiUsageScope | undefined = storage.getStore()) {
  try {
    background(persist(scope, rec));
  } catch (e) {
    console.error('ai usage log failed', String(e));
  }
}

const parseBody = (body: unknown): any => {
  if (typeof body !== 'string') return null;
  try { return JSON.parse(body); } catch { return null; }
};

/**
 * `fetch` for AI providers: same request and response, plus a background usage
 * log (tokens from the JSON `usage`, characters for ElevenLabs text-to-speech).
 * Streams are left to the caller, which records usage when the stream ends.
 */
export async function aiFetch(url: string, init: RequestInit = {}, opts: { feature?: string } = {}): Promise<Response> {
  const scope = storage.getStore();
  const provider = providerForUrl(url);
  const body = parseBody(init.body);
  const isTts = provider === 'elevenlabs' && /\/v1\/text-to-speech\//.test(url);
  if (provider === 'elevenlabs' && !isTts) return await fetch(url, init);
  const model = String(body?.model ?? body?.model_id ?? '');
  const imageCount = countImageBlocks(body);
  const started = Date.now();
  const base = { provider, model, imageCount, feature: opts.feature };
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (!init.signal?.aborted) recordAiUsage({ ...base, ok: false, error: 'network failure', durationMs: Date.now() - started }, scope);
    throw e;
  }
  const durationMs = Date.now() - started;
  if (isTts) {
    recordAiUsage({ ...base, characters: res.ok ? String(body?.text ?? '').length : 0, ok: res.ok, error: res.ok ? null : `HTTP ${res.status}`, durationMs }, scope);
    return res;
  }
  if (!res.ok) {
    recordAiUsage({ ...base, ok: false, error: `HTTP ${res.status}`, durationMs }, scope);
    return res;
  }
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('event-stream') || body?.stream === true) return res;
  const copy = res.clone();
  background(copy.json().then((data: any) => persist(scope, { ...base, ...usageQuantities(provider, data?.usage), ok: true, durationMs })));
  return res;
}
