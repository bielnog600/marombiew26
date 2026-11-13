import React from 'react';
import fs from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
const FOODS = JSON.parse(fs.readFileSync('/tmp/repro/foods.json', 'utf8'));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => table === 'foods'
      ? { select: () => ({ order: () => Promise.resolve({ data: FOODS, error: null }) }) }
      : { insert: (row: any) => { mock.insert(row); return { select: () => ({ single: async () => ({ data: { id: 'x', created_at: 'now', ...row }, error: null }) }) }; }, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) },
    functions: { invoke: vi.fn() },
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));
import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';
const log = JSON.parse(fs.readFileSync('/tmp/repro/log.json', 'utf8'));
describe('repro', () => {
  it('edit', async () => {
    render(<MealWeighScreen meal={{ name: 'Café', foods: [] } as any} studentId="a" logDate="2026-11-13" mealIndex={0} dietPlanId="p" editLog={log} onClose={() => {}} />);
    await new Promise((r) => setTimeout(r, 50));
    console.log('HEADER', document.body.textContent?.slice(0, 400));
    const btn = screen.getByRole('button', { name: /Editar Omelete/ });
    fireEvent.click(btn);
    const sheet = await screen.findByRole('dialog', { name: 'Editar Omelete' });
    fireEvent.change(within(sheet).getByLabelText('Gramas'), { target: { value: '150' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Salvar alteração/ }));
    await new Promise((r) => setTimeout(r, 50));
    console.log('AFTER', document.body.textContent?.slice(0, 600));
  });
});
