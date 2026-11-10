import { describe, it, expect } from 'vitest';
import {
  FRONTAL_WIDTH_RATIO, STILL_MAX_MOVEMENT, AUTO_FINISH_IDLE_MS, AUTO_FINISH_LOST_MS, COUNTDOWN_SECONDS, FRONTAL_HOLD_MS,
  LM, StillnessDetector, isStillMovement, isFacingCamera, frontalRatio, FacingGate, diagnosePositioning,
  POSITION_MESSAGES, countdownValue, AutoFinishDetector, SquatRepCounter, type Landmark, type FrameMetrics,
} from '@/lib/liveCorrection/squatAnalysis';

/** Corpo em pé; `spread` = distância horizontal entre os lados esquerdo/direito. */
const body = (spread: number, dx = 0): Landmark[] => {
  const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5 + dx, y: 0.1, visibility: 0.9 }));
  const set = (i: number, x: number, y: number) => { lms[i] = { x: x + dx, y, visibility: 0.9 }; };
  set(LM.leftShoulder, 0.5 - spread / 2, 0.25); set(LM.rightShoulder, 0.5 + spread / 2, 0.25);
  set(LM.leftHip, 0.5 - spread / 2, 0.55); set(LM.rightHip, 0.5 + spread / 2, 0.55);
  set(LM.leftKnee, 0.5, 0.72); set(LM.rightKnee, 0.5, 0.72);
  set(LM.leftAnkle, 0.5, 0.9); set(LM.rightAnkle, 0.5, 0.9);
  return lms;
};

describe('Correção ao vivo — vista de frente', () => {
  it('limite de frente fica numa constante (0,4)', () => {
    expect(FRONTAL_WIDTH_RATIO).toBe(0.4);
  });

  it('ombros e quadris lado a lado, largos em relação ao tronco = de frente', () => {
    // largura 0,2 / tronco 0,3 ≈ 0,67
    expect(frontalRatio(body(0.2))).toBeCloseTo(0.667, 2);
    expect(isFacingCamera(body(0.2))).toBe(true);
  });

  it('de lado (ombros e quadris quase sobrepostos) não conta como de frente', () => {
    expect(isFacingCamera(body(0.03))).toBe(false);
    expect(isFacingCamera(null)).toBe(false);
  });

  it('vista só muda depois de se manter 400 ms (não pisca)', () => {
    const g = new FacingGate();
    expect(g.update(true, 0)).toBe(false);
    expect(g.update(true, FRONTAL_HOLD_MS - 1)).toBe(false);
    expect(g.update(true, FRONTAL_HOLD_MS)).toBe(true);
    expect(g.update(false, 500)).toBe(true);
    expect(g.update(false, 500 + FRONTAL_HOLD_MS)).toBe(false);
  });

  it('rep feita de frente não conta: depois de virar de lado precisa ficar em pé antes de contar', () => {
    const c = new SquatRepCounter();
    const f = (k: number): FrameMetrics => ({ side: 'left', kneeAngle: k, trunkAngle: 20, hipDepth: 0.1 });
    c.update(f(175)); c.update(f(140)); c.update(f(90));
    c.waitForStanding(); // virou de frente no fundo
    expect(c.update(f(170))).toBeNull(); // subiu: rep descartada
    expect(c.reps).toHaveLength(0);
    c.update(f(140)); c.update(f(90));
    expect(c.update(f(170))?.complete).toBe(true);
  });
});

