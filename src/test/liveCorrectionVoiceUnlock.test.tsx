import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), insert: () => Promise.resolve({ error: null }) }) },
}));

const voice = vi.hoisted(() => ({
  unlock: vi.fn(),
  preload: vi.fn(() => Promise.resolve()),
  prepare: vi.fn(() => Promise.resolve()),
  say: vi.fn(),
  cancel: vi.fn(),
  readyCount: 0,
  getStatus: vi.fn(() => ({ listed: true, approved: 77, ready: 76, loadErrors: 0, contextState: 'running', unlocked: true, lastPlayFailed: false, mode: 'audio', playedMode: 'audio' })),
  subscribe: vi.fn(() => () => undefined),
  outputs: {},
}));
vi.mock('@/lib/liveCorrection/voice/browserVoice', () => ({ createCoachVoice: () => voice, COACH_VOICE_BUCKET: 'coach-voice' }));

import LiveCorrectionScreen from '@/components/liveCorrection/LiveCorrectionScreen';

describe('Correção ao vivo — liberar o som do iPhone', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('baixa os áudios ao abrir a tela, com 3-2-1 e as correções do exercício primeiro', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="AGACHAMENTO LIVRE" onClose={() => undefined} />);
    expect(voice.preload).toHaveBeenCalledTimes(1);
    const prio = (voice.preload.mock.calls[0] as unknown as [string[]])[0];
    expect(prio.slice(0, 4)).toEqual(['numero_3', 'numero_2', 'numero_1', 'pode_comecar']);
    expect(prio).toContain('desce_mais');
  });

  it('"Começar" chama unlock na hora do toque (antes de abrir a câmera)', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="AGACHAMENTO LIVRE" onClose={() => undefined} />);
    voice.unlock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }));
    expect(voice.unlock).toHaveBeenCalled();
  });

  it('"Tentar de novo" também libera o som', async () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="AGACHAMENTO LIVRE" onClose={() => undefined} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Começar' })); });
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' });
    voice.unlock.mockClear();
    fireEvent.click(retry);
    expect(voice.unlock).toHaveBeenCalled();
  });

  it('qualquer toque na tela da câmera libera o som', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="AGACHAMENTO LIVRE" onClose={() => undefined} />);
    const root = screen.getByTestId('live-correction-screen');
    voice.unlock.mockClear();
    fireEvent.touchEnd(root);
    expect(voice.unlock).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(screen.getByTestId('live-instruction'));
    expect(voice.unlock).toHaveBeenCalledTimes(2);
  });

  it('voltar do segundo plano tenta reativar o áudio', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="AGACHAMENTO LIVRE" onClose={() => undefined} />);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    fireEvent(document, new Event('visibilitychange'));
    expect(voice.prepare).toHaveBeenCalled();
  });

  it('selo de diagnóstico só aparece quando pedido', () => {
    const { unmount } = render(<LiveCorrectionScreen studentId="u1" exerciseName="AGACHAMENTO LIVRE" onClose={() => undefined} />);
    expect(screen.queryByTestId('live-voice-badge')).toBeNull();
    unmount();
    render(<LiveCorrectionScreen studentId="u1" exerciseName="AGACHAMENTO LIVRE" voiceDiagnostic onClose={() => undefined} />);
    expect(screen.getByTestId('live-voice-badge')).toHaveTextContent(/^Voz: Fabiew · audio \(76\/\d+\)$/);
  });
});
