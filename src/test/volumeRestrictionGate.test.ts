import { describe, it, expect } from 'vitest';
import {
  auditVolumeRedundancy,
  buildVolumeRetryInstruction,
  countExerciseSets,
  normalizeVolumeTarget,
} from '../../supabase/functions/_shared/volumeRedundancyAudit';
import {
  assessRestrictionDetail,
  buildRestrictionQualityPromptBlock,
  detectUnfoundedJointInference,
} from '../../supabase/functions/_shared/restrictionDetailGate';

const ex = (exercise: string, series = '3', series2: string | null = '-', reps = '10-12') => ({
  exercise,
  series,
  series2,
  reps,
});

const plan = (exercises: any[]) => ({ days: [{ day: 'TERÇA', exercises }] });

describe('volumeRedundancyAudit', () => {
  it('3 variações de panturrilha no mesmo dia reprovam', () => {
    const a = auditVolumeRedundancy(
      plan([ex('GÊMEOS LEG PRESS'), ex('GEMEOS SMITH'), ex('GÊMEOS UNILATERAL')]),
    );
    expect(a.status).toBe('FAIL');
    expect(a.reasons.some((r) => r.code === 'EXCESSIVE_SAME_FAMILY' && r.family === 'calf_raise')).toBe(true);
  });

  it('2 flexoras quase equivalentes geram WARN', () => {
    const a = auditVolumeRedundancy(plan([ex('MESA FLEXORA'), ex('FLEXORA ALTERNANDO')]));
    expect(a.status).toBe('WARN');
    expect(a.reasons[0].code).toBe('REDUNDANT_FAMILY_PAIR');
  });

  it('vertical pull + horizontal row é permitido', () => {
    const a = auditVolumeRedundancy(plan([ex('PUXADA NA POLIA'), ex('REMADA MÁQUINA')]));
    expect(a.status).toBe('PASS');
  });

  it('3 remadas semelhantes reprovam por família', () => {
    const a = auditVolumeRedundancy(
      plan([ex('REMADA MÁQUINA'), ex('REMADA TRIÂNGULO'), ex('REMADA CAVALINHO')]),
    );
    expect(a.reasons.some((r) => r.code === 'EXCESSIVE_SAME_FAMILY' && r.family === 'horizontal_row')).toBe(true);
  });

  it('semana de calibração com volume alto reprova', () => {
    const many = Array.from({ length: 8 }, (_, i) => ex(`AGACHAMENTO ${i}`, '4'));
    const a = auditVolumeRedundancy({ days: [{ day: 'SEG', exercises: many }] }, {
      weekStrategy: 'Semana de calibração',
      weekNumber: 1,
    });
    expect(a.reasons.some((r) => r.code === 'CALIBRATION_VOLUME_TOO_HIGH')).toBe(true);
    expect(a.status).toBe('FAIL');
  });

  it('moderado_alto alvo com saída compatível passa', () => {
    const a = auditVolumeRedundancy(
      { days: [{ day: 'SEG', exercises: [ex('SUPINO RETO', '4'), ex('REMADA MÁQUINA', '4')] }] },
      { volumeTarget: 'moderado_alto', weekNumber: 2 },
    );
    expect(a.status).toBe('PASS');
  });

  it('série de reconhecimento não conta como série de trabalho', () => {
    expect(countExerciseSets({ series: '1', series2: '3' })).toEqual({ work: 3, recognition: 1 });
    expect(countExerciseSets({ series: '4', series2: '-' })).toEqual({ work: 4, recognition: 0 });
  });

  it('mobilidade e cardio não entram no volume de hipertrofia', () => {
    const a = auditVolumeRedundancy(plan([ex('MOBILIDADE ESCAPULAR', '3'), ex('ESTEIRA CURVA', '1')]));
    expect(a.weeklyWorkingSets).toBe(0);
    expect(a.sessions[0].supportExercises).toBe(2);
  });

  it('âncoras são preservadas na instrução de retry', () => {
    const a = auditVolumeRedundancy(
      plan([ex('AGACHAMENTO LIVRE', '4'), ex('MESA FLEXORA'), ex('GÊMEOS LEG PRESS'), ex('GEMEOS SMITH'), ex('GÊMEOS UNILATERAL')]),
    );
    const retry = buildVolumeRetryInstruction(a);
    expect(retry).toContain('VOLUME_REDUNDANCY_VALIDATION_FAILED');
    expect(retry).toContain('NÃO remova os exercícios âncora');
    expect(a.protectedAnchors).toContain('AGACHAMENTO LIVRE');
  });

  it('plano corrigido depois do retry passa', () => {
    const a = auditVolumeRedundancy(plan([ex('AGACHAMENTO LIVRE', '4'), ex('MESA FLEXORA'), ex('GÊMEOS LEG PRESS', '4')]));
    expect(a.status).toBe('PASS');
  });

  it('normaliza alvos de volume em português', () => {
    expect(normalizeVolumeTarget('moderado_alto')).toBe('MODERATE_HIGH');
    expect(normalizeVolumeTarget('alto')).toBe('HIGH');
    expect(normalizeVolumeTarget('baixo')).toBe('LOW');
  });
});

