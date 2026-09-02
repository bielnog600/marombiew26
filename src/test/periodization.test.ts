import { describe, it, expect } from 'vitest';
import {
  selectPeriodizationModel,
  resolvePeriodization,
  resolveWeekStrategy,
  resolveBlockPlan,
  resolveNextStep,
  auditAnchors,
  judgeContinuity,
  buildPeriodizationPromptBlock,
  snapshotToPlanColumns,
  weekNumberToPhase,
  phaseToWeekNumber,
} from '@/lib/periodization';
import * as edgeResolver from '../../supabase/functions/_shared/periodization';

const base = {
  objective: 'hipertrofia',
  level: 'intermediario' as const,
  daysPerWeek: 5,
  weeklyStimuliPerMuscle: 2,
  adherencePct: 85,
  completedPlans: 3,
};

describe('seleção automática do modelo', () => {
  it('usa fallback Linear com baixa informação', () => {
    const d = selectPeriodizationModel({ level: 'intermediario' });
    expect(d.model).toBe('linear');
    expect(d.dataSufficiency).toBe('low');
  });

  it('escolhe Linear para iniciante com pouca frequência', () => {
    const d = selectPeriodizationModel({ ...base, level: 'iniciante', daysPerWeek: 3, weeklyStimuliPerMuscle: 1 });
    expect(d.model).toBe('linear');
  });

  it('escolhe Ondulatória para intermediário com múltiplos estímulos e boa adesão', () => {
    expect(selectPeriodizationModel(base).model).toBe('ondulatoria');
  });

  it('cardio complementar NÃO torna o aluno concorrente', () => {
    const d = selectPeriodizationModel({ ...base, cardioIsComplementary: true, cardioIsProgrammatic: false });
    expect(d.model).not.toBe('concorrente');
    expect(d.eligible).not.toContain('concorrente');
  });

  it('cardio programático habilita Concorrente', () => {
    const d = selectPeriodizationModel({ ...base, cardioIsProgrammatic: true, secondaryCapacity: 'corrida 10k' });
    expect(d.model).toBe('concorrente');
  });

  it('respeita a escolha manual do professor', () => {
    const d = selectPeriodizationModel(base, 'blocos');
    expect(d.model).toBe('blocos');
    expect(d.manual).toBe(true);
  });

  it('sempre devolve motivo auditável', () => {
    expect(selectPeriodizationModel(base).reason.length).toBeGreaterThan(10);
  });
});

describe('blocos', () => {
  it('não cria especialização sem prioridade real', () => {
    const p = resolveBlockPlan('blocos', 1, false);
    expect(p.blockTotal).toBe(3);
    expect(['acumulacao', 'intensificacao', 'transicao']).toContain(p.blockType);
  });

  it('cria especialização quando há prioridade', () => {
    const p = resolveBlockPlan('blocos', 3, true);
    expect(p.blockType).toBe('especializacao');
    expect(p.nextBlockType).toBe('transicao');
  });
});

describe('estratégia da semana (modelo + bloco + fase)', () => {
  it('S1-S4 mantêm a timeline existente', () => {
    expect(phaseToWeekNumber('semana_1')).toBe(1);
    expect(phaseToWeekNumber('deload')).toBe(4);
    expect(weekNumberToPhase(3)).toBe('semana_3');
  });

  it('ondulatória diferencia sessões de verdade', () => {
    const w = resolveWeekStrategy({ model: 'ondulatoria', blockType: 'acumulacao', phase: 'semana_2', daysPerWeek: 5 });
    expect(w.sessionProfiles).toHaveLength(5);
    const profiles = new Set(w.sessionProfiles.map((s) => s.profile));
    expect(profiles.size).toBeGreaterThan(1);
    const ranges = new Set(w.sessionProfiles.map((s) => s.repRange));
    expect(ranges.size).toBeGreaterThan(1);
  });

  it('linear não gera perfis por sessão e progride entre semanas', () => {
    const w1 = resolveWeekStrategy({ model: 'linear', blockType: 'acumulacao', phase: 'semana_1' });
    const w3 = resolveWeekStrategy({ model: 'linear', blockType: 'acumulacao', phase: 'semana_3' });
    expect(w1.sessionProfiles).toHaveLength(0);
    expect(w1.volumeTarget).not.toBe(w3.volumeTarget);
    expect(w1.intensityTarget).not.toBe(w3.intensityTarget);
  });

  it('acumulação prefere reps/volume e intensificação prefere carga', () => {
    expect(resolveWeekStrategy({ model: 'blocos', blockType: 'acumulacao', phase: 'semana_2' }).progressionPreference).toBe('reps_volume');
    expect(resolveWeekStrategy({ model: 'blocos', blockType: 'intensificacao', phase: 'semana_2' }).progressionPreference).toBe('carga');
  });

  it('deload bloqueia progressão agressiva em qualquer modelo', () => {
    for (const model of ['linear', 'ondulatoria', 'blocos', 'concorrente'] as const) {
      const w = resolveWeekStrategy({ model, blockType: 'acumulacao', phase: 'deload' });
      expect(w.blockAggressiveProgression).toBe(true);
      expect(w.volumeTarget).toBe('baixo');
      expect(w.progressionPreference).toBe('manter');
    }
  });

  it('snapshot não contradiz a fase', () => {
    const snap = resolvePeriodization({ context: base, phase: 'semana_3' });
    expect(snap.week.phase).toBe('semana_3');
    expect(snap.week.weekNumber).toBe(3);
    const cols = snapshotToPlanColumns(snap, '2026-09-01');
    expect(cols.periodization_model).toBe(snap.model);
    expect(cols.block_start_date).toBe('2026-09-01');
  });
});

