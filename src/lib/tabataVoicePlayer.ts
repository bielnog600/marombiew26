// Voz do Fabiew no Player do TABATA: usa os mesmos áudios aprovados da "Voz da Correção ao vivo"
// (bucket privado coach-voice, gerados uma vez no ElevenLabs), mas só baixa as falas do TABATA.
// Sem áudio pronto, quem chama toca o bipe atual (nunca a voz do celular).
import { supabase } from '@/integrations/supabase/client';
import { createCoachVoice, type CoachVoice } from '@/lib/liveCorrection/voice/browserVoice';
import { TABATA_VOICE_PHRASES, isTabataVoiceKey, type TabataVoiceKey } from './tabataPlayerView';

export interface TabataVoice {
  /** Chamar síncrono no toque (libera o áudio no iPhone). */
  unlock(): void;
  preload(): Promise<void>;
  ready(key: TabataVoiceKey): boolean;
  /** Resolve quando terminar; rejeita se o áudio não tocar (aí entra o bipe). */
  play(key: TabataVoiceKey): Promise<void>;
  stop(): void;
}

export function createTabataVoice(base?: CoachVoice): TabataVoice {
  const voice = base ?? createCoachVoice({
    fetchApproved: async () => {
      const { data, error } = await supabase.rpc('coach_voice_clips', {});
      if (error) throw error;
      return (Array.isArray(data) ? data : []).filter(
        (r: any) => (!r.tipo || r.tipo === 'sistema') && isTabataVoiceKey(String(r.phrase_key)),
      );
    },
    fetchMotivationEnabled: async () => false,
    fetchNamePhrasesEnabled: async () => false,
  });
  return {
    unlock: () => voice.unlock(),
    preload: () => voice.preload(TABATA_VOICE_PHRASES.map(p => p.key)),
    ready: (key) => voice.outputs.hasClip(key),
    play: async (key) => {
      if (!voice.outputs.hasClip(key)) throw new Error('clip_unavailable');
      voice.outputs.stop();
      await voice.outputs.playClip(key);
    },
    stop: () => voice.outputs.stop(),
  };
}
