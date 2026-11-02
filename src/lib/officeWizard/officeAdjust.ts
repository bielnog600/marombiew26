/**
 * `ajustar` do escritório: categorias, regras Marombiew, prompts, validação do
 * plano alterado e seção "O que mudou". Puro (sem banco e sem IA) para ser
 * testado no app e empacotado no officeCore do servidor.
 */
import { normalizeWorkoutPlan, type WorkoutExercise, type WorkoutPlan } from '../workoutSchema';
import { OFFICE_PAUSE_OPTS, REC_REPS_OPTS, WORK_REPS_OPTS } from '../workoutEditorOptions';
import { isNaoContavel, isProibido, norm, problemasCampos, seriesDeTrabalho } from './treinoAnalysis';
import { REGRAS_MAROMBIEW_DIETA, REGRAS_MAROMBIEW_TREINO } from './regrasMarombiew';

export const AJUSTE_CATEGORIAS = {
  treino: ['volume', 'exercicios', 'reps_pausa', 'metodos', 'dias', 'descricoes', 'revisar', 'livre'],
  dieta: ['porcoes', 'alimentos', 'macros', 'refeicoes', 'revisar', 'livre'],
  cardio: ['frequencia', 'intensidade', 'modalidade', 'livre'],
} as const;
export type AjusteTipo = keyof typeof AJUSTE_CATEGORIAS;

export function categoriaValida(tipo: AjusteTipo, categoria: string): boolean {
  return (AJUSTE_CATEGORIAS[tipo] as readonly string[]).includes(categoria);
}

/** Formato técnico dos campos (como o editor grava as técnicas e o reconhecimento). */
const FORMATO_TECNICAS = `FORMATO DOS CAMPOS (como o editor grava)
- Reconhecimento + trabalho: series=1 (reconhecimento), series2=N (trabalho), reps "12 + 8-10".
- Drop set: metodo "dropset" + metodo_params {aplicar:"ultima"|"todas", drops, reducao_pct}. Rest-pause: metodo "restpause" + {aplicar, pausa_s (10–30), minis}. Cluster: metodo "cluster" + {blocos, reps_bloco, pausa_s}. Bi-set/superset: mesmo grupo_id nos dois exercícios consecutivos, tipo_grupo "biset"|"superset", ordem_grupo "A"/"B", pausa_grupo_s 0–10. Pirâmide de reps: setScheme {mode:"per_set", sets:[{set_number, set_type:"work", target_reps}]} + method {slug:"pyramid_up"} (ou pyramid_down se decrescente).
- Mobilidade, alongamento, liberação, ativação e respiração NÃO contam séries.`;

export const REGRAS_TREINO_MAROMBIEW = `REGRAS MAROMBIEW (literais do Fabiew)\n${REGRAS_MAROMBIEW_TREINO}\n\n${FORMATO_TECNICAS}`;

export const REGRAS_DIETA_MAROMBIEW = `REGRAS MAROMBIEW (literais do Fabiew)\n${REGRAS_MAROMBIEW_DIETA}
- Tolerância da meta diária: kcal ±50, P ±10 g, C ±15 g, G ±8 g.
- portionLabel sempre em medida caseira ("2 ovos", "1 lata", "1 pote", "2 fatias").`;

const OPCOES_EDITOR = `VALORES ACEITOS PELO EDITOR (nada fora disso)
- Reps de trabalho: ${WORK_REPS_OPTS.join(', ')}.
- Reps de reconhecimento (antes do "+"): ${REC_REPS_OPTS.join(', ')}.
- Pausa (restSeconds em segundos, equivalente a): ${OFFICE_PAUSE_OPTS.join(', ')}.`;

