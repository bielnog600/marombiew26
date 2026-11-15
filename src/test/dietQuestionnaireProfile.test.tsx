import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DietQuestionnaire from '@/pages/DietQuestionnaire';

/** Ficha do aluno: "Seus dados" pré-preenchido e peso só sem pesagem em 15 dias. */

const perfil = (precisa_peso: boolean) => ({
  id: 'q1', student_id: 's1', status: 'pending', token: 'tok', student_name: 'Gisele',
  foods: [], previous_answers: null,
  perfil: { data_nascimento: '1992-03-04', altura: 165, telefone: '351911577317', raca: 'pardo', objetivo: 'Emagrecimento', precisa_peso },
});

const setup = (precisa: boolean) => {
  const posts: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ success: true }) }; }
    return { ok: true, json: async () => perfil(precisa) };
  }));
  render(<MemoryRouter initialEntries={['/questionario-dieta?token=tok']}><DietQuestionnaire /></MemoryRouter>);
  return posts;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ficha — Seus dados', () => {
  it('pré-preenche com o perfil e esconde o peso quando há pesagem recente', async () => {
    setup(false);
    expect(await screen.findByText('Seus dados')).toBeInTheDocument();
    expect(screen.getByLabelText('Data de nascimento')).toHaveValue('1992-03-04');
    expect(screen.getByLabelText('Altura (cm)')).toHaveValue(165);
    expect(screen.getByLabelText('Telefone')).toHaveValue('911577317');
    expect(screen.getByRole('button', { name: 'Emagrecimento' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pardo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText(/Peso corporal/)).toBeNull();
  });

  it('peso aparece e é obrigatório sem pesagem nos últimos 15 dias; envia os dados do perfil', async () => {
    const posts = setup(true);
    await screen.findByText('Seus dados');
    fireEvent.click(screen.getByText('Low carb'));
    fireEvent.click(screen.getByText('Cutting'));
    fireEvent.click(screen.getByText('Enviar Questionário'));
    await new Promise(r => setTimeout(r, 20));
    expect(posts).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/Peso corporal/), { target: { value: '64.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hipertrofia' }));
    fireEvent.change(screen.getByLabelText('Outro objetivo'), { target: { value: 'chegar aos 60 kg' } });
    fireEvent.click(screen.getByText('Enviar Questionário'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].perfil).toMatchObject({
      data_nascimento: '1992-03-04', altura: '165', telefone: '+351 911577317', raca: 'pardo', objetivo: 'Hipertrofia, Emagrecimento, Outro: chegar aos 60 kg', peso: '64.5',
    });
  });

  it('altura fora de 100–250 não envia', async () => {
    const posts = setup(false);
    await screen.findByText('Seus dados');
    fireEvent.click(screen.getByText('Low carb'));
    fireEvent.click(screen.getByText('Cutting'));
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '80' } });
    fireEvent.click(screen.getByText('Enviar Questionário'));
    await new Promise(r => setTimeout(r, 20));
    expect(posts).toHaveLength(0);
  });
});
