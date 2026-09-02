import { describe, it, expect } from 'vitest';
import {
  resolvePlannedWeek,
  buildNextStepSignals,
  extractPlanExercises,
  classifyAnchors,
  resolveRenewalPeriodization,
  buildRenewalPromptBlock,
  exerciseOverlap,
  checkRenewalContinuity,
} from '../../supabase/functions/_shared/renewalPeriodization';

const MD = `
| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | SUPINO RETO | 4 | - | 8-10 | 2 | 90s | — | — |
| A | REMADA CURVADA | 4 | - | 8-10 | 2 | 90s | — | — |
| A | LEG PRESS | 4 | - | 10-12 | 2 | 90s | — | — |
`;

const basePlan = {
  fase: 'semana_2',
  version: 2,
  conteudo: MD,
  periodization_model: 'linear',
  block_type: 'acumulacao',
  block_number: 1,
};

const baseCtx = {
  adherence_score: 0.85,
  avg_rpe: 7,
  sessions_in_window: 8,
  session_frequency: 4,
  data_quality: 'sufficient',
  objetivo: 'hipertrofia',
  recent_exercise_stats: [
    { name: 'SUPINO RETO', sets: 12, load_trend: 'subindo', reps_trend: 'estavel', max_load_kg: 80 },
    { name: 'LEG PRESS', sets: 10, load_trend: 'estavel', reps_trend: 'estavel', max_load_kg: 200 },
  ],
};

describe('renewalPeriodization', () => {
  it('resolve semana planejada a partir da fase do plano', () => {
    expect(resolvePlannedWeek(basePlan)).toBe(2);
    expect(resolvePlannedWeek({ fase: 'deload' })).toBe(4);
    expect(resolvePlannedWeek({})).toBe(1);
  });

  it('prioriza semana do snapshot', () => {
    expect(resolvePlannedWeek({ fase: 'semana_1', periodization_snapshot: { week: { weekNumber: 3 } } })).toBe(3);
  });

  it('constrói sinais objetivos sem matemática nova', () => {
    const s = buildNextStepSignals(basePlan, baseCtx);
    expect(s.weightedAdherence).toBe(85);
    expect(s.dataSufficiency).toBe('high');
    expect(s.progressionSummary.improved).toBe(1);
    expect(s.painFlags).toBe(false);
  });

  it('detecta dor no feedback recente', () => {
    const s = buildNextStepSignals(basePlan, { ...baseCtx, recent_checkins: [{ dor_relato: 'dor no ombro' }] });
    expect(s.painFlags).toBe(true);
  });

  it('extrai exercícios da tabela markdown', () => {
    expect(extractPlanExercises(MD)).toEqual(['SUPINO RETO', 'REMADA CURVADA', 'LEG PRESS']);
  });

  it('classifica âncoras (manter/progredir/rotacionar/remover)', () => {
    const a = classifyAnchors(extractPlanExercises(MD), baseCtx.recent_exercise_stats as never, ['leg press']);
    expect(a.progress).toContain('SUPINO RETO');
    expect(a.remove).toContain('LEG PRESS');
    expect(a.keep).toContain('REMADA CURVADA');
    expect(a.anchors).toEqual([...a.keep, ...a.progress]);
  });

  it('continue_block mantém o tipo de bloco atual', () => {
    const r = resolveRenewalPeriodization(basePlan, baseCtx);
    expect(r.nextStep.action).toBe('continue_block');
    expect(r.snapshot.block.blockType).toBe('acumulacao');
    expect(r.snapshot.block.blockNumber).toBe(1);
    expect(r.snapshot.week.weekNumber).toBe(3);
  });

  it('dor força review_required e proposta conservadora', () => {
    const r = resolveRenewalPeriodization(basePlan, { ...baseCtx, pain_alerts: [{ x: 1 }] });
    expect(r.nextStep.action).toBe('review_required');
    expect(r.reviewRequired).toBe(true);
    expect(buildRenewalPromptBlock(r)).toContain('REVIEW REQUIRED');
  });

  it('aderência baixa gera repetição da semana', () => {
    const r = resolveRenewalPeriodization(basePlan, { ...baseCtx, adherence_score: 0.3 });
    expect(r.nextStep.action).toBe('repeat_week');
    expect(r.snapshot.week.weekNumber).toBe(2);
  });

  it('fim de bloco avança para o próximo bloco', () => {
    const r = resolveRenewalPeriodization({ ...basePlan, fase: 'deload' }, baseCtx);
    expect(['advance_block', 'deload']).toContain(r.nextStep.action);
    if (r.nextStep.action === 'advance_block') {
      // A numeração é limitada pelo total de blocos do modelo (regra canônica).
      expect(r.snapshot.block.blockNumber).toBeLessThanOrEqual(r.snapshot.block.blockTotal);
      expect(r.snapshot.week.weekNumber).toBe(1);

    }
  });

  it('preserva o modelo já salvo no plano (IA não escolhe)', () => {
    const r = resolveRenewalPeriodization({ ...basePlan, periodization_model: 'ondulatoria' }, baseCtx);
    expect(r.snapshot.model).toBe('ondulatoria');
  });

  it('prompt traz modelo, bloco, decisão e âncoras', () => {
    const block = buildRenewalPromptBlock(resolveRenewalPeriodization(basePlan, baseCtx));
    expect(block).toContain('MODELO:');
    expect(block).toContain('BLOCO ATUAL:');
    expect(block).toContain('DECISÃO DO RESOLVER:');
    expect(block).toContain('ÂNCORAS A MANTER:');
    expect(block).toContain('NÃO pode trocar o modelo');
  });

  it('prompt de retry inclui o motivo concreto da falha', () => {
    const r = resolveRenewalPeriodization(basePlan, baseCtx);
    expect(buildRenewalPromptBlock(r, 'similaridade 10%')).toContain('similaridade 10%');
  });

  it('overlap mede continuidade de exercícios', () => {
    expect(exerciseOverlap(['SUPINO RETO', 'LEG PRESS'], ['supino reto'])).toBe(0.5);
    expect(exerciseOverlap([], ['x'])).toBe(1);
  });

  it('continuidade falha quando o plano novo descarta as âncoras', () => {
    const r = resolveRenewalPeriodization(basePlan, baseCtx);
    const novo = MD.replace('SUPINO RETO', 'CRUCIFIXO').replace('REMADA CURVADA', 'PULLDOWN').replace('LEG PRESS', 'AGACHAMENTO');
    const c = checkRenewalContinuity(r, novo);
    expect(c.ok).toBe(false);
    expect(c.reason).toContain('CONTINUITY VALIDATION FAILED');
  });

  it('continuidade passa quando as âncoras são preservadas', () => {
    const r = resolveRenewalPeriodization(basePlan, baseCtx);
    const c = checkRenewalContinuity(r, MD);
    expect(c.ok).toBe(true);
    expect(c.similarity).toBe(1);
  });
});
