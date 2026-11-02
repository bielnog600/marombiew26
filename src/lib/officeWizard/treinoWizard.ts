/**
 * Wizard "Gerar Treino" — FONTE ÚNICA das perguntas, opções e montagem do
 * pedido ao trainer-agent. Usado pela tela do admin (TreinoIA) e, via bundle
 * gerado, pela edge function office-gerar. Não alterar sem rodar os testes
 * de equivalência (src/test/officeWizardTreino.test.ts).
 */
import { normalizeSplitSlug } from '../splitSlugs';
import {
  resolvePeriodization,
  weekNumberToPhase,
  type PeriodizationSelection,
  type PeriodizationSnapshot,
} from '../periodization';
import { DEFAULT_INTENSITY, type VariationIntensity } from '../variationProfiles';

export const LEVELS = [
  { value: 'iniciante', label: 'Iniciante', desc: 'Menos de 6 meses de treino' },
  { value: 'intermediario', label: 'Intermediário', desc: '6 meses a 2 anos' },
  { value: 'avancado', label: 'Avançado', desc: 'Mais de 2 anos consistentes' },
];

export const DAYS_PER_WEEK = [
  { value: '2', label: '2 dias' },
  { value: '3', label: '3 dias' },
  { value: '4', label: '4 dias' },
  { value: '5', label: '5 dias' },
  { value: '6', label: '6 dias' },
  { value: '7', label: '7 dias' },
];

export const SPLITS = [
  { value: 'full_body', label: 'Full Body', desc: 'Corpo inteiro por sessão' },
  { value: 'upper_lower', label: 'Upper/Lower', desc: 'Superior e inferior alternados' },
  { value: 'push_pull_legs', label: 'Push/Pull/Legs', desc: 'Empurrar / Puxar / Pernas' },
  { value: 'push_pull', label: 'Push/Pull', desc: 'Empurrar e Puxar alternados' },
  { value: 'upper_lower_ppl', label: 'Upper/Lower + PPL', desc: 'Híbrido para 5 dias' },
  { value: 'torso_limbs', label: 'Torso / Membros', desc: 'Tronco e membros alternados' },
  { value: 'specialization', label: 'Especialização', desc: 'Foco em grupo(s) prioritário(s)' },
  { value: 'body_part', label: 'Divisão por grupos musculares', desc: 'Maior concentração de volume por sessão' },
  { value: 'custom', label: 'Selecionar grupos', desc: 'Escolher grupos por dia' },
  { value: 'ai_decides', label: 'Decida por mim', desc: 'IA escolhe a melhor divisão' },
];

export const WEEKS = [
  { value: '1', label: 'Semana 1', desc: 'Adaptação / Volume base' },
  { value: '2', label: 'Semana 2', desc: 'Progressão de carga' },
  { value: '3', label: 'Semana 3', desc: 'Intensificação' },
  { value: '4', label: 'Semana 4', desc: 'Deload / Recuperação' },
];

