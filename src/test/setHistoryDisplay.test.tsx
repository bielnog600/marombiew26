import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Caso real: 07/11/2026 — aquecimento 17,5×15, preparatória 30×10, trabalho 35×11 e 37,5×5.
const ROWS = [
  { performed_at: '2026-11-07T10:20:00Z', set_number: 4, weight_kg: 37.5, reps: 5, set_type: 'work', session_id: 's1' },
  { performed_at: '2026-11-07T10:15:00Z', set_number: 3, weight_kg: 35, reps: 11, set_type: null, session_id: 's1' },
  { performed_at: '2026-11-07T10:10:00Z', set_number: 2, weight_kg: 30, reps: 10, set_type: 'preparatory', session_id: 's1' },
  { performed_at: '2026-11-07T10:05:00Z', set_number: 1, weight_kg: 17.5, reps: 15, set_type: 'warmup', session_id: 's1' },
];

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  ['select', 'eq', 'ilike', 'order'].forEach((m) => { chain[m] = () => chain; });
  chain.limit = () => Promise.resolve({ data: ROWS, error: null });
  return { supabase: { from: () => chain } };
});

import { buildLoadHistorySessions, formatHistoryKg, historyRowsByDate, historySetDisplay } from '@/lib/setHistoryDisplay';
import { HistoryPopover } from '@/components/training/TrainerLogSheet';

describe('histórico de séries — exibição', () => {
  it('mostra todas as séries na ordem, com o tipo (sem tipo = Trabalho)', () => {
    const [[date, sets]] = historyRowsByDate(ROWS);
    expect(date).toBe('07/11/2026');
    expect(sets.map((s) => `Série ${s.set_number} ${historySetDisplay(s.set_type).label} ${formatHistoryKg(s.weight_kg)} × ${s.reps}`)).toEqual([
      'Série 1 Aquecimento 17,5 kg × 15',
      'Série 2 Preparatória 30 kg × 10',
      'Série 3 Trabalho 35 kg × 11',
      'Série 4 Trabalho 37,5 kg × 5',
    ]);
  });

  it('reconhecimento tem rótulo próprio', () => {
    expect(historySetDisplay('recognition').label).toBe('Reconhecimento');
    expect(historySetDisplay('recon').label).toBe('Reconhecimento');
  });

  it('top e volume da sessão continuam só com séries de trabalho', () => {
    const [s] = buildLoadHistorySessions(ROWS);
    expect(s.sets).toHaveLength(4);
    expect(s.topWeight).toBe(37.5);
    expect(s.totalVolume).toBe(35 * 11 + 37.5 * 5);
    expect(s.hasWork).toBe(true);
  });

  it('sessão só com aquecimento aparece, mas não tem top de trabalho', () => {
    const [s] = buildLoadHistorySessions([ROWS[3]]);
    expect(s.sets).toHaveLength(1);
    expect(s.hasWork).toBe(false);
    expect(s.topWeight).toBe(0);
  });

  it('popover do Modo Treino lista as 4 séries e o botão segue com a série de trabalho', async () => {
    render(
      <HistoryPopover
        studentId="aluno"
        exerciseName="SUPINO"
        last={{ lastWeight: 37.5, lastReps: 5, lastDate: ROWS[0].performed_at }}
      />,
    );
    const botao = screen.getByRole('button');
    expect(botao.textContent).toContain('37.5kg × 5');
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByText('Aquecimento')).toBeTruthy());
    const linhas = Array.from(document.querySelectorAll('[data-set-type]'));
    expect(linhas.map((l) => l.getAttribute('data-set-type'))).toEqual(['warmup', 'preparatory', 'work', 'work']);
    expect(within(linhas[0] as HTMLElement).getByText('17,5 kg × 15')).toBeTruthy();
    expect(within(linhas[3] as HTMLElement).getByText('37,5 kg × 5')).toBeTruthy();
  });
});
