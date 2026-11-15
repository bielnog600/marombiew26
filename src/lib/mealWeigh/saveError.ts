/**
 * Erro ao salvar a refeição do dia: o aluno vê uma frase simples e o erro
 * real do banco vai para o console (para diagnóstico), nunca para a tela.
 */
export const MEAL_SAVE_ERROR_MESSAGE = 'Não deu para salvar, tenta de novo';

export function mealSaveErrorMessage(where: string, error: unknown): string {
  console.error(`[refeição] falha ao salvar (${where})`, error);
  return MEAL_SAVE_ERROR_MESSAGE;
}
