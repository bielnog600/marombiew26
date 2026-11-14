import { describe, it, expect, vi } from 'vitest';
import {
  TABATA_VOICE_SEEDS, countdownMode, createCuePlanner, momentCandidates, pickVariation, tabataVariationKey,
  tabataVoiceGroup, voiceBank, type PhaseCue,
} from '@/lib/tabataVoiceCues';
import { createTabataVoice } from '@/lib/tabataVoicePlayer';

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };
const moments = (cues: PhaseCue[]) => cues.map(c => `${c.moment}@${c.at}`);

describe('grupos das falas', () => {
  it('as 5 falas aprovadas entram cada uma no seu grupo', () => {
    expect(tabataVoiceGroup('tabata_preparado')).toBe('preparar');
    expect(tabataVoiceGroup('tabata_321_bora')).toBe('contagembora');
    expect(tabataVoiceGroup('tabata_descanse')).toBe('descanso');
    expect(tabataVoiceGroup('tabata_respira')).toBe('respira');
    expect(tabataVoiceGroup('tabata_proximo_bloco')).toBe('bloco');
  });
  it('variação nova tem chave aceita pelo banco e volta para o grupo', () => {
    const key = tabataVariationKey('blocomax', 'AB12-cd34-ef56-7890');
    expect(key).toMatch(/^[a-z0-9_]{1,80}$/);
    expect(tabataVoiceGroup(key)).toBe('blocomax');
    expect(tabataVoiceGroup('desce_mais')).toBeNull();
  });
  it('sugestões pedidas: 5 largadas, 4 de descanso, 3 de respira, 3 de transição, 2 de preparar', () => {
    const count = (g: string) => TABATA_VOICE_SEEDS.filter(s => tabataVoiceGroup(s.key) === g).length;
    expect(count('largada')).toBe(5);
    expect(count('descanso')).toBe(4);
    expect(count('respira')).toBe(3);
    expect(count('bloco') + count('blocosobe') + count('blocomax')).toBe(3);
    expect(count('preparar')).toBe(2);
  });
});

describe('sorteio', () => {
  it('nunca repete a mesma fala duas vezes seguidas quando há outra', () => {
    const keys = ['a', 'b', 'c'];
    let last: string | null = null;
    for (let i = 0; i < 50; i++) {
      const next = pickVariation(keys, last, Math.random)!;
      expect(next).not.toBe(last);
      last = next;
    }
    expect(pickVariation(['so'], 'so')).toBe('so');
    expect(pickVariation([], null)).toBeNull();
  });
  it('contagem separada só com "3, 2, 1…" e uma largada aprovadas; senão a antiga; senão bipe', () => {
    expect(countdownMode(voiceBank(['tabatav_contagem_321', 'tabatav_largada_vai', 'tabata_321_bora']))).toBe('split');
    expect(countdownMode(voiceBank(['tabatav_contagem_321', 'tabata_321_bora']))).toBe('legacy');
    expect(countdownMode(voiceBank(['tabatav_largada_vai']))).toBe('beep');
  });
  it('"Bloco novo, vamos com tudo!" só antes do Máximo; "sobe a intensidade" só quando sobe', () => {
    const bank = voiceBank(['tabata_proximo_bloco', 'tabatav_blocosobe_intensidade', 'tabatav_blocomax_comtudo']);
    expect(momentCandidates(bank, 'bloco', { from: 'moderado', to: 'forte' }))
      .toEqual(['tabata_proximo_bloco', 'tabatav_blocosobe_intensidade']);
    expect(momentCandidates(bank, 'bloco', { from: 'forte', to: 'maximo' }))
      .toEqual(['tabata_proximo_bloco', 'tabatav_blocosobe_intensidade', 'tabatav_blocomax_comtudo']);
    expect(momentCandidates(bank, 'bloco', { from: 'forte', to: 'forte' })).toEqual(['tabata_proximo_bloco']);
  });
});

describe('frequência', () => {
  it('contagem em toda fase antes de exercício e largada em todo exercício', () => {
    const p = createCuePlanner(seq(0.9));
    expect(moments(p.plan('rest', 5))).toEqual(['contagem@3']);
    expect(moments(p.plan('work', 20))).toEqual(['largada@20']);
    expect(moments(p.plan('prep', 10))).toEqual(['preparar@10', 'contagem@3']);
  });
  it('descanso curto de 5s do aquecimento: nunca fala de descanso nem respira', () => {
    const p = createCuePlanner(seq(0));
    for (let i = 0; i < 10; i++) expect(moments(p.plan('rest', 5))).toEqual(['contagem@3']);
  });
  it('fala de início do descanso fica entre 1 a cada 2 e 1 a cada 3 descansos', () => {
    for (const r of [0, 0.99]) {
      const p = createCuePlanner(seq(r));
      const calls = Array.from({ length: 30 }, () => p.plan('rest', 10).some(c => c.moment === 'descanso'));
      const idx = calls.flatMap((c, i) => (c ? [i] : []));
      const gaps = idx.slice(1).map((v, i) => v - idx[i]);
      expect(gaps.every(g => g === 2 || g === 3)).toBe(true);
    }
  });
  it('"Respira" de vez em quando (≈1 a cada 3), nunca junto da fala de início, e sempre entre blocos', () => {
    const p = createCuePlanner(Math.random);
    const plans = Array.from({ length: 300 }, () => p.plan('rest', 10));
    const breathe = plans.filter(c => c.some(x => x.moment === 'respira')).length;
    expect(breathe).toBeGreaterThan(50);
    expect(breathe).toBeLessThan(150);
    expect(plans.some(c => c.some(x => x.moment === 'respira') && c.some(x => x.moment === 'descanso'))).toBe(false);
    for (let i = 0; i < 5; i++) expect(moments(p.plan('block_rest', 60))).toEqual(['bloco@60', 'respira@30', 'contagem@3']);
  });
});

describe('sem falas sobrepostas', () => {
  it('com uma fala tocando, a próxima não começa; a largada espera a contagem terminar', async () => {
    let finish!: () => void;
    const playClip = vi.fn((key: string) => (key === 'c' ? new Promise<void>(r => { finish = r; }) : Promise.resolve()));
    const base = { unlock: vi.fn(), preload: vi.fn(async () => {}), outputs: { hasClip: () => true, playClip, stop: vi.fn() } } as any;
    const voice = createTabataVoice(base, ['c', 'l', 'd']);
    const counting = voice.play('c');
    expect(voice.busy()).toBe(true);
    expect(await voice.play('d')).toBe(false);
    const launch = voice.playNext('l', 1000);
    finish();
    await counting;
    expect(await launch).toBe(true);
    expect(playClip.mock.calls.map(c => c[0])).toEqual(['c', 'l']);
  });
});
