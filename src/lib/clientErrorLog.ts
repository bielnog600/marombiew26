import { supabase } from '@/integrations/supabase/client';
import { appRunningVersion } from '@/lib/appUpdate/updateController';
import { isStandaloneDisplay } from '@/lib/workoutViewport';

/** Máximo de erros enviados por sessão do navegador (evita inundar o banco). */
export const MAX_CLIENT_ERRORS_PER_SESSION = 20;
const COUNT_KEY = 'mw_client_errors_sent';
const PENDING_KEY = 'mw_client_errors_pending';
/** Gravado pelo vigia do index.html quando o app não montou a tempo. */
export const BOOT_FAILURE_KEY = 'mw_boot_failure';

export type ClientErrorKind = 'error' | 'unhandledrejection' | 'boundary' | 'chunk' | 'boot';

export interface ClientErrorRow {
  /** Gerado no aparelho: reenviar a mesma linha nunca duplica. */
  id: string;
  kind: ClientErrorKind;
  message: string;
  stack: string | null;
  route: string;
  user_agent: string;
  app_version: string | null;
  online: boolean;
  standalone: boolean;
  language: string | null;
  created_at?: string;
}

/** Decide se um erro entra: limite por sessão e sem repetir a mesma mensagem. */
export function createThrottle(max = MAX_CLIENT_ERRORS_PER_SESSION, initialCount = 0) {
  let count = initialCount;
  const seen = new Set<string>();
  return (key: string): boolean => {
    if (count >= max || seen.has(key)) return false;
    seen.add(key);
    count += 1;
    return true;
  };
}

const readSessionCount = () => {
  try { return Number(sessionStorage.getItem(COUNT_KEY) ?? 0) || 0; } catch { return 0; }
};
// Um só limitador por janela, mesmo que o módulo seja carregado duas vezes.
const allow: (key: string) => boolean = (() => {
  if (typeof window === 'undefined') return createThrottle();
  const w = window as Window & { __mwClientErrorThrottle?: (key: string) => boolean };
  return (w.__mwClientErrorThrottle ??= createThrottle(MAX_CLIENT_ERRORS_PER_SESSION, readSessionCount()));
})();

const clip = (v: string | null | undefined, n: number) => (v ? String(v).slice(0, n) : null);

const newId = () => {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(16)}0000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`.slice(0, 36); }
};

const buildRow = (kind: ClientErrorKind, message: string, stack?: string | null): ClientErrorRow => ({
  id: newId(),
  kind,
  message: clip(message, 2000) || 'Erro sem mensagem',
  stack: clip(stack ?? null, 8000),
  route: `${window.location.pathname}${window.location.search}`.slice(0, 300),
  user_agent: navigator.userAgent.slice(0, 400),
  app_version: appRunningVersion ?? null,
  online: navigator.onLine,
  standalone: isStandaloneDisplay(),
  language: document.documentElement.lang || null,
});

const readPending = (): ClientErrorRow[] => {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
};
const writePending = (rows: ClientErrorRow[]) => {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(rows.slice(-10))); } catch { /* sem storage */ }
};

async function send(rows: ClientErrorRow[]): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid || !navigator.onLine) return false;
    let allOk = true;
    for (const row of rows) {
      const { error } = await supabase.from('client_errors').insert({ ...row, user_id: uid });
      // 23505 = já gravado antes (resposta perdida num recarregamento): conta como enviado.
      if (error && error.code !== '23505') allOk = false;
    }
    return allOk;
  } catch {
    return false;
  }
}

/** Registra um erro do app. Nunca lança: falha de log não pode quebrar a tela. */
export function reportClientError(kind: ClientErrorKind, error: unknown, extraStack?: string | null) {
  try {
    const err = error instanceof Error ? error : null;
    const message = err ? `${err.name}: ${err.message}` : typeof error === 'string' ? error : JSON.stringify(error ?? null);
    if (!allow(`${kind}|${message}`)) return;
    try { sessionStorage.setItem(COUNT_KEY, String(readSessionCount() + 1)); } catch { /* ok */ }
    const row = buildRow(kind, message, [err?.stack, extraStack].filter(Boolean).join('\n---\n') || null);
    void send([row]).then(ok => { if (!ok) writePending([...readPending(), row]); });
  } catch {
    /* nunca propaga */
  }
}

/** Envia erros guardados (sem rede/sem sessão) e a falha de boot anterior, se houver. */
let flushing: Promise<void> | null = null;
export function flushPendingClientErrors(): Promise<void> {
  // Uma só remessa por vez: vários eventos de sessão não duplicam linhas.
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}

async function doFlush() {
  const pending = readPending();
  try {
    const boot = localStorage.getItem(BOOT_FAILURE_KEY);
    if (boot) {
      const info = JSON.parse(boot) as { at?: string; route?: string; detail?: string; standalone?: boolean };
      pending.push({
        ...buildRow('boot', `App não abriu em 6 s${info.detail ? `: ${info.detail}` : ''}`),
        route: info.route ?? '/',
        standalone: !!info.standalone,
        created_at: info.at,
      });
    }
  } catch { /* ok */ }
  if (!pending.length) return;
  try { localStorage.removeItem(PENDING_KEY); localStorage.removeItem(BOOT_FAILURE_KEY); } catch { /* ok */ }
  if (!(await send(pending))) writePending([...pending.filter(r => r.kind !== 'boot'), ...readPending()]);
}

export function installClientErrorLogging() {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __mwClientErrorsInstalled?: boolean };
  if (w.__mwClientErrorsInstalled) return;
  w.__mwClientErrorsInstalled = true;
  window.addEventListener('error', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && target !== (window as unknown) && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      reportClientError('chunk', `Falha ao carregar ${(target as HTMLScriptElement).src || (target as HTMLLinkElement).href}`);
      return;
    }
    reportClientError('error', event.error ?? event.message);
  }, true);
  window.addEventListener('unhandledrejection', (event) => reportClientError('unhandledrejection', event.reason));
  window.addEventListener('vite:preloadError', (event) => reportClientError('chunk', (event as Event & { payload?: unknown }).payload ?? 'preloadError'));
  window.addEventListener('online', () => void flushPendingClientErrors());
  supabase.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION') void flushPendingClientErrors(); });
}