describe('Correção ao vivo — pessoa parada', () => {
  it('pontos quase imóveis por 500 ms = parado', () => {
    const d = new StillnessDetector();
    let m: number | null = null;
    for (let t = 0; t <= 600; t += 50) m = d.push(body(0.03, (t % 100 === 0 ? 0.002 : 0)), t);
    expect(m).not.toBeNull();
    expect(m!).toBeLessThanOrEqual(STILL_MAX_MOVEMENT);
    expect(isStillMovement(m)).toBe(true);
  });

  it('andando até o lugar = não parado', () => {
    const d = new StillnessDetector();
    let m: number | null = null;
    for (let t = 0; t <= 600; t += 50) m = d.push(body(0.03, t / 3000), t); // 0,2 de deslocamento
    expect(isStillMovement(m)).toBe(false);
  });

  it('janela ainda não cheia = não libera', () => {
    const d = new StillnessDetector();
    expect(d.push(body(0.03), 0)).toBeNull();
    expect(isStillMovement(null)).toBe(false);
  });

  it('diz o que está errado: cortado → de frente → mexendo', () => {
    expect(diagnosePositioning({ hasBody: false, fullBody: false, frontal: false, still: false })).toBe('no_body');
    expect(diagnosePositioning({ hasBody: true, fullBody: false, frontal: true, still: false })).toBe('cut');
    expect(diagnosePositioning({ hasBody: true, fullBody: true, frontal: true, still: false })).toBe('frontal');
    expect(diagnosePositioning({ hasBody: true, fullBody: true, frontal: false, still: false })).toBe('moving');
    expect(diagnosePositioning({ hasBody: true, fullBody: true, frontal: false, still: true })).toBe('ok');
    expect([POSITION_MESSAGES.cut, POSITION_MESSAGES.frontal, POSITION_MESSAGES.moving]).toEqual(['Afasta um pouco', 'Fica de lado', 'Fica parado']);
  });

  it('contagem regressiva 3, 2, 1 e libera em 0', () => {
    expect(COUNTDOWN_SECONDS).toBe(3);
    expect([0, 999, 1000, 2000, 2999, 3000].map((t) => countdownValue(0, t))).toEqual([3, 3, 2, 1, 1, 0]);
  });
});

describe('Correção ao vivo — fim automático', () => {
  const stand = { fullBody: true, inRep: false, kneeAngle: 175 };

  it('limite de 5 s fica numa constante', () => {
    expect(AUTO_FINISH_IDLE_MS).toBe(5000);
  });

  it('antes da primeira rep nunca encerra, mesmo parado em pé', () => {
    const a = new AutoFinishDetector();
    for (let t = 0; t <= 20000; t += 500) expect(a.update({ t, repCount: 0, ...stand })).toBeNull();
    expect(a.update({ t: 30000, repCount: 0, fullBody: false, inRep: false, kneeAngle: null })).toBeNull();
  });

  it('depois da primeira rep, 5 s em pé sem rep nova encerra', () => {
    const a = new AutoFinishDetector();
    expect(a.update({ t: 1000, repCount: 1, ...stand })).toBeNull();
    expect(a.update({ t: 1000 + AUTO_FINISH_IDLE_MS - 1, repCount: 1, ...stand })).toBeNull();
    expect(a.update({ t: 1000 + AUTO_FINISH_IDLE_MS, repCount: 1, ...stand })).toBe('idle');
  });

  it('descer de novo zera a espera', () => {
    const a = new AutoFinishDetector();
    a.update({ t: 0, repCount: 1, ...stand });
    a.update({ t: 4000, repCount: 1, fullBody: true, inRep: true, kneeAngle: 120 });
    expect(a.update({ t: 6000, repCount: 2, ...stand })).toBeNull();
    expect(a.update({ t: 11000, repCount: 2, ...stand })).toBe('idle');
  });

  it('pausado de frente não conta como espera (joelho desconhecido)', () => {
    const a = new AutoFinishDetector();
    for (let t = 0; t <= 8000; t += 500) expect(a.update({ t, repCount: 1, fullBody: true, inRep: false, kneeAngle: null })).toBeNull();
  });

  it('saiu do quadro ou chegou perto da câmera depois de uma rep encerra', () => {
    const a = new AutoFinishDetector();
    a.update({ t: 0, repCount: 2, ...stand });
    const lost = { repCount: 2, fullBody: false, inRep: false, kneeAngle: null };
    expect(a.update({ t: 100, ...lost })).toBeNull();
    expect(a.update({ t: 100 + AUTO_FINISH_LOST_MS - 1, ...lost })).toBeNull();
    expect(a.update({ t: 100 + AUTO_FINISH_LOST_MS, ...lost })).toBe('left');
  });

  it('voltar ao quadro antes do limite cancela', () => {
    const a = new AutoFinishDetector();
    a.update({ t: 0, repCount: 1, fullBody: false, inRep: false, kneeAngle: null });
    a.update({ t: 500, repCount: 1, ...stand });
    expect(a.update({ t: 1200, repCount: 1, fullBody: false, inRep: false, kneeAngle: null })).toBeNull();
  });
});
