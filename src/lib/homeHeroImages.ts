import { supabase } from '@/integrations/supabase/client';

const cache = new Map<string, string | null>();

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

  const { data, error } = await supabase
    .from('exercises')
    .select('nome, imagem_url, grupo_muscular')
    .not('imagem_url', 'is', null);

  if (error || !data) {
    cache.set(key, null);
    return null;
  }

  const rows = data as Array<{ nome: string; imagem_url: string | null; grupo_muscular: string | null }>;

  for (const candidate of candidates) {
    const target = normalize(candidate);
    if (!target) continue;
    const exact = rows.find((r) => normalize(r.nome) === target);
    if (exact?.imagem_url) {
      cache.set(key, exact.imagem_url);
      return exact.imagem_url;
    }
    const partial = rows.find((r) => normalize(r.nome).includes(target));
    if (partial?.imagem_url) {
      cache.set(key, partial.imagem_url);
      return partial.imagem_url;
    }
  }

  // Fallback: qualquer exercício de CARDIO com imagem
  const cardio = rows.find((r) => (r.grupo_muscular || '').toUpperCase().includes('CARDIO') && r.imagem_url);
  const result = cardio?.imagem_url ?? null;
  cache.set(key, result);
  return result;
}

export const CARDIO_IMAGE_BY_MODALITY: Record<string, string[]> = {
  passadeira: ['PASSADEIRA (CORRIDA)', 'PASSADEIRA', 'ESTEIRA CURVA'],
  bike: ['BIKE SENTADO', 'BIKE EM PE', 'AIR BIKE'],
  eliptica: ['ELIPTICO', 'ELIPTICO (TIRO)'],
  escada: ['ESCADA', 'SKI'],
};

export const TABATA_FALLBACK_IMAGES = ['BURPEES', 'CORDA NAVAL (BI)', 'POLICHINELO', 'SKIPS'];
