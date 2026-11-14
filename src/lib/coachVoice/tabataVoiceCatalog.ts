// Falas do Player do TABATA na tela de voz (aba "TABATA"). Ficam fora do catálogo da câmera
// para a Correção ao vivo não mudar; as chaves são as que o Player procura.
import type { VoicePhrase } from '@/lib/liveCorrection/voice/phrases';
import { TABATA_VOICE_PHRASES } from '@/lib/tabataPlayerView';

export const TABATA_VOICE_CATALOG: VoicePhrase[] = TABATA_VOICE_PHRASES.map((p) => ({
  key: p.key, text: p.text, voiceText: p.text, category: 'tabata',
}));

/** Quando cada fala toca no Player (mostrado no card). */
export const TABATA_VOICE_MOMENTS: Record<string, string> = {
  tabata_preparado: 'Na tela "Fique pronto", antes de começar',
  tabata_321_bora: 'Nos 3 s antes de cada exercício ("bora!" no início)',
  tabata_descanse: 'No início de cada descanso (6 s ou mais)',
  tabata_respira: 'No meio do descanso (8 s ou mais) e entre blocos',
  tabata_proximo_bloco: 'Na tela de transição entre blocos',
};
