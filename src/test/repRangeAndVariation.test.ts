import { describe, it, expect } from 'vitest';
import {
  classifyExerciseFunction,
  resolveRepRange,
  validateAndNormalizeRepRanges,
  assessSessionProfileIdentity,
} from '../../supabase/functions/_shared/repRangePolicy';
import { evaluateVariationCandidate } from '../../supabase/functions/_shared/variationSelection';

const ex = (exercise: string, reps: string) => ({ exercise, series: '3', series2: '-', reps, rir: '2', variation: null });

const tensionDay = () => ({
  day: 'A',
  exercises: [
    ex('SUPINO RETO BARRA', '5-8'),
    ex('PUXADA ALTA PRONADA', '5-8'),
    ex('PECK DECK', '5-8'),
    ex('TRICEPS CORDA', '5-8'),
    ex('FLEXAO DE PUNHO', '5-8'),
    ex('ABDOMINAL SUPRA', '5-8'),
    ex('PRANCHA', '8'),
  ],
});

const volumeDay = () => ({
  day: 'B',
  exercises: [
    ex('LEG PRESS 45 ART', '12-18'),
    ex('CADEIRA EXTENSORA', '12-18'),
    ex('MESA FLEXORA', '12-18'),
    ex('KICK BACK NA POLIA', '12-18'),
    ex('CADEIRA ABDUTORA', '12-18'),
    ex('GEMEOS NO LEG PRESS', '12-18'),
  ],
});

describe('classificação funcional para reps', () => {
  it('separa compostos, isoladores, pequenos grupos, core e panturrilha', () => {
    expect(classifyExerciseFunction('SUPINO RETO BARRA')).toBe('COMPOUND_PRIMARY');
    expect(classifyExerciseFunction('PUXADA ALTA PRONADA')).toBe('COMPOUND_PRIMARY');
    expect(classifyExerciseFunction('PECK DECK')).toBe('ISOLATION_LARGE');
    expect(classifyExerciseFunction('TRICEPS CORDA')).toBe('ISOLATION_SMALL');
    expect(classifyExerciseFunction('FLEXAO DE PUNHO')).toBe('ISOLATION_SMALL');
    expect(classifyExerciseFunction('GEMEOS NO LEG PRESS')).toBe('CALF');
    expect(classifyExerciseFunction('ABDOMINAL SUPRA')).toBe('CORE_DYNAMIC');
    expect(classifyExerciseFunction('PRANCHA')).toBe('CORE_ISOMETRIC');
    expect(classifyExerciseFunction('MOBILIDADE DE QUADRIL')).toBe('MOBILITY');
  });

  it('composto principal pode ficar 5-8 no dia de tensão', () => {
    expect(resolveRepRange('SUPINO RETO BARRA', 'tensao').range.text).toBe('5-8');
  });

  it('isolador e pequeno grupo têm faixas próprias no mesmo dia', () => {
    expect(resolveRepRange('PECK DECK', 'tensao').range.text).toBe('8-12');
    expect(resolveRepRange('TRICEPS CORDA', 'tensao').range.text).toBe('10-15');
  });
});

