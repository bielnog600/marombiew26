/** App instalado na tela inicial (PWA) — lá 100lvh é a altura certa. */
export const isStandaloneDisplay = (): boolean => {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
    return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  } catch {
    return false;
  }
};

/**
 * No navegador, a tela de treino usa a altura VISÍVEL (sem a barra do Safari/Chrome),
 * para os botões do rodapé nunca ficarem escondidos. Retorna a limpeza.
 */
export function applyWorkoutVisibleHeight(): () => void {
  if (isStandaloneDisplay()) return () => undefined;
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const update = () => {
    const h = Math.round(viewport?.height ?? window.innerHeight);
    if (h > 0) root.style.setProperty('--workout-visible-h', `${h}px`);
  };
  root.classList.add('workout-browser');
  update();
  viewport?.addEventListener('resize', update);
  window.addEventListener('resize', update);
  return () => {
    viewport?.removeEventListener('resize', update);
    window.removeEventListener('resize', update);
    root.classList.remove('workout-browser');
    root.style.removeProperty('--workout-visible-h');
  };
}
