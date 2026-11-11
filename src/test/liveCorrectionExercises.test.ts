import { describe, it, expect } from 'vitest';
import {
  matchExerciseRule, getExerciseRule, EXERCISE_RULE_ORDER, ALL_ERROR_MESSAGES, autoFinishRepCount, summarizeByLeg, summarizeLiveReps,
  StiffRepCounter, STIFF_MIN_TRUNK_LEAN, STIFF_MIN_KNEE_ANGLE, STIFF_MIN_DESCENT_SECONDS, STIFF_REP_START_HIP_ANGLE, STIFF_REP_END_HIP_ANGLE,
  STIFF_MESSAGES, judgeStiffDepth, stiffMetrics, type StiffMetrics,
  LungeRepCounter, LUNGE_MAX_BOTTOM_KNEE, LUNGE_MAX_TRUNK_ANGLE, LUNGE_MIN_DESCENT_SECONDS, LUNGE_REP_START_KNEE_ANGLE, LUNGE_REP_END_KNEE_ANGLE,
  LUNGE_MESSAGES, BULGARO_INSTRUCTION, judgeLungeDepth, lungeMetrics, type LungeMetrics,
  squatRule, normalizeExerciseName,
} from '@/lib/liveCorrection/exercises';
import { LM, SquatRepCounter, frameMetrics, POSITION_MESSAGES, type Landmark, type Side } from '@/lib/liveCorrection/squatAnalysis';

// ---------------------------------------------------------------------------
// Pontos de uma pessoa de lado (perna esquerda e direita podem ter ângulos diferentes)
// ---------------------------------------------------------------------------
const rad = (d: number) => (d * Math.PI) / 180;
interface LegPose { knee: number; lean: number }
/** knee = ângulo do joelho (180 = reto); lean = tronco inclinado da vertical. Canela vertical. */
function pose(left: LegPose, right: LegPose = left): Landmark[] {
  const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.1, visibility: 0.9 }));
  const put = (side: Side, p: LegPose) => {
    const ids = side === 'left'
      ? { sh: LM.leftShoulder, hip: LM.leftHip, knee: LM.leftKnee, ankle: LM.leftAnkle }
      : { sh: LM.rightShoulder, hip: LM.rightHip, knee: LM.rightKnee, ankle: LM.rightAnkle };
    const ankle = { x: 0.5, y: 0.9 };
    const knee = { x: 0.5, y: 0.7 };
    const phi = rad(180 - p.knee);
    const hip = { x: knee.x - 0.2 * Math.sin(phi), y: knee.y - 0.2 * Math.cos(phi) };
    const sh = { x: hip.x + 0.3 * Math.sin(rad(p.lean)), y: hip.y - 0.3 * Math.cos(rad(p.lean)) };
    lms[ids.ankle] = { ...ankle, visibility: 0.9 };
    lms[ids.knee] = { ...knee, visibility: 0.9 };
    lms[ids.hip] = { ...hip, visibility: 0.9 };
    lms[ids.sh] = { ...sh, visibility: 0.9 };
  };
  put('left', left);
  put('right', right);
  return lms;
}

