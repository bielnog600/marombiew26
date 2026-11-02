/**
 * Regras do Fabiew (Marombiew), LITERAIS, usadas no `ajustar` do escritório:
 * na categoria `revisar` todas são aplicadas; nas demais entram como regras de
 * fundo. Também traz as correções que o servidor aplica sem IA (conversão de
 * selects e renomeação de dias do 4x seg–qui) e as tabelas de séries do resumo.
 * Puro: empacotado no officeCore (servidor) e testado no app.
 */
import type { WorkoutExercise, WorkoutPlan } from '../workoutSchema';
import { OFFICE_PAUSE_OPTS, WORK_REPS_OPTS } from '../workoutEditorOptions';
import { analisarTreino, grupoLabel, isNaoContavel, norm, type AnaliseTreino } from './treinoAnalysis';

export const REGRAS_MAROMBIEW_TREINO = `REGRAS (treino):
- Selects válidos: Reps = 6, 8, 10, 12, 15, 6-8, 8-10, 8-12, 10-12, 12-15, 15s, 20s, 30s, 45s, 60s, 90s. Pausa = 10s… 30s, 45s, 60s, 90s, 120s. Converter: 5-8→6-8 · 6-10→8-10 · 9-12→8-12 · 10-15→12-15 (ou 10-12) · 15-18→12-15 · 20-40s→30s · 75s→90s (acessório 60s) · 105s→90s · 150s→120s.
- Toda Variação preenchida, da mesma família e sem repetir o principal de outro dia. Alertas de redundância ("mesma família funcional") → trocar um dos dois.
- Volume: NÃO cortar séries; passar exercícios para "Reconhecimento + trabalho" (1 de reconhecimento + demais de trabalho; 3 séries = 1 + 2) até bater. Limite da semana 1 = 18 séries de trabalho por dia.
- Bíceps e tríceps: 3 séries por exercício.
- Grupos pequenos (bíceps, tríceps, ombro, panturrilha, abdômen): sempre 8–12 séries de TRABALHO por semana (reconhecimento não conta). Abaixo de 8, acrescentar exercícios de 3 séries (bíceps no dia de costas + no dia de peito; tríceps no dia de peito + no dia de costas; panturrilha 3 séries em cada dia de inferiores). Vale mesmo que o dia passe de 18 — para segurar o dia, passar compostos e acessórios para Reconhecimento + trabalho, nunca deixar grupo pequeno abaixo de 8.
- Grupos grandes (costas, peito, quadríceps, glúteo, posterior): sempre 12–20 séries de trabalho por semana (contar cada exercício no grupo principal — afundo/agachamento/leg = quadríceps; elevação pélvica/kick back/abdução = glúteo; stiff/RDL/good morning/flexoras = posterior). Abaixo de 12, acrescentar exercícios de 3 séries no dia do grupo (costas: remada unilateral + pull down; peito: supino inclinado + crucifixo/peck deck) e voltar para séries normais o que tinha virado reconhecimento no grupo. Acima de 20, tirar ou passar para Reconhecimento + trabalho. Vale mesmo que o dia passe de 18.
- Distribuição: dia de inferiores com Glúteo precisa de composto de glúteo (Elevação pélvica) em TODO dia de inferiores; dia de costas precisa de puxada vertical composta (Puxada alta) — Pull down é acessório; evitar excesso de deltoide anterior (desenvolvimento + elevação frontal + supinos) sem elevação lateral.
- Dias de inferiores: um grupo por vez: quadríceps → posterior → glúteo → panturrilha; nunca alternar quadríceps e posterior; abdutora/adutora no bloco de glúteo; cadeira adutora antes da abdução; mobilidade como aquecimento antes do principal.
- Panturrilha: 3 séries por dia de inferiores, total 8–12 na semana.
- Descrição para avançado = estratégia, não ensinar o exercício: pico de contração (segura 1–2s), excêntrica controlada (3s), onde alongar, dicas de movimento, em que série ir à falha, "sem sentir o músculo, mais carga e excêntrica mais lenta". Ex. Stiff: "Pensa em levar o quadril para trás, não em descer a barra. Segura 1s no alongamento máximo do posterior e sobe contraindo glúteo." Mobilidades sem descrição.
- Variação sempre da mesma família e sem redundância no dia: Pull Down → outro modelo de Pull Down (nunca Puxada Alta); Supino inclinado → Supino inclinado com halteres; Supino inclinado nunca com variação de supino reto.
- "AGACHAMENTO" (sem complemento) é peso corporal: nunca é variação de agachamento com carga nem principal de dia pesado.
- Ao trocar o principal, preservar o padrão (reto/inclinado, unilateral/bilateral) e ajustar a variação junto.
- Hiperextensão lombar: variação é a própria Hiperextensão lombar ("Hiperextensão lombar 2" é OUTRO exercício).
- Nunca usar Isometria parede (nem como variação); trocar por outro do mesmo dia/grupo.
- Rear delt fly / crucifixo inverso como trabalho: 3 × 12, pausa 60s.
- Kick back: variação é o próprio Kick back.
- Elevação pélvica unilateral (a "1") não entra, nem como variação: usar Elevação pélvica unilateral 2 ou Elevação pélvica.
- Cadeira extensora, cadeira/mesa flexora, elevação pélvica, afundo, kick back: mínimo 3 séries.
- Trocas preferidas: Supino inclinado Smith → Supino inclinado barra; Puxada alta neutra → Puxada alta aberta; Remada máquina / Remada pronada banco / Remada supinada articulada redundante → Remada triângulo; Leg press 45/unilateral → Leg press 180 (exceto se o Fabiew pedir explicitamente Leg press 45 articulado).
- Técnicas (drop set, isometria, progressão 15/12/10 ou 10/8/6): progressão/pirâmide = modo Repetições por série + method pyramid_up; bi-set/superset = agrupar; drop set/rest-pause/cluster = campo Método. Sempre explicar a técnica na descrição. "Técnicas mais avançadas": pirâmide 12/10/8 ou 8/7/6 nos multiarticulares principais, drop set na última série dos isoladores, pico de contração 1–2s e excêntrica 3s. Dia "pesado": reps diferentes por série nos multiarticulares principais.
- Restrições de joelho/ombro: evitar sobrecarga e amplitude agressiva; se o aluno não tolera flexora/extensora, trocar por alternativas seguras; limitação unilateral: versão unilateral do lado bom, escrever o lado na descrição.
- Preferências por aluno: Benedita — sem Remada cavalinho, Rosca Scott, Peck deck, Flexora alternando, Supino reto (usar Supino vertical, variação Supino reto halteres). Cristina — nada de mesa flexora, cadeira flexora nem flexão nórdica.`;

