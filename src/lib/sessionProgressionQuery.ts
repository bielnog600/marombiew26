/**
 * Helpers puros da query de histórico (testáveis sem rede).
 *
 * O histórico é buscado em UMA query filtrada pelos exercícios do treino atual
 * (`exercise_name IN (...)`), o que reduz drasticamente o volume e elimina o
 * risco de o limite de linhas cortar justamente um exercício da sessão.
 * Dado legado pode ter sido gravado sem a normalização atual, por isso o filtro
 * usa variantes do mesmo nome.
 */

import { normalizeExName } from '@/components/training/TrainerLogSheetUtils';

/** Variantes de nome aceitas no filtro `in()` (dedupe, ordem estável). */
export const buildHistoryNameVariants = (names: string[]): string[] => {
  const out = new Set<string>();
  (names ?? []).forEach((raw) => {
    const name = String(raw || '').trim();
    if (!name) return;
    out.add(normalizeExName(name));
    out.add(name);
    out.add(name.toUpperCase());
    out.add(name.toLowerCase());
  });
  return [...out];
};
