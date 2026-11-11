import { describe, expect, it } from 'vitest';
import { VOICE_CATALOG } from '@/lib/liveCorrection/voice/phrases';
import {
  correctionGroups, matchesFilter, phraseStatus, readLastVoiceTab, saveLastVoiceTab, systemPhrasesForTab,
} from '@/lib/coachVoice/voiceTabs';

describe('Voz — abas da tela do admin', () => {
  it('toda fala do sistema cai em exatamente uma aba (Números, Comandos ou Correções)', () => {
    const tabs = (['numeros', 'comandos', 'correcoes'] as const).map((t) => systemPhrasesForTab(VOICE_CATALOG, t).map((p) => p.key));
    const all = tabs.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(VOICE_CATALOG.length);
  });

  it('cada correção aparece em pelo menos um exercício; a prancha tem as próprias', () => {
    const groups = correctionGroups(VOICE_CATALOG);
    const covered = new Set(groups.flatMap((g) => g.phrases.map((p) => p.key)));
    for (const p of systemPhrasesForTab(VOICE_CATALOG, 'correcoes')) expect(covered.has(p.key)).toBe(true);
    expect(groups.map((g) => g.id)).toEqual(expect.arrayContaining(['squat', 'stiff', 'bulgaro', 'lateral_raise', 'hip_thrust', 'curl', 'triceps_french', 'shoulder_press', 'bench_press', 'leg_press', 'plank']));
    expect(groups.find((g) => g.id === 'plank')!.phrases.map((p) => p.text)).toContain('Tira o joelho do chão');
  });

  it('filtro e status: aprovada só se a versão aprovada existe', () => {
    expect(phraseStatus('t1', ['t1', 't2'])).toBe('approved');
    expect(phraseStatus('gone', ['t2'])).toBe('pending');
    expect(phraseStatus(null, [])).toBe('empty');
    expect(matchesFilter('pending', 'para_aprovar')).toBe(true);
    expect(matchesFilter('approved', 'sem_audio')).toBe(false);
    expect(matchesFilter('empty', 'todas')).toBe(true);
  });

  it('última aba: lembra, ignora valor estranho e não quebra sem armazenamento', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    saveLastVoiceTab('motivacao', storage);
    expect(readLastVoiceTab(storage)).toBe('motivacao');
    mem.set('coachVoice.lastTab', 'xyz');
    expect(readLastVoiceTab(storage)).toBe('config');
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readLastVoiceTab(broken)).toBe('config');
    expect(() => saveLastVoiceTab('nomes', broken)).not.toThrow();
  });
});
