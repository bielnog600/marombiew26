
import { describe, it, expect } from 'vitest';
import { resolveCurrentTrainingPhase, parsePhaseStartDate } from '../lib/currentPhase';

describe('resolveCurrentTrainingPhase - Marcus Melo Timeline', () => {
  it('deve resolver para semana_3 em 2026-08-23 se o ciclo começou em 2026-07-10', () => {
    const plan = {
      fase_inicio_data: '2026-07-10',
      fase: 'semana_1', // Rótulo estático do plano
      cycle_days: 45
    };
    
    // Hoje é 23/08
    const now = new Date(Date.UTC(2026, 7, 23));
    
    const res = resolveCurrentTrainingPhase(plan, now);
    
    // 44 dias / 7 = 6.28. Index 6. index % 4 = 2. index 2 é semana_3.
    expect(res.daysIn).toBe(44);
    expect(res.weekIndex).toBe(6);
    expect(res.phase).toBe('semana_3');
  });

  it('deve resolver para semana_3 em 2026-08-21 (início da janela)', () => {
    const plan = { fase_inicio_data: '2026-07-10', fase: 'semana_1' };
    const now = new Date(Date.UTC(2026, 7, 21));
    const res = resolveCurrentTrainingPhase(plan, now);
    
    // 42 dias / 7 = 6. index 6 % 4 = 2.
    expect(res.daysIn).toBe(42);
    expect(res.phase).toBe('semana_3');
  });

  it('deve resolver para semana_1 em 2026-08-10 (primeiro registro da fase)', () => {
    const plan = { fase_inicio_data: '2026-07-10', fase: 'semana_1' };
    const now = new Date(Date.UTC(2026, 7, 10));
    const res = resolveCurrentTrainingPhase(plan, now);
    expect(res.daysIn).toBe(0);
    expect(res.phase).toBe('semana_1');
  });
});
