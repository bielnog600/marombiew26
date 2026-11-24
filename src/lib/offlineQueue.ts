import { openDB, type IDBPDatabase } from 'idb';
import { supabase } from '@/integrations/supabase/client';

/** Fila durável e ordenada das gravações feitas sem internet. */
const DB_NAME = 'mw_offline';
const DB_VERSION = 1;
const STORE = 'sync_queue';

export type QueueOpType = 'insert' | 'upsert' | 'update';

export interface QueuedOp {
  id?: number;
  table: string;
  op: QueueOpType;
  payload: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  matchId?: string;
  createdAt: number;
  attempts?: number;
  lastError?: string;
  nextAttemptAt?: number;
  failureRecorded?: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

export function upsertDedupKey(op: Pick<QueuedOp, 'table' | 'op' | 'payload' | 'onConflict'>): string | null {
  if (op.op !== 'upsert' || !op.onConflict || Array.isArray(op.payload)) return null;
  const cols = op.onConflict.split(',').map(c => c.trim()).filter(Boolean);
  const values = cols.map(c => (op.payload as Record<string, unknown>)[c]);
  if (values.some(v => v == null)) return null;
  return `${op.table}|${cols.join(',')}|${values.map(String).join('|')}`;
}

function updateDedupKey(op: Pick<QueuedOp, 'table' | 'op' | 'matchId'>): string | null {
  return op.op === 'update' && op.matchId ? `${op.table}|id|${op.matchId}` : null;
}

function idDedupKey(op: Pick<QueuedOp, 'table' | 'op' | 'payload'>): string | null {
  if (Array.isArray(op.payload)) return null;
  const id = op.payload.id;
  return id != null && (op.op === 'insert' || op.op === 'upsert') ? `${op.table}|id|${String(id)}` : null;
}

/** Um UUID por linha permite repetir inserts sem criar duplicados. */
export function withClientIds(op: Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'>): Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'> {
  if (op.op !== 'insert') return op;
  const rows = Array.isArray(op.payload) ? op.payload : [op.payload];
  const withIds = rows.map(row => row.id ? row : { ...row, id: crypto.randomUUID() });
  return { ...op, payload: Array.isArray(op.payload) ? withIds : withIds[0] };
}

export async function enqueue(rawOp: Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'>) {
  const op = withClientIds(rawOp);
  const db = await getDB();
  const key = upsertDedupKey(op) ?? updateDedupKey(op) ?? idDedupKey(op);
  if (key) {
    const existing = (await db.getAll(STORE)) as QueuedOp[];
    for (const item of existing) {
      const itemKey = upsertDedupKey(item) ?? updateDedupKey(item) ?? idDedupKey(item);
      if (item.id == null || itemKey !== key) continue;
      // Uma atualização da mesma sessão não pode substituir sua criação ainda
      // pendente. Mescla o estado final no INSERT para manter sessão -> séries.
      if (item.op === 'insert' && op.op === 'update' && !Array.isArray(item.payload) && !Array.isArray(op.payload)) {
        await db.put(STORE, { ...item, payload: { ...item.payload, ...op.payload }, lastError: undefined, nextAttemptAt: undefined });
        notifyChange();
        return;
      }
      if (item.op === 'update' && op.op === 'update' && !Array.isArray(item.payload) && !Array.isArray(op.payload)) {
        await db.put(STORE, { ...item, payload: { ...item.payload, ...op.payload }, lastError: undefined, nextAttemptAt: undefined });
      } else {
        await db.delete(STORE, item.id);
      }
      if (item.op === 'update' && op.op === 'update') {
        notifyChange();
        return;
      }
    }
  }
  await db.add(STORE, { ...op, createdAt: Date.now(), attempts: 0 } as QueuedOp);
  notifyChange();
}

export async function dedupeQueue() {
  const db = await getDB();
  const items = ((await db.getAll(STORE)) as QueuedOp[]).sort((a, b) => b.createdAt - a.createdAt || (b.id ?? 0) - (a.id ?? 0));
  const seen = new Set<string>();
  for (const item of items) {
    const key = upsertDedupKey(item) ?? updateDedupKey(item) ?? idDedupKey(item);
    if (!key || item.id == null) continue;
    if (seen.has(key)) await db.delete(STORE, item.id);
    else seen.add(key);
  }
}

export const MAX_ATTEMPTS = 5;

export function isTransientError(e: any): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = String(e?.code ?? '');
  if (/^(42|22|PGRST)/i.test(code)) return false;
  // 23505 pode ser uma repetição de insert: runOp tenta resolver pelo id.
  if (/^23/i.test(code) && code !== '23505') return false;
  const status = Number(e?.status ?? e?.statusCode ?? NaN);
  if (Number.isFinite(status)) {
    if (status >= 500 || status === 408 || status === 429) return true;
    if (status >= 400) return false;
  }
  if (e instanceof TypeError) return true;
  const msg = `${e?.name ?? ''} ${e?.message ?? ''} ${e?.details ?? ''}`;
  return /failed to fetch|network|load failed|timeout|timed out|aborterror|fetch failed/i.test(msg);
}

export async function recordSyncFailure(op: Pick<QueuedOp, 'table' | 'op' | 'payload'>, e: any) {
  const message = e?.message ?? String(e);
  console.error('[offlineQueue] falha de sincronização', op.table, op.op, e?.code, message);
  try {
    let studentId: string | undefined;
    const p = Array.isArray(op.payload) ? op.payload[0] : op.payload;
    if (p && typeof p.student_id === 'string') studentId = p.student_id;
    if (!studentId) {
      const { data } = await supabase.auth.getSession();
      studentId = data.session?.user?.id;
    }
    if (!studentId) return;
    const { error } = await supabase.from('client_sync_failures' as any).insert({
      student_id: studentId,
      table_name: op.table,
      op: op.op,
      payload: op.payload as any,
      error_code: e?.code ? String(e.code) : (e?.status ? String(e.status) : null),
      error_message: String(message).slice(0, 1000),
    } as any);
    if (error) console.error('[offlineQueue] não foi possível registrar a falha', error);
  } catch (err) {
    console.error('[offlineQueue] não foi possível registrar a falha', err);
  }
}

export async function getPending(): Promise<QueuedOp[]> {
  const db = await getDB();
  return (await db.getAll(STORE)) as QueuedOp[];
}

export async function pendingCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE);
}

