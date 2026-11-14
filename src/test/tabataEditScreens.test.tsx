import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { parseTabata, type ParsedTabata } from '@/lib/tabataParser';

vi.mock('@/components/AppLayout', () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/tabata/ExercisePicker', () => ({
  ExercisePicker: ({ value, onChange, placeholder }: any) => (
    <input aria-label={placeholder ?? 'Selecionar exercício'} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select aria-label="Dia" value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));
vi.mock('hls.js', () => ({ default: { isSupported: () => false, Events: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const md = (title: string, ex: string, obs = '...') => `# ${title}\n\n**Tipo:** Moderado\n\n## Blocos\n\n### Bloco 1\n**Formato:** 8 rounds × 20s / 10s\n\n| # | Exercício | Trabalho | Descanso | Observação |\n|---|---|---|---|---|\n| 1 | ${ex} | 20s | 10s | ${obs} |\n\n**Descanso após bloco:** 1 min\n`;

const db: Record<string, any> = {};
const updates: { id: string; payload: any }[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const filters: Record<string, any> = {};
    let payload: any = null;
    const result = (single: boolean) => {
      if (payload) { updates.push({ id: filters.id, payload }); return { error: null }; }
      if (table !== 'ai_plans') return { data: single ? null : [] };
      if (filters.id) return { data: db.plans.find((p: any) => p.id === filters.id) ?? null };
      if (filters.tipo === 'treino') return { data: null };
      return { data: db.plans.map(({ id, titulo, created_at }: any) => ({ id, titulo, created_at })) };
    };
    const b: any = {
      select: () => b, order: () => b, limit: () => b,
      eq: (k: string, v: any) => { filters[k] = v; return b; },
      update: (p: any) => { payload = p; return b; },
      maybeSingle: async () => result(true),
      then: (res: any, rej: any) => Promise.resolve(result(false)).then(res, rej),
    };
    return b;
  };
  return { supabase: { from: builder, auth: { getSession: async () => ({ data: { session: null } }) } } };
});

Element.prototype.scrollIntoView = vi.fn();
import TabataIA from '@/pages/TabataIA';
import { TabataStructuredEditor } from '@/components/tabata/TabataStructuredEditor';

const renderPage = () => render(
  <MemoryRouter initialEntries={['/tabata-ia/s1?edit=q&mode=adjust']}>
    <Routes><Route path="/tabata-ia/:studentId" element={<TabataIA />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  updates.length = 0;
  db.plans = [
    { id: 'q', titulo: 'Quinta — TABATA QUINTA', created_at: '2026-11-14T18:02:16Z', conteudo: md('TABATA QUINTA', 'BURPEES') },
    { id: 't', titulo: 'Terça — TABATA TERCA', created_at: '2026-11-14T18:02:15Z', conteudo: md('TABATA TERCA', 'POLICHINELO') },
  ];
});

describe('Ajuste Rápido — trocar o dia', () => {
  it('abre o conteúdo do dia escolhido e salva no plano desse dia', async () => {
    renderPage();
    expect(await screen.findByText('BURPEES')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: 'Terça' } });
    expect(await screen.findByText('POLICHINELO')).toBeInTheDocument();
    expect(screen.queryByText('BURPEES')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].id).toBe('t');
    expect(updates[0].payload.titulo).toMatch(/^Terça — /);
    expect(updates[0].payload.conteudo).toContain('POLICHINELO');
  });

  it('com edições não aplicadas pede confirmação, descarta e sai do Editar', async () => {
    renderPage();
    await screen.findByText('BURPEES');
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    fireEvent.change(screen.getByLabelText('Selecionar exercício'), { target: { value: 'SKIPS' } });
    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: 'Terça' } });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Abrir o TABATA de Terça?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar e abrir' }));
    expect(await screen.findByText('POLICHINELO')).toBeInTheDocument();
    expect(screen.queryByLabelText('Selecionar exercício')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar/ })).toBeInTheDocument();
  });

  it('cancelar a confirmação mantém o dia e as edições', async () => {
    renderPage();
    await screen.findByText('BURPEES');
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    fireEvent.change(screen.getByLabelText('Selecionar exercício'), { target: { value: 'SKIPS' } });
    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: 'Terça' } });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Selecionar exercício')).toHaveValue('SKIPS');
    expect((screen.getByLabelText('Dia') as HTMLSelectElement).value).toBe('Quinta');
  });

  it('dia sem TABATA pergunta se move este plano e só muda ao salvar', async () => {
    renderPage();
    await screen.findByText('BURPEES');
    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: 'Sexta' } });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Mover este TABATA para Sexta?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].id).toBe('q');
    expect(updates[0].payload.titulo).toMatch(/^Sexta — /);
  });
});

