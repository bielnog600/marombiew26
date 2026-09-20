/**
 * Contexto determinístico de geração de TREINO — espelho fiel do que a página
 * TreinoIA monta antes de chamar `trainer-agent`.
 *
 * Puramente aditivo: não altera nenhuma função, tabela ou regra existente.
 * Usado pela Edge Function `jarvis-bridge` para que a ponte de voz use
 * EXATAMENTE o mesmo motor e o mesmo prompt da página.
 */

import {
  resolvePeriodization,
  snapshotToPlanColumns,
  weekNumberToPhase,
  type PeriodizationSelection,
  type PeriodizationSnapshot,
} from "./periodization.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
type Rec = Record<string, unknown>;

// ---------------------------------------------------------------- vocabulário
// Mesmos ids/labels da página TreinoIA (não inventar valores novos).

export const LEVEL_LABELS: Record<string, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
};

export const SPLIT_LABELS_PT: Record<string, string> = {
  full_body: "Full Body",
  upper_lower: "Upper/Lower",
  push_pull_legs: "Push/Pull/Legs",
  push_pull: "Push/Pull",
  upper_lower_ppl: "Upper/Lower + PPL",
  torso_limbs: "Torso / Membros",
  specialization: "Especialização",
  body_part: "Divisão por grupos musculares",
  custom: "Selecionar grupos",
  ai_decides: "Decida por mim",
};

export const EQUIPMENT_LABELS: Record<string, string> = {
  completa: "Academia Completa",
  limitado: "Equipamento Limitado",
  casa: "Home Gym",
};

export const MACHINE_LABELS: Record<string, string> = {
  halteres: "Halteres",
  barras_anilhas: "Barras e Anilhas",
  banco_regulavel: "Banco Regulável",
  kettlebells: "Kettlebells",
  polia_crossover: "Polia / Cross Over",
  puxador_alto: "Puxador (Lat Pulldown)",
  remada_baixa: "Remada Baixa",
  supino_maquina: "Supino Máquina",
  peck_deck: "Peck Deck / Voador",
  gravitron: "Gravitron",
  leg_press: "Leg Press",
  extensora: "Cadeira Extensora",
  flexora: "Mesa Flexora",
  abdutora_adutora: "Cadeira Abdutora/Adutora",
  hack_squat: "Hack Squat",
  smith: "Smith Machine",
  barra_fixa: "Barra Fixa",
  paralelas: "Paralelas",
  elasticos: "Elásticos / Mini-bands",
  trx: "TRX / Suspensão",
  esteira: "Esteira",
  bike: "Bicicleta Ergométrica",
  eliptico: "Elíptico",
  escada: "Escada",
};

export const FORBIDDEN_PATTERN_LABELS: Record<string, string> = {
  sobrecarga_axial: "Sobrecarga axial",
  hinge_pesado: "Hinge pesado",
  overhead: "Movimentos acima da cabeça",
  compressao_cervical: "Compressão cervical/ombros",
  flexao_lombar: "Flexão lombar agressiva",
  alto_impacto: "Alto impacto / explosivos",
  instabilidade: "Instabilidade excessiva",
  unilateral: "Unilateral pesado",
};

export const EXECUTION_RULE_LABELS: Record<string, string> = {
  baixa_carga: "Baixa carga",
  pouca_serie: "Pouca série",
  amplitude_controlada: "Amplitude controlada",
  amplitude_parcial: "Amplitude parcial",
  priorizar_isometria: "Priorizar isometria",
  sem_peso: "Sem peso quando possível",
  tempo_controlado: "Tempo / cadência controlada",
  sem_falha: "Longe da falha (RIR alto)",
};

export const DEVIATION_LABELS: Record<string, string> = {
  hipercifose: "Hipercifose",
  escoliose: "Escoliose",
  hiperlordose: "Hiperlordose",
  protrusao: "Protrusão de ombros",
  valgo: "Valgo de joelho",
};

export const EXERCISE_PROFILE_VALUES = ["basic", "articulated_plus_basic", "mixed"];

