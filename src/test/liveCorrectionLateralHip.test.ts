import { describe, it, expect } from 'vitest';
import {
  matchExerciseRule, getExerciseRule, ALL_ERROR_MESSAGES, isWrongView, wrongViewMessage, FACE_CAMERA_MESSAGE,
  speakableErrors, markSpokenOnce,
  LateralRaiseCounter, lateralMetrics, lateralRaiseRule, LATERAL_MESSAGES, LATERAL_INSTRUCTION, ARM_LM,
  HipThrustCounter, hipThrustRule, HIP_THRUST_MESSAGES, HIP_THRUST_INSTRUCTION, HIP_THRUST_SPEAK_ONCE,
  type LateralMetrics, type HipThrustMetrics,
} from '@/lib/liveCorrection/exercises';
import { LM, StillnessDetector, isStillMovement, type Landmark } from '@/lib/liveCorrection/squatAnalysis';

// ---------------------------------------------------------------------------
describe('Correção ao vivo — nomes da etapa 2', () => {
  it.each([
    ['ELEVAÇÃO LATERAL', 'lateral_raise'],
    ['ELEVACAO LATERAL', 'lateral_raise'],
    ['Elevação lateral com halteres', 'lateral_raise'],
    ['ELEVAÇÃO PÉLVICA', 'hip_thrust'],
    ['ELEVACAO PELVICA', 'hip_thrust'],
    ['HIP THRUST', 'hip_thrust'],
    ['Hip thrust na máquina', 'hip_thrust'],
  ])('"%s" usa a regra %s', (name, id) => {
    expect(matchExerciseRule(name)?.id).toBe(id);
  });

  it('as regras já existentes continuam casando igual', () => {
    expect(matchExerciseRule('AGACHAMENTO SMITH')?.id).toBe('squat');
    expect(matchExerciseRule('STIFF ROMENO')?.id).toBe('stiff');
    expect(matchExerciseRule('BÚLGARO')?.id).toBe('bulgaro');
    expect(matchExerciseRule('ELEVAÇÃO FRONTAL')).toBeNull();
  });

  it('mensagens das novas regras não sobrescrevem as antigas', () => {
    expect(ALL_ERROR_MESSAGES.depth).toBe('Desce mais');
    expect(ALL_ERROR_MESSAGES.raise_low).toBe('Sobe até a linha do ombro');
    expect(ALL_ERROR_MESSAGES.hip_low).toBe('Sobe o quadril até alinhar');
  });
});

// ---------------------------------------------------------------------------
// Elevação lateral
// ---------------------------------------------------------------------------
const lat = (l: number, r: number = l, lean = 0, ear: number | null = 0.6): LateralMetrics => ({
  leftAbduction: l, rightAbduction: r, trunkLean: lean, earRatio: ear,
});

/** Rep: repouso → sobe até `peak` → desce. Cada frame = 100 ms (descida de 2 s por padrão). */
function lateralRep(c: LateralRaiseCounter, t0: number, peak: number, opts: { peakR?: number; leanAt?: number; earAt?: number | null; downFrames?: number } = {}) {
  const pr = opts.peakR ?? peak;
  const down = opts.downFrames ?? 20;
  let t = t0;
  for (let k = 0; k < 5; k++) { c.push(lat(10, 10), t); t += 100; }
  const ups = [30, 45, 60, 70];
  for (const a of ups) { if (a < peak) { c.push(lat(a, Math.min(a, pr)), t); t += 100; } }
  c.push(lat(peak, pr, opts.leanAt ?? 0, opts.earAt === undefined ? 0.6 : opts.earAt), t); t += 100;
  let rep = null;
  for (let k = 1; k <= down && !rep; k++) {
    const f = k / down;
    const a = peak - (peak - 15) * f, b = pr - (pr - 15) * f;
    rep = c.push(lat(a, b), t);
    t += 100;
  }
  if (!rep) rep = c.push(lat(10, 10), t);
  return { rep, t };
}

