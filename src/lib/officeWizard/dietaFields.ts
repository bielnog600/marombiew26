/**
 * Perguntas do Agente de Dieta para o escritório de IA. Opções vindas das
 * MESMAS constantes que a tela DietaIA renderiza (src/lib/officeWizard/dietaWizard).
 * Os campos obrigatórios são os mesmos que a tela exige para avançar as etapas.
 */
import { answersToState, type WizardField, type WizardOption } from './fields';
import {
  ACTIVITY_LEVELS, STRATEGIES, MEAL_COUNTS, DIET_STYLES, PHASES, TRAINING_TIMES, TRAINING_DAYS_OPTIONS,
  RESTRICTION_OPTIONS, PREFERENCE_OPTIONS, PROTOCOL_ADJUSTMENTS, defaultDietaWizardState, emptyScheduleAdjustments,
  type DietaWizardState,
} from './dietaWizard';
import { ENERGY_WEEKDAYS, WEEKDAY_LABELS, type EnergyWeekday } from '../weeklyEnergy';
import { ENERGY_FORMULA_LABEL, type EnergyFormula } from '../energyFormula';
import { VARIATION_OPTIONS } from '../variationProfiles';

/** Mesma separação de grupos que a tela (etapas Estratégia / Estrutura / Ajustes finos). */
export const DIET_STRATEGY_ADJUSTMENT_IDS = ['refeed', 'diet_break', 'carb_cycling', 'plato'] as const;
export const DIET_STRUCTURE_ADJUSTMENT_IDS = ['meal_change'] as const;
export const DIET_FINE_TUNE_ADJUSTMENT_IDS = ['calorie_adjust', 'carb_adjust', 'sodium_adjust', 'water_adjust'] as const;

const opt = (arr: ReadonlyArray<{ value: string; label: string; desc?: string }>): WizardOption[] =>
  arr.map((o) => ({ valor: o.value, rotulo: o.label, ...(o.desc ? { descricao: o.desc } : {}) }));
const adjOpts = (ids: readonly string[]): WizardOption[] =>
  PROTOCOL_ADJUSTMENTS.filter((a) => ids.includes(a.id)).map((a) => ({ valor: a.id, rotulo: a.label, descricao: a.desc }));
const strOpts = (arr: string[]): WizardOption[] => arr.map((v) => ({ valor: v, rotulo: v }));

