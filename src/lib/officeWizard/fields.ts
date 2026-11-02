/**
 * Definição das perguntas dos wizards (Gerar Treino, Cardio IA) para o
 * escritório de IA. As opções vêm das MESMAS constantes que as telas do admin
 * renderizam, então não divergem. `stateKey` liga cada campo ao estado do
 * wizard usado pelos construtores compartilhados.
 */
import {
  LEVELS, DAYS_PER_WEEK, SPLITS, WEEKS, EQUIPMENT, AVAILABLE_MACHINES, EXERCISE_PROFILES,
  FORBIDDEN_PATTERNS, EXECUTION_RULES, MUSCLE_GROUPS, LESAO_LOCAIS, MOBILITY_COUNT_OPTIONS,
  MAIN_EXERCISES_COUNT_OPTIONS, defaultTreinoWizardState, type TreinoWizardState,
} from './treinoWizard';
import {
  CARDIO_MODALITY_VALUES, CARDIO_INTENSITIES, CARDIO_STYLES, CARDIO_FREQUENCIES, CARDIO_DURATIONS,
  CARDIO_EQUIPMENT_FIELDS, defaultCardioWizardState, type CardioWizardState,
} from './cardioWizard';
import { MODALITY_LABEL } from '../cardioParser';
import { MODEL_LABELS, SELECTABLE_MODELS } from '../periodization';
import { VARIATION_OPTIONS } from '../variationProfiles';

export type FieldKind = 'escolha' | 'multipla' | 'booleano' | 'texto' | 'divisao_por_dia';

export type WizardOption = { valor: string; rotulo: string; descricao?: string };

export type WizardField = {
  id: string;
  stateKey: string;
  pergunta: string;
  tipo: FieldKind;
  opcoes?: WizardOption[];
  obrigatorio: boolean;
  /** Campo só se aplica quando outro campo tem um destes valores. */
  depende_de?: { campo: string; valores: Array<string | boolean> };
  padrao: unknown;
};

const opt = (arr: ReadonlyArray<{ value: string; label: string; desc?: string }>): WizardOption[] =>
  arr.map((o) => ({ valor: o.value, rotulo: o.label, ...(o.desc ? { descricao: o.desc } : {}) }));
const optIds = (arr: ReadonlyArray<{ id: string; label: string; desc?: string; category?: string }>): WizardOption[] =>
  arr.map((o) => ({ valor: o.id, rotulo: o.label, ...(o.desc || o.category ? { descricao: o.desc ?? o.category } : {}) }));
const optStr = (arr: string[], fmt: (v: string) => string = (v) => v): WizardOption[] => arr.map((v) => ({ valor: v, rotulo: fmt(v) }));