const WEEKDAYS = [
  "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira",
  "Sexta-feira", "Sábado", "Domingo",
];

// ---------------------------------------------------------------- contexto

export interface TrainerStudentContext {
  studentId: string;
  nome: string | null;
  /** Objeto enviado como `studentContext` ao trainer-agent (formato da página). */
  studentContext: Rec;
  peso: number | null;
  peso_fonte: string | null;
  peso_em: string | null;
  altura: number | null;
  data_avaliacao: string | null;
  avaliacao_fonte: string | null;
  avaliacao_id: string | null;
  dias_desde_avaliacao: number | null;
  avaliacao_recente: boolean;
  lesoes: string | null;
  restricoes: string | null;
  dores: string | null;
  desvios_posturais: string[];
  nivel_sugerido: string | null;
  questionario: Rec | null;
  activePlan: Rec | null;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Espelha `loadStudentData()` da página TreinoIA. */
export async function loadTrainerStudentContext(
  supabase: Any,
  studentId: string,
): Promise<TrainerStudentContext> {
  const [profileRes, spRes, avaliacao] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", studentId).maybeSingle(),
    supabase.from("students_profile").select("*").eq("user_id", studentId).maybeSingle(),
    resolveLatestAssessment(supabase, studentId),
  ]);

  const profile = profileRes.data as Rec | null;
  const sp = spRes.data as Rec | null;
  const assessmentId = avaliacao.assessment_id ?? undefined;
  const assessment: Rec | null = assessmentId ? { id: assessmentId } : null;


  let anthro: Rec | null = null, comp: Rec | null = null, vitals: Rec | null = null;
  let anamnese: Rec | null = null, skinfolds: Rec | null = null;
  let performance: Rec | null = null, posture: Rec | null = null;
  let photos: Rec[] = [];

  if (assessmentId) {
    const [a, c, v, sf, an, perf, pos, ph] = await Promise.all([
      supabase.from("anthropometrics").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("composition").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("vitals").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("skinfolds").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("anamnese").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("performance_tests").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("posture").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("assessment_photos").select("*").eq("assessment_id", assessmentId),
    ]);
    anthro = a.data; comp = c.data; vitals = v.data; skinfolds = sf.data;
    anamnese = an.data; performance = perf.data; posture = pos.data;
    photos = (ph.data as Rec[] | null) ?? [];
  }

  const { data: scans } = await supabase
    .from("posture_scans").select("*").eq("student_id", studentId)
    .order("created_at", { ascending: false }).limit(1);
  const scan = (scans as Rec[] | null)?.[0] ?? null;

  const studentContext: Rec = {
    nome: profile?.nome, email: profile?.email, sexo: sp?.sexo,
    data_nascimento: sp?.data_nascimento, altura: sp?.altura ?? anthro?.altura,
    objetivo: sp?.objetivo, restricoes: sp?.restricoes, lesoes: sp?.lesoes,
    observacoes: sp?.observacoes, raca: sp?.raca,
    peso: anthro?.peso, imc: anthro?.imc, cintura: anthro?.cintura,
    quadril: anthro?.quadril, rcq: anthro?.rcq, torax: anthro?.torax,
    abdomen: anthro?.abdomen, ombro: anthro?.ombro, pescoco: anthro?.pescoco,
    braco_direito: anthro?.braco_direito, braco_esquerdo: anthro?.braco_esquerdo,
    coxa_direita: anthro?.coxa_direita, coxa_esquerda: anthro?.coxa_esquerda,
    panturrilha_direita: anthro?.panturrilha_direita,
    panturrilha_esquerda: anthro?.panturrilha_esquerda,
    percentual_gordura: comp?.percentual_gordura, massa_magra: comp?.massa_magra,
    massa_gorda: comp?.massa_gorda,
    fc_repouso: vitals?.fc_repouso, pressao: vitals?.pressao, spo2: vitals?.spo2,
    glicemia: vitals?.glicemia,
    skinfolds: skinfolds
      ? {
          metodo: skinfolds.metodo, triceps: skinfolds.triceps, peitoral: skinfolds.peitoral,
          subescapular: skinfolds.subescapular, axilar_media: skinfolds.axilar_media,
          suprailiaca: skinfolds.suprailiaca, abdominal: skinfolds.abdominal, coxa: skinfolds.coxa,
        }
      : null,
    anamnese: anamnese
      ? {
          historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao,
          suplementos: anamnese.suplementos, cirurgias: anamnese.cirurgias,
          dores: anamnese.dores, sono: anamnese.sono, stress: anamnese.stress,
          rotina: anamnese.rotina, treino_atual: anamnese.treino_atual,
          tabagismo: anamnese.tabagismo, alcool: anamnese.alcool,
        }
      : null,
    performance: performance
      ? {
          cooper_12min: performance.cooper_12min, pushup: performance.pushup,
          plank: performance.plank, salto_vertical: performance.salto_vertical,
          agachamento_score: performance.agachamento_score,
          mobilidade_ombro: performance.mobilidade_ombro,
          mobilidade_quadril: performance.mobilidade_quadril,
          mobilidade_tornozelo: performance.mobilidade_tornozelo,
        }
      : null,
    posture: posture
      ? {
          vista_anterior: posture.vista_anterior, vista_lateral: posture.vista_lateral,
          vista_posterior: posture.vista_posterior, observacoes: posture.observacoes,
        }
      : null,
    posture_scan: scan
      ? {
          angles: scan.angles_json, attention_points: scan.attention_points_json,
          region_scores: scan.region_scores_json, notes: scan.notes,
        }
      : null,
    fotos_avaliacao: photos.length > 0 ? photos.map((p) => ({ tipo: p.tipo, url: p.url })) : null,
    fotos_perfil: sp?.fotos ?? null,
  };

  // Desvios posturais — mesma regra de auto-preenchimento da página.
  const desvios: string[] = [];
  const attention = Array.isArray(scan?.attention_points_json)
    ? (scan!.attention_points_json as Rec[])
    : [];
  const labels = attention.map((p) => String(p.label ?? p.name ?? "").toLowerCase());
  if (labels.some((l) => l.includes("cifose") || l.includes("kyphosis"))) desvios.push("hipercifose");
  if (labels.some((l) => l.includes("escoliose") || l.includes("scoliosis"))) desvios.push("escoliose");
  if (labels.some((l) => l.includes("lordose") || l.includes("lordosis"))) desvios.push("hiperlordose");
  if (labels.some((l) => l.includes("ombro") || l.includes("shoulder"))) desvios.push("protrusao");
  if (labels.some((l) => l.includes("valgo") || l.includes("valgus"))) desvios.push("valgo");

  // Nível sugerido — heurística leve a partir do treino atual da anamnese.
  const treinoAtual = String(anamnese?.treino_atual ?? "").toLowerCase();
  let nivelSugerido: string | null = null;
  if (treinoAtual) {
    if (/(nunca|sedent|inicia|come(c|ç)ando|1 m[êe]s|2 meses|3 meses)/.test(treinoAtual)) {
      nivelSugerido = "iniciante";
    } else if (/(\b[3-9]\s*anos|avan(c|ç)ad|muitos anos|10 anos)/.test(treinoAtual)) {
      nivelSugerido = "avancado";
    } else {
      nivelSugerido = "intermediario";
    }
  }

  const { data: lastPlan } = await supabase
    .from("ai_plans")
    .select("*")
    .eq("student_id", studentId).eq("tipo", "treino").eq("is_draft", false)
    .order("created_at", { ascending: false }).limit(1);

  const { data: quest } = await supabase
    .from("diet_questionnaires")
    .select("*").eq("student_id", studentId).eq("status", "completed")
    .order("responded_at", { ascending: false }).limit(1);

  return {
    studentId,
    nome: (profile?.nome as string) ?? null,
    studentContext,
    peso: num(anthro?.peso),
    altura: num(sp?.altura ?? anthro?.altura),
    data_avaliacao: (assessment?.data_avaliacao as string) ??
      (assessment?.created_at ? String(assessment.created_at).slice(0, 10) : null),
    lesoes: (sp?.lesoes as string) ?? null,
    restricoes: (sp?.restricoes as string) ?? null,
    dores: (anamnese?.dores as string) ?? null,
    desvios_posturais: desvios,
    nivel_sugerido: nivelSugerido,
    questionario: ((quest as Rec[] | null)?.[0] as Rec) ?? null,
    activePlan: ((lastPlan as Rec[] | null)?.[0] as Rec) ?? null,
  };
}

