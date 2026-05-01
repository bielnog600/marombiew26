import { openDB, type IDBPDatabase } from 'idb';

/**
 * Offline data cache – stores Supabase query results in IndexedDB.
 *
 * Strategy:
 *  - Online: fetch from network, update cache, return fresh data
 *  - Offline: return cached data (stale but usable)
 */

const DB_NAME = 'mw_offline_cache';
const DB_VERSION = 1;
const STORE = 'query_cache';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export interface CachedEntry<T = any> {
  data: T;
  ts: number;
}

/**
 * Read cached data for a given key.
 * Returns null if not found or expired (default 7 days).
 */
export async function getCached<T = any>(
  key: string,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000,
): Promise<T | null> {
  try {
    const db = await getDB();
    const entry = (await db.get(STORE, key)) as CachedEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.ts > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

/** Store data in cache. */
export async function setCache<T = any>(key: string, data: T): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE, { data, ts: Date.now() } as CachedEntry<T>, key);
  } catch {
    // Silently fail – cache is a convenience, not critical
  }
}

/** Remove a single cache key. */
export async function removeCache(key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE, key);
  } catch {}
}

/** Clear all cached data. */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE);
  } catch {}
}

/**
 * Network-first fetch with offline fallback.
 *
 * @param key - Cache key (e.g. "plans:treino:<userId>")
 * @param fetcher - Async function that returns data from the network
 * @returns The data (fresh if online, cached if offline)
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ data: T | null; fromCache: boolean }> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (isOnline) {
    try {
      const data = await fetcher();
      // Don't cache null/undefined
      if (data != null) {
        await setCache(key, data);
      }
      return { data, fromCache: false };
    } catch (err) {
      // Network error while "online" – try cache
      const cached = await getCached<T>(key);
      if (cached != null) return { data: cached, fromCache: true };
      throw err;
    }
  }

  // Offline – return cache
  const cached = await getCached<T>(key);
  return { data: cached, fromCache: true };
}