async function removeOp(id: number) {
  const db = await getDB();
  await db.delete(STORE, id);
}

async function bumpAttempts(op: QueuedOp, error: string, failureRecorded = false) {
  if (op.id == null) return;
  const attempts = (op.attempts ?? 0) + 1;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 5));
  const db = await getDB();
  await db.put(STORE, {
    ...op,
    attempts,
    lastError: error,
    nextAttemptAt: Date.now() + delay,
    failureRecorded: failureRecorded || op.failureRecorded,
  });
}

let flushing = false;
/** Envia em ordem e para no primeiro erro: sessões nunca chegam depois das séries. */
export async function flushQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  if (flushing || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { synced: 0, failed: 0, remaining: await pendingCount() };
  }
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    await dedupeQueue();
    const items = await getPending();
    items.sort((a, b) => a.createdAt - b.createdAt || (a.id ?? 0) - (b.id ?? 0));
    for (const item of items) {
      if ((item.nextAttemptAt ?? 0) > Date.now()) break;
      try {
        await runOp(item);
        if (item.id != null) await removeOp(item.id);
        synced++;
      } catch (e: any) {
        failed++;
        const transient = isTransientError(e);
        const shouldRecord = !transient || ((item.attempts ?? 0) + 1) >= MAX_ATTEMPTS;
        if (shouldRecord && !item.failureRecorded) await recordSyncFailure(item, e);
        // Nunca apaga um registro que não foi aceito pelo servidor.
        await bumpAttempts(item, e?.message ?? String(e), shouldRecord);
        break;
      }
    }
  } finally {
    flushing = false;
    notifyChange();
  }
  return { synced, failed, remaining: await pendingCount() };
}

async function runOp(rawOp: QueuedOp) {
  const op = withClientIds(rawOp);
  const table = op.table as any;
  if (op.op === 'insert') {
    const rows = Array.isArray(op.payload) ? op.payload : [op.payload];
    const hasIds = rows.every(row => row.id != null);
    const { error } = hasIds
      ? await supabase.from(table).upsert(op.payload as any, { onConflict: 'id', ignoreDuplicates: true })
      : await supabase.from(table).insert(op.payload as any);
    if (error) throw error;
    return;
  }
  if (op.op === 'upsert') {
    const options: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    if (op.onConflict) options.onConflict = op.onConflict;
    if (op.table === 'exercise_set_logs') options.ignoreDuplicates = true;
    const { error } = await supabase.from(table).upsert(op.payload as any, options);
    if (error) throw error;
    return;
  }
  if (!op.matchId) throw new Error('update sem matchId');
  const { error } = await supabase.from(table).update(op.payload as any).eq('id', op.matchId);
  if (error) throw error;
}

const listeners = new Set<() => void>();
export function onQueueChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notifyChange() {
  listeners.forEach(cb => { try { cb(); } catch { /* noop */ } });
}

export async function writeWithFallback(rawOp: Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'>) {
  const op = withClientIds(rawOp);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueue(op);
    return { queued: true as const };
  }
  try {
    await runOp({ ...op, createdAt: Date.now() } as QueuedOp);
    return { queued: false as const };
  } catch (e) {
    if (isTransientError(e)) {
      await enqueue(op);
      return { queued: true as const };
    }
    await recordSyncFailure(op, e);
    return { queued: false as const, failed: true as const };
  }
}