/** Prontidão de dados: avaliação em até 90 dias + peso + altura. */
export function checkTrainerDataReadiness(
  ctx: TrainerStudentContext,
): { ok: boolean; faltando: string[]; dias_desde_avaliacao: number | null } {
  const faltando: string[] = [];
  let dias: number | null = null;
  if (!ctx.data_avaliacao) {
    faltando.push("avaliacao_fisica");
  } else {
    const d = new Date(ctx.data_avaliacao);
    dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (!Number.isFinite(dias)) dias = null;
    else if (dias > 90) faltando.push("avaliacao_recente_90_dias");
  }
  if (!ctx.peso) faltando.push("peso");
  if (!ctx.altura) faltando.push("altura");
  return { ok: faltando.length === 0, faltando, dias_desde_avaliacao: dias };
}

// ---------------------------------------------------------------- request

export interface TrainerGenerationInput {
  nivel: string;
  dias_semana: number;
  split: string;
  grupos_por_dia?: Array<{ dia: number | string; grupos: string[] }> | null;
  grupos_prioritarios?: string[] | null;
  semana: number;
  equipamento: string;
  equipamentos_disponiveis?: string[] | null;
  perfil_equipamento?: string | null;
  restricoes_estruturadas?: {
    exercicios_proibidos?: string[];
    padroes_proibidos?: string[];
    regras_execucao?: string[];
    exercicios_prioritarios?: string[];
  } | null;
  saude?: {
    lesao?: boolean; local_lesao?: string;
    dor?: boolean; local_dor?: string;
    limitacao_articular?: boolean; local_limitacao?: string;
    desvios?: string[];
    tabagismo?: boolean; stress_alto?: boolean; sono_ruim?: boolean;
  } | null;
  referencia_treino?: string | null;
  observacoes?: string | null;
}