export function dietaFields(): WizardField[] {
  const d = defaultDietaWizardState();
  const f = (x: Omit<WizardField, 'padrao'> & { padrao?: unknown }): WizardField => ({
    padrao: x.stateKey.startsWith('adj.') ? [] : (d as any)[x.stateKey],
    ...x,
  });
  return [
    // Etapa 1 — Objetivo do Plano
    f({ id: 'rotina_diaria', stateKey: 'dailyRoutine', pergunta: 'Rotina diária do aluno (trabalho, horários, etc.)', tipo: 'texto', obrigatorio: false }),
    f({ id: 'horario_treino', stateKey: 'trainingTime', pergunta: 'Horário de treino', tipo: 'escolha', opcoes: opt(TRAINING_TIMES), obrigatorio: true }),
    f({ id: 'intensidade_variacao', stateKey: 'variationIntensity', pergunta: 'Variação em relação à dieta anterior', tipo: 'escolha', opcoes: VARIATION_OPTIONS.map((o) => ({ valor: o.value, rotulo: o.label, descricao: o.desc })), obrigatorio: false }),
    f({ id: 'dias_treino', stateKey: 'trainingDays', pergunta: 'Frequência de treino', tipo: 'escolha', opcoes: opt(TRAINING_DAYS_OPTIONS), obrigatorio: true }),
    f({ id: 'fase', stateKey: 'phase', pergunta: 'Fase atual do aluno', tipo: 'escolha', opcoes: opt(PHASES), obrigatorio: true }),
    f({ id: 'usa_hormonios', stateKey: 'usesHormones', pergunta: 'Usa hormônios / TRT? (false = natural)', tipo: 'booleano', obrigatorio: true }),
    f({ id: 'detalhes_hormonios', stateKey: 'hormoneDetails', pergunta: 'Detalhes dos hormônios (ex.: TRT 200mg/sem)', tipo: 'texto', obrigatorio: false, depende_de: { campo: 'usa_hormonios', valores: [true] } }),
    f({ id: 'nivel_atividade', stateKey: 'activityLevel', pergunta: 'Nível de atividade física (fator de atividade)', tipo: 'escolha', opcoes: opt(ACTIVITY_LEVELS), obrigatorio: true }),
    f({ id: 'estrategia', stateKey: 'strategy', pergunta: 'Estratégia calórica', tipo: 'escolha', opcoes: opt(STRATEGIES), obrigatorio: true }),
    // Etapa 2 — Base da Dieta
    f({ id: 'estilo_dieta', stateKey: 'dietStyle', pergunta: 'Base (estilo) da dieta', tipo: 'escolha', opcoes: opt(DIET_STYLES), obrigatorio: true }),
    // Etapa 3 — Estratégia da Dieta (nenhum = condução linear)
    f({ id: 'conducao', stateKey: 'adj.selectedAdjustments', pergunta: 'Condução da dieta (vazio = linear). Carb Cycling ativa metas por dia.', tipo: 'multipla', opcoes: adjOpts(DIET_STRATEGY_ADJUSTMENT_IDS), obrigatorio: false }),
    // Etapa 4 — Estrutura Alimentar do Dia
    f({ id: 'num_refeicoes', stateKey: 'mealCount', pergunta: 'Número de refeições por dia', tipo: 'escolha', opcoes: opt(MEAL_COUNTS), obrigatorio: true }),
    f({ id: 'jejum_intermitente', stateKey: 'enableJejumIntermitente', pergunta: 'Jejum intermitente?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'reorganizacao_refeicoes', stateKey: 'adj.selectedAdjustments', pergunta: 'Reorganização de refeições', tipo: 'multipla', opcoes: adjOpts(DIET_STRUCTURE_ADJUSTMENT_IDS), obrigatorio: false }),
    f({ id: 'restricoes', stateKey: 'selectedRestrictions', pergunta: 'Restrições alimentares', tipo: 'multipla', opcoes: strOpts(RESTRICTION_OPTIONS), obrigatorio: false }),
    f({ id: 'restricoes_outras', stateKey: 'customRestriction', pergunta: 'Outras restrições (texto livre)', tipo: 'texto', obrigatorio: false }),
    f({ id: 'preferencias', stateKey: 'selectedPreferences', pergunta: 'Preferências alimentares', tipo: 'multipla', opcoes: strOpts(PREFERENCE_OPTIONS), obrigatorio: false }),
    f({ id: 'preferencias_outras', stateKey: 'customPreference', pergunta: 'Outras preferências (texto livre)', tipo: 'texto', obrigatorio: false }),
    // Etapa 5 — Ajustes Finos do Protocolo
    f({ id: 'meta_base_modo', stateKey: 'baseKcalMode', pergunta: 'Meta calórica base', tipo: 'escolha', opcoes: [{ valor: 'automatic', rotulo: 'Automática (TMB × fator de atividade × estratégia)' }, { valor: 'manual', rotulo: 'Manual' }], obrigatorio: false }),
    f({ id: 'meta_base_manual_kcal', stateKey: 'manualBaseKcalInput', pergunta: 'Meta manual (kcal/dia)', tipo: 'numero', minimo: 900, maximo: 8000, obrigatorio: true, depende_de: { campo: 'meta_base_modo', valores: ['manual'] }, toState: (v) => String(Math.round(Number(v))) }),
    f({ id: 'formula_energetica', stateKey: 'manualFormula', pergunta: 'Fórmula da TMB (automática = escolha do app)', tipo: 'escolha', opcoes: [{ valor: 'automatica', rotulo: 'Automática (escolha do app)' }, ...(Object.keys(ENERGY_FORMULA_LABEL) as EnergyFormula[]).map((k) => ({ valor: k, rotulo: ENERGY_FORMULA_LABEL[k] }))], obrigatorio: false, padrao: 'automatica', toState: (v) => (v === 'automatica' ? null : v) }),
    f({ id: 'ajustes_finos', stateKey: 'adj.selectedAdjustments', pergunta: 'Ajustes finos do protocolo', tipo: 'multipla', opcoes: adjOpts(DIET_FINE_TUNE_ADJUSTMENT_IDS), obrigatorio: false }),
    f({ id: 'proteina_g_kg', stateKey: 'proteinPerKgOverride', pergunta: 'Proteína em g/kg (vazio = preset da tela pela fase/estratégia)', tipo: 'numero', minimo: 0.8, maximo: 3.5, obrigatorio: false }),
    f({ id: 'gordura_g_kg', stateKey: 'fatPerKgOverride', pergunta: 'Gordura em g/kg (vazio = preset da tela pela fase/estratégia)', tipo: 'numero', minimo: 0.3, maximo: 2.0, obrigatorio: false }),
    // Etapa 6 — Calorias por dia (desativado com Carb Cycling, como na tela)
    f({
      id: 'ajuste_kcal_por_dia', stateKey: 'scheduleAdjustments',
      pergunta: 'Ajuste de kcal por dia da semana sobre a meta base (ex.: {"sab": 300}). Ignorado com Carb Cycling.',
      tipo: 'kcal_por_dia', opcoes: ENERGY_WEEKDAYS.map((wd) => ({ valor: wd, rotulo: WEEKDAY_LABELS[wd] })), obrigatorio: false,
      toState: (v) => {
        const out = emptyScheduleAdjustments();
        for (const [wd, kcal] of Object.entries(v as Record<string, number>)) out[wd as EnergyWeekday].adjustment_kcal = kcal;
        return out;
      },
    }),
    // Etapa 7 — Extras e Observações
    f({ id: 'fitoterapia', stateKey: 'enableFitoterapia', pergunta: 'Receitas de fitoterapia?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'suplementacao', stateKey: 'enableSuplementos', pergunta: 'Suplementação?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'hiit_termogenicos', stateKey: 'enableEmagrecimentoRapido', pergunta: 'HIIT + termogênicos?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'substituicoes', stateKey: 'substitutions', pergunta: 'Alimentos para substituição [{alimento, porcao}]', tipo: 'substituicoes', obrigatorio: false }),
    f({ id: 'dieta_modelo', stateKey: 'modelDiet', pergunta: 'Dieta modelo (texto colado; a IA ajusta as quantidades)', tipo: 'texto', obrigatorio: false }),
  ];
}

/** Respostas → estado do wizard. `instrucoes` entra nas observações da rotina (mesmo campo da tela). */
export const validateDietaAnswers = (respostas: Record<string, unknown>, instrucoes?: string | null) =>
  answersToState<DietaWizardState>(dietaFields(), defaultDietaWizardState(), respostas, instrucoes, 'dailyRoutine');
