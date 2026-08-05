import { supabase } from '@/integrations/supabase/client';
import type { AppLanguage } from '@/i18n';

const CACHE_PREFIX = 'plan-translation-v1:';

const hash = (value: string) => {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return String(h);
};

/**
 * Traduz o markdown de um plano (treino/dieta) para o idioma do aluno.
 * Resultado fica em cache local por conteúdo, evitando novas chamadas de IA.
 */
export const translatePlanMarkdown = async (
  content: string,
  language: AppLanguage,
): Promise<string> => {
  if (language === 'pt' || !content?.trim()) return content;

  const key = `${CACHE_PREFIX}${language}:${hash(content)}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return cached;
  } catch { /* localStorage indisponível */ }

  try {
    const { data, error } = await supabase.functions.invoke('translate-plan', {
      body: { content, targetLanguage: language },
    });
    const translated = typeof data?.translated === 'string' ? data.translated.trim() : '';
    if (error || !translated) return content;
    try { localStorage.setItem(key, translated); } catch { /* cota cheia */ }
    return translated;
  } catch {
    return content;
  }
};
