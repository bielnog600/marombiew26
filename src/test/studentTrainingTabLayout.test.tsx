import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, cleanup } from '@testing-library/react';
import { resolvePlanWeekStrategy } from '@/components/training/PeriodizationCard';
import { resolveWeekStrategy } from '@/lib/periodization';

/**
 * Aba Treinos do aluno (admin): selo da semana e faixa de periodização
 * usam a MESMA semana (resolveCurrentTrainingPhase pela fase_inicio_data),
 * treino atual em destaque e histórico recolhível.
 */

let rows: any[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const chain = (table: string) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: () => Promise.resolve({ data: table === 'ai_plans' ? rows : [], error: null }),
      maybeSingle: () => Promise.resolve({ data: { nome: 'Aluno Teste' }, error: null }),
      delete: () => q,
      update: () => q,
    };
    return q;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});
vi.mock('@/contexts/AdminTrainerSessionContext', () => ({
  useAdminTrainerSession: () => ({ active: null, open: vi.fn(), start: vi.fn() }),
}));
vi.mock('@/components/training/ProgressionAnalyticsCard', () => ({
  ProgressionAnalyticsCard: () => <div data-testid="progression-analytics" />,
}));
vi.mock('@/components/TrainingResultCards', () => ({ default: () => <div data-testid="editor" /> }));
vi.mock('@/components/WhatsAppNotifyPlanButton', () => ({ default: () => null }));
vi.mock('@/components/training/WeeklyAdherenceBanner', () => ({ default: () => <div data-testid="adherence" /> }));
vi.mock('@/hooks/useWeeklyTraining', () => ({
  useWeeklyTraining: () => ({ report: null, resolution: null, loading: false }),
}));

import StudentTrainingTab from '@/components/student/StudentTrainingTab';
import { MemoryRouter } from 'react-router-dom';

const renderTab = () => render(<MemoryRouter><StudentTrainingTab studentId="s1" /></MemoryRouter>);

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const snapshotWeek1 = resolveWeekStrategy({ model: 'ondulatoria' as any, blockType: 'acumulacao', phase: 'semana_1' });

const plan = (over: Record<string, any>) => ({
  tipo: 'treino',
  is_draft: false,
  conteudo: '',
  conteudo_json: null,
  fase: 'semana_1',
  fase_inicio_data: null,
  cycle_days: 45,
  ...over,
});

beforeEach(() => {
  rows = [
    plan({
      id: 'p-current',
      titulo: 'Treino Novembro',
      created_at: '2026-11-01T10:00:00Z',
      // fase gravada = semana_1, mas a timeline (16 dias) está na semana 3
      fase_inicio_data: isoDaysAgo(16),
      periodization_model: 'ondulatoria',
      block_type: 'acumulacao',
      block_number: 1,
      block_total: 1,
      periodization_snapshot: { week: snapshotWeek1 },
    }),
    plan({ id: 'p-old-1', titulo: 'Treino Outubro', created_at: '2026-10-01T10:00:00Z', fase: 'semana_2' }),
    plan({ id: 'p-old-2', titulo: 'Treino Setembro', created_at: '2026-09-01T10:00:00Z' }),
  ];
});
afterEach(cleanup);

describe('resolvePlanWeekStrategy', () => {
  it('ignora snapshot de outra semana e recalcula para a fase atual', () => {
    const week = resolvePlanWeekStrategy(rows[0], 'semana_3');
    expect(week?.weekNumber).toBe(3);
  });
  it('reaproveita o snapshot quando é da mesma semana', () => {
    expect(resolvePlanWeekStrategy(rows[0], 'semana_1')).toBe(snapshotWeek1);
  });
  it('treino sem periodization_model não tem faixa', () => {
    expect(resolvePlanWeekStrategy(rows[1], 'semana_1')).toBeNull();
  });
});

describe('StudentTrainingTab — layout dos treinos', () => {
  it('selo e faixa mostram a mesma semana da timeline; sem card separado', async () => {
    renderTab();
    const current = await screen.findByTestId('training-plan-current');
    expect(within(current).getByText('Atual')).toBeTruthy();
    expect(within(current).getByText('Semana 3')).toBeTruthy();
    const strip = within(current).getByTestId('periodization-strip');
    expect(strip.textContent).toContain('Semana 3 de 4');
    expect(screen.queryByText('Periodização')).toBeNull();
    // texto longo só expandido
    expect(screen.queryByTestId('periodization-details')).toBeNull();
    fireEvent.click(within(current).getByText('Treino Novembro'));
    expect(await screen.findByTestId('periodization-details')).toBeTruthy();
  });

  it('data de início editada (não salva) muda selo e faixa juntos', async () => {
    renderTab();
    const current = await screen.findByTestId('training-plan-current');
    fireEvent.click(within(current).getByText('Treino Novembro'));
    const dateInput = current.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: isoDaysAgo(8) } });
    await waitFor(() => expect(within(current).getByText('Semana 2')).toBeTruthy());
    expect(within(current).getByTestId('periodization-strip').textContent).toContain('Semana 2 de 4');
  });

  it('histórico começa fechado, lista linhas compactas e expande o editor sem fechar a seção', async () => {
    renderTab();
    const toggle = await screen.findByRole('button', { name: /Histórico \(2 treinos\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Treino Outubro')).toBeNull();

    fireEvent.click(toggle);
    const rowsEls = screen.getAllByTestId('training-plan-history-row');
    expect(rowsEls).toHaveLength(2);
    const first = rowsEls[0];
    expect(within(first).getByText('Semana 2')).toBeTruthy();
    expect(within(first).getByRole('button', { name: /Treinar/ })).toBeTruthy();
    expect(within(first).getByRole('button', { name: 'Deletar treino' })).toBeTruthy();

    fireEvent.click(within(first).getByText('Treino Outubro'));
    const expanded = await screen.findByTestId('training-plan-card');
    expect(within(expanded).getByTestId('editor')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByTestId('training-plan-history-row')).toHaveLength(1);
  });
});
