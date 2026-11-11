/**
 * translate-plan request handling with injected dependencies (pure, testable).
 * - Student/admin call `{ planId, targetLanguage }`: the plan is read with the
 *   caller's own permissions, the displayed strings are extracted on the server
 *   and looked up in plan_translations; only a miss calls the AI, once.
 * - Publish trigger call `{ planId, targetLanguage, source: 'publish' }`: only
 *   published diets/trainings of students whose app is in English; answers at
 *   once and translates in the background.
 */
import {
  SUPPORTED_LANGUAGES,
  cacheKeyInput,
  extractPlanTexts,
  isTranslatableTipo,
  type TranslationPair,
} from './texts.ts';

export type TranslatablePlan = {
  id: string;
  tipo: string;
  conteudo: string | null;
  is_draft: boolean | null;
  student_id: string;
};

export interface TranslatePlanDeps {
  corsHeaders: Record<string, string>;
  /** Bearer token of a signed-in user, or null. */
  authenticate(req: Request): Promise<string | null>;
  loadPlanForUser(token: string, planId: string): Promise<TranslatablePlan | null>;
  loadPlan(planId: string): Promise<TranslatablePlan | null>;
  studentLanguage(studentId: string): Promise<string | null>;
  findCached(contentHash: string, language: string): Promise<TranslationPair[] | null>;
  saveCached(row: { plan_id: string; language: string; content_hash: string; translated: TranslationPair[] }): Promise<void>;
  /** Calls the AI; throws on failure or on an answer not aligned with `texts`. */
  translate(texts: string[], language: string): Promise<TranslationPair[]>;
  sha256(text: string): Promise<string>;
  waitUntil(promise: Promise<unknown>): void;
  log?(message: string, extra?: unknown): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createTranslatePlanHandler(deps: TranslatePlanDeps) {
  const inflight = new Map<string, Promise<{ pairs: TranslationPair[]; cached: boolean }>>();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...deps.corsHeaders, 'Content-Type': 'application/json' } });

  const ensureTranslation = async (plan: TranslatablePlan, language: string) => {
    const texts = extractPlanTexts(plan.tipo, plan.conteudo ?? '');
    if (texts.length === 0) return { pairs: [] as TranslationPair[], cached: true };
    const contentHash = await deps.sha256(cacheKeyInput(texts));
    const hit = await deps.findCached(contentHash, language);
    if (hit) return { pairs: hit, cached: true };
    const key = `${language}:${contentHash}`;
    const running = inflight.get(key);
    if (running) return running;
    const job = (async () => {
      try {
        const pairs = await deps.translate(texts, language);
        try {
          await deps.saveCached({ plan_id: plan.id, language, content_hash: contentHash, translated: pairs });
        } catch (error) {
          deps.log?.('translate-plan cache save failed', String(error));
        }
        return { pairs, cached: false };
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, job);
    return job;
  };

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: deps.corsHeaders });
    try {
      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      const planId = typeof body?.planId === 'string' ? body.planId : '';
      const language = typeof body?.targetLanguage === 'string' ? body.targetLanguage : '';
      if (!UUID.test(planId)) return json({ error: 'Invalid planId' }, 400);
      if (language === 'pt') return json({ pairs: [], cached: true });
      if (!SUPPORTED_LANGUAGES.includes(language)) return json({ error: 'Unsupported language' }, 400);

      if (body?.source === 'publish') {
        const plan = await deps.loadPlan(planId);
        if (!plan) return json({ skipped: 'not_found' });
        if (plan.is_draft !== false || !isTranslatableTipo(plan.tipo)) return json({ skipped: 'not_published' });
        if ((await deps.studentLanguage(plan.student_id)) !== language) return json({ skipped: 'language' });
        deps.waitUntil(
          ensureTranslation(plan, language).catch((error) => deps.log?.('translate-plan prewarm failed', String(error))),
        );
        return json({ queued: true }, 202);
      }

      const token = await deps.authenticate(req);
      if (!token) return json({ error: 'Unauthorized' }, 401);
      const plan = await deps.loadPlanForUser(token, planId);
      if (!plan) return json({ error: 'Plan not found' }, 404);
      if (!isTranslatableTipo(plan.tipo)) return json({ pairs: [], cached: true });
      // Keeps running (and saves to the cache) even if the app gives up waiting.
      const job = ensureTranslation(plan, language);
      deps.waitUntil(job.catch(() => undefined));
      const result = await job;
      return json(result);
    } catch (error) {
      deps.log?.('translate-plan failed', String(error));
      return json({ error: 'Translation failed' }, 502);
    }
  };
}
