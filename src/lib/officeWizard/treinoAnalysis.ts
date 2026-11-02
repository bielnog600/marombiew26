/**
 * Análise determinística do treino vigente (office-gerar → analisar) e
 * checagens compartilhadas com o `ajustar`. Sem IA, sem escrita.
 */
import type { WorkoutExercise, WorkoutPlan } from '../workoutSchema';
import { OFFICE_PAUSE_OPTS, REC_REPS_OPTS, WORK_REPS_OPTS } from '../workoutEditorOptions';

export type GrupoMuscular =
  | 'peito' | 'costas' | 'quadriceps' | 'gluteo' | 'posterior'
  | 'biceps' | 'triceps' | 'ombro' | 'panturrilha' | 'abdomen' | 'adutores' | 'outro';

export const GRUPOS_PEQUENOS: GrupoMuscular[] = ['biceps', 'triceps', 'ombro', 'panturrilha', 'abdomen'];
export const GRUPOS_GRANDES: GrupoMuscular[] = ['costas', 'peito', 'quadriceps', 'gluteo', 'posterior'];
export const ALVO_PEQUENO = { min: 8, max: 12 };
export const ALVO_GRANDE = { min: 12, max: 20 };
export const LIMITE_DIA_SEMANA1 = 18;

const GRUPO_LABEL: Record<GrupoMuscular, string> = {
  peito: 'Peito', costas: 'Costas', quadriceps: 'Quadríceps', gluteo: 'Glúteo', posterior: 'Posterior',
  biceps: 'Bíceps', triceps: 'Tríceps', ombro: 'Ombro', panturrilha: 'Panturrilha', abdomen: 'Abdômen',
  adutores: 'Adutores', outro: 'Outros',
};
export const grupoLabel = (g: GrupoMuscular) => GRUPO_LABEL[g];

export const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Mobilidade/alongamento/liberação/ativação/respiração: não contam como séries. */
export const isNaoContavel = (name: string) =>
  /mobilidade|alongamento|liberacao|ativacao|respiracao/.test(norm(name));

/** Grupo principal pelo nome (regras do Fabiew), com fallback no grupo do banco. */
export function grupoPrincipal(name: string, grupoBanco?: string | null): GrupoMuscular {
  const n = norm(name);
  if (/triceps/.test(n)) return 'triceps';
  if (/elevacao pelvica|hip thrust|kick ?back|abdutora|abducao|gluteo|coice/.test(n)) return 'gluteo';
  if (/adutora|aducao/.test(n)) return 'adutores';
  if (/stiff|rdl|romeno|good morning|flexora|nordic|hiperextensao/.test(n)) return 'posterior';
  if (/panturrilha|gemeos|soleo/.test(n)) return 'panturrilha';
  if (/crucifixo inverso|face pull|desenvolvimento|elevacao lateral|elevacao frontal|ombro|arnold|remada alta/.test(n)) return 'ombro';
  if (/afundo|agachamento|leg|hack|extensora|bulgaro|passada|sissy|avanco|step ?up/.test(n)) return 'quadriceps';
  if (/rosca|biceps/.test(n)) return 'biceps';
  if (/testa|frances|mergulho/.test(n)) return 'triceps';
  if (/supino|crucifixo|peck|voador|crossover|cross over|flexao de braco|peitoral/.test(n)) return 'peito';
  if (/puxada|remada|pulldown|pull ?down|barra fixa|pull ?up|pullover|costas|graviton|serrote/.test(n)) return 'costas';
  if (/abdominal|abdomen|prancha|crunch|infra|obliquo|roda abdominal/.test(n)) return 'abdomen';
  const b = norm(grupoBanco);
  if (/peit/.test(b)) return 'peito';
  if (/costa|dorsal/.test(b)) return 'costas';
  if (/quadri|coxa/.test(b)) return 'quadriceps';
  if (/glut/.test(b)) return 'gluteo';
  if (/posterior|isquio/.test(b)) return 'posterior';
  if (/bicep/.test(b)) return 'biceps';
  if (/tricep/.test(b)) return 'triceps';
  if (/ombro|deltoid/.test(b)) return 'ombro';
  if (/pantu/.test(b)) return 'panturrilha';
  if (/abdo|core/.test(b)) return 'abdomen';
  return 'outro';
}

const int = (v: unknown) => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Séries de trabalho (reconhecimento não conta). Mesmo critério do editor. */
export function seriesDeTrabalho(ex: WorkoutExercise): number {
  if (isNaoContavel(ex.exercise)) return 0;
  if (ex.setScheme?.sets?.length) return ex.setScheme.sets.filter((s) => s.set_type === 'work').length;
  const s1 = int(ex.series);
  const s2 = int(ex.series2);
  if (s1 > 0 && s2 > 0) return s2; // modo Reconhecimento + trabalho
  return s1 || s2;
}

