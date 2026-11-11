import { describe, expect, it } from 'vitest';
import { VoiceQueue, type VoiceOutputs } from '@/lib/liveCorrection/voice/queue';

/** Saídas falsas: cada som dura até `finish()`; registra início/fim para checar sobreposição. */
function fakeOutputs(clips: string[], failing: string[] = []) {
  const log: string[] = [];
  let active: { name: string; resolve: () => void } | null = null;
  let maxConcurrent = 0;
  let concurrent = 0;
  const start = (name: string) => new Promise<void>((resolve) => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    log.push(`start ${name}`);
    active = { name, resolve: () => { concurrent--; log.push(`end ${name}`); active = null; resolve(); } };
  });
  const out: VoiceOutputs = {
    hasClip: (k) => clips.includes(k),
    playClip: (k) => (failing.includes(k) ? Promise.reject(new Error('fail')) : start(`clip:${k}`)),
    speakTts: (t) => start(`tts:${t}`),
    stop: () => { if (active) { log.push(`stop ${active.name}`); active.resolve(); } },
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    out, log, tick,
    get maxConcurrent() { return maxConcurrent; },
    async finish() { await tick(); (active as { resolve: () => void } | null)?.resolve(); await tick(); },
  };
}

describe('Voz da Correção ao vivo — fila sem sobreposição', () => {
  it('número primeiro, depois a correção, um de cada vez', async () => {
    const f = fakeOutputs(['numero_2', 'desce_mais']);
    const q = new VoiceQueue(f.out);
    const done = q.say(['dois', 'Desce mais. Controla a descida']);
    await f.finish();
    await f.finish();
    await f.finish();
    await done;
    expect(f.log).toEqual([
      'start clip:numero_2', 'end clip:numero_2',
      'start clip:desce_mais', 'end clip:desce_mais',
      'start tts:Controla a descida', 'end tts:Controla a descida',
    ]);
    expect(f.maxConcurrent).toBe(1);
  });

  it('fala nova para a anterior antes de começar (nunca duas ao mesmo tempo)', async () => {
    const f = fakeOutputs(['numero_1', 'numero_2']);
    const q = new VoiceQueue(f.out);
    void q.say(['um', 'Desce mais']);
    await f.tick();
    const second = q.say(['dois']);
    await f.finish();
    await second;
    expect(f.log).toEqual(['start clip:numero_1', 'stop clip:numero_1', 'end clip:numero_1', 'start clip:numero_2', 'end clip:numero_2']);
    expect(f.log).not.toContain('start tts:Desce mais');
    expect(f.maxConcurrent).toBe(1);
  });

  it('áudio que não toca cai na voz do celular', async () => {
    const f = fakeOutputs(['desce_mais'], ['desce_mais']);
    const q = new VoiceQueue(f.out);
    const done = q.say(['Desce mais']);
    await f.finish();
    await done;
    expect(f.log).toEqual(['start tts:Desce mais', 'end tts:Desce mais']);
  });

  it('desligar a voz para tudo e não fala o resto', async () => {
    const f = fakeOutputs([]);
    const q = new VoiceQueue(f.out);
    const done = q.say(['um', 'dois']);
    await f.tick();
    q.cancel();
    await done;
    expect(f.log).toEqual(['start tts:um', 'stop tts:um', 'end tts:um']);
  });
});
