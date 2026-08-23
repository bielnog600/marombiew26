
import { describe, it, expect } from 'vitest';
import { planCompatible } from '../lib/weekContext';

describe('planCompatible - Auditoria de bug Marcus Melo', () => {
  it('plan_id null na sessão deve ser compatível com plano atual (legado/bug)', () => {
    const sessionPlanId = null;
    const currentPlanId = 'ad4c66c7-62ea-4206-8c51-95b833f42496';
    
    // Se isso retornar false, encontramos a causa: o código descarta 
    // sessões reais que não têm plan_id preenchido.
    expect(planCompatible(sessionPlanId, currentPlanId)).toBe(true);
  });

  it('plan_id preenchido na sessão deve ser compatível com o mesmo plano', () => {
    const planId = 'ad4c66c7-62ea-4206-8c51-95b833f42496';
    expect(planCompatible(planId, planId)).toBe(true);
  });

  it('plan_id preenchido na sessão deve ser INCOMPATÍVEL com outro plano', () => {
    expect(planCompatible('plano-A', 'plano-B')).toBe(false);
  });
});
