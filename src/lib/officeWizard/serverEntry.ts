/**
 * Ponto de entrada do bundle usado pela edge function office-gerar.
 * Gerado em supabase/functions/_shared/generated/officeCore.js por
 * `bun scripts/build-office-core.mjs`; um teste falha se o bundle estiver
 * desatualizado, garantindo que servidor e admin rodem o MESMO código.
 * Não importar nada que dependa do navegador ou do cliente do app.
 */
export {
  buildTreinoGenerationRequest,
  canGenerateTreino,
  defaultTreinoWizardState,
} from './treinoWizard';
export { loadTreinoWizardData } from './treinoStudentData';
export {
  buildCardioRequestBody,
  buildCardioPlanInsert,
  defaultCardioWizardState,
  loadCardioWizardData,
} from './cardioWizard';
export {
  treinoFields,
  cardioFields,
  validateTreinoAnswers,
  validateCardioAnswers,
  publicField,
} from './fields';
export {
  suggestTreinoValues,
  suggestCardioValues,
  resumoTreinoAtual,
  resumoTreinoCompleto,
  resumoCardioAtual,
  resumoCardioCompleto,
} from './officeSummaries';
export { buildWorkoutPlanInsertPayload } from '../workoutPlanInsert';
export { normalizeWorkoutPlan } from '../workoutSchema';
export { snapshotToPlanColumns } from '../periodization';
export { parseCardioPayload } from '../cardioParser';
export {
  defaultDietaWizardState,
  deriveDietaWizard,
  buildDietGenerationPrompts,
  buildDietTrainingContext,
  loadDietFoodRecords,
  buildDietFoodHints,
  buildDietAgentBody,
  parseDietAgentSse,
  finalizeDietAgentPlan,
  processDietDailyAdjustments,
  buildDietProtocols,
  buildDietDraftInsert,
  dietPreferencesText,
  parseWeekdayWorkouts,
} from './dietaWizard';
export { loadDietaStudentData, loadActiveTrainingMarkdown } from './dietaStudentData';
export { dietaFields, validateDietaAnswers } from './dietaFields';
export { suggestDietaValues, resumoDietaAtual, resumoDietaCompleto, assessGeneratedDiet } from './dietaOffice';
export { dietPlanToMarkdown } from '../dietMarkdownSerializer';
export { buildWorkoutPlanUpdatePayload } from '../workoutPlanInsert';
export { buildPrescriptionEditRow } from '../prescriptionEditRow';
export { diffWorkoutPlans } from '../workoutPlanDiff';
export { parseDietPlanLoose } from '../dietSchema';
export { analisarTreino, semanaDoCiclo } from './treinoAnalysis';
export {
  REGRAS_MAROMBIEW_TREINO,
  REGRAS_MAROMBIEW_DIETA,
  converterSelects,
  renomearDias4x,
  preRevisarTreino,
  secaoRevisao,
} from './regrasMarombiew';
export {
  AJUSTE_CATEGORIAS,
  categoriaValida,
  buildTreinoAjusteMessages,
  buildDietaAjusteMessages,
  buildCardioAjusteMessages,
  parseAjusteResposta,
  validateTreinoAjuste,
  mudancasTreino,
  mudancasDieta,
  mudancasTexto,
  dietaItensProibidos,
  secaoOQueMudou,
} from './officeAdjust';