const CATEGORIA_TREINO: Record<string, string> = {
  volume: 'Ajuste de VOLUME (séries por exercício/grupo).',
  exercicios: 'Troca/inclusão/remoção de EXERCÍCIOS ou variações.',
  reps_pausa: 'Ajuste de REPETIÇÕES e PAUSAS.',
  metodos: 'Aplicar/remover MÉTODOS (drop set, rest-pause, cluster, pirâmide, bi-set/superset).',
  dias: 'Mudança na estrutura de DIAS (ordem, divisão, foco).',
  descricoes: 'Reescrever DESCRIÇÕES (estratégia para avançado).',
  revisar: 'REVISAR o treino inteiro aplicando TODAS as regras Marombiew (pode mexer onde for preciso para cumprir as regras).',
  livre: 'Pedido livre.',
};
const CATEGORIA_DIETA: Record<string, string> = {
  porcoes: 'Ajuste de PORÇÕES.', alimentos: 'Troca/inclusão/remoção de ALIMENTOS.',
  macros: 'Ajuste de MACROS (mantendo a meta publicada).', refeicoes: 'Mudança de REFEIÇÕES (horários, ordem, composição).',
  revisar: 'REVISAR a dieta inteira aplicando TODAS as regras Marombiew.', livre: 'Pedido livre.',
};
const CATEGORIA_CARDIO: Record<string, string> = {
  frequencia: 'Ajuste de FREQUÊNCIA.', intensidade: 'Ajuste de INTENSIDADE/zonas.', modalidade: 'Troca de MODALIDADE.', livre: 'Pedido livre.',
};

export interface AjusteMessages { system: string; user: string }

export function buildTreinoAjusteMessages(p: {
  plan: WorkoutPlan; categoria: string; pedido: string; catalogBlock: string; metodos: string[]; correcao?: string[];
}): AjusteMessages {
  const revisar = p.categoria === 'revisar';
  const system = [
    'Você é o assistente de prescrição do personal Fabiew (Marombiew). Recebe o treino VIGENTE em JSON e um pedido de ajuste.',
    revisar
      ? 'REVISÃO: aplique LITERALMENTE TODAS as regras Marombiew abaixo ao treino inteiro e devolva o treino COMPLETO corrigido, no MESMO formato JSON (version, type "workout", metadata, days[].exercises[]). Mude onde for preciso para cumprir as regras e mantenha o resto idêntico. Preserve os "id" de dias e exercícios existentes; exercícios novos recebem id novo único. Em "mudancas", liste cada correção feita (antes → depois, com o motivo).'
      : 'Devolva o treino COMPLETO alterado, no MESMO formato JSON (version, type "workout", metadata, days[].exercises[]), mudando SOMENTE o que o pedido exige. Todo o resto (ids, ordem, campos, textos) fica byte a byte idêntico. Preserve os "id" de dias e exercícios existentes; exercícios novos recebem id novo único. As regras Marombiew abaixo são regras de fundo: o que você alterar ou incluir precisa respeitá-las.',
    'Exercícios e variações: SOMENTE nomes exatos do banco abaixo.',
    OPCOES_EDITOR,
    REGRAS_TREINO_MAROMBIEW,
    `Métodos ativos (method.slug): ${p.metodos.join(', ') || 'nenhum'}.`,
    'Resposta: JSON { "plan": <treino completo>, "mudancas": ["antes → depois", ...] }.',
    'BANCO DE EXERCÍCIOS:\n' + p.catalogBlock,
  ].join('\n\n');
  const user = [
    `Categoria: ${CATEGORIA_TREINO[p.categoria] ?? p.categoria}`,
    ...(p.semana ? [`Fase semanal = semana ${p.semana} do ciclo${p.semana === 1 ? ' (limite de 18 séries de trabalho por dia)' : ''}.`] : []),
    ...(p.aluno ? [`Aluno: ${p.aluno}`] : []),
    `Pedido do Fabiew: ${p.pedido}`,
    ...(p.correcao?.length ? [`CORRIJA estes problemas da sua resposta anterior, sem mexer em mais nada:\n- ${p.correcao.join('\n- ')}`] : []),
    'Treino vigente (JSON):',
    JSON.stringify(p.plan),
  ].join('\n\n');
  return { system, user };
}

