import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { createCoachVoice, type CoachVoiceDeps } from '@/lib/liveCorrection/voice/browserVoice';
import { VoiceQueue } from '@/lib/liveCorrection/voice/queue';
import { orderByPriority, voicePreloadPriority } from '@/lib/liveCorrection/voice/phrases';
import { coachVoiceBadgeLabel, INITIAL_COACH_VOICE_STATUS, canSeeVoiceDiagnostic } from '@/lib/liveCorrection/voice/status';

/** AudioContext falso: começa no estado pedido; `resume()` liga se `canResume`. */
function fakeContext(initial: string, opts: { canResume?: boolean; decodeFails?: boolean } = {}) {
  const started: string[] = [];
  const ctx: any = {
    state: initial,
    destination: {},
    resume: vi.fn(async () => { if (opts.canResume !== false) ctx.state = 'running'; }),
    addEventListener: vi.fn(),
    createBuffer: () => ({}),
    createBufferSource: () => {
      const node: any = { connect: vi.fn(), stop: vi.fn() };
      node.start = vi.fn(() => {
        if (node.buffer?.id) started.push(node.buffer.id);
        setTimeout(() => node.onended?.(), 0);
      });
      return node;
    },
    decodeAudioData: vi.fn((_bytes: ArrayBuffer) => (opts.decodeFails
      ? Promise.reject(new Error('EncodingError'))
      : Promise.resolve({ id: 'buffer' }))),
  };
  return { ctx, started };
}

function fakeElement() {
  const el: any = { src: '', pause: vi.fn(), setAttribute: vi.fn() };
  el.play = vi.fn(() => { setTimeout(() => el.onended?.(), 0); return Promise.resolve(); });
  return el;
}

function deps(ctx: any, el: any, rows = [{ phrase_key: 'desce_mais', file_path: 'desce_mais/1.mp3' }]): Partial<CoachVoiceDeps> {
  return {
    getContext: () => ctx,
    fetchApproved: async () => rows,
    download: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Blob,
    createAudioElement: () => el,
    createObjectURL: () => 'blob:clip-desce-mais',
    speech: () => null,
    log: () => undefined,
    cache: new Map(),
    resumeTimeoutMs: 50,
    decodeTimeoutMs: 50,
    preferMediaElement: false,
  };
}

