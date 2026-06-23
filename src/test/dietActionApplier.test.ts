import { describe, it, expect } from 'vitest';
import {
  buildApplicationRecord,
  ACTION_META,
  buildClosePatch,
  buildFailPatch,
  orphanCutoffISO,
  ORPHAN_PENDING_HOURS,
} from '@/lib/dietActionApplier';
import type { DietDecisionResult } from '@/lib/dietDecisionEngine';

const baseDecision: DietDecisionResult = {
  scenario: 'estagnacao',
  action: 'atualizar_dieta',
  confidence: 0.75,
  rationale: 'Estagnação por 2+ semanas. Ajustar metas.',
  signals: ['Sem mudança de peso em 3 sem.'],
};

const baseCtx = {
  checkinId: 'chk-1',
  studentId: 'stu-1',
  adminId: 'adm-1',
  targetPlanId: 'plan-1',
  now: new Date('2026-06-23T13:00:00Z'),
};

describe('Fase 4 — assisted action persistence', () => {
  it('manter: registra histórico como completed e NÃO marca pending', () => {
    const rec = buildApplicationRecord(baseDecision, 'manter', baseCtx);
    expect(rec.applied_action).toBe('manter');
    expect(rec.status).toBe('completed');
    expect(rec.completed_at).toBe('2026-06-23T13:00:00.000Z');
    expect(ACTION_META.manter.needsGenerator).toBe(false);
  });

  it('revisar_manual: registra histórico como completed sem disparar geração', () => {
    const rec = buildApplicationRecord(baseDecision, 'revisar_manual', baseCtx);
    expect(rec.applied_action).toBe('revisar_manual');
    expect(rec.status).toBe('completed');
    expect(rec.completed_at).not.toBeNull();
    expect(ACTION_META.revisar_manual.needsGenerator).toBe(false);
    expect(ACTION_META.revisar_manual.intent).toBeUndefined();
  });

  it('atualizar_dieta: pending_generation com intent=update e completed_at null', () => {
    const rec = buildApplicationRecord(baseDecision, 'atualizar_dieta', baseCtx);
    expect(rec.status).toBe('pending_generation');
    expect(rec.completed_at).toBeNull();
    expect(ACTION_META.atualizar_dieta.intent).toBe('update');
  });

  it('regenerar_dieta: pending_generation com intent=regenerate', () => {
    const rec = buildApplicationRecord(baseDecision, 'regenerar_dieta', baseCtx);
    expect(rec.status).toBe('pending_generation');
    expect(rec.completed_at).toBeNull();
    expect(ACTION_META.regenerar_dieta.intent).toBe('regenerate');
  });

  it.each(['reduzir_densidade', 'aliviar_agressividade', 'aplicar_refeed', 'subir_proteina'] as const)(
    '%s: pending_generation com intent=update',
    (action) => {
      const rec = buildApplicationRecord(baseDecision, action, baseCtx);
      expect(rec.status).toBe('pending_generation');
      expect(ACTION_META[action].intent).toBe('update');
    }
  );

  it('preserva sugestão original mesmo quando admin escolhe ação diferente', () => {
    const rec = buildApplicationRecord(baseDecision, 'manter', baseCtx);
    expect(rec.suggested_action).toBe('atualizar_dieta'); // engine sugeriu
    expect(rec.applied_action).toBe('manter');             // admin sobrescreveu
  });

  it('falha de geração: histórico fica pending_generation e nunca diz "completed" sozinho', () => {
    // Cenário: ação de geração foi disparada mas usuário fechou a aba.
    // O record permanece pending_generation — não vira "completed" enganoso.
    const rec = buildApplicationRecord(baseDecision, 'atualizar_dieta', baseCtx);
    expect(rec.status).toBe('pending_generation');
    expect(rec.completed_at).toBeNull();
    // Status só pode ir para 'completed' via update explícito depois do save do plano.
  });

  it('rationale é embutido em notes para auditoria', () => {
    const rec = buildApplicationRecord(baseDecision, 'reduzir_densidade', baseCtx);
    expect(rec.notes).toContain('Reduzir densidade calórica');
    expect(rec.notes).toContain('Estagnação por 2+ semanas');
  });

  it('todos os 8 actions têm metadata definido', () => {
    const actions = [
      'manter',
      'atualizar_dieta',
      'regenerar_dieta',
      'subir_proteina',
      'reduzir_densidade',
      'aplicar_refeed',
      'aliviar_agressividade',
      'revisar_manual',
    ] as const;
    for (const a of actions) {
      expect(ACTION_META[a]).toBeDefined();
      expect(ACTION_META[a].title).toBeTruthy();
      expect(ACTION_META[a].preview).toBeTruthy();
    }
  });
});

describe('Fase 5 — lifecycle closure', () => {
  const now = new Date('2026-06-23T14:00:00Z');

  it('buildClosePatch: fecha aplicação com result_plan_id e timestamp', () => {
    const patch = buildClosePatch({
      applicationId: 'app-1',
      resultPlanId: 'plan-99',
      now,
    });
    expect(patch).toEqual({
      status: 'completed',
      result_plan_id: 'plan-99',
      completed_at: '2026-06-23T14:00:00.000Z',
    });
  });

  it('buildFailPatch: registra failure_reason truncada e timestamp', () => {
    const patch = buildFailPatch({
      applicationId: 'app-1',
      reason: 'erro de geração',
      now,
    });
    expect(patch.status).toBe('failed');
    expect(patch.failure_reason).toBe('erro de geração');
    expect(patch.completed_at).toBe('2026-06-23T14:00:00.000Z');
  });

  it('buildFailPatch: trunca reason longa em 500 chars', () => {
    const long = 'x'.repeat(1000);
    const patch = buildFailPatch({ applicationId: 'a', reason: long });
    expect(patch.failure_reason.length).toBe(500);
  });

  it('orphanCutoffISO: padrão = now - 48h', () => {
    const cutoff = orphanCutoffISO(now);
    const expected = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
    expect(cutoff).toBe(expected);
    expect(ORPHAN_PENDING_HOURS).toBe(48);
  });

  it('orphanCutoffISO: respeita janela customizada', () => {
    expect(orphanCutoffISO(now, 24)).toBe(
      new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
    );
  });
});