export const EQUIPMENT = [
  { value: 'completa', label: 'Academia Completa', desc: 'Todos os equipamentos' },
  { value: 'limitado', label: 'Equipamento Limitado', desc: 'Halteres, barras e poucos aparelhos' },
   { value: 'casa', label: 'Home Gym', desc: 'Treino em casa com básico' },
 ];
 
 export const AVAILABLE_MACHINES = [
   { id: 'halteres', label: 'Halteres', category: 'Pesos Livres' },
   { id: 'barras_anilhas', label: 'Barras e Anilhas', category: 'Pesos Livres' },
   { id: 'banco_regulavel', label: 'Banco Regulável', category: 'Pesos Livres' },
   { id: 'kettlebells', label: 'Kettlebells', category: 'Pesos Livres' },
   { id: 'polia_crossover', label: 'Polia / Cross Over', category: 'Máquinas Superiores' },
   { id: 'puxador_alto', label: 'Puxador (Lat Pulldown)', category: 'Máquinas Superiores' },
   { id: 'remada_baixa', label: 'Remada Baixa', category: 'Máquinas Superiores' },
   { id: 'supino_maquina', label: 'Supino Máquina', category: 'Máquinas Superiores' },
   { id: 'peck_deck', label: 'Peck Deck / Voador', category: 'Máquinas Superiores' },
   { id: 'gravitron', label: 'Gravitron', category: 'Máquinas Superiores' },
   { id: 'leg_press', label: 'Leg Press', category: 'Máquinas Inferiores' },
   { id: 'extensora', label: 'Cadeira Extensora', category: 'Máquinas Inferiores' },
   { id: 'flexora', label: 'Mesa Flexora', category: 'Máquinas Inferiores' },
   { id: 'abdutora_adutora', label: 'Cadeira Abdutora/Adutora', category: 'Máquinas Inferiores' },
   { id: 'hack_squat', label: 'Hack Squat', category: 'Máquinas Inferiores' },
   { id: 'smith', label: 'Smith Machine', category: 'Máquinas Inferiores' },
   { id: 'barra_fixa', label: 'Barra Fixa', category: 'Calistenia/Outros' },
   { id: 'paralelas', label: 'Paralelas', category: 'Calistenia/Outros' },
   { id: 'elasticos', label: 'Elásticos / Mini-bands', category: 'Calistenia/Outros' },
   { id: 'trx', label: 'TRX / Suspensão', category: 'Calistenia/Outros' },
   { id: 'esteira', label: 'Esteira', category: 'Cardio' },
   { id: 'bike', label: 'Bicicleta Ergométrica', category: 'Cardio' },
   { id: 'eliptico', label: 'Elíptico', category: 'Cardio' },
   { id: 'escada', label: 'Escada', category: 'Cardio' },
 ];
 
 export const EXERCISE_PROFILES = [
   { value: 'basic', label: 'Básico / Tradicional', desc: 'Prioriza equipamentos tradicionais, polias, pesos livres e máquinas convencionais. Não utiliza máquinas articuladas.' },
   { value: 'articulated_plus_basic', label: 'Articulados + Básicos', desc: 'Prioriza máquinas articuladas quando existir uma opção funcional equivalente, mantendo exercícios tradicionais como alternativas.' },
   { value: 'mixed', label: 'Misto / Sem preferência', desc: 'Permite todos os exercícios disponíveis sem priorizar articulados ou tradicionais.' },
 ] as const;

 export type ExerciseProfileValue = typeof EXERCISE_PROFILES[number]['value'];

 export interface ExerciseProfileAuditState {
   profile: ExerciseProfileValue;
   status: 'PASS' | 'REPAIRED' | 'REVIEW_REQUIRED';
   violations: Array<{ day: string; where: 'main' | 'variation'; exercise: string; offending: string }>;
   repairs: Array<{ day: string; where: 'main' | 'variation'; previous: string; next: string | null }>;
   opportunities?: Array<{ day: string; exercise: string; articulatedCandidate: string; applied: boolean; reason: string }>;
 }

 export const MACHINE_CATEGORIES = Array.from(new Set(AVAILABLE_MACHINES.map(m => m.category)));

export const FORBIDDEN_PATTERNS = [
  { id: 'sobrecarga_axial', label: 'Sobrecarga axial', desc: 'Agachamento livre, smith, afundo c/ barra' },
  { id: 'hinge_pesado', label: 'Hinge pesado', desc: 'Stiff, sumô terra, peso morto, good morning' },
  { id: 'overhead', label: 'Movimentos acima da cabeça', desc: 'Desenvolvimentos, elevação frontal alta' },
  { id: 'compressao_cervical', label: 'Compressão cervical/ombros', desc: 'Cargas sobre trapézio/cervical' },
  { id: 'flexao_lombar', label: 'Flexão lombar agressiva', desc: 'Abdominais dinâmicos, canivete, hiperextensão' },
  { id: 'alto_impacto', label: 'Alto impacto / explosivos', desc: 'Saltos, burpees, skips, polichinelo' },
  { id: 'instabilidade', label: 'Instabilidade excessiva', desc: 'Bola, BOSU, exercícios em superfície instável' },
  { id: 'unilateral', label: 'Unilateral pesado', desc: 'Búlgaro, afundo c/ carga, passadas' },
];

