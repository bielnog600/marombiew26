/**
 * Valores atuais sugeridos e resumos legíveis para o escritório de IA.
 * Puro (sem cliente); a edge function office-gerar passa as linhas lidas.
 */
import { normalizeWorkoutPlan } from '../workoutSchema';
import { workoutPlanToMarkdown } from '../workoutMarkdownSerializer';
import {
  isWeeklyPlan, parseCardioPayload, MODALITY_LABEL, STRUCTURE_LABEL, INTENSITY_LABEL,
  formatDurationFromSec, totalCardioDurationSec, type CardioProtocol, type CardioPayload,
} from '../cardioParser';
import { MODEL_LABELS } from '../periodization';
import type { TreinoWizardState } from './treinoWizard';
import type { WizardField } from './fields';

export type Suggestion = { valor_atual: unknown; origem_valor: string | null };

const NEXT_WEEK: Record<string, string> = { semana_1: '2', semana_2: '3', semana_3: '4', deload: '1' };

export function suggestTreinoValues(
  fields: WizardField[],
  input: { lastPlan: any | null; health: Partial<TreinoWizardState> },
): Record<string, Suggestion> {
  const { lastPlan, health } = input;
  const out: Record<string, Suggestion> = {};
  const set = (id: string, v: unknown, origem: string) => { out[id] = { valor_atual: v, origem_valor: origem }; };
  const plan = lastPlan?.conteudo_json ? normalizeWorkoutPlan(lastPlan.conteudo_json) : null;
  const when = lastPlan?.created_at ? new Date(lastPlan.created_at).toLocaleDateString('pt-BR') : '';
  const src = `treino atual${when ? ` (${when})` : ''}`;
  if (plan) {
    const days = plan.days.filter((d) => d.exercises.length > 0).length;
    if (days >= 2 && days <= 7) set('dias_semana', String(days), src);
  }
  if (lastPlan?.fase && NEXT_WEEK[lastPlan.fase]) set('semana_ciclo', NEXT_WEEK[lastPlan.fase], `próxima semana após ${lastPlan.fase} do ${src}`);
  if (lastPlan?.periodization_model && (MODEL_LABELS as any)[lastPlan.periodization_model]) set('periodizacao', lastPlan.periodization_model, src);
  if (lastPlan?.mobility_count != null) set('mobilidade_qtd', String(lastPlan.mobility_count), src);
  if (lastPlan?.main_exercises_count != null) set('principais_qtd', String(lastPlan.main_exercises_count), src);
  const hmap: Array<[keyof TreinoWizardState, string, string]> = [
    ['hasLesao', 'possui_lesao', 'cadastro do aluno (lesões)'],
    ['hasDor', 'possui_dor', 'anamnese (dores)'],
    ['tabagismo', 'tabagismo', 'anamnese'],
    ['stressAlto', 'stress_alto', 'anamnese'],
    ['sonoRuim', 'sono_ruim', 'anamnese'],
    ['hipercifose', 'hipercifose', 'scan postural'],
    ['escoliose', 'escoliose', 'scan postural'],
    ['hiperlordose', 'hiperlordose', 'scan postural'],
    ['protrusaoOmbro', 'protrusao_ombro', 'scan postural'],
    ['valgoJoelho', 'valgo_joelho', 'scan postural'],
  ];
  for (const [k, id, origem] of hmap) if (health[k]) set(id, true, origem);
  if (health.dorLocal) set('local_dor', health.dorLocal, 'anamnese (dores)');
  return fillDefaults(fields, out);
}

export function suggestCardioValues(fields: WizardField[], lastCardio: any | null): Record<string, Suggestion> {
  const out: Record<string, Suggestion> = {};
  const payload = lastCardio?.conteudo ? parseCardioPayload(lastCardio.conteudo) : null;
  if (payload) {
    const when = lastCardio?.created_at ? new Date(lastCardio.created_at).toLocaleDateString('pt-BR') : '';
    const src = `cardio atual${when ? ` (${when})` : ''}`;
    const protocols: CardioProtocol[] = isWeeklyPlan(payload) ? payload.protocols : [payload as CardioProtocol];
    const freq = isWeeklyPlan(payload) ? payload.frequencyPerWeek || protocols.length : (payload as CardioProtocol).frequencyPerWeek;
    if (freq >= 1 && freq <= 6) out.frequencia_semana = { valor_atual: String(freq), origem_valor: src };
    const mods = Array.from(new Set(protocols.map((p) => p.modality).filter(Boolean)));
    if (mods.length) out.modalidades = { valor_atual: mods, origem_valor: src };
    const structs = Array.from(new Set(protocols.map((p) => p.structure)));
    if (structs.length === 1 && structs[0]) out.estilo = { valor_atual: structs[0], origem_valor: src };
    const ints = Array.from(new Set(protocols.map((p) => p.intensity)));
    if (ints.length === 1 && ints[0]) out.intensidade = { valor_atual: ints[0], origem_valor: src };
  }
  return fillDefaults(fields, out);
}

