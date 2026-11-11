import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rpc = vi.hoisted(() => vi.fn(async (_name: string, _args?: unknown) => ({ data: [], error: null })));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  MotivationPicker, parseTargetReps, planNamePhrases, namePhraseKey, motivationClipFromRow,
  type MotivationClip,
} from '@/lib/liveCorrection/voice/motivation';
import { VoiceQueue, type VoiceOutputs } from '@/lib/liveCorrection/voice/queue';
import { createCoachVoice, defaultCoachVoiceDeps, type CoachVoiceDeps } from '@/lib/liveCorrection/voice/browserVoice';

const clip = (key: string, moment: MotivationClip['moment'], frequency: MotivationClip['frequency'] = 'sempre', personal = false): MotivationClip =>
  ({ key, text: key, moment, frequency, personal });

/** Sorteio previsível (LCG). */
function seeded(seed = 7) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

describe('Falas de motivação — sorteio', () => {
  it('sorteia só entre as falas do momento e nunca repete a mesma duas vezes seguidas', () => {
    const clips = [clip('bora', 'inicio_serie'), clip('vamos', 'inicio_serie'), clip('boa', 'rep_completa')];
    const picker = new MotivationPicker(() => clips, seeded());
    const picked: string[] = [];
    for (let i = 0; i < 40; i++) picked.push(picker.pick('inicio_serie')!.key);
    expect(new Set(picked)).toEqual(new Set(['bora', 'vamos']));
    for (let i = 1; i < picked.length; i++) expect(picked[i]).not.toBe(picked[i - 1]);
  });

  it('frequência: "Às vezes" ~1 em 3, "Raramente" ~1 em 6, "Sempre" toda vez', () => {
    const count = (frequency: MotivationClip['frequency']) => {
      const picker = new MotivationPicker(() => [clip('x', 'fim_serie', frequency)], seeded(11));
      let n = 0;
      for (let i = 0; i < 6000; i++) if (picker.pick('fim_serie')) n++;
      return n / 6000;
    };
    expect(count('sempre')).toBe(1);
    expect(count('as_vezes')).toBeGreaterThan(0.29);
    expect(count('as_vezes')).toBeLessThan(0.37);
    expect(count('raramente')).toBeGreaterThan(0.14);
    expect(count('raramente')).toBeLessThan(0.195);
  });

  it('nas reps: no máximo 1 motivação a cada 3 reps', () => {
    const picker = new MotivationPicker(() => [clip('boa', 'rep_completa')], () => 0);
    const spokenAt: number[] = [];
    for (let rep = 1; rep <= 10; rep++) {
      if (picker.forRep({ complete: true, hasErrors: false, correctionSpoken: false, completeCount: rep, repIndex: rep })) spokenAt.push(rep);
    }
    expect(spokenAt).toEqual([1, 4, 7, 10]);
  });

  it('rep com erro: incentivo só depois da correção falada; correção calada pelo limite → nada', () => {
    const picker = new MotivationPicker(() => [clip('vai', 'rep_incompleta'), clip('boa', 'rep_completa')], () => 0);
    expect(picker.forRep({ complete: false, hasErrors: true, correctionSpoken: false, completeCount: 0, repIndex: 1 })).toBeNull();
    expect(picker.forRep({ complete: false, hasErrors: true, correctionSpoken: true, completeCount: 0, repIndex: 2 })?.key).toBe('vai');
  });

  it('penúltima/última: usa a meta do plano; sem meta não toca', () => {
    const clips = [clip('ultima', 'penultima_ultima'), clip('boa', 'rep_completa')];
    const withTarget = new MotivationPicker(() => clips, () => 0);
    expect(withTarget.forRep({ complete: true, hasErrors: false, correctionSpoken: false, completeCount: 8, repIndex: 8, targetReps: 10 })?.key).toBe('ultima');
    const noTarget = new MotivationPicker(() => clips, () => 0);
    expect(noTarget.forRep({ complete: true, hasErrors: false, correctionSpoken: false, completeCount: 8, repIndex: 8, targetReps: null })?.key).toBe('boa');
    expect(parseTargetReps('8-10')).toBe(10);
    expect(parseTargetReps('12')).toBe(12);
    expect(parseTargetReps('até a falha')).toBeNull();
    expect(parseTargetReps('30s')).toBeNull();
  });

  it('prefere as falas com o nome do aluno quando existem', () => {
    const picker = new MotivationPicker(() => [clip('boa', 'fim_serie'), clip('boa_rafa', 'fim_serie', 'sempre', true)], () => 0.9);
    expect(picker.pick('fim_serie')?.key).toBe('boa_rafa');
  });
});

