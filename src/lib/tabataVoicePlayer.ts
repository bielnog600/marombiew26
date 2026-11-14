// Voz do Fabiew no Player do TABATA: usa os mesmos áudios aprovados da "Voz da Correção ao vivo"
// (bucket privado coach-voice, gerados uma vez no ElevenLabs), mas só baixa as falas do TABATA.
// Sem áudio pronto, quem chama toca o bipe atual (nunca a voz do celular).
// Nunca sobrepõe: se uma fala ainda está tocando, a próxima não começa.
import { supabase } from '@/integrations/supabase/client';
import { createCoachVoice, type CoachVoice } from '@/lib/liveCorrection/voice/browserVoice';
import { isTabataVoiceKey } from './tabataVoiceCues';

export interface TabataVoice {
  /** Chamar síncrono no toque (libera o áudio no iPhone). */
  unlock(): void;
  preload(): Promise<void>;
  /** Falas do TABATA aprovadas e já baixadas. */
  readyKeys(): string[];
  ready(key: string): boolean;
  busy(): boolean;
  /** Toca se nada estiver tocando: true = tocou, false = ocupado. Rejeita se o áudio falhar. */
  play(key: string): Promise<boolean>;
  /** Toca logo depois da fala atual, se ela terminar em até `maxWaitMs`; senão não toca. */
  playNext(key: string, maxWaitMs: number): Promise<boolean>;
  stop(): void;
}

export function createTabataVoice(base?: CoachVoice, approvedKeys: string[] = []): TabataVoice {
  const keys = new Set(approvedKeys);
  const voice = base ?? createCoachVoice({
    fetchApproved: async () => {
      const { data, error } = await supabase.rpc('coach_voice_clips', {});
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []).filter(
        (r: any) => (!r.tipo || r.tipo === 'sistema') && isTabataVoiceKey(String(r.phrase_key)),
      );
      for (const r of rows) keys.add(String(r.phrase_key));
      return rows;
    },
    fetchMotivationEnabled: async () => false,
    fetchNamePhrasesEnabled: async () => false,
  });
  let current: Promise<void> | null = null;
  const play = async (key: string): Promise<boolean> => {
    if (current) return false;
    if (!voice.outputs.hasClip(key)) throw new Error('clip_unavailable');
    const job = voice.outputs.playClip(key);
    current = job;
    try { await job; } finally { if (current === job) current = null; }
    return true;
  };
  return {
    unlock: () => voice.unlock(),
    preload: () => voice.preload([]),
    readyKeys: () => [...keys].filter(k => voice.outputs.hasClip(k)),
    ready: (key) => voice.outputs.hasClip(key),
    busy: () => current != null,
    play,
    playNext: async (key, maxWaitMs) => {
      const pending = current;
      if (pending) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finished = await Promise.race([
          pending.then(() => true, () => true),
          new Promise<boolean>(r => { timer = setTimeout(() => r(false), maxWaitMs); }),
        ]);
        clearTimeout(timer);
        if (!finished) return false;
      }
      return play(key);
    },
    stop: () => { current = null; voice.outputs.stop(); },
  };
}
