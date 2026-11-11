/**
 * Decide QUANDO aplicar uma versão nova do app instalado, para nunca recarregar
 * no meio do uso. A versão nova só entra quando:
 *  - o app vai para segundo plano (aba/tela escondida);
 *  - na abertura do app (versão nova já esperando ao carregar);
 *  - o usuário toca em "Atualizar".
 * Nunca enquanto houver uma tela protegida aberta (execução de treino, câmera).
 */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Versão nova detectada até este tempo após abrir o app conta como "na abertura". */
export const BOOT_APPLY_WINDOW_MS = 10 * 1000;
/** Telas onde nunca recarregar, mesmo sem a trava registrada pelo componente. */
export const PROTECTED_PATHS = ['/treino-execucao', '/correcao-ao-vivo-teste'];

export type ApplyReason = 'hidden' | 'boot' | 'user';

export interface UpdateState {
  available: boolean;
  held: boolean;
}

interface Deps {
  getPathname: () => string;
  sinceLoadMs: () => number;
  isVisible: () => boolean;
}

export function createUpdateController(deps: Deps) {
  let applier: (() => void | Promise<void>) | null = null;
  let applying = false;
  const holds = new Set<symbol>();
  const listeners = new Set<() => void>();

  const isHeld = () => holds.size > 0 || PROTECTED_PATHS.includes(deps.getPathname());
  const notify = () => listeners.forEach(listener => listener());

  const apply = (reason: ApplyReason): boolean => {
    if (!applier || applying) return false;
    if (isHeld()) return false;
    void reason;
    applying = true;
    const run = applier;
    void Promise.resolve()
      .then(() => run())
      .catch(() => { applying = false; });
    return true;
  };

  return {
    markAvailable(next: () => void | Promise<void>) {
      applier = next;
      if (deps.isVisible() && deps.sinceLoadMs() <= BOOT_APPLY_WINDOW_MS) {
        if (apply('boot')) return;
      } else if (!deps.isVisible()) {
        if (apply('hidden')) return;
      }
      notify();
    },
    apply,
    onHidden() { return apply('hidden'); },
    hold(): () => void {
      const token = Symbol('app-update-hold');
      holds.add(token);
      notify();
      return () => {
        if (holds.delete(token)) notify();
      };
    },
    getState(): UpdateState {
      return { available: applier !== null && !applying, held: isHeld() };
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type UpdateController = ReturnType<typeof createUpdateController>;

export const appUpdates: UpdateController = createUpdateController({
  getPathname: () => (typeof window === 'undefined' ? '/' : window.location.pathname),
  sinceLoadMs: () => (typeof performance === 'undefined' ? Number.POSITIVE_INFINITY : performance.now()),
  isVisible: () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'),
});
