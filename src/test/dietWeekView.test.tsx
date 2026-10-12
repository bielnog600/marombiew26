import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DietWeekView, { buildDietWeekView } from '@/components/diet/DietWeekView';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const keys = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const days = keys.map((weekday, index) => ({ weekday, label: index < 5 ? 'Treino' : 'Off', trainingDay: index < 5,
  carbBias: index === 0 ? 'high' : 'low', totals: { kcal: 1803, p: 92, c: 266, g: 42 },
  meals: [{ id: `meal-${index}`, name: 'Café da manhã', items: [{ id: `food-${index}`, name: 'Aveia', qtyGrams: 50 }] }],
}));
const table = (name: string) => `## Treino\n| Refeição | Alimento | Qtd | Kcal | P | C | G |\n|---|---|---|---|---|---|---|\n| Café da manhã | ${name} | 50 g | 200 | 10 | 30 | 5 |`;
const markdown = keys.map((key) => table(`Aveia ${key}`)).join('\n\n') + '\n\n## Dicas\nBeba água.\n\n## Meta diária\n| Kcal | P | C | G |\n|---|---|---|---|\n| 1803 | 92 | 266 | 42 |\n\n## Mensagens para WhatsApp\nOi, confira seu plano.';

describe('leitura semanal da dieta admin', () => {
  it('condensa sete dias iguais ignorando ids e ordem das chaves', () => {
    const plan = { days: days.map((day, i) => i === 2 ? { ...day, meals: [{ name: 'Café da manhã', id: 'different', items: [{ qtyGrams: 50, name: 'Aveia', id: 'different' }] }] } : day) };
    expect(buildDietWeekView(markdown, plan)?.identical).toBe(true);
    render(<DietWeekView markdown={markdown} plan={plan} />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText(/Igual todos os dias/)).toBeInTheDocument();
    expect(screen.getByText('Aveia seg')).toBeInTheDocument();
    expect(screen.queryByText('Aveia ter')).not.toBeInTheDocument();
    expect(screen.getAllByText('Beba água.')).toHaveLength(1);
    expect(screen.getAllByText('Oi, confira seu plano.')).toHaveLength(1);
    expect(screen.getAllByText('Meta diária')).toHaveLength(1);
  });
  it('usa abas com dia local de hoje e totais reais quando há diferença', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 12, 12));
    const changed = days.map((day, i) => i === 0 ? { ...day, totals: { ...day.totals, kcal: 1956 } } : day);
    render(<DietWeekView markdown={markdown} plan={{ days: changed }} />);
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')[5]).toHaveTextContent('Descanso · 1803 kcal');
    expect(screen.getByText('Seg · Treino · carbo alto')).toBeInTheDocument();
    expect(screen.getByLabelText('Total do dia')).toHaveTextContent('1956 kcal');
    expect(screen.queryByText('Aveia ter')).not.toBeInTheDocument();
  });
  it('mantém correspondência original por índice antes de ordenar', () => {
    const reversed = [...days].reverse();
    const view = buildDietWeekView(markdown, { days: reversed });
    expect(view?.paired[0].day.weekday).toBe('seg');
    expect(view?.paired[0].meals[0].foods[0].food).toBe('Aveia dom');
  });
  it('diferenças de quantidade impedem condensação mesmo com kcal iguais', () => {
    const changed = days.map((day, i) => i === 3 ? { ...day, meals: [{ name: 'Café da manhã', items: [{ name: 'Aveia', qtyGrams: 55 }] }] } : day);
    expect(buildDietWeekView(markdown, { days: changed })?.identical).toBe(false);
  });
  it('preserva renderer anterior para dia único, weekday ausente ou contagem diferente', () => {
    expect(buildDietWeekView(table('Aveia'), { days: [days[0]] })).toBeNull();
    expect(buildDietWeekView(markdown, { days: days.map(day => ({ ...day, weekday: undefined })) })).toBeNull();
    expect(buildDietWeekView(table('Aveia'), { days })).toBeNull();
    render(<DietWeekView markdown={markdown} plan={null} />);
    expect(screen.getByText('Aveia seg')).toBeInTheDocument();
    expect(screen.getByText('Aveia dom')).toBeInTheDocument();
  });
});