describe('Falas de motivação — prioridade na fila', () => {
  function fakeOutputs() {
    const played: string[] = [];
    let active = 0;
    let maxActive = 0;
    const ends = new Set<() => void>();
    const out: VoiceOutputs = {
      hasClip: () => true,
      playClip: (key) => new Promise<void>((resolve) => {
        played.push(key); active++; maxActive = Math.max(maxActive, active);
        const end = () => { ends.delete(end); active--; resolve(); };
        ends.add(end);
        setTimeout(() => { if (ends.has(end)) end(); }, 5);
      }),
      speakTts: async () => undefined,
      stop: () => { for (const e of [...ends]) e(); },
    };
    return { out, played, max: () => maxActive };
  }

  it('número e correção tocam antes da motivação, sem sobrepor', async () => {
    const f = fakeOutputs();
    await new VoiceQueue(f.out).say(['cinco', 'Desce mais', { clip: 'motiv_bora', text: 'Bora!' }]);
    expect(f.played).toEqual(['numero_5', 'desce_mais', 'motiv_bora']);
    expect(f.max()).toBe(1);
  });

  it('o próximo número interrompe a motivação (ela nunca atrasa número/correção)', async () => {
    const f = fakeOutputs();
    const q = new VoiceQueue(f.out);
    void q.say([{ clip: 'motiv_bora', text: 'Bora!' }]);
    await new Promise((r) => setTimeout(r, 1));
    expect(f.played).toEqual(['motiv_bora']);
    await q.say(['seis']);
    expect(f.played).toEqual(['motiv_bora', 'numero_6']);
    expect(f.max()).toBe(1);
  });
});

