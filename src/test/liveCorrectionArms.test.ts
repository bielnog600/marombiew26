import { describe, it, expect } from 'vitest';
import {
  matchExerciseRule, getExerciseRule, ALL_ERROR_MESSAGES, EXERCISE_RULE_ORDER, isWrongView, wrongViewMessage,
  CurlCounter, curlRule, curlMetrics, isScottCurl, CURL_MESSAGES, CURL_INSTRUCTION,
  TricepsFrenchCounter, tricepsFrenchRule, TRICEPS_MESSAGES,
  ShoulderPressCounter, shoulderPressRule, PRESS_MESSAGES,
  pickArmSide, ARM_LM,
  type CurlMetrics, type TricepsMetrics, type PressMetrics,
} from '@/lib/liveCorrection/exercises';
import { LM, type Landmark } from '@/lib/liveCorrection/squatAnalysis';

describe('Correção ao vivo — nomes da etapa 3', () => {
  it.each([
    ['ROSCA DIRETA C/ HALTERES', 'curl'],
    ['ROSCA DIRETA', 'curl'],
    ['ROSCA ALTERNADA', 'curl'],
    ['ROSCA MARTELO', 'curl'],
    ['BÍCEPS MARTELO', 'curl'],
    ['BICEPS MARTELO', 'curl'],
    ['ROSCA SCOTT', 'curl'],
    ['TRÍCEPS FRANCÊS', 'triceps_french'],
    ['TRICEPS FRANCES', 'triceps_french'],
    ['FRANCÊS UNILATERAL', 'triceps_french'],
    ['ROSCA FRANCESA', 'triceps_french'],
    ['DESENV. HALTERES', 'shoulder_press'],
    ['DESENV. ARNOLD', 'shoulder_press'],
    ['DESENVOLVIMENTO MILITAR', 'shoulder_press'],
  ])('"%s" usa a regra %s', (name, id) => {
    expect(matchExerciseRule(name)?.id).toBe(id);
  });

  it('as regras anteriores continuam casando igual', () => {
    expect(matchExerciseRule('AGACHAMENTO SMITH')?.id).toBe('squat');
    expect(matchExerciseRule('STIFF ROMENO')?.id).toBe('stiff');
    expect(matchExerciseRule('AFUNDO HALTERES')?.id).toBe('bulgaro');
    expect(matchExerciseRule('ELEVAÇÃO LATERAL')?.id).toBe('lateral_raise');
    expect(matchExerciseRule('ELEVAÇÃO PÉLVICA')?.id).toBe('hip_thrust');
    expect(matchExerciseRule('TRÍCEPS CORDA')).toBeNull();
  });

  it('seletor do admin com os 8 exercícios e mensagens antigas intactas', () => {
    expect(EXERCISE_RULE_ORDER.slice(0, 8)).toEqual(['squat', 'stiff', 'bulgaro', 'lateral_raise', 'hip_thrust', 'curl', 'triceps_french', 'shoulder_press']);
    expect(ALL_ERROR_MESSAGES.depth).toBe('Desce mais');
    expect(ALL_ERROR_MESSAGES.depth_near).toBe('Desce um pouco mais');
    expect(ALL_ERROR_MESSAGES.raise_near).toBe('Sobe um pouco mais');
    expect(ALL_ERROR_MESSAGES.curl_extend).toBe('Estica o braço embaixo');
    expect(ALL_ERROR_MESSAGES.triceps_low).toBe('Desce mais atrás da cabeça');
    expect(ALL_ERROR_MESSAGES.press_low).toBe('Desce até a altura da orelha');
  });
});

// ---------------------------------------------------------------------------
function lmsWith(vis: Partial<Record<number, number>> = {}): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, visibility: vis[i] ?? 0.9 }));
}