const Harness = ({ initial, onValue }: { initial: ParsedTabata; onValue: (v: ParsedTabata) => void }) => {
  const [v, setV] = useState(initial);
  return <TabataStructuredEditor value={v} onChange={n => { setV(n); onValue(n); }} />;
};

describe('Editor do bloco', () => {
  it('trocar o exercício do round limpa a observação', () => {
    let last: ParsedTabata | null = null;
    render(<Harness initial={parseTabata(md('T', 'BURPEES', 'Explosão máxima'))} onValue={v => { last = v; }} />);
    expect(screen.getByDisplayValue('Explosão máxima')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Selecionar exercício'), { target: { value: 'POLICHINELO' } });
    expect(screen.queryByDisplayValue('Explosão máxima')).not.toBeInTheDocument();
    expect(last!.blocks[0].exercises[0]).toMatchObject({ name: 'POLICHINELO', observation: '' });
  });

  it('Repetir padrão com 4 exercícios preenche os 8 rounds A-B-C-D', () => {
    let last: ParsedTabata | null = null;
    render(<Harness initial={parseTabata(md('T', 'BURPEES'))} onValue={v => { last = v; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Repetir padrão/ }));
    expect(screen.getByLabelText('Exercício A')).toHaveValue('BURPEES');
    fireEvent.change(screen.getByLabelText('Exercício B'), { target: { value: 'SKIPS' } });
    fireEvent.change(screen.getByLabelText('Exercício C'), { target: { value: 'JUMPS' } });
    fireEvent.change(screen.getByLabelText('Exercício D'), { target: { value: 'PRANCHA FRONTAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preencher 8 rounds' }));
    expect(last!.blocks[0].exercises.map(e => e.name)).toEqual([
      'BURPEES', 'SKIPS', 'JUMPS', 'PRANCHA FRONTAL', 'BURPEES', 'SKIPS', 'JUMPS', 'PRANCHA FRONTAL',
    ]);
    expect(last!.blocks[0].exercises.every(e => e.workSeconds === 20 && e.restSeconds === 10)).toBe(true);
  });

  it('Repetir padrão com 2 exercícios', () => {
    let last: ParsedTabata | null = null;
    render(<Harness initial={parseTabata(md('T', 'BURPEES'))} onValue={v => { last = v; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Repetir padrão/ }));
    fireEvent.click(screen.getByRole('radio', { name: '2 exercícios' }));
    fireEvent.change(screen.getByLabelText('Exercício B'), { target: { value: 'SKIPS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preencher 8 rounds' }));
    expect(last!.blocks[0].exercises.map(e => e.name)).toEqual(['BURPEES', 'SKIPS', 'BURPEES', 'SKIPS', 'BURPEES', 'SKIPS', 'BURPEES', 'SKIPS']);
  });
});

const legacyWarmup = (title: string) =>
  md(title, 'GLOBET SQUATS').replace('## Blocos', '## Aquecimento\n- POLICHINELO — 1 min\n- SKIPS — 1 min\n\n## Blocos');

describe('Editor — Bloco 0 e intensidade', () => {
  it('lista antiga vira Bloco 0 cronometrado editável (exercício, tempo, transição)', () => {
    let last: ParsedTabata | null = null;
    render(<Harness initial={parseTabata(legacyWarmup('T'))} onValue={v => { last = v; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Transformar em bloco cronometrado/ }));
    expect(last!.warmupBlock?.exercises.map(e => e.name)).toEqual(['POLICHINELO', 'SKIPS']);
    expect(last!.warmupBlock?.exercises.every(e => e.workSeconds === 25 && e.restSeconds === 5)).toBe(true);
    const warm = screen.getByTestId('tabata-warmup-block');
    fireEvent.change(within(warm).getAllByLabelText('Selecionar exercício')[1], { target: { value: 'JUMPING JACK' } });
    expect(last!.warmupBlock?.exercises[1].name).toBe('JUMPING JACK');
    expect(last!.blocks).toHaveLength(1);
  });

  it('aquecimento: trabalho 20–30s e intervalo 5–10s para todos, aviso acima de 3 min', () => {
    let last: ParsedTabata | null = null;
    render(<Harness initial={parseTabata(legacyWarmup('T'))} onValue={v => { last = v; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Transformar em bloco cronometrado/ }));
    const warm = screen.getByTestId('tabata-warmup-block');
    const work = within(warm).getByLabelText('Trabalho do aquecimento');
    fireEvent.change(work, { target: { value: '45' } });
    fireEvent.blur(work);
    expect(last!.warmupBlock?.exercises.every(e => e.workSeconds === 30)).toBe(true);
    const rest = within(warm).getByLabelText('Intervalo do aquecimento');
    fireEvent.change(rest, { target: { value: '2' } });
    fireEvent.blur(rest);
    expect(last!.warmupBlock?.exercises.every(e => e.restSeconds === 5)).toBe(true);
    expect(within(warm).queryByRole('alert')).toBeNull();
    // 2 × 35s = 1:10; mais 4 exercícios = 6 × 35s = 3:30 → aviso
    for (let i = 0; i < 4; i++) fireEvent.click(within(warm).getByRole('button', { name: /Exercício/ }));
    expect(last!.warmupBlock?.exercises).toHaveLength(6);
    expect(within(warm).getByRole('alert')).toHaveTextContent('3:30 — o máximo é 3 min');
  });

  it('intensidade do bloco e "Aplicar progressão" gravam no plano', () => {
    let last: ParsedTabata | null = null;
    const two = md('T', 'SKIPS').replace('**Descanso após bloco:** 1 min\n', '**Descanso após bloco:** 1 min\n\n### Bloco 2\n**Formato:** 8 rounds × 20s / 10s\n\n| # | Exercício | Trabalho | Descanso | Observação |\n|---|---|---|---|---|\n| 1 | BURPEES | 20s | 10s | ... |\n');
    render(<Harness initial={parseTabata(two)} onValue={v => { last = v; }} />);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Intensidade do Bloco 1' })).getByRole('radio', { name: /Forte/ }));
    expect(last!.blocks[0].intensity).toBe('forte');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar progressão/ }));
    expect(last!.blocks.map(b => b.intensity)).toEqual(['moderado', 'maximo']);
  });
});

import TabataExecucao from '@/pages/TabataExecucao';

describe('Player — Bloco 0', () => {
  it('plano antigo mostra e começa pelo Bloco 0 — Aquecimento', () => {
    const tabata = parseTabata(legacyWarmup('TABATA ANTIGO'));
    render(
      <MemoryRouter initialEntries={[{ pathname: '/tabata-execucao', state: { tabata } }]}>
        <Routes><Route path="/tabata-execucao" element={<TabataExecucao />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Bloco 0 — Aquecimento')).toBeInTheDocument();
    expect(screen.getByText(/Aquecimento 1 min \+ 1 bloco/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Iniciar/ }));
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('AQUECIMENTO · 1/2');
    expect(screen.getByTestId('tabata-player-intensity')).toHaveTextContent('Leve · RPE 3–4');
  });
});