describe('Falas com nome — cada aluno só com as dele', () => {
  const RAFA = '11111111-1111-1111-1111-111111111111';
  const IZIS = '22222222-2222-2222-2222-222222222222';
  const TPL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('a câmera pede ao servidor só as falas do aluno aberto', async () => {
    rpc.mockClear();
    await defaultCoachVoiceDeps(RAFA).fetchApproved();
    await defaultCoachVoiceDeps(RAFA).fetchMotivationEnabled();
    expect(rpc).toHaveBeenCalledWith('coach_voice_clips', { _student_id: RAFA });
    expect(rpc).toHaveBeenCalledWith('coach_voice_motivation_enabled', { _student_id: RAFA });
  });

  it('modelo vira uma fala por aluno, com o nome falado de cada um e a pasta do próprio aluno', () => {
    const { upserts } = planNamePhrases(
      [{ id: TPL, texto: 'Bora, {nome}!', momento: 'inicio_serie', frequencia: 'as_vezes', ativo: true }],
      [{ user_id: RAFA, nome: 'Rafael Souza', voice_name: 'Rafa' }, { user_id: IZIS, nome: 'Izis Lima', voice_name: null }],
      [],
    );
    expect(upserts.map((u) => [u.texto, u.student_id])).toEqual([['Bora, Rafa!', RAFA], ['Bora, Izis!', IZIS]]);
    expect(upserts[0].phrase_key).toBe(namePhraseKey(TPL, RAFA));
    expect(upserts[0].phrase_key.endsWith(RAFA.replace(/-/g, ''))).toBe(true);
  });

  it('fala com nome conta como motivação (não entra no selo N/77); desligada para o aluno → nenhuma', async () => {
    const rows = [
      { phrase_key: 'desce_mais', file_path: 'desce_mais/1.mp3', tipo: 'sistema' },
      { phrase_key: namePhraseKey(TPL, RAFA), file_path: 'n/1.mp3', tipo: 'nome', momento: 'fim_serie', frequencia: 'sempre', texto: 'Boa, Rafa!' },
    ];
    const base: Partial<CoachVoiceDeps> = {
      getContext: () => null,
      fetchApproved: async () => rows,
      download: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Blob,
      createAudioElement: () => null, createObjectURL: () => 'blob:x', speech: () => null, log: () => undefined,
      cache: new Map(), resumeTimeoutMs: 10, decodeTimeoutMs: 10, preferMediaElement: true,
    };
    const on = createCoachVoice({ ...base, fetchMotivationEnabled: async () => true, fetchNamePhrasesEnabled: async () => true });
    await on.preload();
    expect(on.readyCount).toBe(1);
    expect(on.motivationClips().map((c) => c.text)).toEqual(['Boa, Rafa!']);
    const off = createCoachVoice({ ...base, cache: new Map(), fetchMotivationEnabled: async () => false, fetchNamePhrasesEnabled: async () => true });
    await off.preload();
    expect(off.motivationClips()).toEqual([]);
    expect(motivationClipFromRow({ phrase_key: 'x', tipo: 'sistema', momento: 'fim_serie' })).toBeNull();
  });

  describe('chave "Falas com nome do aluno" desligada', () => {
    const rows = [
      { phrase_key: 'desce_mais', file_path: 'desce_mais/1.mp3', tipo: 'sistema' },
      { phrase_key: 'motiv_bora', file_path: 'motiv_bora/1.mp3', tipo: 'personalizada', momento: 'fim_serie', frequencia: 'sempre', texto: 'Bora!' },
      { phrase_key: namePhraseKey(TPL, RAFA), file_path: 'n/1.mp3', tipo: 'nome', momento: 'fim_serie', frequencia: 'sempre', texto: 'Boa, Rafa!' },
    ];
    const base = (names: CoachVoiceDeps['fetchNamePhrasesEnabled']): Partial<CoachVoiceDeps> => ({
      getContext: () => null,
      fetchApproved: async () => rows,
      fetchMotivationEnabled: async () => true,
      fetchNamePhrasesEnabled: names,
      download: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Blob,
      createAudioElement: () => null, createObjectURL: () => 'blob:x', speech: () => null, log: () => undefined,
      cache: new Map(), resumeTimeoutMs: 10, decodeTimeoutMs: 10, preferMediaElement: true,
    });

    it('desligada: fala com nome nunca entra no sorteio; sistema e personalizadas continuam', async () => {
      const voice = createCoachVoice(base(async () => false));
      await voice.preload();
      expect(voice.readyCount).toBe(1);
      expect(voice.motivationClips().map((c) => c.key)).toEqual(['motiv_bora']);
      const picker = new MotivationPicker(() => voice.motivationClips(), seeded(3));
      for (let i = 0; i < 30; i++) expect(picker.pick('fim_serie')?.personal).toBe(false);
    });

    it('erro ao ler a chave = desligada', async () => {
      const voice = createCoachVoice(base(async () => { throw new Error('rpc'); }));
      await voice.preload();
      expect(voice.motivationClips().map((c) => c.key)).toEqual(['motiv_bora']);
    });

    it('ligada: a fala com nome volta (nada foi apagado)', async () => {
      const voice = createCoachVoice(base(async () => true));
      await voice.preload();
      expect(voice.motivationClips().map((c) => c.key).sort()).toEqual(['motiv_bora', namePhraseKey(TPL, RAFA)].sort());
    });

    it('sem opção explícita, a linha "nome" não vira fala; a câmera pergunta a chave ao servidor', async () => {
      const row = { phrase_key: 'n', tipo: 'nome', momento: 'fim_serie', frequencia: 'sempre', texto: 'Boa, Rafa!' };
      expect(motivationClipFromRow(row)).toBeNull();
      expect(motivationClipFromRow(row, { namesEnabled: true })?.personal).toBe(true);
      rpc.mockClear();
      await defaultCoachVoiceDeps(RAFA).fetchNamePhrasesEnabled();
      expect(rpc).toHaveBeenCalledWith('coach_voice_name_phrases_enabled');
    });

    it('servidor: a versão atual de coach_voice_clips só devolve "nome" com a chave ligada (padrão desligada)', () => {
      const dir = path.resolve(__dirname, '../../drizzle/migrations');
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
      const defining = files.filter((f) => /FUNCTION public\.coach_voice_clips\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
      const sql = fs.readFileSync(path.join(dir, defining[defining.length - 1]), 'utf8');
      const fn = sql.slice(sql.indexOf('FUNCTION public.coach_voice_clips('));
      const nameBranch = fn.match(/p\.tipo = 'nome'[^\n]*/)?.[0] ?? '';
      expect(nameBranch).toMatch(/names\.enabled/);
      expect(fn).toMatch(/name_phrases_enabled[^\n]*\), false\)/);
      const all = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
      expect(all).toMatch(/ADD COLUMN name_phrases_enabled boolean NOT NULL DEFAULT false/);
    });
  });
});
