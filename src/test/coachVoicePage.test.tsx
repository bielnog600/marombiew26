import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

beforeEach(() => {
  db.phrases = [{ phrase_key: 'desce_mais', texto: 'Desce mais!', categoria: 'x', approved_take_id: null }];
  db.config = null; db.upserts = []; db.takes = [];
  calls.list = []; calls.failOn = null;
});

describe('Voz da Correção ao vivo — tela do admin', () => {
  it('fala nova no código entra como "sem áudio" e a voz "Fabiew" é pré-escolhida', async () => {
    render(<VozCorrecaoAoVivo />);
    await waitFor(() => expect(screen.getByTestId('coach-voice-counter')).toHaveTextContent(`0 de ${VOICE_CATALOG.length} aprovadas`));
    await waitFor(() => expect(db.phrases).toHaveLength(VOICE_CATALOG.length));
    // Texto editado antes continua (não é sobrescrito pelo do código).
    expect(db.phrases.find((p) => p.phrase_key === 'desce_mais').texto).toBe('Desce mais!');
    await waitFor(() => expect(db.config).toMatchObject({ voice_id: 'fab', voice_name: 'Fabiew', model_id: 'eleven_multilingual_v2', stability: 0.4, similarity_boost: 1 }));
    expect(screen.getAllByText('Sem áudio').length).toBe(VOICE_CATALOG.length);
  });

  it('"Gerar todas sem áudio" gera uma por vez e para no primeiro erro', async () => {
    calls.failOn = VOICE_CATALOG[2].key;
    render(<VozCorrecaoAoVivo />);
    const btn = await screen.findByTestId('coach-voice-generate-all');
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await screen.findByText(/Parou em/);
    const gens = calls.list.filter((c) => c.action === 'generate').map((c) => c.phrase_key);
    expect(gens).toEqual([VOICE_CATALOG[0].key, VOICE_CATALOG[1].key, VOICE_CATALOG[2].key]);
    expect(screen.getAllByText('Para aprovar')).toHaveLength(2);
  });
});
