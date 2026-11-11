import { describe, expect, it } from 'vitest';
import {
  VOICE_CATALOG, buildVoiceCatalog, legSwitchMessage, numberPhraseKey, phraseKeyForText, START_MESSAGE,
} from '@/lib/liveCorrection/voice/phrases';
import { resolveVoiceSegments } from '@/lib/liveCorrection/voice/queue';
import { EXERCISE_RULES } from '@/lib/liveCorrection/exercises';
import { AUTO_FINISH_MESSAGE, POSITION_MESSAGES, repNumberWord } from '@/lib/liveCorrection/squatAnalysis';

describe('Voz da Correção ao vivo — catálogo das falas', () => {
  it('tem todas as mensagens de todos os exercícios, avisos de posição e números', () => {
    const texts = new Set(VOICE_CATALOG.map((p) => p.text));
    for (const rule of EXERCISE_RULES) for (const m of Object.values(rule.messages)) expect(texts.has(m)).toBe(true);
    for (const t of ['Fica de lado', 'Fica de frente pra câmera', 'Afasta um pouco', 'Fica parado', 'Vira de lado', START_MESSAGE, AUTO_FINISH_MESSAGE, 'Fechou']) {
      expect(texts.has(t)).toBe(true);
    }
    for (let n = 1; n <= 30; n++) expect(VOICE_CATALOG.some((p) => p.key === numberPhraseKey(n))).toBe(true);
    for (const n of [40, 50, 60, 70, 80, 90, 100, 110, 120]) expect(phraseKeyForText(repNumberWord(n))).toBe(numberPhraseKey(n));
    expect(phraseKeyForText(repNumberWord(3))).toBe('numero_3');
    expect(phraseKeyForText(legSwitchMessage('right'))).toBe('agora_a_perna_direita_na_frente');
  });

  it('chaves únicas e estáveis', () => {
    const keys = VOICE_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(buildVoiceCatalog().map((p) => p.key)).toEqual(keys);
    expect(keys.every((k) => /^[a-z0-9_]{1,80}$/.test(k))).toBe(true);
    expect(phraseKeyForText('Desce mais')).toBe('desce_mais');
    expect(phraseKeyForText(POSITION_MESSAGES.frontal)).toBe('fica_de_lado');
  });
});

describe('Voz da Correção ao vivo — fala → áudio aprovado', () => {
  const approved = new Set(['numero_3', 'desce_mais']);
  const has = (k: string) => approved.has(k);

  it('fala com áudio aprovado toca o áudio; sem áudio usa a voz do celular', () => {
    expect(resolveVoiceSegments(['três', 'Controla a descida'], has)).toEqual([
      { kind: 'clip', key: 'numero_3', text: 'três' },
      { kind: 'tts', text: 'Controla a descida' },
    ]);
  });

  it('correções juntas viram uma fala por arquivo, cada uma com o seu fallback', () => {
    expect(resolveVoiceSegments(['Desce mais. Controla a descida'], has)).toEqual([
      { kind: 'clip', key: 'desce_mais', text: 'Desce mais' },
      { kind: 'tts', text: 'Controla a descida' },
    ]);
  });

  it('fala fora do catálogo continua inteira na voz do celular', () => {
    expect(resolveVoiceSegments(['cento e trinta'], has)).toEqual([{ kind: 'tts', text: 'cento e trinta' }]);
  });

  it('o texto editado da gravação não muda a chave que a câmera procura', () => {
    // A câmera fala "Desce mais"; o admin gravou "Desce mais!" — a chave continua desce_mais.
    expect(resolveVoiceSegments(['Desce mais'], has)[0]).toEqual({ kind: 'clip', key: 'desce_mais', text: 'Desce mais' });
  });
});