describe('restrictionDetailGate', () => {
  it('sem lesão → fluxo normal', () => {
    const a = assessRestrictionDetail({ restricoes: 'nenhuma restrição' });
    expect(a.status).toBe('none');
    expect(a.reviewRequired).toBe(false);
  });

  it('lesão com local e restrição clara → adaptação específica permitida', () => {
    const a = assessRestrictionDetail({ lesoes: 'Lesão no joelho direito, dor ao agachar profundo, evitar impacto' });
    expect(a.status).toBe('complete');
    expect(a.knownAreas).toContain('joelho');
    expect(a.reviewRequired).toBe(false);
  });

  it('lesão sem local → incomplete + REVIEW_REQUIRED', () => {
    const a = assessRestrictionDetail({ lesoes: 'Possui lesão, não informou detalhes' });
    expect(a.status).toBe('incomplete');
    expect(a.reviewRequired).toBe(true);
    expect(a.reasonCode).toBe('MISSING_INJURY_DETAILS');
  });

  it('incompleta não pode inferir joelho', () => {
    const a = assessRestrictionDetail({ lesoes: 'tem uma lesão' });
    const r = detectUnfoundedJointInference(plan([ex('ESTABILIDADE DE JOELHO'), ex('MINI SQUATS')]), a);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.area === 'joelho')).toBe(true);
  });

  it('incompleta não pode inferir ombro nem lombar', () => {
    const a = assessRestrictionDetail({ lesoes: 'tem uma lesão' });
    const r = detectUnfoundedJointInference(
      {
        days: [
          { day: 'A', exercises: [{ exercise: 'FACE PULL', description: 'proteger o ombro' }] },
          { day: 'B', exercises: [{ exercise: 'REMADA MÁQUINA', description: 'poupar a lombar' }] },
        ],
      },
      a,
    );
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.area).sort()).toEqual(['lombar', 'ombro']);
  });

  it('adaptação conservadora genérica é permitida', () => {
    const a = assessRestrictionDetail({ lesoes: 'tem uma lesão' });
    const r = detectUnfoundedJointInference(
      plan([{ exercise: 'LEG PRESS', description: 'carga moderada, amplitude confortável, RIR 3' }]),
      a,
    );
    expect(r.ok).toBe(true);
  });

  it('com local informado a checagem de inferência não bloqueia', () => {
    const a = assessRestrictionDetail({ lesoes: 'condromalácia no joelho, dor ao agachar' });
    const r = detectUnfoundedJointInference(plan([ex('ESTABILIDADE DE JOELHO')]), a);
    expect(r.ok).toBe(true);
  });

  it('bloco de prompt instrui a não inferir local', () => {
    const a = assessRestrictionDetail({ lesoes: 'tem uma lesão' });
    const block = buildRestrictionQualityPromptBlock(a);
    expect(block).toContain('RESTRICTION DATA QUALITY');
    expect(block).toContain('INCOMPLETE');
    expect(block).toContain('NÃO infira o local da lesão');
    expect(block).toContain('REVIEW_REQUIRED');
  });
});
