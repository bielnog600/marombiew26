type Loader = () => Promise<unknown>;

/**
 * Pré-carrega telas uma a uma quando o aparelho está ocioso.
 * Retorna uma função que cancela o restante.
 */
export function preloadWhenIdle(loaders: Loader[], { startDelayMs = 1500 }: { startDelayMs?: number } = {}): () => void {
  let cancelled = false;
  let timer: number | undefined;
  let idleId: number | undefined;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return () => {};

  const queue = [...loaders];
  const schedule = (fn: () => void) => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) idleId = ric(fn, { timeout: 3000 });
    else timer = window.setTimeout(fn, 300);
  };
  const next = () => {
    if (cancelled) return;
    const loader = queue.shift();
    if (!loader) return;
    void loader().catch(() => undefined).finally(() => schedule(next));
  };
  timer = window.setTimeout(() => schedule(next), startDelayMs);

  return () => {
    cancelled = true;
    if (timer !== undefined) window.clearTimeout(timer);
    const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (idleId !== undefined && cic) cic(idleId);
  };
}