describe('Elevação lateral — contagem e amplitude', () => {
  it('vista de frente obrigatória, instrução e pontos exigidos', () => {
    expect(lateralRaiseRule.view).toBe('front');
    expect(lateralRaiseRule.instruction()).toBe(LATERAL_INSTRUCTION);
    expect(LATERAL_INSTRUCTION).toBe('Coloca o celular no chão ou apoiado, de frente pra você, com o corpo da cintura pra cima e os braços aparecendo');
    // De lado numa regra de frente = vista errada, com o aviso pedido
    expect(isWrongView('front', false, true)).toBe(true);
    expect(isWrongView('front', true, true)).toBe(false);
    expect(wrongViewMessage('front')).toBe('Fica de frente pra câmera');
    expect(FACE_CAMERA_MESSAGE).toBe('Fica de frente pra câmera');
    // As regras de lado continuam iguais
    expect(isWrongView('side', true, true)).toBe(true);
    expect(wrongViewMessage('side')).toBe('Vira de lado');
  });

  it('não exige tornozelo: ombros, cotovelos, punhos e quadril bastam', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    lms[LM.leftAnkle] = { x: 0.5, y: 1.4, visibility: 0.1 };
    lms[LM.rightAnkle] = { x: 0.5, y: 1.4, visibility: 0.1 };
    expect(lateralRaiseRule.isBodyVisible!(lms, 'left')).toBe(true);
    lms[ARM_LM.rightWrist] = { x: 1.2, y: 0.5, visibility: 0.9 };
    expect(lateralRaiseRule.isBodyVisible!(lms, 'left')).toBe(false);
  });

  it('abdução: braço junto ao corpo ≈ 0°, na linha do ombro ≈ 90°', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    lms[LM.leftShoulder] = { x: 0.6, y: 0.3 }; lms[LM.rightShoulder] = { x: 0.4, y: 0.3 };
    lms[LM.leftHip] = { x: 0.58, y: 0.7 }; lms[LM.rightHip] = { x: 0.42, y: 0.7 };
    lms[ARM_LM.leftWrist] = { x: 0.9, y: 0.3 };   // horizontal
    lms[ARM_LM.rightWrist] = { x: 0.4, y: 0.65 };  // para baixo
    const m = lateralMetrics(lms, 1, 1);
    expect(Math.round(m.leftAbduction)).toBeGreaterThanOrEqual(85);
    expect(Math.round(m.leftAbduction)).toBeLessThanOrEqual(95);
    expect(m.rightAbduction).toBeLessThan(10);
  });

  it('rep começa acima de 40° e termina abaixo de 25°', () => {
    const c = new LateralRaiseCounter();
    c.push(lat(10), 0);
    expect(c.push(lat(39), 100)).toBeNull();
    expect(c.inRep).toBe(false);
    c.push(lat(41), 200);
    expect(c.inRep).toBe(true);
    expect(c.push(lat(85), 300)).toBeNull();
    expect(c.push(lat(26), 2400)).toBeNull();
    const rep = c.push(lat(24), 2500);
    expect(rep?.complete).toBe(true);
    expect(c.atTop).toBe(true);
  });

  it('pico ≥ 80° = completa e sem avisos', () => {
    const c = new LateralRaiseCounter();
    const { rep } = lateralRep(c, 0, 85);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual([]);
  });

  it('faltou mais de 10° = "Sobe até a linha do ombro" (incompleta)', () => {
    const { rep } = lateralRep(new LateralRaiseCounter(), 0, 65);
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toContain('raise_low');
    expect(LATERAL_MESSAGES.raise_low).toBe('Sobe até a linha do ombro');
  });

  it('faltou até 10° = "Sobe um pouco mais" (incompleta)', () => {
    const { rep } = lateralRep(new LateralRaiseCounter(), 0, 72);
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toContain('raise_near');
    expect(LATERAL_MESSAGES.raise_near).toBe('Sobe um pouco mais');
  });

  it('acima de 105° = "Não precisa passar do ombro" e a rep conta', () => {
    const { rep } = lateralRep(new LateralRaiseCounter(), 0, 110);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toContain('raise_high');
    expect(LATERAL_MESSAGES.raise_high).toBe('Não precisa passar do ombro');
  });

  it('tronco variando mais de 10° = "Sem balanço" (aviso)', () => {
    const ok = lateralRep(new LateralRaiseCounter(), 0, 85, { leanAt: 9 }).rep;
    expect(ok?.errors).not.toContain('swing');
    const bad = lateralRep(new LateralRaiseCounter(), 0, 85, { leanAt: 12 }).rep;
    expect(bad?.complete).toBe(true);
    expect(bad?.errors).toContain('swing');
    expect(LATERAL_MESSAGES.swing).toBe('Sem balanço');
  });

  it('ombro→orelha encurtando mais de 25% do início da série = "Ombro longe da orelha"', () => {
    const ok = lateralRep(new LateralRaiseCounter(), 0, 85, { earAt: 0.6 * 0.8 }).rep;
    expect(ok?.errors).not.toContain('shrug');
    const c = new LateralRaiseCounter();
    const bad = lateralRep(c, 0, 85, { earAt: 0.6 * 0.7 }).rep;
    expect(c.earBaseline).toBeCloseTo(0.6);
    expect(bad?.complete).toBe(true);
    expect(bad?.errors).toContain('shrug');
    expect(LATERAL_MESSAGES.shrug).toBe('Ombro longe da orelha');
  });

  it('diferença de pico > 15° entre os braços = "Sobe os dois iguais"', () => {
    const ok = lateralRep(new LateralRaiseCounter(), 0, 90, { peakR: 76 }).rep;
    expect(ok?.errors).not.toContain('asymmetry');
    const bad = lateralRep(new LateralRaiseCounter(), 0, 90, { peakR: 74 }).rep;
    expect(bad?.errors).toContain('asymmetry');
    expect(LATERAL_MESSAGES.asymmetry).toBe('Sobe os dois iguais');
  });

  it('descida em menos de 1,5 s = "Controla a descida"', () => {
    const slow = lateralRep(new LateralRaiseCounter(), 0, 85, { downFrames: 18 }).rep;
    expect(slow?.descentSeconds).toBeGreaterThanOrEqual(1.5);
    expect(slow?.errors).not.toContain('descent');
    const fast = lateralRep(new LateralRaiseCounter(), 0, 85, { downFrames: 8 }).rep;
    expect(fast?.descentSeconds).toBeLessThan(1.5);
    expect(fast?.fastDescent).toBe(true);
    expect(fast?.errors).toContain('descent');
  });

  it('depois de pausar só volta a contar com os braços embaixo', () => {
    const c = new LateralRaiseCounter();
    c.waitForStanding();
    c.push(lat(60), 0);
    c.push(lat(85), 100);
    expect(c.push(lat(20), 2000)).toBeNull();
    expect(c.reps).toHaveLength(0);
    const { rep } = lateralRep(c, 3000, 85);
    expect(rep?.index).toBe(1);
  });

  it('"parado" no posicionamento não depende do tornozelo', () => {
    const still = new StillnessDetector(undefined, lateralRaiseRule.stillPoints, lateralRaiseRule.stillScale);
    const base: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    base[LM.leftShoulder] = { x: 0.6, y: 0.3 }; base[LM.rightShoulder] = { x: 0.4, y: 0.3 };
    base[LM.leftHip] = { x: 0.58, y: 0.7 }; base[LM.rightHip] = { x: 0.42, y: 0.7 };
    let move: number | null = null;
    for (let t = 0; t <= 600; t += 50) {
      const lms = base.map((p) => ({ ...p }));
      lms[LM.leftAnkle] = { x: Math.random(), y: 1.3, visibility: 0.1 }; // tornozelo fora do quadro, pulando
      move = still.push(lms, t, 1, 1, 'left');
    }
    expect(isStillMovement(move)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Elevação pélvica
// ---------------------------------------------------------------------------
const hip = (h: number, knee = 90): HipThrustMetrics => ({ hipAngle: h, kneeAngle: knee });

/**
 * Rep começando no topo: desce (`downFrames` × 100 ms), sobe até `peak` e segura `holdMs`.
 * Devolve a rep fechada (no topo depois de 1 s, ou quando desce de novo).
 */
function hipRep(c: HipThrustCounter, t0: number, peak: number, opts: { holdMs?: number; knee?: number; downFrames?: number } = {}) {
  const hold = opts.holdMs ?? 1200;
  const down = opts.downFrames ?? 20;
  let t = t0;
  let rep = null;
  for (let k = 0; k <= down; k++) { rep = c.push(hip(170 - (170 - 120) * (k / down)), t) ?? rep; t += 100; }
  for (const a of [130, 145, 160]) { rep = c.push(hip(a), t) ?? rep; t += 100; }
  for (let held = 0; held <= hold; held += 100) { rep = c.push(hip(peak, opts.knee ?? 90), t) ?? rep; t += 100; }
  if (!c.reps.length || c.inRep) rep = c.push(hip(160), t) ?? rep;
  return { rep: rep ?? c.reps[c.reps.length - 1] ?? null, t };
}

describe('Elevação pélvica — contagem, topo e avisos', () => {
  it('instrução, vista lateral e posicionamento sem exigir a pessoa em pé', () => {
    expect(hipThrustRule.view).toBe('side');
    expect(hipThrustRule.instruction()).toBe(HIP_THRUST_INSTRUCTION);
    expect(HIP_THRUST_INSTRUCTION).toBe('Celular no chão, de lado, na altura do banco, com o corpo inteiro aparecendo');
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    lms[LM.nose] = { x: 0.1, y: 0.5, visibility: 0.1 }; // cabeça não aparece
    expect(hipThrustRule.isBodyVisible!(lms, 'left')).toBe(true);
    lms[LM.leftAnkle] = { x: 0.5, y: 1.2, visibility: 0.9 };
    expect(hipThrustRule.isBodyVisible!(lms, 'left')).toBe(false);
  });

  it('rep começa abaixo de 150° e chega no topo acima de 165°', () => {
    const c = new HipThrustCounter();
    c.push(hip(170), 0);
    c.push(hip(151), 100);
    expect(c.inRep).toBe(false);
    c.push(hip(149), 200);
    expect(c.inRep).toBe(true);
    c.push(hip(120), 300);
    expect(c.push(hip(166), 400)).toBeNull();
    expect(c.reps).toHaveLength(0);
    const rep = c.push(hip(160), 1000);
    expect(rep).not.toBeNull();
    expect(c.reps).toHaveLength(1);
  });

  it('começar embaixo conta a primeira subida (não exige começar no topo)', () => {
    const c = new HipThrustCounter();
    c.waitForStanding();
    c.push(hip(120), 0);
    c.push(hip(150), 300);
    c.push(hip(172), 600);
    const rep = c.push(hip(172), 1700);
    expect(rep?.complete).toBe(true);
    expect(rep?.descentSeconds).toBeNull();
  });

  it('pico ≥ 170° segurando 1 s = completa e sem avisos', () => {
    const { rep } = hipRep(new HipThrustCounter(), 0, 172);
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toEqual([]);
  });

  it('faltou até 5° = "Sobe um pouco mais" (incompleta)', () => {
    const { rep } = hipRep(new HipThrustCounter(), 0, 167);
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toContain('hip_near');
    expect(HIP_THRUST_MESSAGES.hip_near).toBe('Sobe um pouco mais');
  });

  it('subiu sem chegar no topo e desceu = "Sobe o quadril até alinhar" (incompleta)', () => {
    const c = new HipThrustCounter();
    let t = 0;
    for (const a of [170, 160, 145, 130, 120, 130, 145, 155, 158, 150, 140, 130]) { c.push(hip(a), t); t += 200; }
    expect(c.reps).toHaveLength(1);
    expect(c.reps[0].complete).toBe(false);
    expect(c.reps[0].errors).toContain('hip_low');
    expect(HIP_THRUST_MESSAGES.hip_low).toBe('Sobe o quadril até alinhar');
    // continua contando a próxima normalmente
    for (const a of [125, 150, 172]) { c.push(hip(a), t); t += 200; }
    c.push(hip(172), t + 1000);
    expect(c.reps).toHaveLength(2);
    expect(c.reps[1].complete).toBe(true);
  });

  it('menos de 0,5 s acima de 165° = "Segura 1 segundo em cima" (aviso)', () => {
    const { rep } = hipRep(new HipThrustCounter(), 0, 172, { holdMs: 200 });
    expect(rep?.complete).toBe(true);
    expect(rep?.errors).toContain('hold');
    expect(rep?.holdSeconds).toBeLessThan(0.5);
    const ok = hipRep(new HipThrustCounter(), 0, 172, { holdMs: 600 }).rep;
    expect(ok?.errors).not.toContain('hold');
    expect(HIP_THRUST_MESSAGES.hold).toBe('Segura 1 segundo em cima');
  });

  it('joelho no topo > 115° = "Pés mais perto do banco"; < 70° = "Pés mais longe"', () => {
    const far = hipRep(new HipThrustCounter(), 0, 172, { knee: 120 }).rep;
    expect(far?.complete).toBe(true);
    expect(far?.errors).toContain('feet_closer');
    const near = hipRep(new HipThrustCounter(), 0, 172, { knee: 65 }).rep;
    expect(near?.errors).toContain('feet_farther');
    const ok = hipRep(new HipThrustCounter(), 0, 172, { knee: 90 }).rep;
    expect(ok?.errors).not.toContain('feet_closer');
    expect(ok?.errors).not.toContain('feet_farther');
    expect(HIP_THRUST_MESSAGES.feet_closer).toBe('Pés mais perto do banco');
    expect(HIP_THRUST_MESSAGES.feet_farther).toBe('Pés mais longe');
  });

  it('avisos de pés falam no máximo 1x por série (continuam no resumo)', () => {
    expect(hipThrustRule.speakOncePerSeries).toEqual(HIP_THRUST_SPEAK_ONCE);
    const spoken = new Set<string>();
    const first = speakableErrors(['feet_closer', 'hold'], HIP_THRUST_SPEAK_ONCE, spoken);
    expect(first).toEqual(['feet_closer', 'hold']);
    markSpokenOnce(first, HIP_THRUST_SPEAK_ONCE, spoken);
    expect(speakableErrors(['feet_closer', 'hold'], HIP_THRUST_SPEAK_ONCE, spoken)).toEqual(['hold']);
    expect(speakableErrors(['feet_farther'], HIP_THRUST_SPEAK_ONCE, spoken)).toEqual(['feet_farther']);
    // Outras regras não têm limite
    expect(speakableErrors(['depth'], undefined, spoken)).toEqual(['depth']);
  });

  it('descida em menos de 1,5 s = "Controla a descida"', () => {
    const slow = hipRep(new HipThrustCounter(), 0, 172, { downFrames: 20 }).rep;
    expect(slow?.descentSeconds).toBeGreaterThanOrEqual(1.5);
    expect(slow?.errors).not.toContain('descent');
    const fast = hipRep(new HipThrustCounter(), 0, 172, { downFrames: 8 }).rep;
    expect(fast?.descentSeconds).toBeLessThan(1.5);
    expect(fast?.errors).toContain('descent');
    expect(HIP_THRUST_MESSAGES.descent).toBe('Controla a descida');
  });

  it('finalizar segurando em cima ainda conta a rep', () => {
    const c = new HipThrustCounter();
    c.push(hip(170), 0);
    c.push(hip(120), 1500);
    c.push(hip(172), 2000);
    c.push(hip(172), 2600);
    expect(c.reps).toHaveLength(0);
    const rep = c.flush();
    expect(rep?.complete).toBe(true);
    expect(rep?.holdSeconds).toBeCloseTo(0.6);
    expect(c.flush()).toBeNull();
  });

  it('parado (topo ou embaixo) libera o fim automático', () => {
    const c = new HipThrustCounter();
    hipRep(c, 0, 172);
    expect(c.resting).toBe(true); // no topo depois de fechar
    const c2 = new HipThrustCounter();
    c2.push(hip(120), 0);
    expect(c2.resting).toBe(false);
    c2.push(hip(122), 600);
    c2.push(hip(121), 1100);
    expect(c2.resting).toBe(true);
  });
});

describe('Regras da etapa 1 continuam sem os novos campos', () => {
  it('agachamento, stiff e búlgaro mantêm corpo inteiro e fala normal', () => {
    for (const id of ['squat', 'stiff', 'bulgaro'] as const) {
      const r = getExerciseRule(id);
      expect(r.isBodyVisible).toBeUndefined();
      expect(r.speakOncePerSeries).toBeUndefined();
      expect(r.createCounter().resting).toBeUndefined();
    }
  });
});
