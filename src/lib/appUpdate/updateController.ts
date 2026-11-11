/**
 * Decide QUANDO aplicar uma versão nova do app instalado, para nunca recarregar
 * no meio do uso nem entrar em loop. A versão nova só é aplicada:
 *  - ao ir para segundo plano (no máximo 1 tentativa automática a cada 10 min e
 *    nunca de novo para a mesma versão em espera já tentada);
 *  - no toque do usuário em "Atualizar".
 * Nunca na abertura do app e nunca com uma tela protegida aberta (treino, câmera).
 *
 * O aviso só aparece se a versão publicada (app-version.json) for diferente da
 * que está rodando. Recarrega quando o service worker novo assume
 * (controllerchange), uma única vez. Se ele não assumir em 8 s (iOS com o SW
 * preso em espera), remove o SW do app, apaga só os caches do app e recarrega
 * uma vez pela rede (no máximo 1 vez a cada 10 min). Se depois disso ainda
 * houver SW esperando, o aviso fica escondido por 24 h.
 * Troca feita por outro app aberto (controllerchange não pedido) não recarrega
 * no meio do uso: só ao ir para segundo plano ou no toque.
 */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Intervalo mínimo entre tentativas automáticas (persistido entre aberturas). */
export const AUTO_APPLY_COOLDOWN_MS = 10 * 60 * 1000;
/** Tempo para o service worker novo assumir antes do plano B. */
export const TAKEOVER_TIMEOUT_MS = 8 * 1000;
/** Intervalo mínimo entre recuperações (remover SW + recarregar pela rede). */
export const RECOVERY_COOLDOWN_MS = 10 * 60 * 1000;
/** Quanto tempo esconder o aviso quando o SW continua preso após a recuperação. */
export const SUPPRESS_NOTICE_MS = 24 * 60 * 60 * 1000;
export const APPLY_ATTEMPT_KEY = 'marombiew:sw-apply-attempt';
export const RECOVERY_KEY = 'marombiew:sw-recovery';
export const SUPPRESS_KEY = 'marombiew:sw-update-hidden';
/** Telas onde nunca recarregar, mesmo sem a trava registrada pelo componente. */
export const PROTECTED_PATHS = ['/treino-execucao', '/correcao-ao-vivo-teste'];

/** Caches do app que a recuperação apaga; imagens e fontes ficam. */
export function isAppShellCache(name: string): boolean {
  return name.startsWith('workbox-precache') || name === 'html-cache';
}

export type ApplyReason = 'hidden' | 'user';

