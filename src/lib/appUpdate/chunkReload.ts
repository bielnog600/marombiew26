/**
 * Recuperação de "partes do app" (chunks) que sumiram depois de um deploy.
 * Recarrega a página no máximo UMA vez por janela de tempo, guardando um
 * carimbo em sessionStorage para nunca entrar em loop de recarregamento.
 */
export const CHUNK_RELOAD_KEY = 'mw_chunk_reload_at';
/** Dentro desta janela não recarrega de novo (evita loop se o erro persistir). */
export const CHUNK_RELOAD_WINDOW_MS = 10 * 60 * 1000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /unable to preload css/i,
  /loading (css )?chunk [\w-]+ failed/i,
  /chunkloaderror/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: unknown }).name;
  if (name === 'ChunkLoadError') return true;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String((error as { message?: unknown }).message ?? '');
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

interface ReloadDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  reload?: () => void;
  now?: () => number;
}

const defaultStorage = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
  try { return window.sessionStorage; } catch { return null; }
};

/** Retorna true quando disparou o recarregamento; false quando já recarregou há pouco. */
export function reloadOnceForChunkError(deps: ReloadDeps = {}): boolean {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const now = (deps.now ?? Date.now)();
  const reload = deps.reload ?? (() => window.location.reload());
  let last = 0;
  try { last = Number(storage?.getItem(CHUNK_RELOAD_KEY) ?? 0) || 0; } catch { last = 0; }
  if (last > 0 && now - last >= 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
  try {
    storage?.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    // Sem storage não há como garantir "uma vez": não recarrega.
    return false;
  }
  if (!storage) return false;
  reload();
  return true;
}
