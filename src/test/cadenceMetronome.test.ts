import { describe, it, expect } from 'vitest';
import {
  bikeCadenceRpm, cadenceIntervalMs, cadenceBeat, cadenceBeatSounds, createCadenceScheduler, nextBeatIndex,
  readCadencePrefs, writeCadencePrefs, toggleCadenceMute, withSound, DEFAULT_CADENCE_PREFS, type ScheduledBeat,
} from '@/lib/cadenceMetronome';
import type { CardioBlock } from '@/lib/cardioParser';

const block = (cadenceRpm?: number): CardioBlock => ({ name: 'Pico', type: 'pico', durationSec: 60, intensityLabel: 'forte', cadenceRpm } as CardioBlock);

/** Relógio falso + setInterval falso para o agendador. */
function fakeClock() {
  let now = 0;
  const intervals = new Map<number, { fn: () => void; ms: number; next: number }>();
  let id = 0;
  return {
    now: () => now,
    setInterval: (fn: () => void, ms: number) => { intervals.set(++id, { fn, ms, next: now + ms }); return id; },
    clearInterval: (i: unknown) => { intervals.delete(i as number); },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let soonest: { fn: () => void; ms: number; next: number } | null = null;
        intervals.forEach(t => { if (t.next <= end && (!soonest || t.next < soonest.next)) soonest = t; });
        if (!soonest) break;
        const t = soonest as { fn: () => void; ms: number; next: number };
        now = t.next; t.next += t.ms; t.fn();
      }
      now = end;
    },
    /** Tempo passa sem os timers rodarem (aba em segundo plano). */
    jump(ms: number) { now += ms; intervals.forEach(t => { t.next = now + t.ms; }); },
    get active() { return intervals.size; },
  };
}

describe('intervalo por rpm', () => {
  it('70, 90 e 110 rpm = 60000/rpm ms (1 piscada = 1 volta)', () => {
    expect(cadenceIntervalMs(70)).toBeCloseTo(857.142857, 4);
    expect(cadenceIntervalMs(90)).toBeCloseTo(666.666667, 4);
    expect(cadenceIntervalMs(110)).toBeCloseTo(545.454545, 4);
  });
  it('modo "Cada perna" = metade do intervalo', () => {
    expect(cadenceIntervalMs(70, 'perna')).toBeCloseTo(428.571429, 4);
    expect(cadenceIntervalMs(90, 'perna')).toBeCloseTo(333.333333, 4);
    expect(cadenceIntervalMs(110, 'perna')).toBeCloseTo(272.727273, 4);
  });
});

describe('acento e barrinhas', () => {
  it('acento a cada 4 voltas e barrinhas 1-2-3-4 que zeram', () => {
    const beats = Array.from({ length: 9 }, (_, i) => cadenceBeat(i));
    expect(beats.map(b => b.accent)).toEqual([true, false, false, false, true, false, false, false, true]);
    expect(beats.map(b => b.bar)).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1]);
  });
  it('modo perna: 2 batidas por volta, acento a cada 8 batidas (4 voltas)', () => {
    const beats = Array.from({ length: 9 }, (_, i) => cadenceBeat(i, 'perna'));
    expect(beats.map(b => b.accent)).toEqual([true, false, false, false, false, false, false, false, true]);
    expect(beats.map(b => b.bar)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 1]);
  });
});

describe('faixa só em bike com cadência', () => {
  it('bike com cadência → rpm; sem cadência ou outra modalidade → null', () => {
    expect(bikeCadenceRpm(block(70), 'bike')).toBe(70);
    expect(bikeCadenceRpm(block(undefined), 'bike')).toBeNull();
    expect(bikeCadenceRpm(block(70), 'passadeira')).toBeNull();
    expect(bikeCadenceRpm(block(70), 'escada')).toBeNull();
    expect(bikeCadenceRpm(block(70), 'eliptica')).toBeNull();
    expect(bikeCadenceRpm(undefined, 'bike')).toBeNull();
  });
});

describe('quando o beep toca', () => {
  const base = { anchorMs: 0, blockEndMs: 60_000, sound: 'beep' as const, playerMuted: false };
  it('mudo (faixa ou player) não toca', () => {
    expect(cadenceBeatSounds({ ...base, beatAtMs: 5000 })).toBe(true);
    expect(cadenceBeatSounds({ ...base, beatAtMs: 5000, sound: 'mute' })).toBe(false);
    expect(cadenceBeatSounds({ ...base, beatAtMs: 5000, playerMuted: true })).toBe(false);
  });
  it('pula no bipe de troca de fase e nos 3 s finais (bipes de aviso 3-2-1)', () => {
    expect(cadenceBeatSounds({ ...base, beatAtMs: 0 })).toBe(false);
    expect(cadenceBeatSounds({ ...base, beatAtMs: 57_500 })).toBe(false);
    expect(cadenceBeatSounds({ ...base, beatAtMs: 56_000 })).toBe(true);
  });
});

