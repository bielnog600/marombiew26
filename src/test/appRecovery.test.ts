import { describe, it, expect, vi } from 'vitest';
import { createThrottle, MAX_CLIENT_ERRORS_PER_SESSION } from '@/lib/clientErrorLog';
import { isNumericLike } from '@/i18n/AutoTranslate';
import { releaseStaleAuthScreenLock } from '@/components/AuthScreenLockGuard';
import { withAuthTimeout, AuthNetworkTimeout } from '@/contexts/AuthContext';
import { applyWorkoutVisibleHeight } from '@/lib/workoutViewport';

describe('registro de erros do app', () => {
  it('envia no máximo 20 por sessão e não repete a mesma mensagem', () => {
    const allow = createThrottle();
    expect(allow('a')).toBe(true);
    expect(allow('a')).toBe(false);
    let sent = 1;
    for (let i = 0; i < 50; i++) if (allow(`e${i}`)) sent++;
    expect(sent).toBe(MAX_CLIENT_ERRORS_PER_SESSION);
  });
});

describe('tradução automática', () => {
  it('não mexe em tempos, faixas, cargas e números', () => {
    for (const t of ['30s', '12-15', '7,25 kg', '1/11', '00:01', '6-8', '45s']) expect(isNumericLike(t)).toBe(true);
    for (const t of ['Próximo', 'Finalizar', 'MOBILIDADE TORÁCICA']) expect(isNumericLike(t)).toBe(false);
  });
});

describe('trava da tela de login', () => {
  it('é removida fora de /login e /cadastro e mantida neles', () => {
    const root = document.createElement('html');
    root.classList.add('auth-screen-open');
    expect(releaseStaleAuthScreenLock('/login', root)).toBe(false);
    expect(root.classList.contains('auth-screen-open')).toBe(true);
    expect(releaseStaleAuthScreenLock('/treino-execucao', root)).toBe(true);
    expect(root.classList.contains('auth-screen-open')).toBe(false);
  });
});

describe('abertura com rede presa', () => {
  it('desiste do servidor depois do prazo em vez de esperar para sempre', async () => {
    vi.useFakeTimers();
    const p = withAuthTimeout(new Promise(() => {}), 6000);
    vi.advanceTimersByTime(6000);
    await expect(p).rejects.toBeInstanceOf(AuthNetworkTimeout);
    vi.useRealTimers();
  });
});

describe('altura da tela de treino', () => {
  it('no navegador usa a altura visível para os botões do rodapé não ficarem escondidos', () => {
    Object.defineProperty(window, 'innerHeight', { value: 664, configurable: true });
    const stop = applyWorkoutVisibleHeight();
    expect(document.documentElement.classList.contains('workout-browser')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--workout-visible-h')).toBe('664px');
    stop();
    expect(document.documentElement.classList.contains('workout-browser')).toBe(false);
  });
});