export interface UpdateState {
  available: boolean;
  held: boolean;
  /** A troca não concluiu e a recuperação já foi usada: fechar e abrir o app. */
  stalled: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Deps {
  getPathname: () => string;
  isVisible: () => boolean;
  storage?: () => StorageLike | null;
  now?: () => number;
  reload?: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Versão que está rodando (meta app-version / __APP_VERSION__). */
  runningVersion?: string | null;
  /** Versão publicada (app-version.json sem cache); null quando não deu para ler. */
  fetchPublishedVersion?: () => Promise<string | null>;
  /** Remove o SW do app e apaga os caches do app (plano B). */
  recover?: () => Promise<void>;
}

type Mode = 'waiting' | 'activated';

export function createUpdateController(deps: Deps) {
  const now = deps.now ?? (() => Date.now());
  const reload = deps.reload ?? (() => window.location.reload());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const running = deps.runningVersion ?? null;
  const getStorage = (): StorageLike | null => {
    try { return deps.storage ? deps.storage() : (typeof localStorage === 'undefined' ? null : localStorage); }
    catch { return null; }
  };

  let applier: (() => void | Promise<void>) | null = null;
  let waitingId: string | null = null;
  let mode: Mode = 'waiting';
  let checkGen = 0;
  let checking = false;
  let upToDate = false;
  let suppressed = false;
  let applying = false;
  let stalled = false;
  let reloaded = false;
  let timer: unknown = null;
  const holds = new Set<symbol>();
  const listeners = new Set<() => void>();

  const isHeld = () => holds.size > 0 || PROTECTED_PATHS.includes(deps.getPathname());
  const notify = () => listeners.forEach(listener => listener());

  const read = <T,>(key: string): T | null => {
    try {
      const raw = getStorage()?.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed as T : null;
    } catch { return null; }
  };
  const write = (key: string, value: unknown) => {
    try { getStorage()?.setItem(key, JSON.stringify(value)); } catch { /* sem storage */ }
  };
  const recentlyAt = (rec: { at?: unknown } | null, windowMs: number) =>
    !!rec && typeof rec.at === 'number' && now() - rec.at < windowMs;

  /** Tentativa automática bloqueada: houve tentativa recente ou esta versão já foi tentada. */
  const autoBlocked = (): boolean => {
    const last = read<{ at?: number; id?: string | null }>(APPLY_ATTEMPT_KEY);
    if (!last || typeof last.at !== 'number') return false;
    if (recentlyAt(last, AUTO_APPLY_COOLDOWN_MS)) return true;
    return waitingId !== null && last.id === waitingId;
  };

  const suppressionActive = (published: string | null): boolean => {
    const s = read<{ until?: number; running?: string | null; published?: string | null }>(SUPPRESS_KEY);
    if (!s || typeof s.until !== 'number' || s.until <= now()) return false;
    if ((s.running ?? null) !== running) return false;
    // Uma versão publicada mais nova que a do momento em que escondemos volta a avisar.
    return !published || published === (s.published ?? null);
  };

  const clearTimerIfAny = () => { if (timer !== null) { clearTimer(timer); timer = null; } };

  const hardReload = () => {
    reloaded = true;
    clearTimerIfAny();
    notify();
    reload();
  };

  /** Plano B: o SW novo não assumiu. Remove o SW do app e recarrega pela rede, uma vez. */
  const onStall = () => {
    timer = null;
    if (reloaded) return;
    applying = false;
    if (recentlyAt(read(RECOVERY_KEY), RECOVERY_COOLDOWN_MS)) {
      stalled = true;
      notify();
      return;
    }
    write(RECOVERY_KEY, { at: now(), from: running });
    reloaded = true;
    notify();
    const run = deps.recover ?? (async () => undefined);
    void Promise.resolve()
      .then(() => run())
      .catch(() => undefined)
      .then(() => reload());
  };

  const evaluate = () => {
    const gen = ++checkGen;
    checking = true;
    notify();
    const fetchVersion = deps.fetchPublishedVersion ?? (async () => null);
    void Promise.resolve()
      .then(() => fetchVersion())
      .catch(() => null)
      .then((published) => {
        if (gen !== checkGen) return;
        checking = false;
        upToDate = !!published && !!running && published === running;
        suppressed = false;
        if (!upToDate) {
          if (suppressionActive(published)) {
            suppressed = true;
          } else if (recentlyAt(read(RECOVERY_KEY), RECOVERY_COOLDOWN_MS)) {
            // Recarregamos pela rede há pouco e ainda há SW esperando: esconde por 24 h.
            write(SUPPRESS_KEY, { until: now() + SUPPRESS_NOTICE_MS, running, published });
            suppressed = true;
          }
        }
        if (!upToDate && !suppressed && !deps.isVisible() && apply('hidden')) return;
        notify();
      });
  };

  const canOffer = () => !!applier && !checking && !upToDate && !suppressed && !reloaded;

  const apply = (reason: ApplyReason): boolean => {
    if (!canOffer() || applying) return false;
    if (isHeld()) return false;
    if (reason !== 'user' && autoBlocked()) return false;
    write(APPLY_ATTEMPT_KEY, { at: now(), id: waitingId });
    stalled = false;
    if (mode === 'activated') {
      // O SW novo já assumiu (pedido por outro app): basta recarregar uma vez.
      hardReload();
      return true;
    }
    applying = true;
    notify();
    const run = applier!;
    clearTimerIfAny();
    timer = setTimer(onStall, TAKEOVER_TIMEOUT_MS);
    void Promise.resolve()
      .then(() => run())
      .catch(() => {
        clearTimerIfAny();
        applying = false;
        notify();
      });
    return true;
  };

  return {
    markAvailable(next: () => void | Promise<void>, id: string | null = null) {
      if (reloaded || applying) return;
      if (mode === 'activated') return; // já há SW novo no controle; falta só recarregar
      applier = next;
      waitingId = id;
      evaluate();
    },
    apply,
    onHidden() { return apply('hidden'); },
    /**
     * service worker novo assumiu. Pedido por nós: recarrega uma única vez.
     * Não pedido (outro app trocou): não recarrega agora; fica para o segundo plano/toque.
     */
    onControllerChange(): boolean {
      if (reloaded) return false;
      if (applying) { hardReload(); return true; }
      if (mode !== 'activated') {
        mode = 'activated';
        applier = applier ?? (() => undefined);
        evaluate();
      }
      return false;
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
      return { available: canOffer() && !applying && !stalled, held: isHeld(), stalled: stalled && !reloaded };
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type UpdateController = ReturnType<typeof createUpdateController>;

declare const __APP_VERSION__: string | undefined;

const readRunningVersion = (): string | null => {
  try {
    if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__) return __APP_VERSION__;
  } catch { /* não definido (testes) */ }
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content || null;
};

export const appRunningVersion = readRunningVersion();

export async function fetchPublishedAppVersion(): Promise<string | null> {
  try {
    const res = await fetch('/app-version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' && data.version ? data.version : null;
  } catch { return null; }
}

/** Remove só o SW do app (/sw.js; OneSignal fica) e apaga só os caches do app. */
export async function recoverFromStuckServiceWorker(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    const isAppSw = (url?: string) => !!url && new URL(url).pathname === '/sw.js';
    await Promise.allSettled(
      regs
        .filter(r => [r.active, r.waiting, r.installing].some(w => isAppSw(w?.scriptURL)))
        .map(r => r.unregister()),
    );
  }
  if (typeof caches !== 'undefined') {
    const names = await caches.keys();
    await Promise.allSettled(names.filter(isAppShellCache).map(n => caches.delete(n)));
  }
}

export const appUpdates: UpdateController = createUpdateController({
  getPathname: () => (typeof window === 'undefined' ? '/' : window.location.pathname),
  isVisible: () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'),
  runningVersion: appRunningVersion,
  fetchPublishedVersion: fetchPublishedAppVersion,
  recover: recoverFromStuckServiceWorker,
});