export function treinoFields(): WizardField[] {
  const d = defaultTreinoWizardState();
  const f = (x: Omit<WizardField, 'padrao'>): WizardField => ({ ...x, padrao: (d as any)[x.stateKey] });
  return [
    f({ id: 'nivel', stateKey: 'level', pergunta: 'Nível do aluno', tipo: 'escolha', opcoes: opt(LEVELS), obrigatorio: true }),
    f({ id: 'dias_semana', stateKey: 'daysPerWeek', pergunta: 'Dias por semana', tipo: 'escolha', opcoes: opt(DAYS_PER_WEEK), obrigatorio: true }),
    f({ id: 'divisao', stateKey: 'split', pergunta: 'Divisão do treino', tipo: 'escolha', opcoes: opt(SPLITS), obrigatorio: true }),
    f({ id: 'divisao_por_dia', stateKey: 'customSplit', pergunta: 'Grupos musculares por dia (índice 0 = Segunda)', tipo: 'divisao_por_dia', opcoes: optStr(MUSCLE_GROUPS), obrigatorio: false, depende_de: { campo: 'divisao', valores: ['custom'] } }),
    f({ id: 'periodizacao', stateKey: 'periodizationSelection', pergunta: 'Modelo de periodização', tipo: 'escolha', opcoes: [{ valor: 'automatica', rotulo: MODEL_LABELS.automatica }, ...SELECTABLE_MODELS.map((m) => ({ valor: m, rotulo: MODEL_LABELS[m] }))], obrigatorio: false }),
    f({ id: 'semana_ciclo', stateKey: 'week', pergunta: 'Semana do ciclo', tipo: 'escolha', opcoes: opt(WEEKS), obrigatorio: true }),
    f({ id: 'equipamento', stateKey: 'equipment', pergunta: 'Equipamento', tipo: 'escolha', opcoes: opt(EQUIPMENT), obrigatorio: true }),
    f({ id: 'maquinas', stateKey: 'selectedMachines', pergunta: 'Máquinas disponíveis', tipo: 'multipla', opcoes: optIds(AVAILABLE_MACHINES), obrigatorio: false, depende_de: { campo: 'equipamento', valores: ['limitado', 'casa'] } }),
    f({ id: 'perfil_exercicios', stateKey: 'exerciseProfile', pergunta: 'Perfil de exercícios', tipo: 'escolha', opcoes: opt(EXERCISE_PROFILES as any), obrigatorio: false }),
    f({ id: 'intensidade_variacao', stateKey: 'variationIntensity', pergunta: 'Variação em relação aos treinos anteriores', tipo: 'escolha', opcoes: VARIATION_OPTIONS.map((o: any) => ({ valor: o.value, rotulo: o.label, ...(o.desc ? { descricao: o.desc } : {}) })), obrigatorio: false }),
    f({ id: 'caso_adaptado', stateKey: 'casoAdaptado', pergunta: 'Caso adaptado / reabilitação?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'objetivos_terapeuticos', stateKey: 'objetivosTerapeuticos', pergunta: 'Objetivos terapêuticos', tipo: 'texto', obrigatorio: false }),
    f({ id: 'exercicios_proibidos', stateKey: 'exerciciosProibidos', pergunta: 'Exercícios proibidos', tipo: 'texto', obrigatorio: false }),
    f({ id: 'padroes_proibidos', stateKey: 'padroesProibidos', pergunta: 'Padrões de movimento proibidos', tipo: 'multipla', opcoes: optIds(FORBIDDEN_PATTERNS), obrigatorio: false }),
    f({ id: 'exercicios_permitidos', stateKey: 'exerciciosPermitidos', pergunta: 'Exercícios permitidos/prioritários', tipo: 'texto', obrigatorio: false }),
    f({ id: 'regras_execucao', stateKey: 'regrasExecucao', pergunta: 'Regras de carga e execução', tipo: 'multipla', opcoes: optIds(EXECUTION_RULES), obrigatorio: false }),
    f({ id: 'possui_lesao', stateKey: 'hasLesao', pergunta: 'Possui lesão?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'local_lesao', stateKey: 'lesaoLocal', pergunta: 'Local da lesão', tipo: 'multipla', opcoes: optStr(LESAO_LOCAIS), obrigatorio: false, depende_de: { campo: 'possui_lesao', valores: [true] } }),
    f({ id: 'possui_dor', stateKey: 'hasDor', pergunta: 'Sente dor?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'local_dor', stateKey: 'dorLocal', pergunta: 'Local da dor', tipo: 'texto', obrigatorio: false, depende_de: { campo: 'possui_dor', valores: [true] } }),
    f({ id: 'limitacao_articular', stateKey: 'limitacaoArticular', pergunta: 'Limitação articular?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'local_limitacao', stateKey: 'limitacaoLocal', pergunta: 'Local da limitação', tipo: 'texto', obrigatorio: false, depende_de: { campo: 'limitacao_articular', valores: [true] } }),
    f({ id: 'hipercifose', stateKey: 'hipercifose', pergunta: 'Hipercifose?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'escoliose', stateKey: 'escoliose', pergunta: 'Escoliose?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'hiperlordose', stateKey: 'hiperlordose', pergunta: 'Hiperlordose?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'protrusao_ombro', stateKey: 'protrusaoOmbro', pergunta: 'Protrusão de ombros?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'valgo_joelho', stateKey: 'valgoJoelho', pergunta: 'Valgo de joelho?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'tabagismo', stateKey: 'tabagismo', pergunta: 'Tabagismo?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'stress_alto', stateKey: 'stressAlto', pergunta: 'Stress alto?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'sono_ruim', stateKey: 'sonoRuim', pergunta: 'Sono ruim?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'mobilidade_qtd', stateKey: 'mobilityCount', pergunta: 'Exercícios de mobilidade por sessão', tipo: 'escolha', opcoes: optStr(MOBILITY_COUNT_OPTIONS, (v) => (v === 'auto' ? 'Automático pela IA' : `${v} exercício(s)`)), obrigatorio: false }),
    f({ id: 'principais_qtd', stateKey: 'mainExercisesCount', pergunta: 'Exercícios principais por sessão', tipo: 'escolha', opcoes: optStr(MAIN_EXERCISES_COUNT_OPTIONS, (v) => (v === 'auto' ? 'Automático pela IA' : `${v} exercícios`)), obrigatorio: false }),
    f({ id: 'treino_referencia', stateKey: 'treinoReferencia', pergunta: 'Treino de referência (texto colado)', tipo: 'texto', obrigatorio: false }),
    f({ id: 'agente_marombiew', stateKey: 'marombiewEnabled', pergunta: 'Ativar Modo Agente Marombiew?', tipo: 'booleano', obrigatorio: false }),
    f({ id: 'observacoes', stateKey: 'notes', pergunta: 'Observações adicionais', tipo: 'texto', obrigatorio: false }),
  ];
}

export function cardioFields(): WizardField[] {
  const d = defaultCardioWizardState();
  const base: WizardField[] = [
    { id: 'modalidades', stateKey: 'modalities', pergunta: 'Modalidades (vazio = IA escolhe)', tipo: 'multipla', opcoes: CARDIO_MODALITY_VALUES.map((m) => ({ valor: m, rotulo: MODALITY_LABEL[m] })), obrigatorio: false, padrao: d.modalities },
    { id: 'frequencia_semana', stateKey: 'frequency', pergunta: 'Sessões por semana', tipo: 'escolha', opcoes: optStr(CARDIO_FREQUENCIES), obrigatorio: true, padrao: d.frequency },
    { id: 'intensidade', stateKey: 'intensity', pergunta: 'Intensidade', tipo: 'escolha', opcoes: opt(CARDIO_INTENSITIES), obrigatorio: true, padrao: d.intensity },
    { id: 'estilo', stateKey: 'style', pergunta: 'Estilo', tipo: 'escolha', opcoes: opt(CARDIO_STYLES), obrigatorio: true, padrao: d.style },
    { id: 'duracao', stateKey: 'duration', pergunta: 'Duração (min)', tipo: 'escolha', opcoes: optStr(CARDIO_DURATIONS, (v) => (v === 'auto' ? 'Auto' : `${v} min`)), obrigatorio: true, padrao: d.duration },
  ];
  const eq: WizardField[] = CARDIO_EQUIPMENT_FIELDS.map((e) => ({
    id: `eq_${e.key}`,
    stateKey: `eq.${e.key}`,
    pergunta: e.label,
    tipo: 'escolha' as const,
    opcoes: optStr(e.options.includes('auto') ? e.options : ['auto', ...e.options]),
    obrigatorio: false,
    ...(e.modality ? { depende_de: { campo: 'modalidades', valores: [e.modality] } } : {}),
    padrao: 'auto',
  }));
  return [...base, ...eq, { id: 'observacoes', stateKey: 'notes', pergunta: 'Observações', tipo: 'texto', obrigatorio: false, padrao: d.notes }];
}

export type ValidationResult<S> =
  | { ok: true; state: S }
  | { ok: false; faltando: Array<{ id: string; pergunta: string }>; invalidos: Array<{ id: string; motivo: string }> };

function isActive(field: WizardField, answers: Record<string, unknown>): boolean {
  if (!field.depende_de) return true;
  const v = answers[field.depende_de.campo];
  if (Array.isArray(v)) return v.length === 0 || v.some((x) => field.depende_de!.valores.includes(x as string));
  return field.depende_de.valores.includes(v as string | boolean);
}

function coerce(field: WizardField, raw: unknown): { ok: true; value: unknown } | { ok: false; motivo: string } {
  const valid = new Set((field.opcoes ?? []).map((o) => o.valor));
  switch (field.tipo) {
    case 'escolha': {
      const v = typeof raw === 'number' ? String(raw) : raw;
      if (typeof v !== 'string' || !valid.has(v)) return { ok: false, motivo: `valor fora das opções: ${JSON.stringify(raw)}` };
      return { ok: true, value: v };
    }
    case 'multipla': {
      if (!Array.isArray(raw)) return { ok: false, motivo: 'esperado uma lista' };
      const bad = raw.filter((x) => typeof x !== 'string' || !valid.has(x));
      if (bad.length) return { ok: false, motivo: `valores fora das opções: ${JSON.stringify(bad)}` };
      return { ok: true, value: Array.from(new Set(raw as string[])) };
    }
    case 'booleano':
      if (typeof raw !== 'boolean') return { ok: false, motivo: 'esperado true/false' };
      return { ok: true, value: raw };
    case 'texto':
      if (typeof raw !== 'string') return { ok: false, motivo: 'esperado texto' };
      if (raw.length > 20000) return { ok: false, motivo: 'texto longo demais' };
      return { ok: true, value: raw };
    case 'divisao_por_dia': {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, motivo: 'esperado objeto {indiceDia: [grupos]}' };
      const out: Record<number, string[]> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const idx = Number(k);
        if (!Number.isInteger(idx) || idx < 0 || idx > 6) return { ok: false, motivo: `dia inválido: ${k}` };
        if (!Array.isArray(v) || v.some((g) => typeof g !== 'string' || !valid.has(g))) return { ok: false, motivo: `grupos inválidos no dia ${k}` };
        out[idx] = v as string[];
      }
      return { ok: true, value: out };
    }
  }
}

const isEmpty = (field: WizardField, v: unknown) =>
  v === undefined || v === null || (field.tipo !== 'booleano' && typeof v === 'string' && v.trim() === '');

/** Valida respostas e converte para o estado do wizard (mesmo formato da tela). */
export function answersToState<S extends Record<string, any>>(
  fields: WizardField[],
  defaults: S,
  respostas: Record<string, unknown>,
  instrucoes?: string | null,
): ValidationResult<S> {
  const faltando: Array<{ id: string; pergunta: string }> = [];
  const invalidos: Array<{ id: string; motivo: string }> = [];
  const known = new Set(fields.map((f) => f.id));
  for (const k of Object.keys(respostas ?? {})) if (!known.has(k)) invalidos.push({ id: k, motivo: 'campo desconhecido' });
  const state: any = JSON.parse(JSON.stringify(defaults));
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = respostas?.[field.id];
    if (isEmpty(field, raw)) {
      if (field.obrigatorio && isActive(field, answers)) faltando.push({ id: field.id, pergunta: field.pergunta });
      answers[field.id] = field.padrao;
      continue;
    }
    const c = coerce(field, raw);
    if (!c.ok) { invalidos.push({ id: field.id, motivo: c.motivo }); continue; }
    answers[field.id] = c.value;
  }
  if (faltando.length || invalidos.length) return { ok: false, faltando, invalidos };
  for (const field of fields) {
    if (!isActive(field, answers)) continue;
    const v = answers[field.id];
    if (v === undefined) continue;
    if (field.stateKey.startsWith('eq.')) {
      if (v !== 'auto') state.eq[field.stateKey.slice(3)] = v;
    } else {
      state[field.stateKey] = v;
    }
  }
  const extra = (instrucoes ?? '').trim();
  if (extra) state.notes = state.notes?.trim() ? `${state.notes.trim()}\n${extra}` : extra;
  return { ok: true, state };
}

export const validateTreinoAnswers = (respostas: Record<string, unknown>, instrucoes?: string | null) =>
  answersToState<TreinoWizardState>(treinoFields(), defaultTreinoWizardState(), respostas, instrucoes);

export const validateCardioAnswers = (respostas: Record<string, unknown>, instrucoes?: string | null) =>
  answersToState<CardioWizardState>(cardioFields(), defaultCardioWizardState(), respostas, instrucoes);

/** Remove `stateKey`/`padrao` internos ao expor as perguntas. */
export const publicField = ({ stateKey: _s, ...rest }: WizardField) => rest;