const isComposite = (reps: string) => reps.includes('+');
const pauseLabel = (ex: WorkoutExercise) =>
  ex.restSeconds ? `${ex.restSeconds}s` : String(ex.pause ?? '').trim();

/** Problemas de campos vazios/fora dos selects do editor em um exercício. */
export function problemasCampos(ex: WorkoutExercise): string[] {
  const out: string[] = [];
  if (!String(ex.exercise ?? '').trim()) out.push('exercício sem nome');
  const mob = isNaoContavel(ex.exercise);
  const reps = String(ex.reps ?? '').trim();
  if (!int(ex.series) && !int(ex.series2) && !ex.setScheme?.sets?.length) out.push('séries em branco');
  if (ex.setScheme?.sets?.length) {
    for (const s of ex.setScheme.sets) {
      const ok = s.set_type === 'work' ? WORK_REPS_OPTS : [...REC_REPS_OPTS, ...WORK_REPS_OPTS];
      if (!ok.includes(String(s.target_reps).trim())) out.push(`reps "${s.target_reps}" fora do editor (série ${s.set_number})`);
    }
  } else if (!reps) {
    out.push('reps em branco');
  } else if (!mob) {
    if (isComposite(reps)) {
      const [r, w] = reps.split('+').map((p) => p.trim());
      if (!REC_REPS_OPTS.includes(r) && !WORK_REPS_OPTS.includes(r)) out.push(`reps de reconhecimento "${r}" fora do editor`);
      if (!WORK_REPS_OPTS.includes(w)) out.push(`reps "${w}" fora do editor`);
    } else if (!WORK_REPS_OPTS.includes(reps)) out.push(`reps "${reps}" fora do editor`);
  }
  const p = pauseLabel(ex);
  if (!p) { if (!mob) out.push('pausa em branco'); }
  else if (!OFFICE_PAUSE_OPTS.includes(p)) out.push(`pausa "${p}" fora do editor`);
  return out;
}

const VARIACAO_PROPRIA = /^(kick ?back|hiperextensao lombar)/;
export const isProibido = (name: string) => {
  const n = norm(name);
  return /isometria (na )?parede/.test(n) || n === 'elevacao pelvica unilateral' || n === 'elevacao pelvica unilateral 1';
};
const isCompostoGluteo = (name: string) => /elevacao pelvica|hip thrust/.test(norm(name));
const isPuxadaVertical = (name: string) => /puxada|pulldown|pull ?down|barra fixa|pull ?up|graviton/.test(norm(name)) && !/(braco|bracos) estendido|pullover/.test(norm(name));
const isInferior = (g: GrupoMuscular) => ['quadriceps', 'gluteo', 'posterior', 'adutores'].includes(g);

export interface AnaliseTreino {
  texto: string;
  porDia: Array<{ dia: string; series: number; acimaLimite: boolean }>;
  porGrupo: Array<{ grupo: GrupoMuscular; series: number; alvo: { min: number; max: number } | null; status: 'abaixo' | 'ok' | 'acima' | 'sem_alvo' }>;
  avisos: string[];
}

