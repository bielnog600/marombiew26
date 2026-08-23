
import { describe, it, expect } from 'vitest';
import { planCompatible } from '../lib/weekContext';

import { planCompatible, phaseCompatible } from '../lib/weekContext';

describe('Integridade de Contexto - Auditoria Marcus Melo', () => {
  it('plan_id null na sessão deve ser compatível com plano atual (legado/bug)', () => {
    expect(planCompatible(null, 'ad4c66c7-62ea-4206-8c51-95b833f42496')).toBe(true);
  });

  it('phase null na sessão deve ser compatível com a fase do contexto (confiança temporal)', () => {
    // Caso real Marcus Melo: sessão tem phase='semana_1' mas contexto é 'semana_3'.
    // A correção agora permite aceitar se for null, mas aqui testamos a 
    // nova regra de tolerância para logs sem fase ou com fase divergente 
    // mas temporalmente válidos.
    expect(phaseCompatible(null as any, 'semana_3')).toBe(true);
  });

  it('phase divergente explicitamente ainda deve ser bloqueada para evitar cross-talk de periodização', () => {
    // Se o sistema marcou explicitamente como semana_1, e estamos na semana_2,
    // a compatibilidade estrita entre nomes de fase (semana_1 != semana_2)
    // deve ser respeitada pelo phaseCompatible, mas o seletor (selectLogsForContext)
    // deve ser quem decide a tolerância para null.
    expect(phaseCompatible('semana_1', 'semana_2')).toBe(false);
  });
});
