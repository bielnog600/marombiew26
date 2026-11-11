import { describe, it, expect } from 'vitest';
import {
  matchExerciseRule, getExerciseRule, EXERCISE_RULE_ORDER, ALL_ERROR_MESSAGES,
  BenchPressCounter, benchPressRule, BENCH_MESSAGES, BENCH_INSTRUCTION,
  LegPressCounter, legPressRule, LEG_PRESS_MESSAGES, judgeLegPressDepth,
  PlankCounter, plankRule, plankMetrics, plankPositionIssue, judgePlank, timedToSessionSummary, formatClock,
  PLANK_MESSAGES, PLANK_NOT_HORIZONTAL_MESSAGE, PLANK_KNEE_DOWN_MESSAGE,
  ARM_LM,
  type BenchMetrics, type PlankMetrics, type TimedCounter,
} from '@/lib/liveCorrection/exercises';
import { LM, type Landmark } from '@/lib/liveCorrection/squatAnalysis';

describe('Correção ao vivo — nomes da etapa 4', () => {
  it.each([
    ['SUPINO RETO', 'bench_press'],
    ['SUPINO INCLINADO', 'bench_press'],
    ['SUPINO RETO HALTERES', 'bench_press'],
    ['SUPINO INCLINADO HALTERES', 'bench_press'],
    ['SUPINO INCLINADO BARRA', 'bench_press'],
    ['LEG PRESS', 'leg_press'],
    ['LEG PRESS 45 ART', 'leg_press'],
    ['LEG PRESS 45', 'leg_press'],
    ['LEG 180', 'leg_press'],
    ['LEG 45', 'leg_press'],
    ['PRANCHA', 'plank'],
    ['PRANCHA FRONTAL', 'plank'],
  ])('"%s" usa a regra %s', (name, id) => {
    expect(matchExerciseRule(name)?.id).toBe(id);
  });

  it('prancha lateral fica sem correção; regras anteriores iguais', () => {
    expect(matchExerciseRule('PRANCHA LATERAL')).toBeNull();
    expect(matchExerciseRule('SUPINO DECLINADO')).toBeNull();
    expect(matchExerciseRule('ROSCA DIRETA')?.id).toBe('curl');
    expect(matchExerciseRule('DESENV. ARNOLD')?.id).toBe('shoulder_press');
    expect(matchExerciseRule('ELEVAÇÃO LATERAL')?.id).toBe('lateral_raise');
    expect(matchExerciseRule('AGACHAMENTO SMITH')?.id).toBe('squat');
  });

  it('seletor com os 11 exercícios e mensagens antigas intactas', () => {
    expect(EXERCISE_RULE_ORDER).toEqual([
      'squat', 'stiff', 'bulgaro', 'lateral_raise', 'hip_thrust', 'curl', 'triceps_french', 'shoulder_press',
      'bench_press', 'leg_press', 'plank',
    ]);
    expect(ALL_ERROR_MESSAGES.lockout).toBe('Estica em cima');
    expect(ALL_ERROR_MESSAGES.depth).toBe('Desce mais');
    expect(ALL_ERROR_MESSAGES.hip_bench).toBe('Quadril no banco');
    expect(ALL_ERROR_MESSAGES.knee_lock).toBe('Não trava o joelho');
    expect(ALL_ERROR_MESSAGES.plank_hip_low).toBe('Sobe o quadril');
  });
});

function lmsWith(vis: Partial<Record<number, number>> = {}): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, visibility: vis[i] ?? 0.9 }));
}