export const EXECUTION_RULES = [
  { id: 'baixa_carga', label: 'Baixa carga' },
  { id: 'pouca_serie', label: 'Pouca série' },
  { id: 'amplitude_controlada', label: 'Amplitude controlada' },
  { id: 'amplitude_parcial', label: 'Amplitude parcial' },
  { id: 'priorizar_isometria', label: 'Priorizar isometria' },
  { id: 'sem_peso', label: 'Sem peso quando possível' },
  { id: 'tempo_controlado', label: 'Tempo / cadência controlada' },
  { id: 'sem_falha', label: 'Longe da falha (RIR alto)' },

export const MUSCLE_GROUPS = [
  'Peito', 'Costas', 'Ombro', 'Bíceps', 'Tríceps',
  'Antebraço', 'Quadríceps', 'Posterior', 'Glúteo',
  'Panturrilha', 'Abdômen', 'Core', 'Lombar', 'Trapézio', 'Cardio',
];
export const LESAO_LOCAIS = ['Ombro', 'Cotovelo', 'Punho', 'Coluna Cervical', 'Coluna Lombar', 'Coluna Torácica', 'Quadril', 'Joelho', 'Tornozelo', 'Outro'];
export const MOBILITY_COUNT_OPTIONS = ['auto', '0', '1', '2', '3', '4'];
export const MAIN_EXERCISES_COUNT_OPTIONS = ['auto', '4', '5', '6', '7', '8', '9', '10'];

export type TreinoWizardState = {
  level: string;
  daysPerWeek: string;
  split: string;
  week: string;
  equipment: string;
  selectedMachines: string[];
  exerciseProfile: ExerciseProfileValue;
  notes: string;
  treinoReferencia: string;
  customSplit: Record<number, string[]>;
  hasLesao: boolean;
  lesaoLocal: string[];
  hasDor: boolean;
  dorLocal: string;
  limitacaoArticular: boolean;
  limitacaoLocal: string;
  hipercifose: boolean;
  escoliose: boolean;
  hiperlordose: boolean;
  protrusaoOmbro: boolean;
  valgoJoelho: boolean;
  tabagismo: boolean;
  stressAlto: boolean;
  sonoRuim: boolean;
  casoAdaptado: boolean;
  objetivosTerapeuticos: string;
  exerciciosProibidos: string;
  padroesProibidos: string[];
  exerciciosPermitidos: string;
  regrasExecucao: string[];
  mobilityCount: string;
  mainExercisesCount: string;
  marombiewEnabled: boolean;
  periodizationSelection: PeriodizationSelection;
  variationIntensity: VariationIntensity;
};

/** Valores iniciais idênticos aos useState da tela TreinoIA. */
export const defaultTreinoWizardState = (): TreinoWizardState => ({
  level: '', daysPerWeek: '', split: '', week: '', equipment: '',
  selectedMachines: [], exerciseProfile: 'mixed', notes: '', treinoReferencia: '',
  customSplit: {}, hasLesao: false, lesaoLocal: [], hasDor: false, dorLocal: '',
  limitacaoArticular: false, limitacaoLocal: '', hipercifose: false, escoliose: false,
  hiperlordose: false, protrusaoOmbro: false, valgoJoelho: false, tabagismo: false,
  stressAlto: false, sonoRuim: false, casoAdaptado: false, objetivosTerapeuticos: '',
  exerciciosProibidos: '', padroesProibidos: [], exerciciosPermitidos: '', regrasExecucao: [],
  mobilityCount: 'auto', mainExercisesCount: 'auto', marombiewEnabled: false,
  periodizationSelection: 'automatica', variationIntensity: DEFAULT_INTENSITY,
});

/** Mesma regra do botão "Gerar Treino". */
export const canGenerateTreino = (s: Pick<TreinoWizardState, 'level' | 'daysPerWeek' | 'split' | 'week' | 'equipment'>) =>
  Boolean(s.level && s.daysPerWeek && s.split && s.week && s.equipment);

export type TreinoBuildInput = {
  state: TreinoWizardState;
  studentCtx: Record<string, any> | null;
  studentId: string;
  lastWorkoutPlan: { block_number?: number | null; version?: number | null } | null;
};

/**
 * Monta prompt, snapshot de periodização e corpo do POST ao trainer-agent
 * exatamente como TreinoIA.generatePlan fazia inline.
 */
export function buildTreinoGenerationRequest({ state, studentCtx, studentId, lastWorkoutPlan }: TreinoBuildInput): {
  prompt: string;
  snapshot: PeriodizationSnapshot;
  body: Record<string, unknown>;
} {
  const {
    level, daysPerWeek, split, week, equipment, selectedMachines, exerciseProfile, notes,
    treinoReferencia, customSplit, hasLesao, lesaoLocal, hasDor, dorLocal, limitacaoArticular,
    limitacaoLocal, hipercifose, escoliose, hiperlordose, protrusaoOmbro, valgoJoelho, tabagismo,
    stressAlto, sonoRuim, casoAdaptado, objetivosTerapeuticos, exerciciosProibidos, padroesProibidos,
    exerciciosPermitidos, regrasExecucao, mobilityCount, mainExercisesCount, marombiewEnabled,
    periodizationSelection, variationIntensity,
  } = state;
    const selectedLevel = LEVELS.find(l => l.value === level);
    const selectedSplit = SPLITS.find(s => s.value === split);
    const selectedEquip = EQUIPMENT.find(e => e.value === equipment);
    const canonicalSplit = normalizeSplitSlug(split);
    const daysAvailableNum = parseInt(daysPerWeek || '0', 10) || null;

    // Build health conditions string
    const healthLines: string[] = [];
    if (hasLesao) {
      healthLines.push(`- LESÃO: ${lesaoLocal.length > 0 ? lesaoLocal.join(', ') : 'Sim (local não especificado)'}`);
    }
    if (hasDor) {
      healthLines.push(`- DOR: ${dorLocal || 'Sim (local não especificado)'}`);
    }
    if (limitacaoArticular) {
      healthLines.push(`- LIMITAÇÃO ARTICULAR: ${limitacaoLocal || 'Sim (local não especificado)'}`);
    }
    if (hipercifose) healthLines.push('- DESVIO POSTURAL: Hipercifose');
    if (escoliose) healthLines.push('- DESVIO POSTURAL: Escoliose');
    if (hiperlordose) healthLines.push('- DESVIO POSTURAL: Hiperlordose');
    if (protrusaoOmbro) healthLines.push('- DESVIO POSTURAL: Protrusão de ombros');
    if (valgoJoelho) healthLines.push('- DESVIO POSTURAL: Valgo de joelho');
    if (tabagismo) healthLines.push('- HÁBITO: Tabagismo (considerar capacidade cardiorrespiratória reduzida)');
    if (stressAlto) healthLines.push('- HÁBITO: Stress alto (priorizar exercícios com efeito ansiolítico)');
    if (sonoRuim) healthLines.push('- HÁBITO: Sono ruim (evitar treinos muito intensos, priorizar recuperação)');

    const healthBlock = healthLines.length > 0
      ? `\n\nCONDIÇÕES DE SAÚDE E RESTRIÇÕES DO ALUNO (ADAPTAR O TREINO OBRIGATORIAMENTE):\n${healthLines.join('\n')}\n\nIMPORTANTE: Adapte exercícios, amplitude, carga e volume considerando as condições acima. Inclua exercícios corretivos/compensatórios quando houver desvios posturais. Evite exercícios que agravem lesões ou dores reportadas.`
      : '';

    // Structured safety rules block (PRIORIDADE ABSOLUTA)
    const safetyLines: string[] = [];
    if (casoAdaptado) safetyLines.push('CASO_ADAPTADO: SIM (tratar como caso reabilitativo / adaptado — segurança acima de qualquer outra regra)');
    if (objetivosTerapeuticos.trim()) safetyLines.push(`OBJETIVOS_TERAPEUTICOS_OBRIGATORIOS: ${objetivosTerapeuticos.trim()}`);
    if (exerciciosProibidos.trim()) safetyLines.push(`EXERCICIOS_PROIBIDOS (bloqueio absoluto, inclusive variações/sinônimos): ${exerciciosProibidos.trim()}`);
    if (padroesProibidos.length > 0) {
      const labels = padroesProibidos
        .map(id => FORBIDDEN_PATTERNS.find(p => p.id === id)?.label)
        .filter(Boolean)
        .join(', ');
      safetyLines.push(`PADROES_DE_MOVIMENTO_PROIBIDOS: ${labels}`);
    }
    if (exerciciosPermitidos.trim()) safetyLines.push(`EXERCICIOS_PERMITIDOS_OU_PRIORITARIOS: ${exerciciosPermitidos.trim()}`);
    if (regrasExecucao.length > 0) {
      const labels = regrasExecucao
        .map(id => EXECUTION_RULES.find(r => r.id === id)?.label)
        .filter(Boolean)
        .join(', ');
      safetyLines.push(`REGRAS_DE_CARGA_E_EXECUCAO: ${labels}`);
    }

    const structuredSafetyBlock = safetyLines.length > 0
      ? `\n\n========================================\n🚨 REGRAS RÍGIDAS DE SEGURANÇA ESTRUTURADAS (PRIORIDADE ABSOLUTA — LEIA PRIMEIRO)\n========================================\nEstes campos foram preenchidos pelo professor em formato estruturado.\nNÃO são observações soltas — são REGRAS OBRIGATÓRIAS que VENCEM qualquer outra regra do prompt (volume, intensidade, técnicas avançadas, divisão padrão, periodização).\n\n${safetyLines.map(l => `• ${l}`).join('\n')}\n\nFLUXO OBRIGATÓRIO:\n1) Aplique este filtro ANTES de escolher qualquer exercício.\n2) Bloqueie todo exercício que bata com EXERCICIOS_PROIBIDOS (nome ou sinônimo) ou que use PADROES_DE_MOVIMENTO_PROIBIDOS.\n3) NÃO substitua um proibido por uma variação que mantenha o mesmo padrão (ex: smith squat continua sendo sobrecarga axial; stiff halteres continua sendo hinge pesado).\n4) Inclua obrigatoriamente exercícios alinhados aos OBJETIVOS_TERAPEUTICOS_OBRIGATORIOS.\n5) Aplique REGRAS_DE_CARGA_E_EXECUCAO em cada exercício escolhido e mencione a adaptação na coluna DESCRIÇÃO (ex: "carga baixa, amplitude controlada, isometria 20s").\n6) Se o quadro for sério e não couber treino completo respeitando tudo, monte um treino MENOR — NUNCA preencha com exercício duvidoso.\n========================================`
      : '';

    // Custom muscle group split per day (overrides "Divisão" when defined)
    const numDays = parseInt(daysPerWeek || '0', 10);
    const WEEKDAYS = [
      'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira',
      'Sexta-feira', 'Sábado', 'Domingo',
    ];
    const customLines: string[] = [];
    for (let i = 0; i < numDays; i++) {
      const groups = customSplit[i];
      if (groups && groups.length > 0) {
        customLines.push(`- ${WEEKDAYS[i] ?? `Dia ${i + 1}`}: ${groups.join(' + ')}`);
      }
    }
    const customSplitBlock = customLines.length > 0
      ? `\n\nDIVISÃO PERSONALIZADA POR DIA (USE EXATAMENTE ESTA ESTRUTURA, sobrepõe a divisão padrão):\n${customLines.join('\n')}\n\nMonte cada dia com os grupos musculares listados acima, respeitando volume adequado para o nível.`
      : '';

    const prompt = `Gere o TREINO COMPLETO agora com as seguintes configurações:

- Nível: ${selectedLevel?.label}
- Dias disponíveis para treinar: ${daysPerWeek}
- Divisão: ${canonicalSplit === 'ai_decides'
      ? 'IA DEVE ESCOLHER a melhor divisão (Full Body, Upper/Lower, Push/Pull/Legs ou ABCDE) com base no nível, dias por semana, objetivo e condições de saúde do aluno. Justifique brevemente a escolha no Resumo do protocolo.'
      : selectedSplit?.label}
- Semana do ciclo: ${week} de 4
  - Equipamento: ${selectedEquip?.label}${selectedMachines.length > 0 ? ` (BLOQUEIO ABSOLUTO: USE APENAS OS SEGUINTES EQUIPAMENTOS E NADA MAIS: ${selectedMachines.map(id => AVAILABLE_MACHINES.find(m => m.id === id)?.label).join(', ')}. É PROIBIDO incluir exercícios que exijam máquinas fora desta lista, como por exemplo Leg Press se não estiver listado.)` : ''}
${notes ? `- Observações adicionais (complementares — NÃO substituem as regras estruturadas acima): ${notes}` : ''}${customSplitBlock}${structuredSafetyBlock}${healthBlock}
${treinoReferencia ? `\n\nREFERÊNCIA DE TREINO FORNECIDA PELO PROFESSOR (${marombiewEnabled ? 'USE APENAS COMO APOIO SECUNDÁRIO, NÃO SOBRESCREVA REGRAS RÍGIDAS' : 'USE COMO BASE EXATA para estruturar o treino, exercícios, divisão, volume e faixas de repetição'}):\n---\n${treinoReferencia}\n---\n${marombiewEnabled ? 'Considere este treino apenas como uma referência de estilo ou preferência do professor, mas priorize as regras estruturadas e condições de saúde.' : 'Siga essa estrutura o mais fielmente possível, adaptando apenas para as condições de saúde e equipamento informados.'}\n\nREGRA OBRIGATÓRIA DE NOMES (REFERÊNCIA):\n1) Respeite a ESTRUTURA da referência: mesma divisão por dia, mesma ordem, mesmos grupos musculares, mesmo número de séries e as mesmas faixas de repetição.\n2) NUNCA copie os nomes dos exercícios da referência. Para CADA exercício, escolha o item MAIS EQUIVALENTE do BANCO DE EXERCÍCIOS e escreva o nome EXATAMENTE como está no banco (mesma grafia, acentos e abreviações).\n3) É PROIBIDO usar qualquer nome que não exista no banco. Se não houver equivalente exato, use o mais próximo do MESMO grupo muscular e registre a troca na coluna DESCRIÇÃO.\n4) Aquecimentos, feeder sets, DC stretch e alongamentos da referência devem virar exercícios de mobilidade/alongamento existentes no banco (ou ser descritos na coluna DESCRIÇÃO), nunca linhas com nomes inventados.\n\nREGRA DE COBERTURA TOTAL (CRÍTICA — A REFERÊNCIA MANDA NA QUANTIDADE):\na) Para CADA dia da referência, gere UMA LINHA na tabela para CADA exercício listado, na mesma ordem. É PROIBIDO omitir, fundir ou resumir exercícios da referência.\nb) A quantidade de exercícios de cada dia é definida pela REFERÊNCIA e SOBREPÕE qualquer limite de \'Exercícios Principais\' ou \'Mobilidade\' configurado nesta requisição.\nc) É PROIBIDO cortar os exercícios COMPOSTOS/PRINCIPAIS (os primeiros de cada grupo muscular) para caber em um limite. Se precisar reduzir algo, reduza mobilidade/alongamento — nunca os principais.\nd) Antes de finalizar, CONFIRA dia a dia: o número de exercícios gerados deve ser >= o número de exercícios da referência daquele dia, e TODO grupo muscular citado no cabeçalho do dia (ex.: \'Posterior • Glúteo • Panturrilha • Core\') precisa ter pelo menos os mesmos exercícios da referência.\ne) Itens que costumam ser perdidos e NÃO podem faltar: \'Hip Thrust\'/\'Hip Thrust Smith\'/\'Hip Thrust máquina\' → ELEVAÇÃO PÉLVICA; \'Bulgarian Split Squat\' → BÚLGARO; \'Abdominal cabo\' → exercício do grupo ABDOMEN do banco.` : ''}
${marombiewEnabled ? `\n\nMODO AGENTE MAROMBIEW ATIVADO: Use uma lógica avançada e estruturada de geração. Considere TODO o contexto do aluno (histórico, anamnese, testes de performance, posturas, lesões, restrições e objetivos) para criar um planejamento de treino inteligente, seguro e periodizado.
PRIORIDADE DE PROCESSAMENTO (ORDEM DE IMPORTÂNCIA):
1. Regras rígidas de segurança (bloqueios absolutos)
2. Condições de saúde, lesões e restrições
3. Objetivos e prioridades musculares do aluno
4. Periodização (semana do ciclo) e Equipamento disponível
5. Histórico de treino e logbook (se disponíveis no contexto)
6. Treino de referência (se fornecido)
7. Observações gerais` : ''}

