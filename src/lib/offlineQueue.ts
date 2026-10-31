import { openDB, type IDBPDatabase } from 'idb';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fila de sincronização offline.
 * Armazena operações de escrita feitas pelo aluno enquanto sem Internet
 * e replays elas no Supabase quando a conexão volta.
 *
 * Operações suportadas:
 *  - insert: cria novo registro (ex: exercise_set_logs)
 *  - upsert: cria/atualiza com onConflict (ex: daily_tracking)
 *  - update: atualiza por id (ex: workout_sessions)
 */

const DB_NAME = 'mw_offline';
const DB_VERSION = 1;
const STORE = 'sync_queue';

export type QueueOpType = 'insert' | 'upsert' | 'update';

export interface QueuedOp {
  id?: number;
  table: string;
  op: QueueOpType;
  payload: Record<string, unknown> | Record<string, unknown>[];
  /** Para upsert: coluna(s) de conflito. Ex: 'student_id,date' */
  onConflict?: string;
  /** Para update: id do registro */
  matchId?: string;
  createdAt: number;
  /** Tentativas de retry */
  attempts?: number;
  /** Última mensagem de erro */
  lastError?: string;
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

/** Chave de deduplicação para upserts de um único registro (ex.: daily_tracking student_id+date). */
export function upsertDedupKey(op: Pick<QueuedOp, 'table' | 'op' | 'payload' | 'onConflict'>): string | null {
  if (op.op !== 'upsert' || !op.onConflict || Array.isArray(op.payload)) return null;
  const cols = op.onConflict.split(',').map((c) => c.trim()).filter(Boolean);
  const values = cols.map((c) => (op.payload as Record<string, unknown>)[c]);
  if (values.some((v) => v == null)) return null;
  return `${op.table}|${cols.join(',')}|${values.map(String).join('|')}`;
}

export async function enqueue(op: Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'>) {
  const db = await getDB();
  const key = upsertDedupKey(op);
  if (key) {
    const existing = (await db.getAll(STORE)) as QueuedOp[];
    for (const item of existing) {
      if (item.id != null && upsertDedupKey(item) === key) await db.delete(STORE, item.id);
    }
  }
  await db.add(STORE, { ...op, createdAt: Date.now(), attempts: 0 } as QueuedOp);
  notifyChange();
}

/** Remove upserts repetidos na mesma chave, mantendo só o mais recente. */
export async function dedupeQueue() {
  const db = await getDB();
  const items = ((await db.getAll(STORE)) as QueuedOp[]).sort((a, b) => b.createdAt - a.createdAt);
  const seen = new Set<string>();
  for (const item of items) {
    const key = upsertDedupKey(item);
    if (!key || item.id == null) continue;
    if (seen.has(key)) await db.delete(STORE, item.id);
    else seen.add(key);
  }
}

export const MAX_ATTEMPTS = 5;

/**
 * Falha de rede/transitória (vale re-tentar): aparelho offline, fetch falhou,
 * timeout, 5xx/408/429. Qualquer outro erro é permanente.
 */
export function isTransientError(e: any): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = String(e?.code ?? '');
  if (/^(42|23|22|PGRST)/i.test(code)) return false;
  const status = Number(e?.status ?? e?.statusCode ?? NaN);
  if (Number.isFinite(status)) {
    if (status >= 500 || status === 408 || status === 429) return true;
    if (status >= 400) return false;
  }
  if (e instanceof TypeError) return true;
  const msg = `${e?.name ?? ''} ${e?.message ?? ''} ${e?.details ?? ''}`;
  return /failed to fetch|network|load failed|timeout|timed out|aborterror|fetch failed/i.test(msg);
}

/** Registra falha permanente para o admin ver (client_sync_failures). */
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
  return await db.count(STORE);
}

async function removeOp(id: number) {
  const db = await getDB();
  await db.delete(STORE, id);
}

async function bumpAttempts(op: QueuedOp, error: string) {
  if (op.id == null) return;
  const db = await getDB();
  await db.put(STORE, { ...op, attempts: (op.attempts ?? 0) + 1, lastError: error });
}

let flushing = false;
const sessionStartedAt = Date.now();
let legacyRetryDone = false;
/**
 * Tenta enviar todos os itens da fila.
 * Retorna { synced, failed, remaining }.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  if (flushing) return { synced: 0, failed: 0, remaining: await pendingCount() };
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    await dedupeQueue();
    const items = await getPending();
    items.sort((a, b) => a.createdAt - b.createdAt);
    // Primeira sincronização desta abertura: itens antigos têm uma última chance.
    const finalForLegacy = !legacyRetryDone;
    legacyRetryDone = true;
    for (const item of items) {
      try {
        await runOp(item);
        if (item.id != null) await removeOp(item.id);
        synced++;
      } catch (e: any) {
        failed++;
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const attempts = (item.attempts ?? 0) + 1;
        const legacy = finalForLegacy && item.createdAt < sessionStartedAt && !offline;
        if (!isTransientError(e) || attempts >= MAX_ATTEMPTS || legacy) {
          await recordSyncFailure(item, e);
          if (item.id != null) await removeOp(item.id);
        } else {
          await bumpAttempts(item, e?.message ?? String(e));
        }
      }
    }
  } finally {
    flushing = false;
    notifyChange();
  }
  return { synced, failed, remaining: await pendingCount() };
}

async function runOp(op: QueuedOp) {
  const table = op.table as any;
  if (op.op === 'insert') {
    const { error } = await supabase.from(table).insert(op.payload as any);
    if (error) throw error;
    return;
  }
  if (op.op === 'upsert') {
    const { error } = await supabase
      .from(table)
      .upsert(op.payload as any, op.onConflict ? { onConflict: op.onConflict } : undefined);
    if (error) throw error;
    return;
  }
  if (op.op === 'update') {
    if (!op.matchId) throw new Error('update sem matchId');
    const { error } = await supabase
      .from(table)
      .update(op.payload as any)
      .eq('id', op.matchId);
    if (error) throw error;
    return;
  }
}

// --- pub/sub simples para o indicador re-renderizar ---
const listeners = new Set<() => void>();
export function onQueueChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notifyChange() {
  listeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

/**
 * Wrapper conveniente: tenta executar online; se falhar por rede, enfileira.
 * Use para escritas idempotentes (upsert, insert).
 */
export async function writeWithFallback(op: Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'>) {
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