import { describe, it, expect } from 'vitest';
import { normalizeSplitSlug } from '@/lib/splitSlugs';
import { resolvePeriodization, weekNumberToPhase } from '@/lib/periodization';
import {
  LEVELS, SPLITS, EQUIPMENT, AVAILABLE_MACHINES, FORBIDDEN_PATTERNS, EXECUTION_RULES,
  buildTreinoGenerationRequest, defaultTreinoWizardState, type TreinoWizardState,
} from '@/lib/officeWizard/treinoWizard';

// Cópia literal do código que existia inline em TreinoIA.generatePlan antes
// da extração. Garante que admin e office-gerar montam o MESMO pedido.
function legacy(state: TreinoWizardState, studentCtx: any, studentId: string, lastWorkoutPlan: any) {
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
    prompt, snapshot,
    body: {
      messages: [{ role: 'user', content: prompt }],
      studentContext: studentCtx, outputMode: 'json', studentId, variationIntensity,
      split_slug: canonicalSplit,
      split_slug_legacy: split && split !== canonicalSplit ? split : null,
      days_available: daysAvailableNum, periodization: snapshot,
      phase: weekNumberToPhase(weekNumber), exercise_profile: exerciseProfile,
      available_equipment: equipment === 'limitado' || equipment === 'casa' ? selectedMachines : [],
    },
  };
}

const ctx = { objetivo: 'hipertrofia', nome: 'Teste' };
const base = { ...defaultTreinoWizardState(), level: 'intermediario', daysPerWeek: '5', split: 'push_pull_legs', week: '2', equipment: 'completa' };
const cases: Array<[string, TreinoWizardState, any]> = [
  ['básico', base, null],
  ['limitado + saúde + segurança', {
    ...base, equipment: 'limitado', selectedMachines: ['halteres', 'leg_press'], hasLesao: true, lesaoLocal: ['Joelho'],
    hasDor: true, dorLocal: 'lombar', hipercifose: true, tabagismo: true, casoAdaptado: true,
    exerciciosProibidos: 'stiff', padroesProibidos: ['hinge_pesado'], regrasExecucao: ['sem_falha'],
    mobilityCount: '2', mainExercisesCount: '6', notes: 'foco em glúteo', exerciseProfile: 'basic',
  }, { block_number: 2, version: 3 }],
  ['custom + referência + marombiew', {
    ...base, split: 'custom', daysPerWeek: '3', customSplit: { 0: ['Peito', 'Tríceps'], 2: ['Glúteo'] },
    treinoReferencia: 'A: supino 4x10', marombiewEnabled: true, periodizationSelection: 'ondulatoria' as any,
    variationIntensity: 'alta',
  }, null],
  ['ai_decides deload', { ...base, split: 'ai_decides', week: '4', daysPerWeek: '2' }, { block_number: 1 }],
];

describe('wizard Gerar Treino compartilhado', () => {
  it.each(cases)('monta o mesmo pedido do admin (%s)', (_n, state, last) => {
    const next = buildTreinoGenerationRequest({ state, studentCtx: ctx, studentId: 'stu', lastWorkoutPlan: last });
    const old = legacy(state, ctx, 'stu', last);
    expect(next.prompt).toBe(old.prompt);
    expect(JSON.stringify(next.body)).toBe(JSON.stringify(old.body));
  });
});