describe('próximo passo do ciclo', () => {
  it('dor exige revisão humana', () => {
    expect(resolveNextStep({ plannedWeek: 2, painFlags: true }).action).toBe('review_required');
  });

  it('sem dados suficientes usa a timeline conservadora', () => {
    expect(resolveNextStep({ plannedWeek: 2, dataSufficiency: 'low' }).action).toBe('continue_block');
    expect(resolveNextStep({ plannedWeek: 4, dataSufficiency: 'low' }).action).toBe('deload');
  });

  it('baixa aderência repete a semana', () => {
    expect(resolveNextStep({ plannedWeek: 2, weightedAdherence: 30 }).action).toBe('repeat_week');
  });

  it('semana 4 concluída avança o bloco', () => {
    expect(resolveNextStep({ plannedWeek: 4, weightedAdherence: 90, blockCompleted: true }).action).toBe('advance_block');
  });
});

describe('anchors e continuidade', () => {
  const anchorsPrev = ['SUPINO RETO', 'AGACHAMENTO LIVRE', 'REMADA CURVADA', 'LEG PRESS'];

  it('9% de similaridade sem motivo e sem anchors → review', () => {
    const audit = auditAnchors(anchorsPrev, ['CRUCIFIXO', 'CADEIRA EXTENSORA']);
    const j = judgeContinuity(0.09, audit, null);
    expect(j.action).toBe('review');
  });

  it('45% de similaridade com anchors preservados → aceita', () => {
    const audit = auditAnchors(anchorsPrev, ['SUPINO RETO', 'AGACHAMENTO LIVRE', 'REMADA CURVADA', 'CRUCIFIXO'], ['SUPINO RETO']);
    expect(audit.anchorsRetained).toBe(3);
    expect(audit.anchorsProgressed).toBe(1);
    expect(judgeContinuity(0.45, audit, null).action).toBe('accept');
  });
});

describe('contrato com o trainer-agent', () => {
  it('bloco de prompt entrega a decisão pronta e proíbe troca de modelo', () => {
    const snap = resolvePeriodization({ selection: 'ondulatoria', context: base, phase: 'semana_2' });
    const block = buildPeriodizationPromptBlock(snap);
    expect(block).toContain('ondulatoria');
    expect(block).toContain('NÃO ESCOLHER OUTRO MODELO');
    expect(block).toContain('perfil tensao');
  });

  it('frontend e edge usam literalmente o mesmo resolver (sem drift)', () => {
    expect(selectPeriodizationModel).toBe(edgeResolver.selectPeriodizationModel);
    const fixtures = [
      base,
      { ...base, level: 'iniciante', daysPerWeek: 2 },
      { ...base, cardioIsProgrammatic: true },
      {},
    ];
    for (const f of fixtures) {
      expect(resolvePeriodization({ context: f, phase: 'semana_1', now: new Date(0) }))
        .toEqual(edgeResolver.resolvePeriodization({ context: f, phase: 'semana_1', now: new Date(0) }));
    }
  });
});

describe('compatibilidade com planos legados', () => {
  it('modelo legacy resolve estratégia equivalente à linear', () => {
    const legacy = resolveWeekStrategy({ model: 'legacy', blockType: 'acumulacao', phase: 'semana_2' });
    const linear = resolveWeekStrategy({ model: 'linear', blockType: 'acumulacao', phase: 'semana_2' });
    expect(legacy.volumeTarget).toBe(linear.volumeTarget);
    expect(legacy.effortTarget).toBe(linear.effortTarget);
  });
});