// ---------------------------------------------------------------------------
describe('Correção ao vivo — casamento de nomes', () => {
  it.each([
    ['STIFF ROMENO', 'stiff'],
    ['STIFF HALTERES', 'stiff'],
    ['Stiff com barra', 'stiff'],
    ['RDL', 'stiff'],
    ['LEVANTAMENTO TERRA ROMENO', 'stiff'],
    ['BÚLGARO', 'bulgaro'],
    ['AGACHAMENTO BÚLGARO', 'bulgaro'],
    ['AFUNDO HALTERES', 'bulgaro'],
    ['PASSADA', 'bulgaro'],
    ['GLOBET SQUATS', 'squat'],
    ['GOBLET', 'squat'],
    ['AGACHAMENTO SMITH', 'squat'],
    ['AGACHAMENTO LIVRE', 'squat'],
    ['AGACHAMENTO SUMÔ', 'squat'],
  ])('"%s" usa a regra %s', (name, id) => {
    expect(matchExerciseRule(name)?.id).toBe(id);
  });

  it('exercícios sem regra não mostram o botão', () => {
    expect(matchExerciseRule('LEG PRESS 45')).toBeNull();
    expect(matchExerciseRule('LEVANTAMENTO TERRA')).toBeNull();
    expect(matchExerciseRule('HACK MACHINE')).toBeNull();
    expect(matchExerciseRule('')).toBeNull();
    expect(matchExerciseRule(null)).toBeNull();
  });

  it('normaliza maiúsculas e acentos', () => {
    expect(normalizeExerciseName('Búlgaro  c/ halteres')).toBe('BULGARO C HALTERES');
  });

  it('registro tem as 3 regras, id desconhecido cai no agachamento', () => {
    expect(EXERCISE_RULE_ORDER).toEqual(['squat', 'stiff', 'bulgaro']);
    expect(getExerciseRule('xyz').id).toBe('squat');
    expect(EXERCISE_RULE_ORDER.map((id) => getExerciseRule(id).view)).toEqual(['side', 'side', 'side']);
    expect(ALL_ERROR_MESSAGES.knee).toBe('Menos joelho, quadril pra trás');
  });
});