export function analisarTreino(
  plan: WorkoutPlan,
  opts: { semana?: number | null; grupoBanco?: (name: string) => string | null } = {},
): AnaliseTreino {
  const semana = opts.semana ?? null;
  const porDia: AnaliseTreino['porDia'] = [];
  const totals = new Map<GrupoMuscular, number>();
  const avisos: string[] = [];
  const principaisPorDia = plan.days.map((d) => new Set(d.exercises.map((e) => norm(e.exercise))));

  plan.days.forEach((day, di) => {
    let diaSeries = 0;
    const gruposDia = new Map<GrupoMuscular, number>();
    for (const ex of day.exercises) {
      const g = grupoPrincipal(ex.exercise, opts.grupoBanco?.(ex.exercise));
      const s = seriesDeTrabalho(ex);
      diaSeries += s;
      if (s > 0) {
        totals.set(g, (totals.get(g) ?? 0) + s);
        gruposDia.set(g, (gruposDia.get(g) ?? 0) + 1);
      }
      const label = `${day.day} · ${ex.exercise || '(sem nome)'}`;
      for (const p of problemasCampos(ex)) avisos.push(`${label}: ${p}.`);
      if (isProibido(ex.exercise)) avisos.push(`${label}: exercício que não entra nas regras Marombiew.`);
      if (!isNaoContavel(ex.exercise)) {
        const v = String(ex.variation ?? '').trim();
        if (!v || v === '-' || v === '—') avisos.push(`${label}: variação vazia.`);
        else {
          if (isProibido(v)) avisos.push(`${label}: variação "${v}" não entra nas regras Marombiew.`);
          const nv = norm(v);
          if (!VARIACAO_PROPRIA.test(norm(ex.exercise))) {
            const outro = principaisPorDia.findIndex((set, j) => j !== di && set.has(nv));
            if (outro >= 0) avisos.push(`${label}: variação "${v}" repete o principal de ${plan.days[outro].day}.`);
          }
        }
      }
    }
    const temInferior = [...gruposDia.keys()].filter(isInferior).length > 0 && ((gruposDia.get('quadriceps') ?? 0) + (gruposDia.get('gluteo') ?? 0) + (gruposDia.get('posterior') ?? 0)) >= 2;
    if (temInferior && (gruposDia.get('gluteo') ?? 0) > 0 && !day.exercises.some((e) => isCompostoGluteo(e.exercise))) {
      avisos.push(`${day.day}: dia de inferiores com glúteo sem composto de glúteo (elevação pélvica).`);
    }
    const costasDia = (gruposDia.get('costas') ?? 0) >= 2 || /costas|dorsal/.test(norm(day.focus));
    if (costasDia && !day.exercises.some((e) => isPuxadaVertical(e.exercise))) {
      avisos.push(`${day.day}: dia de costas sem puxada vertical composta.`);
    }
    const acimaLimite = (semana == null || semana === 1) && diaSeries > LIMITE_DIA_SEMANA1;
    porDia.push({ dia: day.day, series: diaSeries, acimaLimite });
  });

  const porGrupo: AnaliseTreino['porGrupo'] = [];
  for (const g of [...GRUPOS_GRANDES, ...GRUPOS_PEQUENOS]) {
    const s = totals.get(g) ?? 0;
    const alvo = GRUPOS_GRANDES.includes(g) ? ALVO_GRANDE : ALVO_PEQUENO;
    porGrupo.push({ grupo: g, series: s, alvo, status: s < alvo.min ? 'abaixo' : s > alvo.max ? 'acima' : 'ok' });
  }
  for (const g of ['adutores', 'outro'] as GrupoMuscular[]) {
    const s = totals.get(g) ?? 0;
    if (s > 0) porGrupo.push({ grupo: g, series: s, alvo: null, status: 'sem_alvo' });
  }

  const L: string[] = [];
  L.push(`Análise do treino${semana ? ` (semana ${semana} do ciclo)` : ''}`);
  L.push('');
  L.push('Séries de trabalho por dia (reconhecimento e mobilidade não contam):');
  for (const d of porDia) L.push(`• ${d.dia}: ${d.series}${d.acimaLimite ? ` ⚠ acima de ${LIMITE_DIA_SEMANA1}${semana == null ? ' (semana do ciclo desconhecida; limite da semana 1)' : ' na semana 1'}` : ''}`);
  L.push('');
  L.push('Séries de trabalho por grupo na semana:');
  for (const g of porGrupo) {
    const alvo = g.alvo ? ` (alvo ${g.alvo.min}–${g.alvo.max})` : '';
    const st = g.status === 'abaixo' ? ' ⚠ abaixo' : g.status === 'acima' ? ' ⚠ acima' : g.status === 'ok' ? ' ✓' : '';
    L.push(`• ${grupoLabel(g.grupo)}: ${g.series}${alvo}${st}`);
  }
  L.push('');
  if (avisos.length) {
    L.push('Pontos a corrigir:');
    for (const a of avisos) L.push(`• ${a}`);
  } else L.push('Nenhum campo em branco, valor fora do editor ou falha de estrutura encontrado.');
  return { texto: L.join('\n'), porDia, porGrupo, avisos };
}

/** Semana do ciclo pelo início do bloco (ou criação do plano). */
export function semanaDoCiclo(plan: { block_start_date?: string | null; fase_inicio_data?: string | null; created_at?: string | null } | null, now = new Date()): number | null {
  const start = plan?.block_start_date ?? plan?.fase_inicio_data ?? plan?.created_at ?? null;
  if (!start) return null;
  const t = Date.parse(start);
  if (!Number.isFinite(t)) return null;
  const w = Math.floor((now.getTime() - t) / (7 * 86400000)) + 1;
  return w >= 1 ? w : 1;
}
