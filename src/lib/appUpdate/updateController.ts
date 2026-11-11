/**
 * Decide QUANDO aplicar uma versão nova do app instalado, para nunca recarregar
 * no meio do uso nem entrar em loop. A versão nova só é aplicada:
 *  - ao ir para segundo plano (no máximo 1 tentativa automática a cada 10 min e
 *    nunca de novo para a mesma versão em espera já tentada);
 *  - no toque do usuário em "Atualizar".
 * Nunca na abertura do app e nunca com uma tela protegida aberta (treino, câmera).
 * O recarregamento acontece só quando o service worker novo assume
 * (controllerchange), uma única vez. Sem isso em 8 s, não recarrega e pede para
 * fechar e abrir o app.
 */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Intervalo mínimo entre tentativas automáticas (persistido entre aberturas). */
export const AUTO_APPLY_COOLDOWN_MS = 10 * 60 * 1000;
/** Tempo para o service worker novo assumir antes de desistir sem recarregar. */
export const TAKEOVER_TIMEOUT_MS = 8 * 1000;
export const APPLY_ATTEMPT_KEY = 'marombiew:sw-apply-attempt';
/** Telas onde nunca recarregar, mesmo sem a trava registrada pelo componente. */
export const PROTECTED_PATHS = ['/treino-execucao', '/correcao-ao-vivo-teste'];

export type ApplyReason = 'hidden' | 'user';

export interface UpdateState {
  available: boolean;
  held: boolean;
  /** A troca não concluiu: o usuário precisa fechar e abrir o app. */
  stalled: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Attempt { at: number; id: string | null }

interface Deps {
  getPathname: () => string;
  isVisible: () => boolean;
  storage?: () => StorageLike | null;
  now?: () => number;
  reload?: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createUpdateController(deps: Deps) {
  const now = deps.now ?? (() => Date.now());
  const reload = deps.reload ?? (() => window.location.reload());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const getStorage = (): StorageLike | null => {
    try { return deps.storage ? deps.storage() : (typeof localStorage === 'undefined' ? null : localStorage); }
    catch { return null; }
  };

  let applier: (() => void | Promise<void>) | null = null;
  let waitingId: string | null = null;
  let applying = false;
  let stalled = false;
  let reloaded = false;
  let timer: unknown = null;
  const holds = new Set<symbol>();
  const listeners = new Set<() => void>();

  const isHeld = () => holds.size > 0 || PROTECTED_PATHS.includes(deps.getPathname());
  const notify = () => listeners.forEach(listener => listener());

  const readAttempt = (): Attempt | null => {
    try {
      const raw = getStorage()?.getItem(APPLY_ATTEMPT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.at !== 'number') return null;
      return { at: parsed.at, id: typeof parsed.id === 'string' ? parsed.id : null };
    } catch { return null; }
  };
  const writeAttempt = () => {
    try { getStorage()?.setItem(APPLY_ATTEMPT_KEY, JSON.stringify({ at: now(), id: waitingId })); } catch { /* sem storage */ }
  };

  /** Tentativa automática bloqueada: houve tentativa recente ou esta versão já foi tentada. */
  const autoBlocked = (): boolean => {
    const last = readAttempt();
    if (!last) return false;
    if (now() - last.at < AUTO_APPLY_COOLDOWN_MS) return true;
    return waitingId !== null && last.id === waitingId;
  };

  const apply = (reason: ApplyReason): boolean => {
    if (!applier || applying || reloaded) return false;
    if (isHeld()) return false;
    if (reason !== 'user' && autoBlocked()) return false;
    applying = true;
    stalled = false;
    writeAttempt();
    notify();
    const run = applier;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      if (reloaded) return;
      applying = false;
      stalled = true;
      notify();
    }, TAKEOVER_TIMEOUT_MS);
    void Promise.resolve()
      .then(() => run())
      .catch(() => {
        if (timer !== null) { clearTimer(timer); timer = null; }
        applying = false;
        notify();
      });
    return true;
  };

  return {
    markAvailable(next: () => void | Promise<void>, id: string | null = null) {
      applier = next;
      waitingId = id;
      if (!deps.isVisible() && apply('hidden')) return;
      notify();
    },
    apply,
    onHidden() { return apply('hidden'); },
    /** service worker novo assumiu: recarrega uma única vez, só se nós pedimos a troca. */
    onControllerChange(): boolean {
      if (!applying || reloaded) return false;
      reloaded = true;
      if (timer !== null) { clearTimer(timer); timer = null; }
      reload();
      return true;
    },
    hold(): () => void {
      const token = Symbol('app-update-hold');
      holds.add(token);
      notify();
      return () => {
        if (holds.delete(token)) notify();
      };
    },
    getState(): UpdateState {
      return { available: applier !== null && !applying && !stalled, held: isHeld(), stalled };
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
  isVisible: () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'),
});
