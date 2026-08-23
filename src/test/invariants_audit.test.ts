
import { describe, it, expect } from 'vitest';
import { planCompatible, phaseCompatible } from '../lib/weekContext';

describe('Auditoria de Invariantes - Fallback vs Divergência', () => {
  describe('planCompatible', () => {
    it('deve aceitar session.plan_id = null (legado)', () => {
      expect(planCompatible(null, 'plano-atual')).toBe(true);
    });

    it('deve aceitar quando os IDs são idênticos', () => {
      expect(planCompatible('plano-A', 'plano-A')).toBe(true);
    });

    it('deve REJEITAR session.plan_id divergente', () => {
      expect(planCompatible('plano-antigo', 'plano-novo')).toBe(false);
    });
  });

  describe('phaseCompatible', () => {
    it('deve aceitar session.phase = null (legado/fallback temporal)', () => {
      expect(phaseCompatible(null, 'semana_3')).toBe(true);
    });

    it('deve aceitar quando as fases são idênticas', () => {
      expect(phaseCompatible('semana_1', 'semana_1')).toBe(true);
    });

    it('deve REJEITAR session.phase explicitamente divergente', () => {
      // Caso real Marcus Melo: session.phase='semana_1', context.phase='semana_3'
      expect(phaseCompatible('semana_1', 'semana_3')).toBe(false);
    });
  });
});
