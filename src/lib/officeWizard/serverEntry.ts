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
