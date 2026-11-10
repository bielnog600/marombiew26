import { describe, it, expect } from 'vitest';
import {
  REP_START_KNEE_ANGLE, REP_END_KNEE_ANGLE, MAX_TRUNK_ANGLE, MIN_DESCENT_SECONDS,
  SquatRepCounter, repNumberWord, planRepSpeech, errorsToJson, LandmarkSmoother, angleAt, trunkAngle, summarizeReps,
  isSquatExercise, canSpeak, isFullBodyVisible, pickSide, LM, type FrameMetrics, type Landmark,
} from '@/lib/liveCorrection/squatAnalysis';

const f = (kneeAngle: number, trunk = 20, hipDepth = 0.1): FrameMetrics => ({ side: 'left', kneeAngle, trunkAngle: trunk, hipDepth });

const runRep = (c: SquatRepCounter, bottom: FrameMetrics) => {
  c.update(f(175));
  c.update(f(140, bottom.trunkAngle, -0.5));
  c.update(bottom);
  c.update(f(155, 20, -0.5));
  return c.update(f(170, 10, -1));
};

describe('Correção ao vivo — agachamento', () => {
  it('limites padrão: 150°, 165° e 50°', () => {
    expect(REP_START_KNEE_ANGLE).toBe(150);
    expect(REP_END_KNEE_ANGLE).toBe(165);
    expect(MAX_TRUNK_ANGLE).toBe(50);
  });

  it('rep começa abaixo de 150° e só termina acima de 165°', () => {
    const c = new SquatRepCounter();
    expect(c.update(f(151))).toBeNull();
    expect(c.inRep).toBe(false);
    c.update(f(149));
    expect(c.inRep).toBe(true);
    c.update(f(90));
    expect(c.update(f(165))).toBeNull();
    const rep = c.update(f(166));
    expect(rep?.complete).toBe(true);
    expect(c.reps).toHaveLength(1);
  });

  it('quadril acima do joelho no fundo = incompleta e "Desce mais"', () => {
    const rep = runRep(new SquatRepCounter(), f(110, 20, -0.3));
    expect(rep?.complete).toBe(false);
    expect(rep?.errors).toEqual(['depth']);
  });

  it('tronco acima de 50° no fundo = "Peito pra cima"; rep com profundidade continua completa', () => {
    const rep = runRep(new SquatRepCounter(), f(80, 55, 0.1));
    expect(rep?.errors).toEqual(['trunk']);
    expect(rep?.complete).toBe(true);
  });

  it('tronco de 50° exatos não gera aviso', () => {
    const rep = runRep(new SquatRepCounter(), f(80, 50, 0.1));
    expect(rep?.errors).toEqual([]);
  });

  it('resumo conta completas, incompletas e erros mais comuns', () => {
    const c = new SquatRepCounter();
    runRep(c, f(80, 20, 0.1));
    runRep(c, f(110, 60, -0.3));
    runRep(c, f(110, 20, -0.3));
    const s = summarizeReps(c.reps);
    expect(s).toMatchObject({ total: 3, complete: 1, incomplete: 2 });
    expect(s.errors.map((e) => [e.label, e.count])).toEqual([['Desce mais', 2], ['Peito pra cima', 1]]);
  });

  it('ângulos: joelho reto = 180°, tronco em pé = 0°, deitado = 90°', () => {
    expect(angleAt({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 })).toBeCloseTo(180);
    expect(angleAt({ x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 2 })).toBeCloseTo(90);
    expect(trunkAngle({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0);
    expect(trunkAngle({ x: 1, y: 1 }, { x: 0, y: 1 })).toBeCloseTo(90);
  });

  it('suaviza com a média dos últimos 5 frames', () => {
    const s = new LandmarkSmoother();
    let out: Landmark[] = [];
    for (let i = 1; i <= 6; i++) out = s.push([{ x: i, y: 0, visibility: 1 }]);
    expect(out[0].x).toBeCloseTo((2 + 3 + 4 + 5 + 6) / 5);
  });

  it('corpo inteiro exige cabeça, ombro, quadril, joelho e tornozelo visíveis no quadro', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    expect(isFullBodyVisible(lms, 'left')).toBe(true);
    lms[LM.leftAnkle] = { x: 0.5, y: 1.2, visibility: 0.9 };
    expect(isFullBodyVisible(lms, 'left')).toBe(false);
    lms[LM.rightShoulder].visibility = 0.1;
    expect(pickSide(lms)).toBe('left');
  });

  it('botão só em exercícios com "agachamento", sem diferenciar acento', () => {
    expect(isSquatExercise('AGACHAMENTO LIVRE')).toBe(true);
    expect(isSquatExercise('Agachamento Smith')).toBe(true);
    expect(isSquatExercise('LEG PRESS 45')).toBe(false);
    expect(isSquatExercise(null)).toBe(false);
  });

  it('voz: no máximo uma fala a cada 3 segundos', () => {
    expect(canSpeak(null, 0)).toBe(true);
    expect(canSpeak(1000, 3999)).toBe(false);
    expect(canSpeak(1000, 4000)).toBe(true);
  });

  it('limite da descida: 1,5 s', () => {
    expect(MIN_DESCENT_SECONDS).toBe(1.5);
  });

  /** Rep com tempo: em pé em t=0, passa de 165° em `start`, fundo em `bottom`. */
  const timedRep = (c: SquatRepCounter, start: number, bottom: number, hipDepth = 0.1) => {
    c.update(f(175), 0);
    c.update(f(160), start);
    c.update(f(140, 20, -0.5), (start + bottom) / 2);
    c.update(f(80, 20, hipDepth), bottom);
    c.update(f(120, 20, -0.5), bottom + 400);
    return c.update(f(170), bottom + 800);
  };

  it('descida medida de 165° até o ponto mais baixo; abaixo de 1,5 s = "Controla a descida" sem invalidar a rep', () => {
    const rep = timedRep(new SquatRepCounter(), 1000, 2200);
    expect(rep?.descentSeconds).toBe(1.2);
    expect(rep?.fastDescent).toBe(true);
    expect(rep?.errors).toEqual(['descent']);
    expect(rep?.complete).toBe(true);
  });

  it('descida de 1,5 s ou mais não gera aviso', () => {
    const rep = timedRep(new SquatRepCounter(), 1000, 2500);
    expect(rep?.descentSeconds).toBe(1.5);
    expect(rep?.fastDescent).toBe(false);
    expect(rep?.errors).toEqual([]);
  });

  it('resumo: tempo médio de descida e reps rápidas demais', () => {
    const c = new SquatRepCounter();
    timedRep(c, 1000, 2000); // 1,0 s
    timedRep(c, 1000, 3000); // 2,0 s
    timedRep(c, 1000, 4000); // 3,0 s
    const s = summarizeReps(c.reps);
    expect(s.avgDescentSeconds).toBe(2);
    expect(s.fastDescentReps).toBe(1);
    expect(errorsToJson(s)).toEqual({ descent: 1 });
  });

  it('número por extenso: um, dois, três… vinte e um, cem', () => {
    expect([1, 2, 3, 10, 16, 21, 100, 101].map(repNumberWord)).toEqual(
      ['um', 'dois', 'três', 'dez', 'dezesseis', 'vinte e um', 'cem', 'cento e um'],
    );
  });

  it('voz: rep completa fala o número mesmo dentro dos 3 s; número antes da correção', () => {
    const rep = timedRep(new SquatRepCounter(), 1000, 2000);
    expect(planRepSpeech(rep!, 4, 9000, 10000)).toEqual({ texts: ['quatro'], correctionSpoken: false });
    expect(planRepSpeech(rep!, 4, 5000, 10000)).toEqual({ texts: ['quatro', 'Controla a descida'], correctionSpoken: true });
  });

  it('voz: rep incompleta não fala número, só a correção', () => {
    const rep = runRep(new SquatRepCounter(), f(110, 20, -0.3));
    expect(planRepSpeech(rep!, 0, null, 10000)).toEqual({ texts: ['Desce mais'], correctionSpoken: true });
  });
});