export function buildDietaAjusteMessages(p: {
  plan: unknown; categoria: string; pedido: string; foodCatalogBlock: string; correcao?: string[];
}): AjusteMessages {
  const revisar = p.categoria === 'revisar';
  const system = [
    'Você é o assistente de nutrição do personal Fabiew (Marombiew). Recebe a dieta VIGENTE em JSON e um pedido de ajuste.',
    revisar
      ? 'REVISÃO: aplique LITERALMENTE TODAS as regras Marombiew abaixo à dieta inteira e devolva a dieta COMPLETA corrigida, no MESMO contrato (meta, targets, days[].meals[].items[] com foodId, name, qtyGrams, portionLabel, macros). Mantenha targets (a meta publicada) intactos. Em "mudancas", liste cada correção feita (antes → depois, com o motivo).'
      : 'Devolva a dieta COMPLETA alterada, no MESMO contrato (meta, targets, days[].meals[].items[] com foodId, name, qtyGrams, portionLabel, macros), mudando SOMENTE o que o pedido exige; o resto fica idêntico. Mantenha targets (a meta publicada) intactos. As regras Marombiew abaixo são regras de fundo: o que você alterar ou incluir precisa respeitá-las.',
    'Alimentos: SOMENTE da base abaixo, com o foodId e o nome exatos. Os macros serão recalculados pela base.',
    REGRAS_DIETA_MAROMBIEW,
    'Resposta: JSON { "plan": <dieta completa>, "mudancas": ["antes → depois", ...] }.',
    'BASE DE ALIMENTOS:\n' + p.foodCatalogBlock,
  ].join('\n\n');
  const user = [
    `Categoria: ${CATEGORIA_DIETA[p.categoria] ?? p.categoria}`,
    `Pedido do Fabiew: ${p.pedido}`,
    ...(p.correcao?.length ? [`CORRIJA estes problemas da sua resposta anterior, sem mexer em mais nada:\n- ${p.correcao.join('\n- ')}`] : []),
    'Dieta vigente (JSON):',
    JSON.stringify(p.plan),
  ].join('\n\n');
  return { system, user };
}

export function buildCardioAjusteMessages(p: { payload: unknown; categoria: string; pedido: string }): AjusteMessages {
  return {
    system: [
      'Você é o assistente de cardio do personal Fabiew (Marombiew). Recebe o plano de cardio VIGENTE em JSON e um pedido de ajuste.',
      'Devolva o plano COMPLETO alterado no MESMO formato JSON, mudando SOMENTE o que o pedido exige; o resto fica idêntico.',
      'Resposta: JSON { "plan": <cardio completo>, "mudancas": ["antes → depois", ...] }.',
    ].join('\n\n'),
    user: [`Categoria: ${CATEGORIA_CARDIO[p.categoria] ?? p.categoria}`, `Pedido do Fabiew: ${p.pedido}`, 'Cardio vigente (JSON):', JSON.stringify(p.payload)].join('\n\n'),
  };
}

/** Extrai { plan, mudancas } da resposta (aceita JSON em texto ou o plano direto). */
export function parseAjusteResposta(content: unknown): { plan: unknown; mudancas: string[] } | null {
  let v: any = content;
  if (typeof v === 'string') {
    const t = v.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { v = JSON.parse(t); } catch { return null; }
  }
  if (!v || typeof v !== 'object') return null;
  let plan = 'plan' in v ? v.plan : v;
  if (typeof plan === 'string') { try { plan = JSON.parse(plan); } catch { return null; } }
  const mudancas = Array.isArray(v.mudancas) ? v.mudancas.map(String) : [];
  return plan && typeof plan === 'object' ? { plan, mudancas } : null;
}

const MIN3 = /rosca|biceps|triceps|testa|frances|extensora|flexora|elevacao pelvica|hip thrust|afundo|kick ?back/;

/**
 * Valida o treino ajustado contra o banco e o editor. `catalogNames`: nomes do
 * banco. `before` serve para exigir as regras só nos exercícios que mudaram,
 * exceto em `revisar`, que exige em tudo.
 */
export function validateTreinoAjuste(
  before: WorkoutPlan,
  rawAfter: unknown,
  catalogNames: Iterable<string>,
  metodos: Iterable<string>,
  categoria: string,
): { plan: WorkoutPlan | null; erros: string[] } {
  const after = normalizeWorkoutPlan(rawAfter);
  if (!after || !after.days.length) return { plan: null, erros: ['Resposta sem treino no formato do editor (days/exercises).'] };
  const names = new Set([...catalogNames].map(norm));
  const slugs = new Set([...metodos]);
  const beforeById = new Map<string, WorkoutExercise>();
  for (const d of before.days) for (const e of d.exercises) beforeById.set(e.id, e);
  const erros: string[] = [];
  const ids = new Set<string>();
  for (const day of after.days) {
    for (const ex of day.exercises) {
      const label = `${day.day} · ${ex.exercise || '(sem nome)'}`;
      if (ids.has(ex.id)) erros.push(`${label}: id repetido (${ex.id}).`);
      ids.add(ex.id);
      const prev = beforeById.get(ex.id);
      const changed = categoria === 'revisar' || !prev || JSON.stringify(prev) !== JSON.stringify(ex);
      if (!changed) continue;
      if (!names.has(norm(ex.exercise))) erros.push(`${label}: exercício fora do banco (use o nome exato).`);
      const v = String(ex.variation ?? '').trim();
      if (v && v !== '-' && v !== '—' && !names.has(norm(v))) erros.push(`${label}: variação "${v}" fora do banco.`);
      if (isProibido(ex.exercise) || (v && isProibido(v))) erros.push(`${label}: exercício proibido pelas regras Marombiew.`);
      for (const pr of problemasCampos(ex)) erros.push(`${label}: ${pr}.`);
      if (!isNaoContavel(ex.exercise) && MIN3.test(norm(ex.exercise)) && seriesDeTrabalho(ex) < 3) erros.push(`${label}: mínimo 3 séries de trabalho.`);
      if (ex.method?.slug && slugs.size && !slugs.has(ex.method.slug)) erros.push(`${label}: método "${ex.method.slug}" não existe.`);
      if (ex.grupo_id) {
        const pares = day.exercises.filter((o) => o.grupo_id === ex.grupo_id);
        if (pares.length !== 2) erros.push(`${label}: agrupamento ${ex.tipo_grupo ?? ''} precisa de exatamente 2 exercícios.`);
      }
    }
  }
  return { plan: after, erros };
}