describe('Pontos exigidos no posicionamento', () => {
  it('supino: ombro, cotovelo, punho e quadril (sem pernas nem cabeça)', () => {
    const l = lmsWith({ [LM.leftAnkle]: 0, [LM.rightAnkle]: 0, [LM.leftKnee]: 0, [LM.rightKnee]: 0, [LM.nose]: 0 });
    expect(benchPressRule.isBodyVisible!(l, 'left')).toBe(true);
    expect(benchPressRule.isBodyVisible!(lmsWith({ [ARM_LM.leftElbow]: 0.1 }), 'left')).toBe(false);
    expect(benchPressRule.instruction()).toBe(BENCH_INSTRUCTION);
  });

  it('leg press: quadril, joelho e tornozelo (ombro pode sumir atrás do encosto)', () => {
    const l = lmsWith({ [LM.leftShoulder]: 0, [LM.rightShoulder]: 0, [LM.nose]: 0 });
    expect(legPressRule.isBodyVisible!(l, 'left')).toBe(true);
    expect(legPressRule.isBodyVisible!(lmsWith({ [LM.leftAnkle]: 0.1 }), 'left')).toBe(false);
    expect(legPressRule.instruction()).toBe('Celular de lado da máquina, com quadril, joelho e pé aparecendo');
  });

  it('prancha: ombro, quadril, joelho e tornozelo + corpo na horizontal e joelho fora do chão', () => {
    expect(plankRule.isBodyVisible!(lmsWith({ [LM.nose]: 0 }), 'left')).toBe(true);
    expect(plankRule.isBodyVisible!(lmsWith({ [LM.leftKnee]: 0.1 }), 'left')).toBe(false);
    expect(plankPositionIssue(pk(178, 0, 45))).toBe(PLANK_NOT_HORIZONTAL_MESSAGE);
    expect(plankPositionIssue(pk(178, 0, 10, 120))).toBe(PLANK_KNEE_DOWN_MESSAGE);
    expect(plankPositionIssue(pk(178, 0, 10, 175))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Supino
// ---------------------------------------------------------------------------
const bm = (elbow: number, drop = 0.1, hip = 0): BenchMetrics => ({ elbowAngle: elbow, elbowDrop: drop, hipLift: hip });

/** Braços esticados → desce até `bottom` → sobe até 170°. Cada frame = 100 ms. */
function benchRep(c: BenchPressCounter, t0: number, bottom: number, opts: { drop?: number; hipAt?: number; downFrames?: number } = {}) {
  let t = t0;
  let rep = null;
  const push = (m: BenchMetrics) => { const r = c.push(m, t); t += 100; if (r) rep = r; };
  for (let k = 0; k < 3; k++) push(bm(170, -0.3));
  const down = opts.downFrames ?? 20;
  for (let k = 1; k < down; k++) push(bm(170 - (170 - bottom) * (k / down), -0.3));
  push(bm(bottom, opts.drop ?? 0.1, opts.hipAt ?? 0));
  for (let k = 1; k <= 10 && !rep; k++) push(bm(bottom + (170 - bottom) * (k / 10), -0.3));
  return { rep: rep as ReturnType<BenchPressCounter['push']>, t };
}

describe('Supino', () => {
  it('completa: cotovelo até 90° e na altura do ombro', () => {
    const { rep } = benchRep(new BenchPressCounter(), 0, 85);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual([]);
    expect(rep?.descentSeconds).toBeGreaterThanOrEqual(1.5);
  });

  it('cotovelo exatamente na altura do ombro conta; acima do ombro não', () => {
    expect(benchRep(new BenchPressCounter(), 0, 85, { drop: 0 }).rep?.complete).toBe(true);
    const { rep } = benchRep(new BenchPressCounter(), 0, 85, { drop: -0.1 });
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toEqual(['bench_near']);
  });

  it('faltou mais de 10° → "Desce mais"; até 10° → "Desce um pouco mais"', () => {
    const low = benchRep(new BenchPressCounter(), 0, 120, { downFrames: 30 }).rep;
    expect(low?.complete).toBe(false);
    expect(low?.errors).toEqual(['bench_low']);
    expect(BENCH_MESSAGES.bench_low).toBe('Desce mais');
    const near = benchRep(new BenchPressCounter(), 0, 98).rep;
    expect(near?.errors).toEqual(['bench_near']);
    expect(BENCH_MESSAGES.bench_near).toBe('Desce um pouco mais');
  });

  it('não esticou em cima e desceu de novo → "Estica em cima"; a próxima rep conta', () => {
    const c = new BenchPressCounter();
    let t = 0;
    const push = (a: number) => { const r = c.push(bm(a), t); t += 100; return r; };
    push(170);
    for (let k = 1; k <= 20; k++) push(170 - 90 * (k / 20));
    for (let a = 90; a <= 150; a += 10) expect(push(a)).toBeNull();
    const first = push(138);
    expect(first?.errors).toEqual(['lockout']);
    expect(first?.complete).toBe(true);
    expect(BENCH_MESSAGES.lockout).toBe('Estica em cima');
    for (let a = 130; a >= 80; a -= 5) push(a);
    let second = null;
    for (let a = 90; a <= 170 && !second; a += 10) second = push(a);
    expect(second?.index).toBe(2);
    expect(second?.errors).toEqual([]);
  });

  it('quadril subindo mais de 10% do tronco → "Quadril no banco" (a rep conta)', () => {
    const c = new BenchPressCounter();
    const { rep } = benchRep(c, 0, 85, { hipAt: 0.15 });
    expect(c.hipBaseline).toBeCloseTo(0);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual(['hip_bench']);
    expect(benchRep(new BenchPressCounter(), 0, 85, { hipAt: 0.08 }).rep?.errors).toEqual([]);
  });

  it('descida em menos de 1,5 s → "Controla a descida"', () => {
    expect(benchRep(new BenchPressCounter(), 0, 85, { downFrames: 8 }).rep?.errors).toEqual(['descent']);
  });

  it('não exige em pé: depois de pausar, espera os braços esticados', () => {
    const c = new BenchPressCounter();
    c.waitForStanding();
    expect(c.push(bm(120), 0)).toBeNull();
    expect(c.inRep).toBe(false);
    expect(benchRep(c, 100, 85).rep?.index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Leg press
// ---------------------------------------------------------------------------
/** Pernas esticadas → desce até `bottom` → empurra até `peak` → começa a descer (fecha a rep). */
function legRep(c: LegPressCounter, t0: number, bottom: number, opts: { peak?: number; downFrames?: number } = {}) {
  let t = t0;
  const peak = opts.peak ?? 170;
  let rep = null;
  const push = (a: number) => { const r = c.push(a, t); t += 100; if (r) rep = r; };
  for (let k = 0; k < 3; k++) push(168);
  const down = opts.downFrames ?? 20;
  for (let k = 1; k <= down; k++) push(168 - (168 - bottom) * (k / down));
  for (let k = 1; k <= 5; k++) push(bottom + (peak - bottom) * (k / 5));
  expect(rep).toBeNull();
  push(peak - 6);
  return { rep: rep as ReturnType<LegPressCounter['push']>, t };
}

describe('Leg press', () => {
  it('profundidade por nível: Iniciante 100°, Intermediário 90°, Avançado 80°, Pro 70°', () => {
    expect(judgeLegPressDepth(100, 'iniciante').deepEnough).toBe(true);
    expect(judgeLegPressDepth(90, 'intermediario').deepEnough).toBe(true);
    expect(judgeLegPressDepth(91, 'intermediario').deepEnough).toBe(false);
    expect(judgeLegPressDepth(80, 'avancado').deepEnough).toBe(true);
    expect(judgeLegPressDepth(70, 'pro').deepEnough).toBe(true);
    expect(judgeLegPressDepth(75, 'pro')).toEqual({ deepEnough: false, near: true });
  });

  it('completa no nível do aluno', () => {
    const { rep } = legRep(new LegPressCounter('iniciante'), 0, 95);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual([]);
    expect(legRep(new LegPressCounter('pro'), 0, 68).rep?.complete).toBe(true);
  });

  it('faltou até 10° → "Desce um pouco mais"; mais que isso → "Desce mais"', () => {
    expect(legRep(new LegPressCounter('intermediario'), 0, 95).rep?.errors).toEqual(['leg_near']);
    const low = legRep(new LegPressCounter('intermediario'), 0, 105).rep;
    expect(low?.complete).toBe(false);
    expect(low?.errors).toEqual(['leg_low']);
    expect(LEG_PRESS_MESSAGES.leg_near).toBe('Desce um pouco mais');
  });

  it('a rep começa abaixo de 150° e termina acima de 160°', () => {
    const c = new LegPressCounter();
    c.push(168, 0);
    c.push(152, 100);
    expect(c.inRep).toBe(false);
    c.push(148, 200);
    expect(c.inRep).toBe(true);
    c.push(85, 300);
    c.push(159, 400);
    expect(c.flush()).toBeNull();
    c.push(162, 500);
    expect(c.flush()?.index).toBe(1);
  });

  it('joelho acima de 175° no topo → "Não trava o joelho" (a rep conta)', () => {
    const { rep } = legRep(new LegPressCounter(), 0, 85, { peak: 178 });
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual(['knee_lock']);
    expect(LEG_PRESS_MESSAGES.knee_lock).toBe('Não trava o joelho');
    expect(legRep(new LegPressCounter(), 0, 85, { peak: 175 }).rep?.errors).toEqual([]);
  });

  it('descida em menos de 1,5 s → "Controla a descida"', () => {
    expect(legRep(new LegPressCounter(), 0, 85, { downFrames: 8 }).rep?.errors).toEqual(['descent']);
  });

  it('nível vem do campo do aluno (camera_depth_level)', () => {
    expect(legPressRule.createCounter('avancado').level).toBe('avancado');
    expect(legPressRule.levelHints.pro).toBe('joelho até 70°');
  });
});

// ---------------------------------------------------------------------------
// Prancha
// ---------------------------------------------------------------------------
function pk(line: number, offset = 0, tilt = 5, knee = 175): PlankMetrics {
  return { lineAngle: line, hipOffset: offset, tilt, kneeAngle: knee };
}
const GOOD = pk(175);
const LOW = pk(150, 0.1);
const HIGH = pk(150, -0.1);

/** Empurra `m` por `ms` (frames de 100 ms) e devolve os frames. */
function hold(c: PlankCounter, from: number, ms: number, m: PlankMetrics | null) {
  const frames = [];
  for (let t = from; t < from + ms; t += 100) frames.push(c.push(m, t));
  return { frames, t: from + ms };
}

describe('Prancha — posição', () => {
  it('linha ombro-quadril-tornozelo: quadril abaixo = "Sobe o quadril", acima = "Desce o quadril"', () => {
    const l = lmsWith();
    l[LM.leftShoulder] = { x: 0.2, y: 0.5 };
    l[LM.leftAnkle] = { x: 0.8, y: 0.5 };
    l[LM.leftKnee] = { x: 0.65, y: 0.5 };
    l[LM.leftHip] = { x: 0.5, y: 0.5 };
    const straight = plankMetrics(l, 100, 100, 'left');
    expect(straight.lineAngle).toBeCloseTo(180);
    expect(straight.tilt).toBeCloseTo(0);
    expect(judgePlank(straight)).toBeNull();
    l[LM.leftHip] = { x: 0.5, y: 0.6 };
    const sag = plankMetrics(l, 100, 100, 'left');
    expect(sag.lineAngle).toBeLessThan(165);
    expect(sag.hipOffset).toBeGreaterThan(0);
    expect(judgePlank(sag)).toBe('plank_hip_low');
    l[LM.leftHip] = { x: 0.5, y: 0.4 };
    expect(judgePlank(plankMetrics(l, 100, 100, 'left'))).toBe('plank_hip_high');
    expect(PLANK_MESSAGES).toEqual({ plank_hip_low: 'Sobe o quadril', plank_hip_high: 'Desce o quadril' });
  });

  it('165° exatos ainda é boa posição', () => {
    expect(judgePlank(pk(165, 0.05))).toBeNull();
    expect(judgePlank(pk(164.9, 0.05))).toBe('plank_hip_low');
  });
});

describe('Prancha — cronômetro', () => {
  it('é exercício de tempo e não conta reps', () => {
    expect(plankRule.timed).toBe(true);
    const c = plankRule.createCounter() as TimedCounter;
    expect(c.timed).toBe(true);
    expect(c.reps).toEqual([]);
    expect(getExerciseRule('squat').timed).toBeUndefined();
  });

  it('conta só o tempo em boa posição e fala a cada 10 s', () => {
    const c = new PlankCounter();
    const { frames } = hold(c, 0, 25100, GOOD);
    expect(frames.map((f) => f.tenMark).filter((x) => x != null)).toEqual([10, 20]);
    expect(c.summary()).toEqual({ totalSeconds: 25, goodSeconds: 25, goodPercent: 100, faults: { plank_hip_low: 0, plank_hip_high: 0 } });
  });

  it('quadril caído não anda o cronômetro, mas conta no tempo total e 1 vez no resumo', () => {
    const c = new PlankCounter();
    let { t } = hold(c, 0, 10000, GOOD);
    const low = hold(c, t, 5000, LOW);
    expect(low.frames.some((f) => f.newFault === 'plank_hip_low')).toBe(true);
    expect(low.frames.filter((f) => f.newFault).length).toBe(1);
    expect(low.frames.at(-1)?.fault).toBe('plank_hip_low');
    expect(low.frames.at(-1)?.good).toBe(false);
    t = hold(c, low.t, 5000, GOOD).t;
    hold(c, t, 2000, HIGH);
    const s = c.summary();
    expect(s.totalSeconds).toBe(21);
    expect(s.goodSeconds).toBe(15);
    expect(s.goodPercent).toBe(Math.round((15000 / 21900) * 100));
    expect(s.faults).toEqual({ plank_hip_low: 1, plank_hip_high: 1 });
  });

  it('quadril caindo por menos de 0,3 s não conta como erro', () => {
    const c = new PlankCounter();
    let { t } = hold(c, 0, 2000, GOOD);
    t = hold(c, t, 200, LOW).t;
    hold(c, t, 2000, GOOD);
    expect(c.summary().faults.plank_hip_low).toBe(0);
  });

  it('fora da posição (joelho no chão ou fora do quadro) por mais de 3 s fecha', () => {
    const c = new PlankCounter();
    const { t } = hold(c, 0, 5000, GOOD);
    const kneel = hold(c, t, 3000, pk(178, 0, 5, 110));
    expect(kneel.frames.some((f) => f.autoFinish)).toBe(false);
    expect(c.push(pk(178, 0, 5, 110), kneel.t + 100).autoFinish).toBe(true);
    expect(c.summary().goodSeconds).toBe(5);

    const c2 = new PlankCounter();
    const t2 = hold(c2, 0, 2000, GOOD).t;
    const lost = hold(c2, t2, 3200, null);
    expect(lost.frames.at(-1)?.autoFinish).toBe(true);
    expect(lost.frames.at(-1)?.inPosition).toBe(false);
  });

  it('antes de entrar na posição não fecha sozinho', () => {
    const c = new PlankCounter();
    const { frames } = hold(c, 0, 6000, pk(178, 0, 60));
    expect(frames.some((f) => f.autoFinish)).toBe(false);
    expect(c.summary().totalSeconds).toBe(0);
  });

  it('salva segundos no lugar das reps e formata o cronômetro', () => {
    const s = timedToSessionSummary({ totalSeconds: 40, goodSeconds: 32, goodPercent: 80, faults: { plank_hip_low: 2, plank_hip_high: 0 } }, PLANK_MESSAGES);
    expect(s).toEqual({
      total: 40, complete: 32, incomplete: 8,
      errors: [{ key: 'plank_hip_low', label: 'Sobe o quadril', count: 2 }],
      avgDescentSeconds: null, fastDescentReps: 0,
    });
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65400)).toBe('1:05');
  });

  it('"Fazer outra série" zera o cronômetro', () => {
    const c = new PlankCounter();
    hold(c, 0, 12000, GOOD);
    c.reset();
    expect(c.summary().goodSeconds).toBe(0);
    expect(c.push(GOOD, 20000).tenMark).toBeNull();
  });
});
