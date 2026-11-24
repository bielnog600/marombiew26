import { openDB, type IDBPDatabase } from 'idb';

/** Cache local das leituras necessárias para o aluno continuar sem rede. */
const DB_NAME = 'mw_offline_cache';
const DB_VERSION = 1;
const STORE = 'query_cache';
const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 2500;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export interface CachedEntry<T = any> {
  data: T;
  ts: number;
}

export async function getCached<T = any>(key: string, maxAgeMs = DEFAULT_MAX_AGE): Promise<T | null> {
  try {
    const db = await getDB();
    const entry = (await db.get(STORE, key)) as CachedEntry<T> | undefined;
    if (!entry) return null;
    // Offline, um dado antigo é mais útil que uma tela vazia. Online ele é
    // substituído pela próxima leitura bem-sucedida.
    if (navigator.onLine && Date.now() - entry.ts > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function getCachedWithTimestamp<T = any>(key: string): Promise<CachedEntry<T> | null> {
  try {
    const db = await getDB();
    return ((await db.get(STORE, key)) as CachedEntry<T> | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function setCache<T = any>(key: string, data: T): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE, { data, ts: Date.now() } as CachedEntry<T>, key);
  } catch {
    // O app continua funcionando se o navegador bloquear IndexedDB.
  }
}

export async function removeCache(key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE, key);
  } catch { /* noop */ }
}

export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE);
  } catch { /* noop */ }
}

/**
 * Network-first online e cache-first offline. O tempo limite sempre resolve,
 * inclusive quando ainda não existe cache: nenhuma tela fica em skeleton eterno.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ data: T | null; fromCache: boolean }> {
  const cached = await getCached<T>(key);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { data: cached, fromCache: true };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (data: T | null, fromCache: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve({ data, fromCache });
    };
    const timeoutId = setTimeout(() => finish(cached, true), NETWORK_TIMEOUT_MS);

    fetcher()
      .then(async (data) => {
        if (data != null) await setCache(key, data);
        finish(data, false);
      })
      .catch((err) => {
        if (cached == null) console.warn(`[Cache] leitura indisponível: ${key}`, err);
        finish(cached, true);
      });
  });
}

export const offlineReadyKey = (userId: string) => `offline:ready:${userId}`;

export interface OfflineReadyState {
  userId: string;
  updatedAt: string;
  complete: boolean;
}

export async function getOfflineReady(userId: string): Promise<OfflineReadyState | null> {
  return getCachedWithTimestamp<OfflineReadyState>(offlineReadyKey(userId)).then(entry => entry?.data ?? null);
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