// ─── "O que mudou" ──────────────────────────────────────────────────

const exResumo = (e: WorkoutExercise) => {
  const reps = e.setScheme?.mode === 'per_set' ? e.setScheme.sets.map((s) => s.target_reps).join('/') : e.reps;
  const series = e.series2 ? `${e.series}+${e.series2}` : e.series;
  const pausa = e.restSeconds ? `${e.restSeconds}s` : e.pause;
  const metodo = [e.method?.slug, e.metodo && e.metodo !== 'nenhum' ? e.metodo : null, e.tipo_grupo ? `${e.tipo_grupo} ${e.ordem_grupo ?? ''}`.trim() : null].filter(Boolean).join(', ');
  return `${e.exercise} ${series || '?'}x${reps || '?'}${pausa ? ` pausa ${pausa}` : ''}${metodo ? ` [${metodo}]` : ''}${e.variation ? ` (var. ${e.variation})` : ''}`;
};

const CAMPOS: Array<[keyof WorkoutExercise, string]> = [
  ['exercise', 'exercício'], ['variation', 'variação'], ['series', 'séries'], ['series2', 'séries de trabalho'], ['reps', 'reps'],
  ['rir', 'RIR'], ['restSeconds', 'pausa'], ['pause', 'pausa'], ['description', 'descrição'], ['setScheme', 'esquema de séries'],
  ['method', 'método'], ['metodo', 'método'], ['metodo_params', 'parâmetros do método'], ['grupo_id', 'agrupamento'], ['tipo_grupo', 'tipo de agrupamento'],
];
const show = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function mudancasTreino(before: WorkoutPlan, after: WorkoutPlan): string[] {
  const out: string[] = [];
  const bDays = new Map(before.days.map((d) => [d.id, d]));
  const aDays = new Map(after.days.map((d) => [d.id, d]));
  for (const d of before.days) if (!aDays.has(d.id)) out.push(`${d.day}: dia removido`);
  for (const d of after.days) {
    const b = bDays.get(d.id);
    if (!b) { out.push(`${d.day}: dia novo (${d.exercises.map((e) => e.exercise).join(', ')})`); continue; }
    if (b.day !== d.day || (b.focus ?? '') !== (d.focus ?? '')) out.push(`${b.day}${b.focus ? ` (${b.focus})` : ''} → ${d.day}${d.focus ? ` (${d.focus})` : ''}`);
    const bEx = new Map(b.exercises.map((e) => [e.id, e]));
    const aIds = new Set(d.exercises.map((e) => e.id));
    for (const e of b.exercises) if (!aIds.has(e.id)) out.push(`${d.day}: removido ${exResumo(e)}`);
    d.exercises.forEach((e, i) => {
      const p = bEx.get(e.id);
      if (!p) { out.push(`${d.day}: incluído ${exResumo(e)}`); return; }
      for (const [k, label] of CAMPOS) {
        if (JSON.stringify(p[k] ?? null) !== JSON.stringify(e[k] ?? null)) out.push(`${d.day} · ${p.exercise}: ${label} ${show(p[k])} → ${show(e[k])}`);
      }
      if (b.exercises.indexOf(p) !== i) out.push(`${d.day} · ${e.exercise}: posição ${b.exercises.indexOf(p) + 1} → ${i + 1}`);
    });
  }
  return out;
}

