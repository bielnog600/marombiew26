/**
 * Ordenação canônica dos dias do treino: SEGUNDA → DOMINGO, depois
 * "TREINO A…E" em ordem alfabética, depois rótulos desconhecidos (estável).
 * Normaliza acentos e maiúsculas e aceita variantes ("SEGUNDA-FEIRA", "Seg",
 * "terca", "sábado"...). Usar em TODOS os lugares que listam dias: editor do
 * admin, visualização do plano, Modo Treino, área do aluno e execução.
 */

const WEEKDAYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const WEEKDAY_PREFIX = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const normalizeDayLabel = (label: string): string =>
  (label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Chave de ordenação: 0–6 dias da semana, 100+letra para "TREINO X", 200 demais. */
export const trainingDaySortKey = (label: string): number => {
  const n = normalizeDayLabel(label);
  if (!n) return 200;
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (n.includes(WEEKDAYS[i])) return i;
  }
  // Abreviações só contam como palavra inteira ("seg", "terça"…), para não
  // confundir com treinos nomeados ("Treino A" não contém "ter").
  const words = n.split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < WEEKDAY_PREFIX.length; i++) {
    if (words.some((w) => w === WEEKDAY_PREFIX[i] || w === `${WEEKDAY_PREFIX[i]}feira`)) return i;
  }
  const treino = n.match(/\btreino\s+([a-z])\b/);
  if (treino) return 100 + (treino[1].charCodeAt(0) - 97);
  return 200;
};

/** Ordenação estável: empates mantêm a ordem original do array. */
export const sortTrainingDays = <T extends { day: string }>(days: T[]): T[] =>
  days
    .map((d, i) => ({ d, i, k: trainingDaySortKey(d.day) }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i))
    .map((x) => x.d);
