import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CadenceBand from '@/components/cardio/CadenceBand';
import type { CadenceAudio } from '@/lib/cadenceAudio';

const plays: { tone: string; delay: number }[] = [];
const fakeAudio = (): CadenceAudio => ({ play: (tone, delay) => { plays.push({ tone, delay }); }, cancelAll: vi.fn() });

beforeEach(() => { plays.length = 0; localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-17T10:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

const T0 = new Date('2026-11-17T10:00:00Z').getTime();
const band = (over: Partial<React.ComponentProps<typeof CadenceBand>> = {}) => (
  <CadenceBand rpm={70} anchorMs={T0} blockEndMs={T0 + 120_000} paused={false} playerMuted={false} audioFactory={fakeAudio} {...over} />
);

describe('Faixa de cadência', () => {
  it('mostra "70 rpm", a dica e pisca no ritmo com beep (acento a cada 4 voltas)', async () => {
    render(band());
    expect(screen.getByTestId('cadence-rpm')).toHaveTextContent('70');
    expect(screen.getByTestId('cadence-band')).toHaveTextContent('Pedala no ritmo da luz · 1 piscada = 1 volta');
    expect(screen.getByTestId('cadence-band')).toHaveAttribute('data-interval-ms', '857');
    await act(async () => { vi.advanceTimersByTime(59_900); });
    // 70 batidas no minuto; a primeira (bipe de troca de fase) fica sem som
    expect(plays.length).toBe(69);
    expect(plays.filter(p => p.tone === 'beepAccent').length).toBe(17);
  });

  it('mudo não toca, mas a luz continua', async () => {
    render(band());
    fireEvent.click(screen.getByRole('button', { name: 'Silenciar cadência' }));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(plays.length).toBe(0);
    expect(JSON.parse(localStorage.getItem('cardio-cadence-prefs')!).sound).toBe('mute');
  });

  it('player mudo no topo também cala a cadência', async () => {
    render(band({ playerMuted: true }));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(plays.length).toBe(0);
  });

  it('pausar para luz e beep', async () => {
    const { rerender } = render(band());
    await act(async () => { vi.advanceTimersByTime(5_000); });
    const n = plays.length;
    rerender(band({ paused: true }));
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(plays.length).toBe(n);
    expect(screen.getByTestId('cadence-band')).toHaveAttribute('data-flash', 'false');
  });

  it('configuração "Cada perna (2×)" e "Clique" ficam lembradas e dobram as batidas', async () => {
    render(band());
    fireEvent.click(screen.getByRole('button', { name: 'Configurar cadência' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cada perna (2×)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clique' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));
    expect(screen.getByTestId('cadence-band')).toHaveAttribute('data-interval-ms', '429');
    expect(JSON.parse(localStorage.getItem('cardio-cadence-prefs')!)).toMatchObject({ mode: 'perna', sound: 'click' });
    plays.length = 0;
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(plays.length).toBeGreaterThanOrEqual(138);
    expect(plays.every(p => p.tone.startsWith('click'))).toBe(true);
  });

  it('nos 3 s finais do bloco a cadência não bipa (ficam os 3 bipes de aviso)', async () => {
    render(band({ blockEndMs: T0 + 10_000 }));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    // batidas 1..8 (até 6,9 s); a 0 é o bipe de troca e as de 7,7 s e 8,6 s caem no 3-2-1
    expect(plays.length).toBe(8);
  });
});
