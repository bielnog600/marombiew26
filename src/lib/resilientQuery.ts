/**
 * Short timeout + automatic retries for a single read. A slow/overloaded backend gets a couple of
 * spaced attempts before the screen shows a failure, and an attempt that hangs is abandoned
 * (aborted) instead of keeping the screen waiting.
 */
export interface ResilientOptions {
  /** Per-attempt limit. */
  timeoutMs?: number;
  /** Waits before each retry; its length is the number of retries. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export interface QueryLikeResult {
  error: unknown;
}

export const DASHBOARD_QUERY_TIMEOUT_MS = 6000;
export const DASHBOARD_RETRY_DELAYS_MS = [800, 2000];

export const TIMEOUT_ERROR = { code: 'TIMEOUT', message: 'A consulta demorou demais' } as const;

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function resilientQuery<T extends QueryLikeResult>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  {
    timeoutMs = DASHBOARD_QUERY_TIMEOUT_MS,
    retryDelaysMs = DASHBOARD_RETRY_DELAYS_MS,
    sleep = defaultSleep,
  }: ResilientOptions = {},
): Promise<T> {
  let last: T | null = null;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    if (attempt > 0) await sleep(retryDelaysMs[attempt - 1]);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ data: null, count: null, error: TIMEOUT_ERROR } as unknown as T);
      }, timeoutMs);
    });
    try {
      last = await Promise.race([
        Promise.resolve(run(controller.signal)).catch(error => ({ data: null, count: null, error }) as unknown as T),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!last.error) return last;
  }
  return last as T;
}