GERE TUDO DE UMA VEZ:
1) Resumo do protocolo e foco da semana
2) Tabela completa do treino com TODAS as colunas: TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO
3) Estrutura da Sessão (REGRAS OBRIGATÓRIAS):
   - Exercícios de Mobilidade por sessão: ${treinoReferencia ? 'seguir a REFERÊNCIA (ela define a quantidade)' : mobilityCount === 'auto' ? 'IA deve decidir (padrão 2-3)' : `EXATAMENTE ${mobilityCount}`}
   - Exercícios Principais por sessão: ${treinoReferencia ? 'seguir a REFERÊNCIA — inclua TODOS os exercícios principais de cada dia da referência, sem cortes' : mainExercisesCount === 'auto' ? 'IA deve decidir (padrão 6)' : `EXATAMENTE ${mainExercisesCount}`}
   - REGRA PARA MOBILIDADE/ESTABILIDADE: Sempre apenas 1 série, duração de 10 a 20 segundos e descanso sempre de 10 segundos.
4) Use técnicas avançadas conforme o nível
5) Mensagens prontas para WhatsApp explicando o protocolo`;

    // ---- PERIODIZAÇÃO: decisão determinística ANTES de chamar a IA.
    const weekNumber = parseInt(week || '1', 10) || 1;
    const snapshot = resolvePeriodization({
      selection: periodizationSelection,
      phase: weekNumberToPhase(weekNumber),
      blockNumber: (lastWorkoutPlan?.block_number ?? 0) + 1,
      context: {
        objective: studentCtx?.objetivo ?? null,
        level,
        daysPerWeek: daysAvailableNum,
        weeklyStimuliPerMuscle:
          canonicalSplit === 'full_body' ? (daysAvailableNum ?? 3)
          : canonicalSplit === 'upper_lower' || canonicalSplit === 'push_pull' ? Math.floor((daysAvailableNum ?? 4) / 2)
          : (daysAvailableNum ?? 0) >= 5 ? 2 : 1,
        completedPlans: lastWorkoutPlan ? (lastWorkoutPlan.version ?? 1) : 0,
        priorityFocus: canonicalSplit === 'specialization' ? 'grupo prioritário' : null,
        painFlags: hasDor || hasLesao,
      },
    });

  return {
    prompt,
    snapshot,
    body: {
      messages: [{ role: 'user', content: prompt }],
      studentContext: studentCtx,
      outputMode: 'json',
      studentId,
      variationIntensity,
      // Phase 1 — additive, optional fields
      split_slug: canonicalSplit,
      split_slug_legacy: split && split !== canonicalSplit ? split : null,
      days_available: daysAvailableNum,
      periodization: snapshot,
      phase: weekNumberToPhase(weekNumber),
      exercise_profile: exerciseProfile,
      available_equipment:
        equipment === 'limitado' || equipment === 'casa' ? selectedMachines : [],
    },
  };
}