describe('agendador', () => {
  const setup = () => {
    const clock = fakeClock();
    const beats: ScheduledBeat[] = [];
    const s = createCadenceScheduler({ now: clock.now, setInterval: clock.setInterval, clearInterval: clock.clearInterval, onBeat: b => beats.push(b) });
    return { clock, beats, s };
  };

  it('70 rpm dá 70 batidas por minuto, sem acumular atraso num bloco longo', () => {
    const { clock, beats, s } = setup();
    s.start({ rpm: 70, mode: 'volta', anchorMs: 0, blockEndMs: 30 * 60_000, sound: 'beep', playerMuted: false });
    clock.advance(60_000);
    const inFirstMinute = beats.filter(b => b.atMs < 60_000);
    expect(inFirstMinute).toHaveLength(70);
    clock.advance(28 * 60_000);
    const last = beats[beats.length - 1];
    expect(last.atMs).toBeCloseTo(last.index * (60000 / 70), 6);
  });

  it('pausa para (nenhuma batida) e retomar continua no ritmo', () => {
    const { clock, beats, s } = setup();
    s.start({ rpm: 90, mode: 'volta', anchorMs: 0, blockEndMs: 600_000, sound: 'beep', playerMuted: false });
    clock.advance(10_000);
    const before = beats.length;
    s.stop();
    expect(clock.active).toBe(0);
    clock.advance(20_000);
    expect(beats.length).toBe(before);
    // retomar: o player empurra o início do bloco pelo tempo pausado
    s.start({ rpm: 90, mode: 'volta', anchorMs: 20_000, blockEndMs: 620_000, sound: 'beep', playerMuted: false });
    clock.advance(10_000);
    expect(beats.length).toBeGreaterThan(before);
    expect(beats.slice(before).every(b => (b.atMs - 20_000) % (60000 / 90) < 1e-6 || Math.abs(((b.atMs - 20_000) % (60000 / 90)) - 60000 / 90) < 1e-6)).toBe(true);
  });

  it('troca de bloco muda o ritmo sozinho e recomeça a contagem', () => {
    const { clock, beats, s } = setup();
    s.start({ rpm: 70, mode: 'volta', anchorMs: 0, blockEndMs: 30_000, sound: 'beep', playerMuted: false });
    clock.advance(30_000);
    const first = beats.length;
    expect(beats.every(b => b.atMs < 30_000)).toBe(true);
    s.start({ rpm: 110, mode: 'volta', anchorMs: 30_000, blockEndMs: 60_000, sound: 'beep', playerMuted: false });
    clock.advance(30_000);
    const second = beats.slice(first);
    expect(second[0].index).toBe(0);
    expect(second[0].bar).toBe(1);
    expect(second[1].atMs - second[0].atMs).toBeCloseTo(60000 / 110, 6);
  });

  it('mudo agenda a luz mas sem som', () => {
    const { clock, beats, s } = setup();
    s.start({ rpm: 70, mode: 'volta', anchorMs: 0, blockEndMs: 60_000, sound: 'mute', playerMuted: false });
    clock.advance(20_000);
    expect(beats.length).toBeGreaterThan(10);
    expect(beats.some(b => b.sound)).toBe(false);
  });

  it('aba em segundo plano: batidas atrasadas são puladas, sem rajada', () => {
    const { clock, beats, s } = setup();
    s.start({ rpm: 70, mode: 'volta', anchorMs: 0, blockEndMs: 600_000, sound: 'beep', playerMuted: false });
    clock.advance(1_000);
    const n = beats.length;
    clock.jump(10_000);
    clock.advance(200);
    expect(beats.length - n).toBe(1);
    const latest = beats[beats.length - 1];
    expect(latest.atMs).toBeGreaterThanOrEqual(11_000 - 120);
  });
});

describe('preferências', () => {
  it('lembra modo e som; mudo volta para o último som', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(readCadencePrefs(storage)).toEqual(DEFAULT_CADENCE_PREFS);
    const p = withSound({ ...DEFAULT_CADENCE_PREFS, mode: 'perna' }, 'click');
    writeCadencePrefs(p, storage);
    expect(readCadencePrefs(storage)).toEqual({ mode: 'perna', sound: 'click', lastSound: 'click' });
    const m = toggleCadenceMute(p);
    expect(m.sound).toBe('mute');
    expect(toggleCadenceMute(m).sound).toBe('click');
  });
  it('localStorage quebrado não derruba o player', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(readCadencePrefs(bad)).toEqual(DEFAULT_CADENCE_PREFS);
    expect(() => writeCadencePrefs(DEFAULT_CADENCE_PREFS, bad)).not.toThrow();
  });
});