describe('Voz da Correção ao vivo — tocar no iPhone', () => {
  it('contexto suspenso: chama resume() e toca o áudio gravado, sem voz do celular', async () => {
    const { ctx, started } = fakeContext('suspended');
    const el = fakeElement();
    const voice = createCoachVoice(deps(ctx, el));
    await voice.preload();
    expect(voice.outputs.hasClip('desce_mais')).toBe(true);
    const tts = vi.spyOn(voice.outputs, 'speakTts');
    await voice.outputs.playClip('desce_mais');
    expect(ctx.resume).toHaveBeenCalled();
    expect(started).toEqual(['buffer']);
    expect(el.play).not.toHaveBeenCalled();
    expect(tts).not.toHaveBeenCalled();
  });

  it('contexto interrompido que não volta: toca pelo <audio> em vez da voz do celular', async () => {
    const { ctx, started } = fakeContext('interrupted', { canResume: false });
    const el = fakeElement();
    const voice = createCoachVoice(deps(ctx, el));
    await voice.preload();
    await voice.outputs.playClip('desce_mais');
    expect(ctx.resume).toHaveBeenCalled();
    expect(started).toEqual([]);
    expect(el.src).toBe('blob:clip-desce-mais');
    expect(el.play).toHaveBeenCalledTimes(1);
  });

  it('decode do Safari falha: o áudio continua pronto e toca pelo <audio> (Blob URL)', async () => {
    const { ctx, started } = fakeContext('running', { decodeFails: true });
    const el = fakeElement();
    const voice = createCoachVoice(deps(ctx, el));
    await voice.preload();
    expect(voice.readyCount).toBe(1);
    await voice.outputs.playClip('desce_mais');
    expect(started).toEqual([]);
    expect(el.src).toBe('blob:clip-desce-mais');
    expect(el.play).toHaveBeenCalledTimes(1);
  });

  it('nenhum dos dois toca: rejeita (a fila cai na voz do celular) e o selo mostra "áudio bloqueado"', async () => {
    const { ctx } = fakeContext('suspended', { canResume: false });
    const el = fakeElement();
    el.play = vi.fn(() => Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })));
    const voice = createCoachVoice(deps(ctx, el));
    await voice.preload();
    await expect(voice.outputs.playClip('desce_mais')).rejects.toThrow('clip_unavailable');
    expect(coachVoiceBadgeLabel(voice.getStatus(), 77)).toBe('Voz: celular · áudio bloqueado');
  });

  it('cada decode recebe um ArrayBuffer novo', async () => {
    const { ctx } = fakeContext('running');
    const rows = [{ phrase_key: 'a', file_path: 'a/1.mp3' }, { phrase_key: 'b', file_path: 'b/1.mp3' }];
    const voice = createCoachVoice(deps(ctx, fakeElement(), rows));
    await voice.preload();
    const [b1, b2] = ctx.decodeAudioData.mock.calls.map((c: unknown[]) => c[0]);
    expect(b1).toBeInstanceOf(ArrayBuffer);
    expect(b1).not.toBe(b2);
  });

  it('unlock é síncrono: resume() e <audio> liberados já dentro do toque', () => {
    const { ctx } = fakeContext('suspended');
    const el = fakeElement();
    const voice = createCoachVoice(deps(ctx, el));
    voice.unlock();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(el.play).toHaveBeenCalledTimes(1);
    expect(voice.getStatus().unlocked).toBe(true);
  });

  it('lista falhou: selo "erro ao baixar"; tudo pronto: "Voz: Fabiew (N/77)"', async () => {
    const { ctx } = fakeContext('running');
    const failing = createCoachVoice({ ...deps(ctx, fakeElement()), fetchApproved: async () => { throw new Error('rpc'); } });
    await failing.preload();
    expect(coachVoiceBadgeLabel(failing.getStatus(), 77)).toBe('Voz: celular · erro ao baixar');
    const ok = createCoachVoice(deps(ctx, fakeElement()));
    await ok.preload();
    ok.unlock();
    expect(coachVoiceBadgeLabel(ok.getStatus(), 77)).toBe('Voz: Fabiew · webaudio (1/77)');
    const none = createCoachVoice(deps(ctx, fakeElement(), []));
    await none.preload();
    expect(coachVoiceBadgeLabel(none.getStatus(), 77)).toBe('Voz: celular · sem áudios');
    expect(coachVoiceBadgeLabel(INITIAL_COACH_VOICE_STATUS, 77)).toBe('Voz: celular · baixando áudios');
  });
});

describe('Voz da Correção ao vivo — ordem do download e quem vê o selo', () => {
  it('3-2-1 e "Pode começar" primeiro, depois as correções do exercício, depois o resto', () => {
    const prio = voicePreloadPriority(['Desce mais. Controla a descida']);
    expect(prio.slice(0, 6)).toEqual(['numero_3', 'numero_2', 'numero_1', 'pode_comecar', 'desce_mais', 'controla_a_descida']);
    const rows = ['fica_de_lado', 'numero_10', 'desce_mais', 'numero_1'].map((k) => ({ phrase_key: k, file_path: `${k}.mp3` }));
    expect(orderByPriority(rows, prio).map((r) => r.phrase_key)).toEqual(['numero_1', 'desce_mais', 'numero_10', 'fica_de_lado']);
  });

  it('selo só para admin e para a conta do Fabiew', () => {
    expect(canSeeVoiceDiagnostic('qualquer-aluno', false)).toBe(false);
    expect(canSeeVoiceDiagnostic('qualquer-aluno', true)).toBe(true);
    expect(canSeeVoiceDiagnostic('0feb5458-15cb-490a-9341-90bd57795495', false)).toBe(true);
  });
});