describe('Vista e pontos exigidos', () => {
  it('rosca e francês de lado; desenvolvimento de frente', () => {
    expect(curlRule.view).toBe('side');
    expect(tricepsFrenchRule.view).toBe('side');
    expect(shoulderPressRule.view).toBe('front');
    expect(isWrongView('front', false, true)).toBe(true);
    expect(wrongViewMessage(shoulderPressRule.view)).toBe('Fica de frente pra câmera');
    expect(isWrongView('side', true, true)).toBe(true);
  });

  it('rosca não exige corpo inteiro: ombro, cotovelo, punho e quadril do braço medido', () => {
    const noLegs = lmsWith({ [LM.leftAnkle]: 0, [LM.rightAnkle]: 0, [LM.leftKnee]: 0, [LM.rightKnee]: 0, [LM.nose]: 0 });
    expect(curlRule.isBodyVisible!(noLegs, 'left')).toBe(true);
    expect(tricepsFrenchRule.isBodyVisible!(noLegs, 'left')).toBe(true);
    const noWrist = lmsWith({ [ARM_LM.leftWrist]: 0.1 });
    expect(curlRule.isBodyVisible!(noWrist, 'left')).toBe(false);
    expect(curlRule.isBodyVisible!(noWrist, 'right')).toBe(true);
    expect(curlRule.instruction()).toBe(CURL_INSTRUCTION);
  });

  it('desenvolvimento exige os dois braços e o quadril (pode estar sentado)', () => {
    expect(shoulderPressRule.isBodyVisible!(lmsWith({ [LM.leftAnkle]: 0, [LM.rightAnkle]: 0 }), 'left')).toBe(true);
    expect(shoulderPressRule.isBodyVisible!(lmsWith({ [ARM_LM.rightElbow]: 0.1 }), 'left')).toBe(false);
  });

  it('mede o braço mais próximo da câmera', () => {
    expect(pickArmSide(lmsWith({ [LM.leftShoulder]: 0.2, [ARM_LM.leftElbow]: 0.2, [ARM_LM.leftWrist]: 0.2 }))).toBe('right');
    expect(pickArmSide(lmsWith({ [LM.rightShoulder]: 0.2, [ARM_LM.rightElbow]: 0.2 }))).toBe('left');
  });

  it('ângulos da rosca vêm de ombro-cotovelo-punho e quadril-ombro-cotovelo', () => {
    const l = lmsWith();
    l[LM.leftShoulder] = { x: 0.5, y: 0.3 };
    l[ARM_LM.leftElbow] = { x: 0.5, y: 0.5 };
    l[ARM_LM.leftWrist] = { x: 0.7, y: 0.5 };
    l[LM.leftHip] = { x: 0.5, y: 0.8 };
    const m = curlMetrics(l, 100, 100, 'left');
    expect(m.elbowAngle).toBeCloseTo(90);
    expect(m.elbowDrift).toBeCloseTo(0);
    expect(m.trunkLean).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// Rosca
// ---------------------------------------------------------------------------
const cm = (elbow: number, drift = 10, lean = 0): CurlMetrics => ({ elbowAngle: elbow, elbowDrift: drift, trunkLean: lean });

/** Braço esticado → sobe até `top` → desce até 170°. Cada frame = 100 ms (descida de ~1,7 s por padrão). */
function curlRep(c: CurlCounter, t0: number, top: number, opts: { drift?: number; leanAt?: number; downFrames?: number } = {}) {
  let t = t0;
  for (let k = 0; k < 3; k++) { c.push(cm(170), t); t += 100; }
  for (const a of [130, 100, 80]) { if (a > top) { c.push(cm(a), t); t += 100; } }
  c.push(cm(top, opts.drift ?? 10, opts.leanAt ?? 0), t); t += 100;
  const down = opts.downFrames ?? 20;
  let rep = null;
  for (let k = 1; k <= down && !rep; k++) {
    rep = c.push(cm(top + (170 - top) * (k / down)), t);
    t += 100;
  }
  return { rep, t };
}

describe('Rosca', () => {
  it('completa: subiu até 60°, esticou embaixo, descida controlada', () => {
    const c = new CurlCounter();
    const { rep } = curlRep(c, 0, 55);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual([]);
    expect(rep?.descentSeconds).toBeGreaterThanOrEqual(1.5);
  });

  it('60° exatos ainda é completa', () => {
    expect(curlRep(new CurlCounter(), 0, 60).rep?.complete).toBe(true);
  });

  it('faltou mais de 10° → "Sobe mais" (incompleta)', () => {
    const { rep } = curlRep(new CurlCounter(), 0, 85);
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toContain('curl_low');
    expect(CURL_MESSAGES.curl_low).toBe('Sobe mais');
  });

  it('faltou até 10° → "Sobe um pouco mais" (incompleta)', () => {
    const { rep } = curlRep(new CurlCounter(), 0, 68);
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toEqual(['curl_near']);
    expect(CURL_MESSAGES.curl_near).toBe('Sobe um pouco mais');
  });

  it('não esticou embaixo e subiu de novo → "Estica o braço embaixo" e a próxima rep conta', () => {
    const c = new CurlCounter();
    let t = 0;
    const push = (a: number) => { const r = c.push(cm(a), t); t += 100; return r; };
    push(170); push(130); push(90); push(50);
    for (let a = 55; a <= 145; a += 5) expect(push(a)).toBeNull(); // volta devagar só até 145°
    const first = push(130);
    expect(first?.errors).toEqual(['curl_extend']);
    expect(first?.complete).toBe(true);
    expect(c.inRep).toBe(true);
    push(90); push(55);
    let second = null;
    for (let k = 1; k <= 20 && !second; k++) second = push(55 + (170 - 55) * (k / 20));
    expect(second?.index).toBe(2);
    expect(second?.errors).toEqual([]);
  });

  it('cotovelo saindo do corpo no topo → "Cotovelo colado no corpo" (a rep conta)', () => {
    const { rep } = curlRep(new CurlCounter(), 0, 55, { drift: 30 });
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual(['elbow_tuck']);
  });

  it('tronco variando mais de 10° → "Sem balanço"', () => {
    const { rep } = curlRep(new CurlCounter(), 0, 55, { leanAt: 12 });
    expect(rep?.errors).toEqual(['swing']);
    expect(CURL_MESSAGES.swing).toBe('Sem balanço');
    expect(curlRep(new CurlCounter(), 0, 55, { leanAt: 9 }).rep?.errors).toEqual([]);
  });

  it('descida em menos de 1,5 s → "Controla a descida"', () => {
    const { rep } = curlRep(new CurlCounter(), 0, 55, { downFrames: 8 });
    expect(rep?.fastDescent).toBe(true);
    expect(rep?.errors).toEqual(['descent']);
  });

  it('rosca Scott não checa cotovelo nem balanço', () => {
    expect(isScottCurl('ROSCA SCOTT')).toBe(true);
    expect(isScottCurl('ROSCA DIRETA')).toBe(false);
    const scott = curlRule.createCounter(undefined, undefined, 'ROSCA SCOTT') as CurlCounter;
    expect(scott.scott).toBe(true);
    const { rep } = curlRep(scott, 0, 55, { drift: 40, leanAt: 15 });
    expect(rep?.errors).toEqual([]);
    expect((curlRule.createCounter(undefined, undefined, 'ROSCA DIRETA') as CurlCounter).scott).toBe(false);
  });

  it('depois de pausar, só conta a próxima rep depois de esticar o braço', () => {
    const c = new CurlCounter();
    c.waitForStanding();
    expect(c.push(cm(120), 0)).toBeNull();
    expect(c.inRep).toBe(false);
    expect(curlRep(c, 100, 55).rep?.index).toBe(1);
    expect(c.atTop).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tríceps francês
// ---------------------------------------------------------------------------
const tm = (elbow: number, tilt = 0): TricepsMetrics => ({ elbowAngle: elbow, armTilt: tilt });

/** Braço esticado em cima → desce até `bottom` → sobe até `peak` → começa a descer (fecha a rep). */
function tricepsRep(c: TricepsFrenchCounter, t0: number, bottom: number, opts: { peak?: number; tiltAt?: number; downFrames?: number } = {}) {
  let t = t0;
  const peak = opts.peak ?? 175;
  let rep = null;
  const push = (m: TricepsMetrics) => { const r = c.push(m, t); t += 100; if (r) rep = r; };
  for (let k = 0; k < 3; k++) push(tm(172));
  const down = opts.downFrames ?? 20;
  for (let k = 1; k <= down; k++) push(tm(172 - (172 - bottom) * (k / down), k === down ? opts.tiltAt ?? 0 : 0));
  for (let k = 1; k <= 5; k++) push(tm(bottom + (peak - bottom) * (k / 5)));
  expect(rep).toBeNull(); // espera o topo assentar
  push(tm(peak - 6));
  return { rep: rep as ReturnType<TricepsFrenchCounter['push']>, t };
}

describe('Tríceps francês', () => {
  it('completa: desceu até 70° e esticou em cima', () => {
    const { rep } = tricepsRep(new TricepsFrenchCounter(), 0, 65);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual([]);
    expect(rep?.topElbowAngle).toBe(175);
  });

  it('faltou mais de 10° → "Desce mais atrás da cabeça"', () => {
    const { rep } = tricepsRep(new TricepsFrenchCounter(), 0, 90, { downFrames: 30 });
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toEqual(['triceps_low']);
    expect(TRICEPS_MESSAGES.triceps_low).toBe('Desce mais atrás da cabeça');
  });

  it('faltou até 10° → "Desce um pouco mais"', () => {
    const { rep } = tricepsRep(new TricepsFrenchCounter(), 0, 78);
    expect(rep?.errors).toEqual(['triceps_near']);
    expect(TRICEPS_MESSAGES.triceps_near).toBe('Desce um pouco mais');
  });

  it('não esticou até 160° em cima → "Estica em cima" (a rep conta)', () => {
    const c = new TricepsFrenchCounter();
    let t = 0;
    const push = (a: number) => { const r = c.push(tm(a), t); t += 100; return r; };
    push(172);
    for (let k = 1; k <= 20; k++) push(172 - (172 - 65) * (k / 20));
    for (const a of [90, 120, 145, 152, 156]) expect(push(a)).toBeNull();
    const rep = push(150);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual(['lockout']);
    expect(TRICEPS_MESSAGES.lockout).toBe('Estica em cima');
  });

  it('braço mudando mais de 20° de inclinação → "Cotovelo parado"', () => {
    expect(tricepsRep(new TricepsFrenchCounter(), 0, 65, { tiltAt: 25 }).rep?.errors).toEqual(['elbow_still']);
    expect(tricepsRep(new TricepsFrenchCounter(), 0, 65, { tiltAt: 18 }).rep?.errors).toEqual([]);
  });

  it('descida em menos de 1,5 s → "Controla a descida"', () => {
    const { rep } = tricepsRep(new TricepsFrenchCounter(), 0, 65, { downFrames: 8 });
    expect(rep?.errors).toEqual(['descent']);
  });

  it('segurando em cima 1 s a rep fecha; finalizar em cima também conta', () => {
    const c = new TricepsFrenchCounter();
    let t = 0;
    const push = (a: number) => { const r = c.push(tm(a), t); t += 100; return r; };
    push(172);
    for (let k = 1; k <= 20; k++) push(172 - (172 - 65) * (k / 20));
    push(120); push(170);
    let rep = null;
    for (let k = 0; k < 12 && !rep; k++) rep = push(172);
    expect(rep?.complete).toBe(true);
    expect(c.inRep).toBe(false);
    for (let k = 1; k <= 20; k++) push(172 - (172 - 65) * (k / 20));
    push(120); push(170);
    expect(c.reps).toHaveLength(1);
    expect(c.flush()?.index).toBe(2);
    expect(c.flush()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Desenvolvimento
// ---------------------------------------------------------------------------
const pm = (l: number, r: number = l): PressMetrics => ({ leftElbow: l, rightElbow: r });

/** Braços esticados → descem até `bottom` → sobem até `peak` → começam a descer (fecha a rep). */
function pressRep(
  c: ShoulderPressCounter, t0: number, bottom: number,
  opts: { peak?: number; bottomDiff?: number; peakR?: number; downFrames?: number } = {},
) {
  let t = t0;
  const peak = opts.peak ?? 172;
  let rep = null;
  const push = (m: PressMetrics) => { const r = c.push(m, t); t += 100; if (r) rep = r; };
  for (let k = 0; k < 3; k++) push(pm(172));
  const down = opts.downFrames ?? 20;
  for (let k = 1; k < down; k++) push(pm(172 - (172 - bottom) * (k / down)));
  const d = opts.bottomDiff ?? 0;
  push(pm(bottom - d / 2, bottom + d / 2));
  for (let k = 1; k < 5; k++) push(pm(bottom + (peak - bottom) * (k / 5)));
  push(pm(peak, opts.peakR ?? peak));
  expect(rep).toBeNull();
  push(pm(Math.min(peak, opts.peakR ?? peak) - 12));
  return { rep: rep as ReturnType<ShoulderPressCounter['push']>, t };
}

describe('Desenvolvimento', () => {
  it('completa: desceu até a altura da orelha (95°) e esticou em cima', () => {
    const { rep } = pressRep(new ShoulderPressCounter(), 0, 90);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual([]);
    expect(pressRep(new ShoulderPressCounter(), 0, 95).rep?.complete).toBe(true);
  });

  it('faltou mais de 10° → "Desce até a altura da orelha"', () => {
    const { rep } = pressRep(new ShoulderPressCounter(), 0, 115, { downFrames: 30 });
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toEqual(['press_low']);
    expect(PRESS_MESSAGES.press_low).toBe('Desce até a altura da orelha');
  });

  it('faltou até 10° → "Desce um pouco mais"', () => {
    expect(pressRep(new ShoulderPressCounter(), 0, 103).rep?.errors).toEqual(['press_near']);
  });

  it('média no topo abaixo de 160° → "Estica em cima"', () => {
    const { rep } = pressRep(new ShoulderPressCounter(), 0, 90, { peak: 158 });
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual(['lockout']);
  });

  it('braços diferentes mais de 15° no fundo ou no topo → "Sobe os dois iguais"', () => {
    expect(pressRep(new ShoulderPressCounter(), 0, 90, { bottomDiff: 20 }).rep?.errors).toEqual(['asymmetry']);
    expect(pressRep(new ShoulderPressCounter(), 0, 90, { peak: 178, peakR: 160 }).rep?.errors).toEqual(['asymmetry']);
    expect(pressRep(new ShoulderPressCounter(), 0, 90, { bottomDiff: 14 }).rep?.errors).toEqual([]);
    expect(PRESS_MESSAGES.asymmetry).toBe('Sobe os dois iguais');
  });

  it('descida em menos de 1,5 s → "Controla a descida"', () => {
    expect(pressRep(new ShoulderPressCounter(), 0, 90, { downFrames: 8 }).rep?.errors).toEqual(['descent']);
  });

  it('a rep só começa abaixo de 140° e termina acima de 155°', () => {
    const c = new ShoulderPressCounter();
    c.push(pm(172), 0);
    c.push(pm(142), 100);
    expect(c.inRep).toBe(false);
    c.push(pm(138), 200);
    expect(c.inRep).toBe(true);
    c.push(pm(90), 300);
    c.push(pm(154), 400);
    expect(c.reps).toHaveLength(0);
    c.push(pm(156), 500);
    expect(c.flush()?.index).toBe(1);
  });

  it('parado ≥ 1 s com os halteres apoiados libera o fim automático', () => {
    const c = new ShoulderPressCounter();
    c.push(pm(90), 0);
    expect(c.resting).toBe(false);
    c.push(pm(92), 600);
    c.push(pm(91), 1100);
    expect(c.resting).toBe(true);
  });
});

describe('Regras anteriores sem mudança', () => {
  it('elevação lateral e pélvica mantêm seus campos', () => {
    expect(getExerciseRule('lateral_raise').skeleton).toBe('arms');
    expect(getExerciseRule('lateral_raise').startHint).toBeUndefined();
    expect(getExerciseRule('hip_thrust').startHint).toBeUndefined();
    expect(getExerciseRule('squat').skeleton).toBeUndefined();
  });
});
