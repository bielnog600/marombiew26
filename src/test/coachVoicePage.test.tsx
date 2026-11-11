import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VOICE_CATALOG } from '@/lib/liveCorrection/voice/phrases';

(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const db = vi.hoisted(() => ({ phrases: [] as any[], config: null as any, upserts: [] as any[], takes: [] as any[] }));
const calls = vi.hoisted(() => ({ list: [] as any[], failOn: null as string | null }));

vi.mock('@/components/AppLayout', () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => {
  const result = (data: any) => Promise.resolve({ data, error: null });
  return {
    supabase: {
      from: (table: string) => {
        if (table === 'coach_voice_config') return {
          select: () => ({ eq: () => ({ maybeSingle: () => result(db.config) }) }),
          upsert: (row: any) => { db.config = row; db.upserts.push(row); return result(null); },
        };
        if (table === 'coach_voice_phrases') return {
          select: () => result([...db.phrases]),
          upsert: (rows: any[]) => { for (const r of rows) if (!db.phrases.some((p) => p.phrase_key === r.phrase_key)) db.phrases.push({ ...r, approved_take_id: null }); return result(null); },
          update: () => ({ eq: () => result(null) }),
        };
        if (table === 'coach_voice_templates') return { select: () => ({ order: () => result([]) }) };
        if (table === 'students_profile') return { select: () => ({ eq: () => result([]) }) };
        return { select: () => ({ order: () => result([...db.takes]) }) };
      },
      storage: { from: () => ({ createSignedUrls: () => result([]) }) },
      rpc: () => result(null),
    },
  };
});
vi.mock('@/lib/coachVoice/api', async (orig) => {
  const real = await orig<typeof import('@/lib/coachVoice/api')>();
  return {
    ...real,
    callCoachVoice: vi.fn(async (body: any) => {
      calls.list.push(body);
      if (body.action === 'list_voices') return { voices: [{ voice_id: 'other', name: 'Rachel', category: null, preview_url: null }, { voice_id: 'fab', name: 'Fabiew', category: 'cloned', preview_url: null }] };
      if (body.action === 'list_models') return { models: [{ model_id: 'eleven_multilingual_v2', name: 'Multilingual v2' }], default_model_id: 'eleven_multilingual_v2' };
      if (body.phrase_key === calls.failOn) throw new Error('Acabou a cota de caracteres do ElevenLabs.');
      return { take: { id: `t-${body.phrase_key}`, phrase_key: body.phrase_key, file_path: `${body.phrase_key}/1.mp3`, texto: 'x', voice_id: 'fab', model_id: 'm', settings: {}, approved: false, created_at: new Date().toISOString() } };
    }),
  };
});

import VozCorrecaoAoVivo from '@/pages/VozCorrecaoAoVivo';

const render = (ui: React.ReactElement, path = '/voz-correcao-ao-vivo') => rtlRender(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
const numberKeys = VOICE_CATALOG.filter((p) => p.category === 'numeros').map((p) => p.key);
const statuses = (text: string) => screen.queryAllByTestId(/^coach-voice-status-/).filter((el) => el.textContent === text);

beforeEach(() => {
  db.phrases = [{ phrase_key: 'desce_mais', texto: 'Desce mais!', categoria: 'x', approved_take_id: null }];
  db.config = null; db.upserts = []; db.takes = [];
  calls.list = []; calls.failOn = null;
  window.localStorage.clear();
});

describe('Voz da Correção ao vivo — tela do admin', () => {
  it('fala nova no código entra como "sem áudio" e a voz "Fabiew" é pré-escolhida', async () => {
    render(<VozCorrecaoAoVivo />);
    await waitFor(() => expect(screen.getByTestId('coach-voice-counter')).toHaveTextContent(`0 de ${VOICE_CATALOG.length} aprovadas`));
    await waitFor(() => expect(db.phrases).toHaveLength(VOICE_CATALOG.length));
    // Texto editado antes continua (não é sobrescrito pelo do código).
    expect(db.phrases.find((p) => p.phrase_key === 'desce_mais').texto).toBe('Desce mais!');
    await waitFor(() => expect(db.config).toMatchObject({ voice_id: 'fab', voice_name: 'Fabiew', model_id: 'eleven_multilingual_v2', stability: 0.4, similarity_boost: 1 }));
    // Falas com nome começam desligadas.
    expect(db.config.name_phrases_enabled).toBe(false);
    expect(screen.getByTestId('coach-voice-names-toggle')).toHaveAttribute('data-state', 'unchecked');
  });

  it('aba Números: só os números, contador da aba e "Gerar sem áudio desta aba" para no primeiro erro', async () => {
    window.localStorage.setItem('coachVoice.lastTab', 'numeros');
    calls.failOn = numberKeys[2];
    render(<VozCorrecaoAoVivo />);
    await waitFor(() => expect(screen.getByTestId('coach-voice-tab-counter-numeros')).toHaveTextContent(`0 de ${numberKeys.length} aprovadas`));
    expect(statuses('Sem áudio')).toHaveLength(numberKeys.length);
    const btn = screen.getByTestId('coach-voice-generate-tab-numeros');
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await screen.findByText(/Parou em/);
    const gens = calls.list.filter((c) => c.action === 'generate').map((c) => c.phrase_key);
    expect(gens).toEqual(numberKeys.slice(0, 3));
    expect(statuses('Para aprovar')).toHaveLength(2);
    // Filtro "Para aprovar" mostra só as duas geradas.
    fireEvent.click(screen.getByRole('button', { name: 'Para aprovar' }));
    expect(screen.queryAllByTestId(/^coach-voice-status-/)).toHaveLength(2);
  });

  it('lembra a última aba aberta e mostra as correções por exercício', async () => {
    render(<VozCorrecaoAoVivo />);
    await screen.findByTestId('coach-voice-counter');
    fireEvent.mouseDown(screen.getByTestId('coach-voice-tab-correcoes'));
    expect(window.localStorage.getItem('coachVoice.lastTab')).toBe('correcoes');
    expect(await screen.findByTestId('coach-voice-group-squat')).toBeInTheDocument();
    expect(screen.getByTestId('coach-voice-group-plank')).toBeInTheDocument();
  });

  it('aba Com nome desligada: aviso com chave para religar e sem "Gerar falas com nome"', async () => {
    window.localStorage.setItem('coachVoice.lastTab', 'nomes');
    render(<VozCorrecaoAoVivo />);
    expect(await screen.findByTestId('coach-voice-names-disabled')).toHaveTextContent('Falas com nome desativadas');
    expect(screen.queryByTestId('coach-voice-generate-names')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Religar falas com nome do aluno' }));
    await waitFor(() => expect(db.config).toMatchObject({ name_phrases_enabled: true }));
    expect(await screen.findByTestId('coach-voice-generate-names')).toBeInTheDocument();
    expect(screen.queryByTestId('coach-voice-names-disabled')).toBeNull();
  });
});
