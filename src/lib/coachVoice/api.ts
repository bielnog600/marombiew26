import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface ElevenVoice { voice_id: string; name: string; category: string | null; preview_url: string | null }
export interface ElevenModelOption { model_id: string; name: string }
export interface CoachVoiceTake {
  id: string;
  phrase_key: string;
  file_path: string;
  texto: string;
  voice_id: string;
  model_id: string;
  settings: Record<string, unknown> | null;
  approved: boolean;
  created_at: string;
}

/** Chama a função coach-voice e devolve a mensagem de erro em português, se houver. */
export async function callCoachVoice<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('coach-voice', { body });
  if (error) {
    let message = 'Não foi possível falar com o servidor. Tente de novo.';
    if (error instanceof FunctionsHttpError) {
      try {
        const parsed = JSON.parse(await error.context.text());
        if (parsed?.error) message = String(parsed.error);
      } catch { /* mantém a genérica */ }
    }
    throw new Error(message);
  }
  return data as T;
}

/** Voz chamada "Fabiew" (sem diferenciar acento/maiúsculas), para pré-selecionar. */
export function findOwnVoice(voices: ElevenVoice[], name = 'Fabiew'): ElevenVoice | null {
  const n = name.toLowerCase();
  return voices.find((v) => v.name.trim().toLowerCase() === n)
    ?? voices.find((v) => v.name.toLowerCase().includes(n))
    ?? null;
}