// deno-lint-ignore no-explicit-any
const itemKey = (it: any) => String(it?.foodId || norm(it?.name));
// deno-lint-ignore no-explicit-any
const itemTxt = (it: any) => `${it?.name ?? '?'}${it?.qtyGrams ? ` ${Math.round(Number(it.qtyGrams))}g` : ''}`;

// deno-lint-ignore no-explicit-any
export function mudancasDieta(before: any, after: any): string[] {
  const out: string[] = [];
  const bDays: any[] = before?.days ?? [];
  const aDays: any[] = after?.days ?? [];
  const multi = aDays.length > 1;
  aDays.forEach((d, di) => {
    const b = bDays.find((x) => x.label === d.label) ?? bDays[di];
    const pre = multi ? `${d.label} · ` : '';
    if (!b) { out.push(`${pre}dia novo`); return; }
    const bMeals: any[] = b.meals ?? [];
    for (const m of bMeals) if (!(d.meals ?? []).some((x: any) => x.id === m.id || x.name === m.name)) out.push(`${pre}${m.name}: refeição removida`);
    for (const m of d.meals ?? []) {
      const pm = bMeals.find((x) => x.id === m.id) ?? bMeals.find((x) => x.name === m.name);
      if (!pm) { out.push(`${pre}${m.name}: refeição nova (${(m.items ?? []).map(itemTxt).join(', ')})`); continue; }
      if ((pm.time ?? '') !== (m.time ?? '')) out.push(`${pre}${m.name}: horário ${pm.time ?? '—'} → ${m.time ?? '—'}`);
      const bi = new Map((pm.items ?? []).map((it: any) => [itemKey(it), it]));
      const ai = new Map((m.items ?? []).map((it: any) => [itemKey(it), it]));
      for (const [k, it] of bi) if (!ai.has(k)) out.push(`${pre}${m.name}: sai ${itemTxt(it)}`);
      for (const [k, it] of ai) {
        const p: any = bi.get(k);
        if (!p) out.push(`${pre}${m.name}: entra ${itemTxt(it)}`);
        else if (Math.round(Number(p.qtyGrams ?? 0)) !== Math.round(Number((it as any).qtyGrams ?? 0))) out.push(`${pre}${m.name}: ${itemTxt(p)} → ${itemTxt(it)}`);
      }
    }
    const bt = b.totals ?? {}; const at = d.totals ?? {};
    if (Math.round(bt.kcal ?? 0) !== Math.round(at.kcal ?? 0)) out.push(`${pre}total ${Math.round(bt.kcal ?? 0)} kcal · P ${Math.round(bt.p ?? 0)} · C ${Math.round(bt.c ?? 0)} · G ${Math.round(bt.g ?? 0)} → ${Math.round(at.kcal ?? 0)} kcal · P ${Math.round(at.p ?? 0)} · C ${Math.round(at.c ?? 0)} · G ${Math.round(at.g ?? 0)}`);
  });
  return out;
}

/** Itens proibidos pelas regras de dieta (manteiga). */
// deno-lint-ignore no-explicit-any
export function dietaItensProibidos(plan: any): string[] {
  const out: string[] = [];
  for (const d of plan?.days ?? []) for (const m of d.meals ?? []) for (const it of m.items ?? []) {
    if (/manteiga/.test(norm(it?.name)) && !/amendoim|castanha|amendoa/.test(norm(it?.name))) out.push(`${d.label} · ${m.name}: ${it.name} (manteiga não entra)`);
  }
  return out;
}

export function mudancasTexto(before: string, after: string): string[] {
  const b = new Set(before.split('\n').map((l) => l.trim()).filter(Boolean));
  const a = after.split('\n').map((l) => l.trim()).filter(Boolean);
  const aSet = new Set(a);
  return [...[...b].filter((l) => !aSet.has(l)).map((l) => `antes: ${l}`), ...a.filter((l) => !b.has(l)).map((l) => `depois: ${l}`)];
}

export function secaoOQueMudou(mudancas: string[], declaradas: string[] = []): string {
  const L = ['', '## O que mudou (antes → depois)', ''];
  if (!mudancas.length) L.push('- Nenhuma diferença encontrada no plano.');
  for (const m of mudancas) L.push(`- ${m}`);
  if (declaradas.length) {
    L.push('', '**Resumo da IA:**', '');
    for (const m of declaradas) L.push(`- ${m}`);
  }
  return L.join('\n');
}