export const REGRAS_MAROMBIEW_DIETA = `REGRAS (dieta) — Porções reais SEMPRE: ovo = 50 g/unidade; fruta = 1 unidade (banana 120–150 g, maçã ~150 g, pêssego/pera 100–150 g); whey = 30 g ou 15 g; pão de forma em fatias (25–30 g); atum = 1 lata escorrida (~80 g); iogurte = 1 pote (125–170 g); abacate ≥ 40–50 g; carne/frango/peixe no almoço e jantar ≥ 90–100 g. Fechar a meta mexendo em carboidratos de base (arroz, batata, pão) e fontes principais; nunca porções simbólicas — se não fechar, tirar o item. Manteiga não entra (compensar gordura com abacate, azeite ou oleaginosas). No resumo, porções em medida caseira ("2 ovos", "1 lata", "1 pote").`;

// ─── correções determinísticas (sem IA) ─────────────────────────────

const REPS_CONV: Record<string, string> = {
  '5-8': '6-8', '6-10': '8-10', '9-12': '8-12', '10-15': '12-15', '15-18': '12-15', '20-40s': '30s',
};
const isAcessorio = (name: string) =>
  /rosca|biceps|triceps|testa|frances|extensora|flexora|elevacao lateral|elevacao frontal|crucifixo|peck|voador|crossover|panturrilha|abdominal|kick ?back|abdutora|adutora|face pull|pull ?down/.test(norm(name));

const cleanReps = (r: string) => r.trim().replace(/\s+/g, '').replace(/–|—/g, '-').toLowerCase();

/** Reps fora do select → valor do select pela tabela do Fabiew (null se não há conversão). */
export function converterReps(reps: string): string | null {
  const c = cleanReps(reps);
  if (WORK_REPS_OPTS.includes(c)) return c === reps.trim() ? null : c;
  return REPS_CONV[c] ?? null;
}

/** Pausa (s) fora do select → valor do select pela tabela (null se não há conversão). */
export function converterPausa(seg: number, exercise: string): number | null {
  if (OFFICE_PAUSE_OPTS.includes(`${seg}s`)) return null;
  if (seg === 75) return isAcessorio(exercise) ? 60 : 90;
  if (seg === 105) return 90;
  if (seg === 150) return 120;
  if (seg > 120) return 120;
  return null;
}

function converterExercicio(ex: WorkoutExercise, label: string, out: string[]) {
  if (isNaoContavel(ex.exercise)) return;
  const reps = String(ex.reps ?? '');
  if (reps.trim()) {
    if (reps.includes('+')) {
      const [r, w] = reps.split('+');
      const nw = converterReps(w);
      if (nw) { ex.reps = `${r.trim()} + ${nw}`; out.push(`${label}: reps ${reps.trim()} → ${ex.reps}`); }
    } else {
      const n = converterReps(reps);
      if (n) { ex.reps = n; out.push(`${label}: reps ${reps.trim()} → ${n}`); }
    }
  }
  if (ex.setScheme?.sets?.length) {
    for (const s of ex.setScheme.sets) {
      const n = converterReps(String(s.target_reps ?? ''));
      if (n) { out.push(`${label}: reps da série ${s.set_number} ${s.target_reps} → ${n}`); s.target_reps = n; }
    }
  }
  const segRaw = ex.restSeconds ?? (() => { const m = /^(\d+)\s*s$/i.exec(String(ex.pause ?? '').trim()); return m ? Number(m[1]) : null; })();
  if (typeof segRaw === 'number' && segRaw > 0) {
    const n = converterPausa(segRaw, ex.exercise);
    if (n) {
      out.push(`${label}: pausa ${segRaw}s → ${n}s`);
      if (ex.restSeconds != null) ex.restSeconds = n;
      if (ex.pause) ex.pause = `${n}s`;
    }
  }
}