export interface TrainerGenerationRequest {
  prompt: string;
  studentContext: Rec;
  split_slug: string;
  days_available: number;
  phase: string;
  exercise_profile: string;
  available_equipment: string[];
  periodization: PeriodizationSnapshot;
  periodizationColumns: Record<string, unknown>;
  fase: string;
  config: Rec;
}

export type BuildTrainerRequestResult =
  | { ok: true; request: TrainerGenerationRequest }
  | { ok: false; erro: string; campo?: string; recebido?: unknown; valores_aceitos?: string[] };

const invalid = (campo: string, recebido: unknown, aceitos: string[]): BuildTrainerRequestResult => ({
  ok: false, erro: "valor_invalido", campo, recebido, valores_aceitos: aceitos,
});

/** Monta prompt + payload do trainer-agent EXATAMENTE como a página TreinoIA. */
export function buildTrainerGenerationRequest(
  ctx: TrainerStudentContext,
  input: TrainerGenerationInput,
): BuildTrainerRequestResult {
  const nivel = String(input.nivel ?? "").trim();
  if (!LEVEL_LABELS[nivel]) return invalid("nivel", nivel, Object.keys(LEVEL_LABELS));

  const dias = Number(input.dias_semana);
  if (!Number.isInteger(dias) || dias < 2 || dias > 7) {
    return invalid("dias_semana", input.dias_semana, ["2", "3", "4", "5", "6", "7"]);
  }

  const split = String(input.split ?? "").trim();
  if (!SPLIT_LABELS_PT[split]) return invalid("split", split, Object.keys(SPLIT_LABELS_PT));

  const semana = Number(input.semana);
  if (!Number.isInteger(semana) || semana < 1 || semana > 4) {
    return invalid("semana", input.semana, ["1", "2", "3", "4"]);
  }

  const equipamento = String(input.equipamento ?? "").trim();
  if (!EQUIPMENT_LABELS[equipamento]) {
    return invalid("equipamento", equipamento, Object.keys(EQUIPMENT_LABELS));
  }

  const perfil = String(input.perfil_equipamento ?? "mixed").trim();
  if (!EXERCISE_PROFILE_VALUES.includes(perfil)) {
    return invalid("perfil_equipamento", perfil, EXERCISE_PROFILE_VALUES);
  }

  const maquinas = Array.isArray(input.equipamentos_disponiveis)
    ? input.equipamentos_disponiveis.map((m) => String(m).trim()).filter(Boolean)
    : [];
  for (const m of maquinas) {
    if (!MACHINE_LABELS[m]) return invalid("equipamentos_disponiveis", m, Object.keys(MACHINE_LABELS));
  }

  const rest = input.restricoes_estruturadas ?? {};
  const padroes = Array.isArray(rest.padroes_proibidos) ? rest.padroes_proibidos.map(String) : [];
  for (const p of padroes) {
    if (!FORBIDDEN_PATTERN_LABELS[p]) {
      return invalid("padroes_proibidos", p, Object.keys(FORBIDDEN_PATTERN_LABELS));
    }
  }
  const regras = Array.isArray(rest.regras_execucao) ? rest.regras_execucao.map(String) : [];
  for (const r of regras) {
    if (!EXECUTION_RULE_LABELS[r]) {
      return invalid("regras_execucao", r, Object.keys(EXECUTION_RULE_LABELS));
    }
  }
  const saude = input.saude ?? {};
  const desvios = Array.isArray(saude.desvios) ? saude.desvios.map(String) : [];
  for (const d of desvios) {
    if (!DEVIATION_LABELS[d]) return invalid("desvios", d, Object.keys(DEVIATION_LABELS));
  }

  const proibidos = (Array.isArray(rest.exercicios_proibidos) ? rest.exercicios_proibidos : [])
    .map(String).map((s) => s.trim()).filter(Boolean).join(", ");
  const prioritarios = (Array.isArray(rest.exercicios_prioritarios) ? rest.exercicios_prioritarios : [])
    .map(String).map((s) => s.trim()).filter(Boolean).join(", ");

  // ---- bloco de saúde (mesmo formato da página)
  const healthLines: string[] = [];
  if (saude.lesao) healthLines.push(`- LESÃO: ${saude.local_lesao || "Sim (local não especificado)"}`);
  if (saude.dor) healthLines.push(`- DOR: ${saude.local_dor || "Sim (local não especificado)"}`);
  if (saude.limitacao_articular) {
    healthLines.push(`- LIMITAÇÃO ARTICULAR: ${saude.local_limitacao || "Sim (local não especificado)"}`);
  }
  for (const d of desvios) healthLines.push(`- DESVIO POSTURAL: ${DEVIATION_LABELS[d]}`);
  if (saude.tabagismo) healthLines.push("- HÁBITO: Tabagismo (considerar capacidade cardiorrespiratória reduzida)");
  if (saude.stress_alto) healthLines.push("- HÁBITO: Stress alto (priorizar exercícios com efeito ansiolítico)");
  if (saude.sono_ruim) healthLines.push("- HÁBITO: Sono ruim (evitar treinos muito intensos, priorizar recuperação)");

  const healthBlock = healthLines.length > 0
    ? `\n\nCONDIÇÕES DE SAÚDE E RESTRIÇÕES DO ALUNO (ADAPTAR O TREINO OBRIGATORIAMENTE):\n${healthLines.join("\n")}\n\nIMPORTANTE: Adapte exercícios, amplitude, carga e volume considerando as condições acima. Inclua exercícios corretivos/compensatórios quando houver desvios posturais. Evite exercícios que agravem lesões ou dores reportadas.`
    : "";

  // ---- bloco de segurança estruturada
  const safetyLines: string[] = [];
  if (proibidos) {
    safetyLines.push(`EXERCICIOS_PROIBIDOS (bloqueio absoluto, inclusive variações/sinônimos): ${proibidos}`);
  }
  if (padroes.length > 0) {
    safetyLines.push(
      `PADROES_DE_MOVIMENTO_PROIBIDOS: ${padroes.map((p) => FORBIDDEN_PATTERN_LABELS[p]).join(", ")}`,
    );
  }
  if (prioritarios) safetyLines.push(`EXERCICIOS_PERMITIDOS_OU_PRIORITARIOS: ${prioritarios}`);
  if (regras.length > 0) {
    safetyLines.push(
      `REGRAS_DE_CARGA_E_EXECUCAO: ${regras.map((r) => EXECUTION_RULE_LABELS[r]).join(", ")}`,
    );
  }

  const structuredSafetyBlock = safetyLines.length > 0
    ? `\n\n========================================\n🚨 REGRAS RÍGIDAS DE SEGURANÇA ESTRUTURADAS (PRIORIDADE ABSOLUTA — LEIA PRIMEIRO)\n========================================\nEstes campos foram preenchidos pelo professor em formato estruturado.\nNÃO são observações soltas — são REGRAS OBRIGATÓRIAS que VENCEM qualquer outra regra do prompt (volume, intensidade, técnicas avançadas, divisão padrão, periodização).\n\n${safetyLines.map((l) => `• ${l}`).join("\n")}\n\nFLUXO OBRIGATÓRIO:\n1) Aplique este filtro ANTES de escolher qualquer exercício.\n2) Bloqueie todo exercício que bata com EXERCICIOS_PROIBIDOS (nome ou sinônimo) ou que use PADROES_DE_MOVIMENTO_PROIBIDOS.\n3) NÃO substitua um proibido por uma variação que mantenha o mesmo padrão.\n4) Inclua obrigatoriamente exercícios alinhados aos objetivos terapêuticos informados.\n5) Aplique REGRAS_DE_CARGA_E_EXECUCAO em cada exercício escolhido e mencione a adaptação na coluna DESCRIÇÃO.\n6) Se o quadro for sério e não couber treino completo respeitando tudo, monte um treino MENOR — NUNCA preencha com exercício duvidoso.\n========================================`
    : "";

  // ---- divisão personalizada por dia
  const customLines: string[] = [];
  if (Array.isArray(input.grupos_por_dia)) {
    for (const item of input.grupos_por_dia) {
      const idx = Number(item?.dia);
      const grupos = Array.isArray(item?.grupos) ? item.grupos.map(String).filter(Boolean) : [];
      if (grupos.length === 0) continue;
      const label = Number.isFinite(idx)
        ? (WEEKDAYS[idx - 1] ?? WEEKDAYS[idx] ?? `Dia ${idx}`)
        : String(item?.dia ?? "Dia");
      customLines.push(`- ${label}: ${grupos.join(" + ")}`);
    }
  }
  const customSplitBlock = customLines.length > 0
    ? `\n\nDIVISÃO PERSONALIZADA POR DIA (USE EXATAMENTE ESTA ESTRUTURA, sobrepõe a divisão padrão):\n${customLines.join("\n")}\n\nMonte cada dia com os grupos musculares listados acima, respeitando volume adequado para o nível.`
    : "";

  const prioritariosGrupos = Array.isArray(input.grupos_prioritarios)
    ? input.grupos_prioritarios.map(String).filter(Boolean)
    : [];
  const specializationBlock = split === "specialization" && prioritariosGrupos.length > 0
    ? `\n\nGRUPOS PRIORITÁRIOS (ESPECIALIZAÇÃO): ${prioritariosGrupos.join(", ")} — concentre volume e frequência nesses grupos, mantendo os demais em volume de manutenção.`
    : "";

  const notes = String(input.observacoes ?? "").trim();
  const referencia = String(input.referencia_treino ?? "").trim();
  const machineNames = maquinas.map((m) => MACHINE_LABELS[m]).join(", ");

  const prompt = `Gere o TREINO COMPLETO agora com as seguintes configurações:

- Nível: ${LEVEL_LABELS[nivel]}
- Dias disponíveis para treinar: ${dias}
- Divisão: ${split === "ai_decides"
    ? "IA DEVE ESCOLHER a melhor divisão (Full Body, Upper/Lower, Push/Pull/Legs ou ABCDE) com base no nível, dias por semana, objetivo e condições de saúde do aluno. Justifique brevemente a escolha no Resumo do protocolo."
    : SPLIT_LABELS_PT[split]}
- Semana do ciclo: ${semana} de 4
  - Equipamento: ${EQUIPMENT_LABELS[equipamento]}${maquinas.length > 0 ? ` (BLOQUEIO ABSOLUTO: USE APENAS OS SEGUINTES EQUIPAMENTOS E NADA MAIS: ${machineNames}. É PROIBIDO incluir exercícios que exijam máquinas fora desta lista, como por exemplo Leg Press se não estiver listado.)` : ""}
${notes ? `- Observações adicionais (complementares — NÃO substituem as regras estruturadas acima): ${notes}` : ""}${specializationBlock}${customSplitBlock}${structuredSafetyBlock}${healthBlock}
${referencia ? `\n\nREFERÊNCIA DE TREINO FORNECIDA PELO PROFESSOR (USE COMO BASE EXATA para estruturar o treino, exercícios, divisão, volume e faixas de repetição):\n---\n${referencia}\n---\nSiga essa estrutura o mais fielmente possível, adaptando apenas para as condições de saúde e equipamento informados.\n\nREGRA OBRIGATÓRIA DE NOMES (REFERÊNCIA):\n1) Respeite a ESTRUTURA da referência: mesma divisão por dia, mesma ordem, mesmos grupos musculares, mesmo número de séries e as mesmas faixas de repetição.\n2) NUNCA copie os nomes dos exercícios da referência. Para CADA exercício, escolha o item MAIS EQUIVALENTE do BANCO DE EXERCÍCIOS e escreva o nome EXATAMENTE como está no banco.\n3) É PROIBIDO usar qualquer nome que não exista no banco.\n4) Aquecimentos e alongamentos da referência devem virar exercícios de mobilidade existentes no banco.\n\nREGRA DE COBERTURA TOTAL: para CADA dia da referência, gere UMA LINHA para CADA exercício listado, na mesma ordem, sem omitir, fundir ou resumir.` : ""}

GERE TUDO DE UMA VEZ:
1) Resumo do protocolo e foco da semana
2) Tabela completa do treino com TODAS as colunas: TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO
3) Estrutura da Sessão (REGRAS OBRIGATÓRIAS):
   - Exercícios de Mobilidade por sessão: ${referencia ? "seguir a REFERÊNCIA (ela define a quantidade)" : "IA deve decidir (padrão 2-3)"}
   - Exercícios Principais por sessão: ${referencia ? "seguir a REFERÊNCIA — inclua TODOS os exercícios principais de cada dia da referência, sem cortes" : "IA deve decidir (padrão 6)"}
   - REGRA PARA MOBILIDADE/ESTABILIDADE: Sempre apenas 1 série, duração de 10 a 20 segundos e descanso sempre de 10 segundos.
4) Use técnicas avançadas conforme o nível
5) Mensagens prontas para WhatsApp explicando o protocolo`;

  const phase = weekNumberToPhase(semana);
  const snapshot = resolvePeriodization({
    selection: "automatica" as PeriodizationSelection,
    phase,
    blockNumber: Number(ctx.activePlan?.block_number ?? 0) + 1,
    context: {
      objective: (ctx.studentContext.objetivo as string) ?? null,
      level: nivel,
      daysPerWeek: dias,
      weeklyStimuliPerMuscle:
        split === "full_body" ? dias
        : split === "upper_lower" || split === "push_pull" ? Math.floor(dias / 2)
        : dias >= 5 ? 2 : 1,
      completedPlans: ctx.activePlan ? Number(ctx.activePlan.version ?? 1) : 0,
      priorityFocus: split === "specialization" ? (prioritariosGrupos[0] ?? "grupo prioritário") : null,
      painFlags: !!saude.dor || !!saude.lesao,
    },
  });

  return {
    ok: true,
    request: {
      prompt,
      studentContext: ctx.studentContext,
      split_slug: split,
      days_available: dias,
      phase,
      exercise_profile: perfil,
      available_equipment: equipamento === "completa" ? [] : maquinas,
      periodization: snapshot,
      periodizationColumns: snapshotToPlanColumns(
        snapshot,
        (ctx.activePlan?.block_start_date as string) ?? null,
      ),
      fase: phase,
      config: {
        nivel, dias_semana: dias, split, semana, equipamento,
        perfil_equipamento: perfil,
        equipamentos_disponiveis: maquinas,
        grupos_prioritarios: prioritariosGrupos,
      },
    },
  };
}

