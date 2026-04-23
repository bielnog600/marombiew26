// Helper para casar o nome do exercício do plano (vindo da IA)
// com um registro da tabela `exercises` do banco.
//
// Bug anterior: usar `name.includes(dbName) || dbName.includes(name)` causava
// falsos positivos. Ex.: "ROSCA DIRETA" do plano casava com "ROSCA" no banco
// (ou vice-versa), exibindo vídeo/imagem errados.

export interface MatchableExercise {
  id: string;
  nome: string;
  imagem_url?: string | null;
  video_embed?: string | null;
  grupo_muscular?: string | null;
  ajustes?: string[] | null;
}

const normalize = (s: string) =>
  s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Encontra o melhor exercício no banco para o nome dado.
 * Estratégia:
 *  1. Match exato (após normalização)
 *  2. Match onde TODAS as palavras do nome do banco aparecem no nome alvo,
 *     priorizando o que tem mais palavras (mais específico vence).
 */
export function findBestExerciseMatch<T extends MatchableExercise>(
  name: string,
  dbExercises: T[],
): T | undefined {
  const target = normalize(name);
  const targetWords = new Set(target.split(' ').filter((w) => w.length > 2));

  // 1) Match exato
  const exact = dbExercises.find((e) => normalize(e.nome) === target);
  if (exact) return exact;

  // 2) Sobreposição: todas as palavras do banco devem estar no alvo
  let bestScore = 0;
  let best: T | undefined;
  for (const e of dbExercises) {
    const eNorm = normalize(e.nome);
    const eWords = eNorm.split(' ').filter((w) => w.length > 2);
    if (eWords.length === 0) continue;
    const overlap = eWords.filter((w) => targetWords.has(w)).length;
    if (overlap !== eWords.length) continue;
    const score = overlap * 10 + eWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}