/** Converte campos fora dos selects pela tabela. Retorna cópia + lista do que mudou. */
export function converterSelects(plan: WorkoutPlan): { plan: WorkoutPlan; correcoes: string[] } {
  const p: WorkoutPlan = JSON.parse(JSON.stringify(plan));
  const correcoes: string[] = [];
  for (const d of p.days) for (const ex of d.exercises) converterExercicio(ex, `${d.day} · ${ex.exercise}`, correcoes);
  return { plan: p, correcoes };
}

const WD = /^(segunda|terca|quarta|quinta|sexta|sabado|domingo)/;
const wdOf = (label: string) => WD.exec(norm(label))?.[1] ?? null;

/** Treino 4x seg–qui → Quinta→Sexta e depois Quarta→Quinta (Seg, Ter, Qui, Sex). */
export function renomearDias4x(plan: WorkoutPlan): { plan: WorkoutPlan; correcoes: string[] } {
  const wds = plan.days.map((d) => wdOf(d.day));
  if (plan.days.length !== 4 || wds.join(',') !== 'segunda,terca,quarta,quinta') return { plan, correcoes: [] };
  const p: WorkoutPlan = JSON.parse(JSON.stringify(plan));
  const correcoes: string[] = [];
  const troca = (d: WorkoutPlan['days'][number], de: RegExp, para: string) => {
    const antes = d.day;
    d.day = d.day.replace(de, para);
    correcoes.push(`Dia ${antes} → ${d.day}`);
  };
  troca(p.days[3], /quinta/i, 'Sexta');
  troca(p.days[2], /quarta/i, 'Quinta');
  return { plan: p, correcoes };
}

/** Correções do servidor antes da IA no `revisar` de treino. */
export function preRevisarTreino(plan: WorkoutPlan): { plan: WorkoutPlan; correcoes: string[] } {
  const a = renomearDias4x(plan);
  const b = converterSelects(a.plan);
  return { plan: b.plan, correcoes: [...a.correcoes, ...b.correcoes] };
}

// ─── resumo do revisar ──────────────────────────────────────────────

/** Tabelas de séries por dia e por grupo (antes → depois) + lista do que foi corrigido. */
export function secaoRevisao(
  antes: WorkoutPlan, depois: WorkoutPlan, corrigido: string[],
  opts: { semana?: number | null; grupoBanco?: (n: string) => string | null } = {},
): string {
  const a: AnaliseTreino = analisarTreino(antes, opts);
  const d: AnaliseTreino = analisarTreino(depois, opts);
  const L: string[] = ['', '## Séries de trabalho por dia (antes → depois)', '', '| Dia | Antes | Depois |', '|---|---|---|'];
  const n = Math.max(a.porDia.length, d.porDia.length);
  for (let i = 0; i < n; i++) {
    const x = a.porDia[i]; const y = d.porDia[i];
    L.push(`| ${y?.dia ?? x?.dia ?? '—'} | ${x ? x.series : '—'} | ${y ? `${y.series}${y.acimaLimite ? ' ⚠ >18' : ''}` : '—'} |`);
  }
  L.push('', '## Séries de trabalho por grupo na semana (antes → depois)', '', '| Grupo | Alvo | Antes | Depois | Status |', '|---|---|---|---|---|');
  const grupos = [...new Set([...a.porGrupo.map((g) => g.grupo), ...d.porGrupo.map((g) => g.grupo)])];
  for (const g of grupos) {
    const x = a.porGrupo.find((v) => v.grupo === g); const y = d.porGrupo.find((v) => v.grupo === g);
    const alvo = (y ?? x)?.alvo;
    const st = y?.status === 'ok' ? '✓' : y?.status === 'abaixo' ? '⚠ abaixo' : y?.status === 'acima' ? '⚠ acima' : '—';
    L.push(`| ${grupoLabel(g)} | ${alvo ? `${alvo.min}–${alvo.max}` : '—'} | ${x?.series ?? 0} | ${y?.series ?? 0} | ${st} |`);
  }
  L.push('', '## O que foi corrigido', '');
  if (!corrigido.length) L.push('- Nada precisou ser corrigido.');
  for (const c of corrigido) L.push(`- ${c}`);
  if (d.avisos.length) {
    L.push('', '**Pontos que ainda merecem atenção:**', '');
    for (const v of d.avisos) L.push(`- ${v}`);
  }
  return L.join('\n');
}
