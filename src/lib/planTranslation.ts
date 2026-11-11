import { supabase } from '@/integrations/supabase/client';
import type { AppLanguage } from '@/i18n';
import { dictionaryFromPairs, type PlanTextDictionary, type PlanTextPair } from '@/lib/planTranslationDisplay';

const CACHE_PREFIX = 'plan-translation-v2:';
const FAIL_PREFIX = 'plan-translation-fail-v2:';

/** Tempo máximo esperando a tradução em segundo plano (a tela já mostra o original). */
export const TRANSLATION_TIMEOUT_MS = 120_000;
/** Depois de ERRO do servidor, não tenta de novo o mesmo conteúdo por 10 min (timeout não bloqueia). */
export const TRANSLATION_RETRY_AFTER_MS = 10 * 60_000;

const hash = (value: string) => {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return String(h);
};

const keyFor = (planId: string, content: string, language: AppLanguage) => `${language}:${planId}:${hash(content)}`;

/** Chamadas em andamento por plano/conteúdo: telas que recarregam não disparam outra chamada. */
const inflight = new Map<string, Promise<PlanTextDictionary | null>>();

/** Só para testes: esquece as chamadas em andamento. */
export const __resetPlanTranslationState = () => inflight.clear();

const isPairs = (value: unknown): value is PlanTextPair[] =>
  Array.isArray(value) && value.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string');

const skip = (planId: string | null | undefined, content: string, language: AppLanguage) =>
  language === 'pt' || !planId || !content?.trim();

/** Tradução já salva neste aparelho (síncrono), ou null. */
export const getCachedPlanTranslation = (
  planId: string | null | undefined,
  content: string,
  language: AppLanguage,
): PlanTextDictionary | null => {
  if (skip(planId, content, language)) return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${keyFor(planId!, content, language)}`);
    if (!raw) return null;
    const pairs = JSON.parse(raw);
    return isPairs(pairs) ? dictionaryFromPairs(pairs) : null;
  } catch {
    return null;
  }
};

const failedRecently = (key: string) => {
  try {
    const at = Number(localStorage.getItem(`${FAIL_PREFIX}${key}`));
    return Number.isFinite(at) && at > 0 && Date.now() - at < TRANSLATION_RETRY_AFTER_MS;
  } catch {
    return false;
  }
};

const markFailure = (key: string) => {
  try { localStorage.setItem(`${FAIL_PREFIX}${key}`, String(Date.now())); } catch { /* cota cheia */ }
};

const clearFailure = (key: string) => {
  try { localStorage.removeItem(`${FAIL_PREFIX}${key}`); } catch { /* ignore */ }
};

/**
 * Pede ao servidor a tradução dos textos exibidos de um plano (treino/dieta).
 * O servidor lê o plano, traduz só os nomes mostrados e guarda o resultado:
 * só o primeiro acesso de cada plano espera a IA. Nunca rejeita: em timeout
 * devolve null (o servidor termina e salva; a próxima abertura já vem pronta);
 * em erro devolve null e não tenta de novo por 10 min. O resultado é só para
 * exibir texto — a lógica do app usa sempre o original em português.
 */
export const translatePlanTexts = async (
  planId: string | null | undefined,
  content: string,
  language: AppLanguage,
  options: { timeoutMs?: number } = {},
): Promise<PlanTextDictionary | null> => {
  if (skip(planId, content, language)) return null;

  const key = keyFor(planId!, content, language);
  const cached = getCachedPlanTranslation(planId, content, language);
  if (cached) return cached;
  if (failedRecently(key)) return null;

  const running = inflight.get(key);
  if (running) return running;

  const timeoutMs = options.timeoutMs ?? TRANSLATION_TIMEOUT_MS;
  const TIMEOUT = Symbol('timeout');
  const job = (async () => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => {
          controller?.abort();
          resolve(TIMEOUT);
        }, timeoutMs);
      });
      const call = Promise.resolve()
        .then(() =>
          supabase.functions.invoke('translate-plan', {
            body: { planId, targetLanguage: language },
            ...(controller ? { signal: controller.signal } : {}),
          }),
        )
        .catch(() => null);
      const res = await Promise.race([call, timeout]);
      if (res === TIMEOUT) return null; // sem pausa: o servidor continua e salva
      const pairs = (res as { data?: { pairs?: unknown } } | null)?.data?.pairs;
      if (!res || (res as { error?: unknown }).error || !isPairs(pairs)) {
        markFailure(key);
        return null;
      }
      try { localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(pairs)); } catch { /* cota cheia */ }
      clearFailure(key);
      return dictionaryFromPairs(pairs);
    } catch {
      markFailure(key);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
};