// ---------------------------------------------------------------- resumo

/** Resumo legível do plano gerado + alertas de volume/restrição/perfil. */
export function summarizeWorkoutPlan(
  plan: Rec,
  extras: { volumeAudit?: Rec | null; restrictionGate?: Rec | null; exerciseProfileAudit?: Rec | null; similarity?: Rec | null },
  titulo: string,
  splitSlug: string,
): Rec {
  const days = Array.isArray(plan?.days) ? (plan.days as Rec[]) : [];
  const alertas: string[] = [];

  const audit = extras.volumeAudit ?? null;
  const reasons = Array.isArray(audit?.reasons) ? (audit!.reasons as Rec[]) : [];
  for (const r of reasons) {
    const exs = Array.isArray(r.exercises) ? (r.exercises as unknown[]).map(String) : [];
    alertas.push(
      exs.length > 0
        ? `${r.day ?? "Semana"}: ${exs.join(", ")} (mesma família funcional)`
        : `${r.day ?? "Semana"}: ${r.observed ?? ""} — esperado ${r.expected ?? ""}`,
    );
  }
  const gate = extras.restrictionGate ?? null;
  const clinical = Array.isArray(gate?.clinicalViolations) ? (gate!.clinicalViolations as Rec[]) : [];
  for (const v of clinical) alertas.push(`${v.where}: "${v.evidence}" (${v.code})`);
  if (gate?.reviewRequired === true) alertas.push("Revisão clínica obrigatória antes de publicar.");
  const missing = Array.isArray(gate?.missingFields) ? (gate!.missingFields as unknown[]).map(String) : [];
  if (missing.length > 0) alertas.push(`Dados de restrição faltando: ${missing.join(", ")}`);

  const profAudit = extras.exerciseProfileAudit ?? null;
  if (profAudit?.status && profAudit.status !== "PASS") {
    alertas.push(`Perfil de equipamento: ${profAudit.status}`);
  }
  const sim = extras.similarity ?? null;
  if (sim?.warning) alertas.push(String(sim.warning));

  const dias = days.map((d) => ({
    dia: d.day ?? null,
    grupos: d.focus ?? null,
    exercicios: (Array.isArray(d.exercises) ? (d.exercises as Rec[]) : []).map((e) => ({
      exercicio: e.exercise ?? null,
      variacao: e.variation ?? null,
      series: e.series ?? null,
      reps: e.reps ?? null,
      rir: e.rir ?? null,
      pausa: e.pause ?? (e.restSeconds ? `${e.restSeconds}s` : null),
    })),
  }));

  const total = dias.reduce((acc, d) => acc + d.exercicios.length, 0);
  const volumePenalty = audit?.status === "FAIL" ? 35 : audit?.status === "WARN" ? 15 : 0;
  const confianca = Math.max(
    0,
    Math.min(100, 100 - volumePenalty - alertas.length * 5 - (gate?.reviewRequired ? 20 : 0)),
  );

  return {
    titulo,
    split: splitSlug,
    dias,
    total_exercicios: total,
    alertas,
    confianca,
  };
}
