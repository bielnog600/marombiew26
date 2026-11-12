import { describe, expect, it } from 'vitest';
import {
  AUTO_CAPTURE_CONFIG, AUTO_COUNTDOWN_MS, AUTO_STABLE_MS, foodInGuide, frameDifference, initialAutoCapture, readAutoCapturePref,
  rgbaToGray, screenRectToVideo, stepAutoCapture, writeAutoCapturePref, type AutoCaptureState,
} from '@/lib/mealWeigh/autoCapture';

const STILL = 1;   // ruído de câmera parada
const MOVE = 30;   // câmera mexendo

/** Roda os quadros (diff por quadro a cada 150 ms) e devolve o estado final e quando disparou. */
function run(diffs: number[], hasObject: boolean | null = true, start: AutoCaptureState = initialAutoCapture()) {
  let state = start;
  let firedAt: number | null = null;
  const counts: number[] = [];
  diffs.forEach((diff, i) => {
    const step = stepAutoCapture(state, { now: i * 150, diff, hasObject });
    state = step.state;
    if (step.count != null) counts.push(step.count);
    if (step.fire && firedAt == null) firedAt = i * 150;
  });
  return { state, firedAt, counts };
}
const frames = (n: number, diff: number) => Array.from({ length: n }, () => diff);

describe('Foto automática — estabilidade', () => {
  it('quadros parecidos por ~1,5 s começam a contagem 3-2-1 e tiram a foto no fim', () => {
    const r = run([MOVE, ...frames(60, STILL)]);
    expect(r.firedAt).not.toBeNull();
    // Mexeu em 0 ms, parou a partir de 150 ms: conta depois de 1,5 s parado e dispara 3 s depois.
    expect(r.firedAt!).toBeGreaterThanOrEqual(150 + AUTO_STABLE_MS + AUTO_COUNTDOWN_MS);
    expect(r.firedAt!).toBeLessThanOrEqual(150 + AUTO_STABLE_MS + AUTO_COUNTDOWN_MS + 300);
    expect(Array.from(new Set(r.counts))).toEqual([3, 2, 1]);
    expect(r.state.phase).toBe('fired');
  });

  it('não dispara de novo depois da foto (até ser rearmada)', () => {
    const r = run([MOVE, ...frames(60, STILL)]);
    const again = run([MOVE, ...frames(60, STILL)], true, r.state);
    expect(again.firedAt).toBeNull();
    expect(again.state.phase).toBe('fired');
  });

  it('movimento durante a contagem cancela e espera estabilizar de novo', () => {
    const toCountdown = [MOVE, ...frames(12, STILL)];
    const before = run(toCountdown);
    expect(before.state.phase).toBe('countdown');
    const cancelled = run([...toCountdown, MOVE]);
    expect(cancelled.state.phase).toBe('settling');
    expect(cancelled.firedAt).toBeNull();
    // Só com mais 1,5 s parado volta a contar.
    const resumed = run([...toCountdown, MOVE, ...frames(5, STILL)]);
    expect(resumed.state.phase).toBe('settling');
    const full = run([...toCountdown, MOVE, ...frames(40, STILL)]);
    expect(full.firedAt).not.toBeNull();
  });

  it('câmera sempre mexendo nunca conta', () => {
    const r = run(frames(80, MOVE));
    expect(r.firedAt).toBeNull();
    expect(r.counts).toEqual([]);
  });

  it('recém-armada, espera a cena mudar antes de contar (não fotografa a balança vazia)', () => {
    const r = run(frames(60, STILL));
    expect(r.state.phase).toBe('waiting_motion');
    expect(r.firedAt).toBeNull();
  });

  it('sem prato/comida na moldura não conta; detector indisponível usa só a estabilidade', () => {
    expect(run([MOVE, ...frames(60, STILL)], false).state.phase).toBe('no_object');
    expect(run([MOVE, ...frames(60, STILL)], false).firedAt).toBeNull();
    expect(run([MOVE, ...frames(60, STILL)], null).firedAt).not.toBeNull();
  });

  it('pequenas variações no limite contam como paradas; acima do limite cancelam a contagem', () => {
    const atLimit = AUTO_CAPTURE_CONFIG.stillDiff;
    expect(run([MOVE, ...frames(60, atLimit)]).firedAt).not.toBeNull();
    const toCountdown = [MOVE, ...frames(12, STILL)];
    expect(run([...toCountdown, AUTO_CAPTURE_CONFIG.moveDiff + 1]).state.phase).toBe('settling');
  });
});

describe('Foto automática — quadros e moldura', () => {
  it('diferença média entre quadros reduzidos', () => {
    const a = rgbaToGray([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(Array.from(a)).toEqual([255, 0]);
    expect(frameDifference(a, a)).toBe(0);
    expect(frameDifference(a, rgbaToGray([0, 0, 0, 255, 0, 0, 0, 255]))).toBe(127.5);
    expect(frameDifference(null, a)).toBeNull();
    expect(frameDifference(a, new Uint8Array(3))).toBeNull();
  });

  it('converte a moldura da tela para o quadro da câmera com object-cover', () => {
    // Tela 400×800, vídeo 1920×1080 → escala 800/1080, sobra lateral cortada.
    const r = screenRectToVideo({ x: 50, y: 200, width: 300, height: 400 }, { width: 400, height: 800 }, { width: 1920, height: 1080 });
    const scale = 800 / 1080;
    const offX = (400 - 1920 * scale) / 2;
    expect(r.x).toBeCloseTo((50 - offX) / scale, 5);
    expect(r.y).toBeCloseTo(200 / scale, 5);
    expect(r.width).toBeCloseTo(300 / scale, 5);
  });

  it('só conta prato/tigela/copo/comida dentro da moldura', () => {
    const guide = { x: 100, y: 100, width: 200, height: 300 };
    expect(foodInGuide([{ x: 150, y: 150, width: 80, height: 80, label: 'bowl', score: 0.6 }], guide)).toBe(true);
    expect(foodInGuide([{ x: 150, y: 150, width: 80, height: 80, label: 'person', score: 0.9 }], guide)).toBe(false);
    expect(foodInGuide([{ x: 0, y: 0, width: 50, height: 50, label: 'banana', score: 0.9 }], guide)).toBe(false);
    expect(foodInGuide([{ x: 150, y: 150, width: 80, height: 80, label: 'cup', score: 0.1 }], guide)).toBe(false);
  });

  it('preferência "Foto automática" ligada por padrão e lembrada', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(readAutoCapturePref(storage)).toBe(true);
    writeAutoCapturePref(storage, false);
    expect(readAutoCapturePref(storage)).toBe(false);
    expect(readAutoCapturePref({ getItem: () => { throw new Error('bloqueado'); } })).toBe(true);
    expect(() => writeAutoCapturePref({ setItem: () => { throw new Error('bloqueado'); } }, true)).not.toThrow();
  });
});
