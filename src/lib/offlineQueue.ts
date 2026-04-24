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

export async function enqueue(op: Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'>) {
  const db = await getDB();
  await db.add(STORE, { ...op, createdAt: Date.now(), attempts: 0 } as QueuedOp);
  notifyChange();
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
    const items = await getPending();
    items.sort((a, b) => a.createdAt - b.createdAt);
    for (const item of items) {
      try {
        await runOp(item);
        if (item.id != null) await removeOp(item.id);
        synced++;
      } catch (e: any) {
        failed++;
        await bumpAttempts(item, e?.message ?? String(e));
        // Para após muitas falhas para não loopar
        if ((item.attempts ?? 0) >= 5) continue;
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
    await enqueue(op);
    return { queued: true as const };
  }
}