// ---------------------------------------------------------------------------
describe('Correção ao vivo — agachamento sem mudanças', () => {
  it('a regra squat conta igual ao contador antigo', () => {
    const frames: [number, number][] = [[175, 10], [160, 20], [140, 25], [80, 30], [140, 25], [170, 10], [175, 5], [140, 20], [115, 30], [170, 10]];
    const old = new SquatRepCounter();
    const rule = squatRule.createCounter();
    frames.forEach(([k, l], i) => {
      const lms = pose({ knee: k, lean: l });
      old.update(frameMetrics(lms, 1, 1, 'left'), i * 500);
      rule.update(lms, 1, 1, 'left', i * 500);
    });
    expect(rule.reps).toEqual(old.reps);
    expect(rule.reps).toHaveLength(2);
    expect(rule.atTop).toBe(true);
    expect(squatRule.instruction()).toBe(POSITION_MESSAGES.no_body);
    expect(squatRule.minDescentSeconds).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
describe('Correção ao vivo — stiff', () => {
  const s = (hipAngle: number, kneeAngle = 165, trunkLean = 10): StiffMetrics => ({ hipAngle, kneeAngle, trunkLean });
  /** Uma rep: topo → desce → fundo (`bottom`) → volta. Tempo em ms. */
  const run = (c: StiffRepCounter, bottom: StiffMetrics, descentMs = 2500) => {
    c.push(s(175), 0);
    c.push(s(160, 165, 25), 100);
    c.push(s(140, bottom.kneeAngle, bottom.trunkLean - 5), 100 + descentMs / 2);
    c.push(bottom, 100 + descentMs);
    c.push(s(150, 165, 30), 200 + descentMs);
    return c.push(s(170), 300 + descentMs);
  };

  it('limites: começa < 150°, termina > 165°, joelho 135°, descida 2,0 s', () => {
    expect(STIFF_REP_START_HIP_ANGLE).toBe(150);
    expect(STIFF_REP_END_HIP_ANGLE).toBe(165);
    expect(STIFF_MIN_KNEE_ANGLE).toBe(135);
    expect(STIFF_MIN_DESCENT_SECONDS).toBe(2);
    expect(STIFF_MIN_TRUNK_LEAN).toEqual({ iniciante: 45, intermediario: 55, avancado: 65, pro: 75 });
  });

  it('rep completa: tronco inclinado o bastante, joelho quase fixo, descida lenta', () => {
    const rep = run(new StiffRepCounter('intermediario'), s(100, 160, 60));
    expect(rep).toMatchObject({ complete: true, errors: [], fastDescent: false, maxTrunkLean: 60, bottomKneeAngle: 160 });
  });

  it('só termina quando o quadril volta acima de 165°', () => {
    const c = new StiffRepCounter();
    c.push(s(175), 0);
    c.push(s(149, 165, 30), 100);
    expect(c.inRep).toBe(true);
    c.push(s(100, 160, 60), 2500);
    expect(c.push(s(165), 2600)).toBeNull();
    expect(c.atTop).toBe(false);
    expect(c.push(s(166), 2700)?.complete).toBe(true);
    expect(c.atTop).toBe(true);
  });

  it('tronco pouco inclinado = incompleta "Desce mais"', () => {
    const rep = run(new StiffRepCounter('intermediario'), s(120, 160, 40));
    expect(rep).toMatchObject({ complete: false, errors: ['depth'] });
    expect(STIFF_MESSAGES.depth).toBe('Desce mais');
  });

  it('faltou até 10° = incompleta "Desce um pouco mais"', () => {
    const rep = run(new StiffRepCounter('intermediario'), s(110, 160, 46));
    expect(rep).toMatchObject({ complete: false, errors: ['depth_near'] });
    expect(STIFF_MESSAGES.depth_near).toBe('Desce um pouco mais');
  });

  it('joelho dobrado demais no fundo = aviso "Menos joelho, quadril pra trás", rep conta', () => {
    const rep = run(new StiffRepCounter(), s(100, 125, 60));
    expect(rep).toMatchObject({ complete: true, errors: ['knee'] });
    expect(STIFF_MESSAGES.knee).toBe('Menos joelho, quadril pra trás');
    expect(run(new StiffRepCounter(), s(100, 135, 60))?.errors).toEqual([]);
  });

  it('descida em menos de 2,0 s = "Controla a descida" (rep conta)', () => {
    const fast = run(new StiffRepCounter(), s(100, 160, 60), 1500);
    expect(fast).toMatchObject({ complete: true, errors: ['descent'], fastDescent: true, descentSeconds: 1.5 });
    const ok = run(new StiffRepCounter(), s(100, 160, 60), 2000);
    expect(ok).toMatchObject({ errors: [], descentSeconds: 2 });
  });

  it('cada nível exige uma inclinação: 45 / 55 / 65 / 75', () => {
    expect(judgeStiffDepth(45, 'iniciante')).toEqual({ deepEnough: true, near: false });
    expect(judgeStiffDepth(54, 'intermediario')).toEqual({ deepEnough: false, near: true });
    expect(judgeStiffDepth(55, 'intermediario')).toEqual({ deepEnough: true, near: false });
    expect(judgeStiffDepth(60, 'avancado')).toEqual({ deepEnough: false, near: true });
    expect(judgeStiffDepth(65, 'avancado')).toEqual({ deepEnough: true, near: false });
    expect(judgeStiffDepth(64, 'pro')).toEqual({ deepEnough: false, near: false });
    expect(judgeStiffDepth(75, 'pro')).toEqual({ deepEnough: true, near: false });
    // nome antigo salvo = nível novo
    expect(judgeStiffDepth(50, 'mobilidade_reduzida')).toEqual({ deepEnough: true, near: false });
  });

  it('mesma rep em níveis diferentes', () => {
    const bottom = s(100, 160, 60);
    expect(run(new StiffRepCounter('iniciante'), bottom)?.complete).toBe(true);
    expect(run(new StiffRepCounter('intermediario'), bottom)?.complete).toBe(true);
    expect(run(new StiffRepCounter('avancado'), bottom)?.errors).toEqual(['depth_near']);
    expect(run(new StiffRepCounter('pro'), bottom)?.errors).toEqual(['depth']);
  });

  it('ângulos medidos dos pontos: quadril = ombro-quadril-joelho, tronco vs vertical', () => {
    const m = stiffMetrics(pose({ knee: 160, lean: 60 }), 1, 1, 'left');
    expect(m.kneeAngle).toBeCloseTo(160, 0);
    expect(m.trunkLean).toBeCloseTo(60, 0);
    expect(m.hipAngle).toBeLessThan(150);
    const up = stiffMetrics(pose({ knee: 178, lean: 0 }), 1, 1, 'left');
    expect(up.hipAngle).toBeGreaterThan(165);
  });

  it('pelos pontos: rep completa contada do começo ao fim', () => {
    const c = new StiffRepCounter();
    const seq: [number, number, number][] = [[178, 0, 0], [175, 10, 200], [170, 30, 800], [165, 50, 1600], [162, 62, 2600], [170, 30, 3400], [178, 2, 4000]];
    let last = null;
    for (const [k, l, t] of seq) last = c.update(pose({ knee: k, lean: l }), 1, 1, 'left', t) ?? last;
    expect(last).toMatchObject({ complete: true, errors: [] });
  });
});

// ---------------------------------------------------------------------------
describe('Correção ao vivo — búlgaro / afundo', () => {
  const b = (frontKneeAngle: number, trunkAngle = 15): LungeMetrics => ({ frontKneeAngle, trunkAngle });
  const run = (c: LungeRepCounter, bottom: LungeMetrics, descentMs = 2000) => {
    c.push(b(175), 0);
    c.push(b(158, 15), 100);
    c.push(b(130, bottom.trunkAngle), 100 + descentMs / 2);
    c.push(bottom, 100 + descentMs);
    c.push(b(140), 200 + descentMs);
    return c.push(b(170), 300 + descentMs);
  };

  it('limites: começa < 150°, termina > 160°, tronco 45°, descida 1,5 s', () => {
    expect(LUNGE_REP_START_KNEE_ANGLE).toBe(150);
    expect(LUNGE_REP_END_KNEE_ANGLE).toBe(160);
    expect(LUNGE_MAX_TRUNK_ANGLE).toBe(45);
    expect(LUNGE_MIN_DESCENT_SECONDS).toBe(1.5);
    expect(LUNGE_MAX_BOTTOM_KNEE).toEqual({ iniciante: 115, intermediario: 105, avancado: 95, pro: 90 });
  });

  it('rep completa e só termina acima de 160°', () => {
    const c = new LungeRepCounter('intermediario', 'left');
    c.push(b(175), 0);
    c.push(b(149), 100);
    c.push(b(95), 2000);
    expect(c.push(b(160), 2100)).toBeNull();
    expect(c.push(b(161), 2200)).toMatchObject({ complete: true, errors: [], leg: 'left', minKneeAngle: 95 });
  });

  it('pouco fundo = "Desce mais"; faltou até 10° = "Desce um pouco mais"', () => {
    expect(run(new LungeRepCounter('intermediario'), b(120))).toMatchObject({ complete: false, errors: ['depth'] });
    expect(run(new LungeRepCounter('intermediario'), b(112))).toMatchObject({ complete: false, errors: ['depth_near'] });
    expect(LUNGE_MESSAGES.depth).toBe('Desce mais');
    expect(LUNGE_MESSAGES.depth_near).toBe('Desce um pouco mais');
  });

  it('cada nível: Iniciante ≤ 115°, Intermediário ≤ 105°, Avançado ≤ 95°, Pro ≤ 90°', () => {
    expect(judgeLungeDepth(115, 'iniciante').deepEnough).toBe(true);
    expect(judgeLungeDepth(116, 'iniciante')).toEqual({ deepEnough: false, near: true });
    expect(judgeLungeDepth(105, 'intermediario').deepEnough).toBe(true);
    expect(judgeLungeDepth(95, 'avancado').deepEnough).toBe(true);
    expect(judgeLungeDepth(96, 'avancado')).toEqual({ deepEnough: false, near: true });
    expect(judgeLungeDepth(90, 'pro').deepEnough).toBe(true);
    expect(judgeLungeDepth(100, 'pro')).toEqual({ deepEnough: false, near: true });
    expect(judgeLungeDepth(101, 'pro')).toEqual({ deepEnough: false, near: false });
  });

  it('tronco > 45° no fundo = "Peito pra cima" (rep conta)', () => {
    expect(run(new LungeRepCounter(), b(95, 50))).toMatchObject({ complete: true, errors: ['trunk'] });
    expect(run(new LungeRepCounter(), b(95, 45))?.errors).toEqual([]);
    expect(LUNGE_MESSAGES.trunk).toBe('Peito pra cima');
  });

  it('descida em menos de 1,5 s = "Controla a descida"', () => {
    expect(run(new LungeRepCounter(), b(95), 1000)).toMatchObject({ complete: true, errors: ['descent'], fastDescent: true });
    expect(run(new LungeRepCounter(), b(95), 1500)?.errors).toEqual([]);
  });

  it('mede a perna da frente escolhida', () => {
    // esquerda dobrada a 95°, direita quase reta
    const lms = pose({ knee: 95, lean: 10 }, { knee: 170, lean: 10 });
    expect(lungeMetrics(lms, 1, 1, 'left').frontKneeAngle).toBeCloseTo(95, 0);
    expect(lungeMetrics(lms, 1, 1, 'right').frontKneeAngle).toBeCloseTo(170, 0);
    const c = new LungeRepCounter('intermediario', 'right');
    expect(c.measureSide()).toBe('right');
    c.update(pose({ knee: 95 }, { knee: 175 }), 1, 1, 'left', 0);
    c.update(pose({ knee: 95 }, { knee: 140 }), 1, 1, 'left', 500);
    c.update(pose({ knee: 175 }, { knee: 100 }), 1, 1, 'left', 2000);
    const rep = c.update(pose({ knee: 95 }, { knee: 170 }), 1, 1, 'left', 2500);
    expect(rep).toMatchObject({ leg: 'right', complete: true });
    expect(rep && 'minKneeAngle' in rep ? rep.minKneeAngle : null).toBe(100);
  });

  it('trocar perna: cancela a rep em andamento, espera o topo e as próximas reps são da outra perna', () => {
    const c = new LungeRepCounter('intermediario', 'left');
    run(c, b(95));
    run(c, b(120));
    c.push(b(175), 9000);
    c.push(b(120), 9500); // no meio da rep
    c.setFrontLeg('right');
    expect(c.frontLeg).toBe('right');
    expect(c.inRep).toBe(false);
    expect(c.push(b(170), 9600)).toBeNull(); // só volta a contar depois do topo
    run(c, b(100));
    expect(c.reps.map((r) => [r.leg, r.complete])).toEqual([['left', true], ['left', false], ['right', true]]);
    const legs = summarizeByLeg(c.reps);
    expect(legs).toEqual([
      { leg: 'left', total: 2, complete: 1, avgDescentSeconds: 2 },
      { leg: 'right', total: 1, complete: 1, avgDescentSeconds: 2 },
    ]);
    // "Salvar na série" usa o total de completas das duas pernas
    expect(summarizeLiveReps(c.reps, LUNGE_MESSAGES).complete).toBe(2);
  });

  it('fim automático só depois de reps nas duas pernas', () => {
    const rule = getExerciseRule('bulgaro');
    const c = new LungeRepCounter('intermediario', 'left');
    run(c, b(95));
    expect(autoFinishRepCount(rule, c.reps)).toBe(0);
    c.setFrontLeg('right');
    run(c, b(95));
    expect(autoFinishRepCount(rule, c.reps)).toBe(2);
    expect(autoFinishRepCount(getExerciseRule('squat'), c.reps)).toBe(2);
  });

  it('posicionamento: búlgaro pede o banco aparecendo', () => {
    const rule = getExerciseRule('bulgaro');
    expect(rule.needsFrontLeg).toBe(true);
    expect(rule.instruction('BÚLGARO')).toBe(BULGARO_INSTRUCTION);
    expect(rule.instruction('BÚLGARO')).toBe('Coloca o celular no chão, de lado, com o banco aparecendo');
    expect(rule.silhouette('BÚLGARO')).toBe('split_bench');
    expect(rule.silhouette('AFUNDO HALTERES')).toBe('split');
    expect(rule.instruction('AFUNDO HALTERES')).not.toContain('banco');
  });
});