describe('normalização de faixas por exercício', () => {
  it('tensão não força todos os exercícios para 5-8', () => {
    const plan = { days: [tensionDay()] };
    validateAndNormalizeRepRanges(plan, [{ sessionIndex: 0, profile: 'tensao' }]);
    const reps = Object.fromEntries(plan.days[0].exercises.map((e: any) => [e.exercise, e.reps]));
    expect(reps['SUPINO RETO BARRA']).toBe('5-8');
    expect(reps['PUXADA ALTA PRONADA']).toBe('5-8');
    expect(reps['PECK DECK']).toBe('8-12');
    expect(reps['TRICEPS CORDA']).toBe('10-15');
    expect(reps['FLEXAO DE PUNHO']).toBe('10-15');
    expect(reps['ABDOMINAL SUPRA']).toBe('10-15');
    expect(reps['PRANCHA']).toBe('20-40s');
  });

  it('core e prancha não herdam a faixa do dia', () => {
    const plan = { days: [tensionDay()] };
    const fixes = validateAndNormalizeRepRanges(plan, [{ sessionIndex: 0, profile: 'tensao' }]);
    expect(fixes.some((f) => f.exercise === 'PRANCHA' && f.reason === 'isometric_should_be_time')).toBe(true);
    expect(fixes.some((f) => f.exercise === 'ABDOMINAL SUPRA')).toBe(true);
  });

  it('sessão continua classificada como tensão mesmo com acessórios em reps maiores', () => {
    const plan = { days: [tensionDay()] };
    validateAndNormalizeRepRanges(plan, [{ sessionIndex: 0, profile: 'tensao' }]);
    expect(assessSessionProfileIdentity(plan.days[0], 'tensao').ok).toBe(true);
  });

  it('volume aceita faixas distribuídas e não uniformiza', () => {
    const plan = { days: [volumeDay()] };
    validateAndNormalizeRepRanges(plan, [{ sessionIndex: 0, profile: 'volume' }]);
    const reps = plan.days[0].exercises.map((e: any) => e.reps);
    expect(reps).toContain('12-18');
    expect(new Set(reps).size).toBeGreaterThan(1);
    expect(assessSessionProfileIdentity(plan.days[0], 'volume').ok).toBe(true);
  });

  it('não altera prescrições especiais nem per_set', () => {
    const plan = {
      days: [
        {
          day: 'A',
          exercises: [
            { ...ex('TRICEPS CORDA', '15 + 8') },
            { ...ex('PECK DECK', '6'), set_scheme: { mode: 'per_set', sets: [] } },
          ],
        },
      ],
    };
    validateAndNormalizeRepRanges(plan, [{ sessionIndex: 0, profile: 'tensao' }]);
    expect(plan.days[0].exercises[0].reps).toBe('15 + 8');
    expect(plan.days[0].exercises[1].reps).toBe('6');
  });

  it('deload mantém faixas confortáveis por função', () => {
    expect(resolveRepRange('SUPINO RETO BARRA', 'deload').range.text).toBe('8-12');
    expect(resolveRepRange('TRICEPS CORDA', 'deload').range.text).toBe('12-15');
  });
});

// ------------------------------------------------------------------

const day = (names: string[]) => ({ day: 'A', exercises: names.map((n) => ex(n, '10')) });

const verdict = (main: string, candidate: string, others: string[] = []) =>
  evaluateVariationCandidate({
    day: day([main, ...others]),
    exerciseName: main,
    candidate,
    catalog: [],
  });

describe('validação funcional de variações', () => {
  const pass: Array<[string, string]> = [
    ['STIFF ROMENO', 'STIFF HALTERES'],
    ['MESA FLEXORA', 'CADEIRA FLEXORA'],
    ['PUXADA NEUTRA', 'PUXADA TRIANGULO'],
    ['ELEVACAO PELVICA', 'ELEVACAO PELVICA 2'],
    ['TRICEPS CORDA', 'TRICEPS CORDA 2'],
  ];
  for (const [a, b] of pass) {
    it(`aceita ${a} → ${b}`, () => {
      const v = verdict(a, b);
      expect(v.valid).toBe(true);
      expect(['A', 'B']).toContain(v.tier);
    });
  }

  const fail: Array<[string, string]> = [
    ['CADEIRA EXTENSORA', 'AGACHAMENTO SMITH'],
    ['CADEIRA EXTENSORA', 'AFUNDO COM HALTERES'],
    ['CADEIRA ABDUTORA', 'KICK BACK NA POLIA'],
    ['CADEIRA ABDUTORA', 'ELEVACAO PELVICA'],
    ['KICK BACK NA POLIA', 'ABDUCAO EM PE NA POLIA'],
    ['PALLOF PRESS', 'BEAR TO PLANK'],
    ['FLEXAO DE PUNHO', 'EXTENSAO DE PUNHO'],
    ['REAR DELT FLY', 'DESENVOLVIMENTO ARNOLD'],
  ];
  for (const [a, b] of fail) {
    it(`rejeita ${a} → ${b}`, () => {
      expect(verdict(a, b).valid).toBe(false);
    });
  }

  it('nunca aceita o próprio exercício como variação', () => {
    expect(verdict('SUPINO RETO', 'SUPINO RETO').reason).toBe('same_exercise');
  });

  it('rejeita variação que duplica outro exercício do dia', () => {
    const v = verdict('LEG PRESS 45 ART', 'LEG 180', ['LEG 180']);
    expect(v.valid).toBe(false);
  });

  it('respeita restrição de estabilidade (máquina → peso livre)', () => {
    const v = evaluateVariationCandidate({
      day: day(['CADEIRA FLEXORA']),
      exerciseName: 'CADEIRA FLEXORA',
      candidate: 'FLEXORA COM HALTERES',
      catalog: [],
      options: { restrictionsText: 'dificuldade de equilibrio' },
    });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('safety_conflict');
  });
});
