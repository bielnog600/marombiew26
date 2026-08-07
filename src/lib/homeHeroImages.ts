import { supabase } from '@/integrations/supabase/client';

type Row = { nome: string; imagem_url: string | null; grupo_muscular: string | null };

const LS_PREFIX = 'mw_hero_img:';
const cache = new Map<string, string | null>();

// Hidrata o cache em memória a partir do localStorage (evita "piscar" ao trocar de slide)
function readPersisted(key: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw === null) return undefined;
    return raw === '' ? null : raw;
  } catch {
    return undefined;
  }
}

function persist(key: string, value: string | null) {
  try { localStorage.setItem(LS_PREFIX + key, value ?? ''); } catch { /* ignore */ }
}

// Uma única busca compartilhada da tabela de exercícios por sessão
let rowsPromise: Promise<Row[]> | null = null;
function getRows(): Promise<Row[]> {
  if (!rowsPromise) {
    rowsPromise = supabase
      .from('exercises')
      .select('nome, imagem_url, grupo_muscular')
      .not('imagem_url', 'is', null)
      .then(({ data, error }) => (error || !data ? [] : (data as Row[])))
      .catch(() => []);
  }
  return rowsPromise;
}

/** Retorna imediatamente a imagem já conhecida (memória ou localStorage), se houver. */
export function getCachedExerciseImage(candidates: string[]): string | null {
  const key = candidates.join('|');
  if (cache.has(key)) return cache.get(key) ?? null;
  const persisted = readPersisted(key);
  if (persisted !== undefined) {
    cache.set(key, persisted);
    return persisted;
  }
  return null;
}

const normalize = (s: string) =>
  s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Busca a primeira imagem disponível entre os nomes candidatos (ordem de prioridade). */
export async function fetchExerciseImageByNames(candidates: string[]): Promise<string | null> {
  const key = candidates.join('|');
  if (cache.has(key)) return cache.get(key) ?? null;
  const persisted = readPersisted(key);
  if (persisted !== undefined) {
    cache.set(key, persisted);
    return persisted;
  }

  const rows = await getRows();
  if (!rows.length) {
    cache.set(key, null);
    return null;
  }

  for (const candidate of candidates) {
    const target = normalize(candidate);
    if (!target) continue;
    const exact = rows.find((r) => normalize(r.nome) === target);
    if (exact?.imagem_url) {
      cache.set(key, exact.imagem_url);
      persist(key, exact.imagem_url);
      return exact.imagem_url;
    }
    const partial = rows.find((r) => normalize(r.nome).includes(target));
    if (partial?.imagem_url) {
      cache.set(key, partial.imagem_url);
      persist(key, partial.imagem_url);
      return partial.imagem_url;
    }
  }

  // Fallback: qualquer exercício de CARDIO com imagem
  const cardio = rows.find((r) => (r.grupo_muscular || '').toUpperCase().includes('CARDIO') && r.imagem_url);
  const result = cardio?.imagem_url ?? null;
  cache.set(key, result);
  persist(key, result);
  return result;
}

export const CARDIO_IMAGE_BY_MODALITY: Record<string, string[]> = {
  passadeira: ['PASSADEIRA (CORRIDA)', 'PASSADEIRA', 'ESTEIRA CURVA'],
  bike: ['BIKE SENTADO', 'BIKE EM PE', 'AIR BIKE'],
  eliptica: ['ELIPTICO', 'ELIPTICO (TIRO)'],
  escada: ['ESCADA', 'SKI'],
};

export const TABATA_FALLBACK_IMAGES = ['BURPEES', 'CORDA NAVAL (BI)', 'POLICHINELO', 'SKIPS'];