/** Campos sem dado do aluno: usa o valor inicial do wizard quando ele existe. */
export function fillDefaults(fields: WizardField[], out: Record<string, Suggestion>) {
  for (const f of fields) {
    if (out[f.id]) continue;
    const p = f.padrao;
    const empty = p === '' || p === null || p === undefined || p === false ||
      (Array.isArray(p) && p.length === 0) || (typeof p === 'object' && p && !Array.isArray(p) && Object.keys(p).length === 0);
    out[f.id] = empty ? { valor_atual: null, origem_valor: null } : { valor_atual: p, origem_valor: 'padrão do wizard' };
  }
  return out;
}

export function resumoTreinoAtual(lastPlan: any | null): string {
  if (!lastPlan) return 'Aluno sem treino publicado.';
  const plan = lastPlan.conteudo_json ? normalizeWorkoutPlan(lastPlan.conteudo_json) : null;
  const when = lastPlan.created_at ? new Date(lastPlan.created_at).toLocaleDateString('pt-BR') : '';
  if (!plan) return `${lastPlan.titulo ?? 'Treino'}${when ? ` (${when})` : ''}`;
  const days = plan.days.filter((d) => d.exercises.length);
  return [
    `${lastPlan.titulo ?? 'Treino'}${when ? ` — publicado em ${when}` : ''}; ${days.length} dia(s)/semana${lastPlan.fase ? `; fase ${lastPlan.fase}` : ''}.`,
    ...days.map((d) => `- ${d.day}${d.focus ? ` (${d.focus})` : ''}: ${d.exercises.length} exercícios`),
  ].join('\n');
}

export function resumoTreinoCompleto(json: unknown): string {
  const plan = normalizeWorkoutPlan(json);
  return plan ? workoutPlanToMarkdown(plan) : '';
}

const fmtProtocol = (p: CardioProtocol, i?: number): string => {
  const head = `${i != null ? `Sessão ${i + 1}: ` : ''}${p.title} — ${MODALITY_LABEL[p.modality] ?? p.modality}, ${STRUCTURE_LABEL[p.structure] ?? p.structure}, intensidade ${INTENSITY_LABEL[p.intensity] ?? p.intensity}, ${formatDurationFromSec(totalCardioDurationSec(p))}`;
  const blocks = (p.blocks ?? []).map((b) => {
    const parts = [
      `${b.type} ${formatDurationFromSec(b.durationSec)}`,
      b.intensityLabel,
      b.targetZone,
      b.targetHrRange ? `FC ${b.targetHrRange}` : '',
      b.speedKmh != null ? `${b.speedKmh} km/h` : '',
      b.inclinePct != null ? `${b.inclinePct}%` : '',
      b.resistanceLevel != null ? `nível ${b.resistanceLevel}` : '',
      b.cadenceRpm != null ? `${b.cadenceRpm} rpm` : '',
      b.bikePosition ?? '',
      b.notes ?? '',
    ].filter(Boolean);
    return `   • ${parts.join(' · ')}`;
  });
  const extra = [
    p.targetZoneSummary ? `   Zona alvo: ${p.targetZoneSummary}` : '',
    ...(p.safetyNotes ?? []).map((n) => `   Segurança: ${n}`),
    ...(p.executionTips ?? []).map((n) => `   Dica: ${n}`),
  ].filter(Boolean);
  return [head, ...blocks, ...extra].join('\n');
};

export function resumoCardioCompleto(payload: CardioPayload | null): string {
  if (!payload) return '';
  if (isWeeklyPlan(payload)) {
    return [`Plano semanal de cardio — ${payload.frequencyPerWeek}x/semana`, ...payload.protocols.map((p, i) => fmtProtocol(p, i))].join('\n\n');
  }
  return fmtProtocol(payload as CardioProtocol);
}

export function resumoCardioAtual(lastCardio: any | null): string {
  if (!lastCardio) return 'Aluno sem cardio publicado.';
  const p = parseCardioPayload(lastCardio.conteudo);
  const when = lastCardio.created_at ? new Date(lastCardio.created_at).toLocaleDateString('pt-BR') : '';
  if (!p) return `${lastCardio.titulo ?? 'Cardio'}${when ? ` (${when})` : ''}`;
  const protocols = isWeeklyPlan(p) ? p.protocols : [p as CardioProtocol];
  return [
    `${lastCardio.titulo ?? 'Cardio'}${when ? ` — publicado em ${when}` : ''}`,
    ...protocols.map((x) => `- ${x.title}: ${MODALITY_LABEL[x.modality] ?? x.modality}, ${STRUCTURE_LABEL[x.structure] ?? x.structure}, ${x.totalDurationMin} min`),
  ].join('\n');
}
