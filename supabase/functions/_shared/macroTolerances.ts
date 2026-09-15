/**
 * Fase 4.2 — definição ÚNICA das tolerâncias oficiais de macros.
 *
 * Servidor (diet-agent) e cliente structured consomem exatamente estes valores.
 * Nenhum outro módulo pode declarar tolerâncias próprias para o fluxo structured.
 */
export interface MacroTolerance {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export const OFFICIAL_MACRO_TOLERANCE: MacroTolerance = {
  kcal: 50,
  p: 10,
  c: 15,
  g: 8,
};

/** Mesmo conjunto, com os nomes usados pelos relatórios do app. */
export const OFFICIAL_MACRO_TOLERANCE_LABELS = {
  calories: OFFICIAL_MACRO_TOLERANCE.kcal,
  protein: OFFICIAL_MACRO_TOLERANCE.p,
  carbs: OFFICIAL_MACRO_TOLERANCE.c,
  fats: OFFICIAL_MACRO_TOLERANCE.g,
};
