import { supabase } from '@/integrations/supabase/client';
import type { AppLanguage } from '@/i18n';

const CACHE_PREFIX = 'plan-translation-v1:';
const FAIL_PREFIX = 'plan-translation-fail-v1:';

/** Tempo máximo esperando a tradução antes de desistir e manter o original. */
export const TRANSLATION_TIMEOUT_MS = 15_000;
/** Depois de timeout/erro, não tenta de novo o mesmo conteúdo por 10 min. */
export const TRANSLATION_RETRY_AFTER_MS = 10 * 60_000;

const hash = (value: string) => {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return String(h);
};

const keyFor = (content: string, language: AppLanguage) => `${language}:${hash(content)}`;

/** Chamadas em andamento por conteúdo: telas que recarregam não disparam outra IA. */
const inflight = new Map<string, Promise<string>>();

/** Só para testes: esquece as chamadas em andamento. */
export const __resetPlanTranslationState = () => inflight.clear();

/** Tradução já salva neste aparelho (síncrono), ou null. */
export const getCachedPlanTranslation = (content: string, language: AppLanguage): string | null => {
  if (language === 'pt' || !content?.trim()) return null;
  try {
    return localStorage.getItem(`${CACHE_PREFIX}${keyFor(content, language)}`) || null;
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
 * Traduz o markdown de um plano (treino/dieta) para o idioma do aluno.
 * Nunca rejeita e nunca demora mais que `timeoutMs`: em timeout ou erro
 * devolve o original e não tenta de novo por 10 min. O resultado é só para
 * exibir texto — a lógica do app usa sempre o original em português.
 */
export const translatePlanMarkdown = async (
  content: string,
  language: AppLanguage,
  options: { timeoutMs?: number } = {},
): Promise<string> => {
  if (language === 'pt' || !content?.trim()) return content;

  const key = keyFor(content, language);
  const cached = getCachedPlanTranslation(content, language);
  if (cached) return cached;
  if (failedRecently(key)) return content;

  const running = inflight.get(key);
  if (running) return running;

  const timeoutMs = options.timeoutMs ?? TRANSLATION_TIMEOUT_MS;
  const job = (async () => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          controller?.abort();
          resolve(null);
        }, timeoutMs);
      });
      const call = Promise.resolve()
        .then(() =>
          supabase.functions.invoke('translate-plan', {
            body: { content, targetLanguage: language },
            ...(controller ? { signal: controller.signal } : {}),
          }),
        )
        .catch(() => null);
      const res = await Promise.race([call, timeout]);
      const data = (res as { data?: { translated?: unknown } } | null)?.data;
      const translated = typeof data?.translated === 'string' ? data.translated.trim() : '';
      if (!res || (res as { error?: unknown }).error || !translated) {
        markFailure(key);
        return content;
      }
      try { localStorage.setItem(`${CACHE_PREFIX}${key}`, translated); } catch { /* cota cheia */ }
      clearFailure(key);
      return translated;
    } catch {
      markFailure(key);
      return content;
    } finally {
      if (timer) clearTimeout(timer);
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
};
