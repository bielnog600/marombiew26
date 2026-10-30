import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MinhasDietas from '@/pages/MinhasDietas';

const mock = vi.hoisted(() => ({
  write: vi.fn().mockResolvedValue(undefined), event: vi.fn(), cache: vi.fn(),
  rows: [] as any[], plan: null as any, user: { id: 'diet-week-flow' },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/i18n', () => ({ useLanguage: () => ({ language: 'pt' }) }));
vi.mock('@/lib/planTranslation', () => ({ translatePlanMarkdown: async (value: string) => value }));
vi.mock('@/hooks/useEventTracking', () => ({ useEventTracking: () => ({ trackEvent: mock.event }) }));
vi.mock('@/lib/offlineQueue', () => ({ writeWithFallback: mock.write }));
vi.mock('@/lib/offlineCache', () => ({ setCache: mock.cache, fetchWithCache: async (key: string) => ({
  data: key.startsWith('plan:dieta:') ? mock.plan : key.startsWith('tracking-week:') ? mock.rows : null,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), upsert: vi.fn() }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn(),
} }));
vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/diet/FoodScanner', () => ({ default: () => null }));
vi.mock('@/components/diet/ProtocolsDialog', () => ({ default: () => null }));
// Meal editing/catalog are covered separately; keep real tracking, guards, calorie and water cards here.
vi.mock('@/components/diet/StudentMealCard', () => ({ default: (props: any) => (
  <div><span>{props.meal.name}</span><button onClick={props.onToggleComplete}>
    {props.isCompleted ? 'Desmarcar' : 'Registrar'} {props.meal.name}
  </button></div>
) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 30, 12));
  localStorage.clear(); mock.write.mockClear();
  const target = { kcal: 2452, p: 207, c: 258, g: 67 };
  mock.plan = { id: 'plan-flow', conteudo: '', is_draft: false, protocols: {},
    conteudo_json: { meta: { foodContractVersion: '1' }, targets: target,
      days: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map(weekday => ({ weekday, label: weekday, totals: target,
        meals: Array.from({ length: 4 }, (_, i) => ({ id: `meal-${i}`, order: i, totals: { kcal: 613, p: 51.75, c: 64.5, g: 16.75 }, name: `Refeição ${i + 1}`, items: [{
          name: 'Alimento', qtyGrams: 100, portionLabel: '100 g',
          macros: { kcal: 613, p: 51.75, c: 64.5, g: 16.75 },
        }] })),
      })),
    },
  };
  mock.rows = [{ date: '2026-10-29', water_glasses: 12, water_ml: 3000,
    meals_completed: [3000, 3001, 3002, 3003], workout_completed: false }];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('student weekly diet flow', () => {
  it('Friday defaults empty, Thursday renders its saved intake and corrections persist Thursday', async () => {
    render(<MinhasDietas />);
    await screen.findByRole('button', { name: 'Sex 2026-10-30' });
    expect(screen.getByRole('button', { name: 'Sex 2026-10-30' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: /^Registrar Refeição/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Qui 2026-10-29' }));
    expect(screen.getAllByRole('button', { name: /^Desmarcar Refeição/ })).toHaveLength(4);
    expect(screen.getByText('3,0 L / 2,0 L · 150%')).toBeInTheDocument();
    expect(screen.getByText('1 de 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar Refeição 3' }));
    await waitFor(() => expect(mock.write).toHaveBeenCalled());
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ date: '2026-10-29', meals_completed: [3000, 3001, 3003] });
    fireEvent.click(screen.getByRole('button', { name: '+100 ml' }));
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ date: '2026-10-29', water_ml: 3100 });
    fireEvent.click(screen.getByRole('button', { name: 'Sex 2026-10-30' }));
    expect(screen.getAllByRole('button', { name: /^Registrar Refeição/ })).toHaveLength(4);
  });
  it('future menu remains visible but neither meal nor water can be recorded', async () => {
    render(<MinhasDietas />);
    await screen.findByRole('button', { name: 'Sáb 2026-10-31' });
    fireEvent.click(screen.getByRole('button', { name: 'Sáb 2026-10-31' }));
    expect(screen.getByText('Esse dia ainda não chegou')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Refeição 1' }));
    fireEvent.click(screen.getByRole('button', { name: '+250 ml' }));
    expect(mock.write).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /^Registrar Refeição/ })).toHaveLength(4);
  });
  it('past day completion still warns against the prescribed 2452 target', async () => {
    mock.plan.conteudo_json.days[3].meals[3].items[0].macros.kcal = 812;
    mock.rows[0].meals_completed = [3000, 3001, 3002];
    render(<MinhasDietas />);
    await screen.findByRole('button', { name: 'Qui 2026-10-29' });
    fireEvent.click(screen.getByRole('button', { name: 'Qui 2026-10-29' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Refeição 4' }));
    expect(mock.write).not.toHaveBeenCalled();
    const warning = await screen.findByRole('alertdialog');
    expect(warning).toHaveTextContent('199');
    expect(warning).toHaveTextContent('2452');
  });
});