/** <audio> falso que registra o que tocou e quantos tocam ao mesmo tempo. */
function trackedElements(log: { played: string[]; active: number; maxActive: number }) {
  return () => {
    const el: any = { src: '', pause: vi.fn(), setAttribute: vi.fn(), currentTime: 0 };
    el.play = vi.fn(() => {
      if (el.src.startsWith('data:')) return Promise.resolve();
      log.played.push(el.src);
      log.active++;
      log.maxActive = Math.max(log.maxActive, log.active);
      setTimeout(() => { log.active--; el.onended?.(); }, 5);
      return Promise.resolve();
    });
    return el;
  };
}

describe('Voz da Correção ao vivo — iPhone no silencioso (modo <audio>)', () => {
  const rows = [
    { phrase_key: 'numero_5', file_path: 'numero_5/1.mp3' },
    { phrase_key: 'desce_mais', file_path: 'desce_mais/1.mp3' },
  ];
  const audioDeps = (ctx: any, createAudioElement: () => any): Partial<CoachVoiceDeps> => ({
    ...deps(ctx, null, rows),
    createAudioElement,
    createObjectURL: (b: any) => `blob:${b.name}`,
    download: async (path: string) => ({ name: path.split('/')[0], arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Blob,
    preferMediaElement: true,
  });

  it('fila toca o número e depois a correção pelo <audio>, sem sobrepor e sem Web Audio', async () => {
    const { ctx, started } = fakeContext('running');
    const log = { played: [] as string[], active: 0, maxActive: 0 };
    const voice = createCoachVoice(audioDeps(ctx, trackedElements(log)));
    await voice.preload();
    voice.unlock();
    const tts = vi.spyOn(voice.outputs, 'speakTts');
    await new VoiceQueue(voice.outputs).say(['cinco', 'Desce mais']);
    expect(log.played).toEqual(['blob:numero_5', 'blob:desce_mais']);
    expect(log.maxActive).toBe(1);
    expect(started).toEqual([]);
    expect(ctx.decodeAudioData).not.toHaveBeenCalled();
    expect(tts).not.toHaveBeenCalled();
    expect(coachVoiceBadgeLabel(voice.getStatus(), 77)).toBe('Voz: Fabiew · audio (2/77)');
  });

  it('unlock libera os elementos <audio> pré-criados já dentro do toque', async () => {
    const { ctx } = fakeContext('suspended');
    const els: any[] = [];
    const voice = createCoachVoice(audioDeps(ctx, () => { const el = fakeElement(); els.push(el); return el; }));
    await voice.preload();
    expect(els).toHaveLength(2);
    expect(coachVoiceBadgeLabel(voice.getStatus(), 77)).toBe('Voz: celular · áudio bloqueado');
    voice.unlock();
    expect(els.every((el) => el.play.mock.calls.length === 1 && el.src.startsWith('data:audio/wav'))).toBe(true);
  });

  it('<audio> falha: cai na Web Audio (decodifica na hora) e o selo mostra webaudio', async () => {
    const { ctx, started } = fakeContext('running');
    const voice = createCoachVoice(audioDeps(ctx, () => {
      const el = fakeElement();
      el.play = vi.fn(() => (el.src.startsWith('data:') ? Promise.resolve() : Promise.reject(new Error('NotSupportedError'))));
      return el;
    }));
    await voice.preload();
    voice.unlock();
    await voice.outputs.playClip('desce_mais');
    expect(started).toEqual(['buffer']);
    expect(coachVoiceBadgeLabel(voice.getStatus(), 77)).toBe('Voz: Fabiew · webaudio (2/77)');
  });

  it('nenhum toca: a fila cai na voz do celular', async () => {
    const { ctx } = fakeContext('suspended', { canResume: false });
    const voice = createCoachVoice(audioDeps(ctx, () => {
      const el = fakeElement();
      el.play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
      return el;
    }));
    await voice.preload();
    const spoken: string[] = [];
    vi.spyOn(voice.outputs, 'speakTts').mockImplementation(async (t) => { spoken.push(t); });
    await new VoiceQueue(voice.outputs).say(['Desce mais']);
    expect(spoken).toEqual(['Desce mais']);
  });
});
