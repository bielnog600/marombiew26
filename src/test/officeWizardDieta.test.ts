import { describe, it, expect } from 'vitest';
import {
  STRATEGIES, ACTIVITY_LEVELS, PHASES, TRAINING_TIMES, DIET_STYLES, PROTOCOL_ADJUSTMENTS, BASE_SOURCE_LABELS,
  buildDietGenerationPrompts, deriveDietaWizard, defaultDietaWizardState, buildDietAgentBody, type DietaWizardState,
} from '@/lib/officeWizard/dietaWizard';
import { validateDietaAnswers, dietaFields } from '@/lib/officeWizard/dietaFields';
import { getMacroPrescription } from '@/lib/macroConfig';
import { WEEKDAY_KEYS, resolveDayTarget } from '@/lib/dietDayTargets';
import { ENERGY_WEEKDAYS, WEEKDAY_LABELS, type EnergyWeekday } from '@/lib/weeklyEnergy';
import { buildStructuredDietPrompt } from '@/lib/structuredDietPrompt';
import type { DietMacroTargets } from '@/lib/dietMacroValidation';

// Cópia literal do código que existia inline em DietaIA.generatePlan antes da
// extração. Garante que admin e office-gerar montam o MESMO pedido ao diet-agent.
function legacy(input: any, intent: string) {
  const { state, studentCtx, baseKcal, macroConfig, macroResolution, macroBody, canonicalTargets, carbCycling, weeklyCarbTargets, weeklySchedule } = input;
  const {
    dailyRoutine, trainingTime, trainingDays, dietStyle, phase, usesHormones, hormoneDetails, activityLevel, strategy,
    mealCount, selectedRestrictions, customRestriction, selectedPreferences, customPreference, selectedAdjustments,
    enableFitoterapia, enableSuplementos, enableEmagrecimentoRapido, enableJejumIntermitente, substitutions, modelDiet,
  } = state as DietaWizardState;
  const getRestrictionsText = () => { const parts = [...selectedRestrictions]; if (customRestriction.trim()) parts.push(customRestriction.trim()); return parts.join(', '); };
  const getPreferencesText = () => { const parts = [...selectedPreferences]; if (customPreference.trim()) parts.push(customPreference.trim()); return parts.join(', '); };
  const capture = (structuredPrompt: string, dietConfig: any, targets: any, _i: string) => ({ structuredPrompt, dietConfig, targets });
    const selectedStrategy = STRATEGIES.find(s => s.value === strategy);
    const selectedActivity = ACTIVITY_LEVELS.find(a => a.value === activityLevel);
    const selectedPhase = PHASES.find(p => p.value === phase);
    const selectedTrainingTime = TRAINING_TIMES.find(t => t.value === trainingTime);
    const selectedDietStyle = DIET_STYLES.find(d => d.value === dietStyle);

    const adjustmentLabels = selectedAdjustments.map(id => PROTOCOL_ADJUSTMENTS.find(a => a.id === id)?.label).filter(Boolean);

    // Build meal names based on count
    const getMealNames = (count: number): string[] => {
      const base = ['Café da Manhã', 'Almoço', 'Lanche da Tarde', 'Jantar'];
      if (count <= 4) return base.slice(0, count);
      const extra = ['Pós-Treino', 'Ceia', 'Lanche da Manhã'];
      return [...base, ...extra.slice(0, count - 4)];
    };

    const mealNames = getMealNames(Number(mealCount));

    // Build alimentos_por_refeicao info from questionnaire
    let alimentosPorRefeicaoText = '';
    if (studentCtx.questionario_dieta?.alimentos_por_refeicao) {
      const apr = studentCtx.questionario_dieta.alimentos_por_refeicao;
      if (typeof apr === 'object' && apr !== null) {
        const entries = Object.entries(apr as Record<string, any>).filter(([, v]) => v && String(v).trim());
        if (entries.length > 0) {
          alimentosPorRefeicaoText = `\n=== ALIMENTOS POR REFEIÇÃO (informados pelo aluno na ficha) ===\n${entries.map(([k, v]) => `- ${k}: ${v}`).join('\n')}\nIMPORTANTE: Respeite esses alimentos nas refeições correspondentes.\n`;
        }
      }
    }

    const observationsList = [
      dailyRoutine && `Observações digitadas no wizard: ${dailyRoutine}`,
      studentCtx.observacoes && `Observações do perfil do aluno: ${studentCtx.observacoes}`,
      studentCtx.anamnese?.rotina && `Rotina registrada na anamnese: ${studentCtx.anamnese.rotina}`,
      studentCtx.questionario_dieta?.observacoes && `Observações do questionário: ${studentCtx.questionario_dieta.observacoes}`,
      studentCtx.questionario_dieta?.como_se_sente && `Como o aluno se sente: ${studentCtx.questionario_dieta.como_se_sente}`,
    ].filter(Boolean);

    const criticalInputsText = `
=== INPUTS OBRIGATÓRIOS DO WIZARD E DA FICHA ===
Use TODOS os dados abaixo como prioridade máxima. NÃO ignore, NÃO substitua por suposições e NÃO contradiga esses campos.
- Frequência de treino selecionada: ${trainingDays ? `${trainingDays}x/semana` : studentCtx.questionario_dieta?.dias_treino || 'Não informada'}
- Fase atual selecionada: ${selectedPhase?.label || studentCtx.questionario_dieta?.fase_atual || 'Não informada'}
- Nível de atividade física selecionado: ${selectedActivity?.label || 'Não informado'} (FA = ${activityLevel || 'não informado'})
- Restrições alimentares obrigatórias: ${getRestrictionsText() || studentCtx.questionario_dieta?.restricoes_alimentares || studentCtx.restricoes || 'Nenhuma informada'}
- Preferências alimentares: ${getPreferencesText() || studentCtx.questionario_dieta?.preferencias_alimentares || 'Não informadas'}
- Estilo de dieta selecionado: ${selectedDietStyle?.label || studentCtx.questionario_dieta?.estilo_dieta || 'Não informado'}
${observationsList.length > 0 ? observationsList.map(item => `- ${item}`).join('\n') : '- Observações adicionais: Nenhuma informada'}
IMPORTANTE: Se houver conflito entre uma inferência sua e os dados acima, os dados acima vencem.
`;


    // Recalculate recommendation using the single base-kcal source selected in the wizard.
    let recText = '';
    let currentTargets: DietMacroTargets | null = null;
    const currentCalories = baseKcal.base_daily_kcal;
    const currentFA = baseKcal.calculation.activity_factor;
    const currentStrategyPct = baseKcal.calculation.strategy_percent;
    const currentGET = baseKcal.calculation.tdee;
    const currentBmr = baseKcal.calculation.bmr;
    const currentFormula = baseKcal.calculation.formula;
    // Fase 2: os macros vêm EXCLUSIVAMENTE da configuração exibida na tela,
    // preservando a BASE escolhida (peso corporal ou massa magra) em cada g/kg.
    const prescription = getMacroPrescription(macroConfig, macroResolution, macroBody);
    const macros = {
      proteinGrams: canonicalTargets.p,
      carbGrams: canonicalTargets.c,
      fatGrams: canonicalTargets.g,
      proteinPerKg: prescription?.protein.perKg ?? null,
      fatPerKg: prescription?.fat.perKg ?? null,
      proteinBasis: prescription?.protein.basisLabel ?? 'peso corporal',
      fatBasis: prescription?.fat.basisLabel ?? 'peso corporal',
    };
    currentTargets = {
      calories: currentCalories,
      protein: macros.proteinGrams,
      carbs: macros.carbGrams,
      fats: macros.fatGrams,
    };

    recText = `
=== RECOMENDAÇÃO CALCULADA (VALORES OBRIGATÓRIOS — NÃO RECALCULE) ===
- Origem da meta base: ${BASE_SOURCE_LABELS[baseKcal.source]}
- TMB: ${currentBmr ?? 'não aplicada'} kcal${currentFormula ? ` (calculado por ${currentFormula})` : ''}
- Fator de Atividade: ${currentFA ?? 'não aplicado'}
- GET: ${currentGET ?? 'não aplicado'} kcal
- Estratégia: ${selectedStrategy?.label} (${(currentStrategyPct ?? 0) > 0 ? '+' : ''}${currentStrategyPct ?? 0}%)
- Calorias alvo EXATAS: ${currentCalories} kcal
- Proteína EXATA: ${macros.proteinGrams}g${macros.proteinPerKg ? ` (${macros.proteinPerKg} g/kg de ${macros.proteinBasis})` : ''}
- Carboidrato EXATO: ${macros.carbGrams}g
- Gordura EXATA: ${macros.fatGrams}g${macros.fatPerKg ? ` (${macros.fatPerKg} g/kg de ${macros.fatBasis})` : ''}
⚠️ OBRIGATÓRIO: O TOTAL DIÁRIO da tabela DEVE ser EXATAMENTE ${currentCalories} kcal (tolerância ±50 kcal). Proteína total = ${macros.proteinGrams}g, Carboidrato total = ${macros.carbGrams}g, Gordura total = ${macros.fatGrams}g. NÃO use outros valores. NÃO recalcule a TMB. Estes valores já são definitivos.
⚠️ REGRA DE CORREÇÃO: Se faltar caloria para bater a meta, ajuste CARBOIDRATO. NÃO aumente proteína acima de ${macros.proteinGrams}g para completar calorias.
⚠️ VALIDAÇÃO FINAL: Antes de responder, some alimento por alimento. A dieta só é aceitável se ficar entre ${currentCalories - 50} e ${currentCalories + 50} kcal, proteína entre ${macros.proteinGrams - 10} e ${macros.proteinGrams + 10}g, carboidrato entre ${macros.carbGrams - 15} e ${macros.carbGrams + 15}g e gordura entre ${macros.fatGrams - 8} e ${macros.fatGrams + 8}g.
`;

    if (carbCycling.enabled) {
      const dayLines = WEEKDAY_KEYS.map((wd) => {
        const d = weeklyCarbTargets[wd];
        if (!d) return '';
        return `${WEEKDAY_LABELS[wd as EnergyWeekday].toUpperCase()} — ${d.type.toUpperCase()}\nKcal: ${d.kcal}\nP: ${d.p}g\nC: ${d.c}g\nG: ${d.g}g`;
      }).filter(Boolean).join('\n\n');
      recText = `
=== REFERÊNCIA METABÓLICA (NÃO É A META DE TODOS OS DIAS) ===
- TMB: ${currentBmr ?? 'não aplicada'} kcal${currentFormula ? ` (calculado por ${currentFormula})` : ''}
- GET: ${currentGET ?? 'não aplicado'} kcal
- Meta base diária (apenas referência): ${currentCalories} kcal

=== METAS DIÁRIAS OBRIGATÓRIAS (CARB CYCLING) ===
${dayLines}

⚠️ Cada dia deve respeitar sua própria meta. Não aplicar a meta base global por cima dessas metas.
⚠️ NÃO recalcule a TMB nem os macros. Os valores acima são definitivos (tolerância ±50 kcal por dia).
`;
    }

    const prompt = `Gere o plano alimentar COMPLETO para fisiculturismo com as seguintes configurações:
${criticalInputsText}
${recText}

=== ROTINA DO ALUNO ===
- Rotina diária: ${dailyRoutine || 'Não informada'}
- Horário de treino: ${selectedTrainingTime?.label || 'Não informado'}
- Dias de treino: ${trainingDays ? `${trainingDays}x/semana` : 'Não informado'}

=== ESTILO DE DIETA ===
- Estilo: ${selectedDietStyle?.label || 'Não definido'} — ${selectedDietStyle?.desc || ''}
IMPORTANTE: Siga o estilo selecionado sem quebrar os macros obrigatórios. Se Low Carb/Cetogênica conflitar com a meta de carboidrato calculada, a meta calculada vence. Se Vegetariana/Vegana, respeite as restrições proteicas sem aumentar a proteína total.

=== FASE ATUAL ===
- Fase: ${selectedPhase?.label} — ${selectedPhase?.desc}
- Uso de hormônios: ${usesHormones === null ? 'Não informado' : usesHormones ? `Sim — ${hormoneDetails || 'detalhes não especificados'}` : 'Não (natural)'}

=== PARÂMETROS NUTRICIONAIS ===
- Fator de Atividade: ${selectedActivity?.label} (FA = ${activityLevel})
- Estratégia: ${selectedStrategy?.label} (${(selectedStrategy?.pct ?? 0) > 0 ? '+' : ''}${selectedStrategy?.pct}%)
- Número de refeições: ${mealCount} por dia
- NOMES DAS REFEIÇÕES (use EXATAMENTE estes nomes na coluna "Refeição" da tabela): ${mealNames.join(', ')}
${getRestrictionsText() ? `- Restrições alimentares: ${getRestrictionsText()}` : ''}
${getPreferencesText() ? `- Preferências alimentares: ${getPreferencesText()}` : ''}
${alimentosPorRefeicaoText}
=== AJUSTES DO PROTOCOLO ===
${adjustmentLabels.length > 0 ? adjustmentLabels.map(a => `- ${a}`).join('\n') : '- Nenhum ajuste selecionado'}

=== EXTRAS ===
${enableFitoterapia ? '- INCLUIR RECEITAS DE FITOTERAPIA: Sugira chás, infusões e preparações fitoterápicas complementares. Inclua dosagens, horários e benefícios.' : ''}
${enableSuplementos ? '- INCLUIR SUPLEMENTAÇÃO COMPLETA: Protocolo de suplementos com dosagem, horário e justificativa.' : ''}
${enableEmagrecimentoRapido ? '- ESTRATÉGIA DE EMAGRECIMENTO RÁPIDO: Estratégias avançadas (jejum intermitente, HIIT, termogênicos).' : ''}
${enableJejumIntermitente ? '- JEJUM INTERMITENTE: Estruturar o dia alimentar respeitando a janela alimentar. Concentrar refeições na janela e indicar horários explicitamente. Não criar refeições fora da janela.' : ''}
=== SUBSTITUIÇÕES DE ALIMENTOS ===
OBRIGATÓRIO: Para CADA alimento na tabela de refeições, a coluna "Substituição" deve conter EXATAMENTE 3 opções de troca, cada uma com nome e quantidade (em gramas), que tenham macros e calorias equivalentes ao alimento principal.
Formato da coluna Substituição: "1) Alimento X (Xg); 2) Alimento Y (Xg); 3) Alimento Z (Xg)"
Exemplo: "1) Batata-doce (150g); 2) Inhame (140g); 3) Mandioca (120g)"
As 3 opções devem ser alimentos DIFERENTES entre si e diferentes do alimento principal, respeitando os macros e calorias equivalentes.
${substitutions.length > 0 ? `Use PREFERENCIALMENTE os alimentos abaixo como opções de substituição:\n${substitutions.map(s => `- ${s.food}: ${s.portion}`).join('\n')}` : ''}
${modelDiet.trim() ? `
 === DIETA MODELO (APENAS LISTA DE ALIMENTOS) ===
 IMPORTANTE: A dieta modelo serve APENAS como fonte da LISTA DE ALIMENTOS por refeição. IGNORE completamente as calorias, macros, "Estimativa" e "TOTAL DIÁRIO" da dieta modelo — esses valores NÃO devem ser copiados nem usados como referência. ${carbCycling.enabled ? 'Use as metas específicas de cada dia definidas no bloco METAS DIÁRIAS OBRIGATÓRIAS — não existe meta única para todos os dias.' : `A meta calórica e de macros do aluno é a definida acima (${currentCalories} kcal, P=${macros.proteinGrams}g, C=${macros.carbGrams}g, G=${macros.fatGrams}g) e SEMPRE prevalece.`}
 REGRAS OBRIGATÓRIAS:
 1) Use EXATAMENTE os mesmos alimentos da dieta modelo, na MESMA ordem, refeição por refeição, preservando o NOME EXATO (ex.: "Arroz basmati cozido") — não renomeie nem simplifique. Se o alimento não estiver na base do sistema, use-o mesmo assim e devolva kcal/P/C/G estimados por você.
 2) AJUSTE LIVREMENTE AS QUANTIDADES (gramas/ml/unidades) de cada item para bater EXATAMENTE a meta calórica e de macros do aluno — as quantidades da dieta modelo são apenas ponto de partida e devem ser recalculadas do zero conforme a meta do aluno.
 3) Substituição do alimento SÓ é permitida quando o alimento da dieta modelo estiver listado como restrição/alergia/intolerância do aluno. Nesse caso, substitua por um item de perfil nutricional semelhante e explique o motivo na coluna "Substituição".
 4) NÃO adicione alimentos que não estejam na dieta modelo, exceto quando absolutamente necessário para fechar um macro — nesse caso, prefira alimentos que já apareçam em outras refeições da própria dieta modelo.
 5) Para cada alimento, preencha SEMPRE Kcal, P, C, G reais daquela quantidade.
 6) FORMATO DA DIETA MODELO: markdown com títulos "### N. Nome da refeição — HHhMM" seguidos por bullets "* Nome do alimento: quantidade". Extraia cada bullet como um alimento; use o horário do título na coluna "Horário" (ex.: "13:30"); mapeie o nome da refeição para os nomes oficiais (${mealNames.join(', ')}). Linhas de "Estimativa" e "TOTAL DIÁRIO" devem ser IGNORADAS.
Dieta modelo:
${modelDiet.trim()}
` : ''}
${studentCtx.questionario_dieta?.preferencias_alimentares ? `
=== PREFERÊNCIAS ALIMENTARES DO ALUNO ===
Estes são os alimentos que o aluno GOSTA e PODE comer. Ao usar dieta modelo, substitua qualquer alimento que não esteja nesta lista por um equivalente desta lista:
${studentCtx.questionario_dieta.preferencias_alimentares}` : ''}
${studentCtx.questionario_dieta?.restricoes_alimentares ? `
=== RESTRIÇÕES ALIMENTARES DO ALUNO ===
O aluno NÃO PODE comer os alimentos/grupos abaixo. Se aparecerem na dieta modelo, SUBSTITUA obrigatoriamente por alternativas permitidas:
${studentCtx.questionario_dieta.restricoes_alimentares}` : ''}
${selectedPreferences.length > 0 ? `
=== ALIMENTOS PREFERIDOS (selecionados pelo nutricionista) ===
Priorize estes alimentos ao montar o plano ou ao substituir itens da dieta modelo:
${selectedPreferences.join(', ')}` : ''}
${selectedRestrictions.length > 0 ? `
=== RESTRIÇÕES (selecionadas pelo nutricionista) ===
O aluno possui estas restrições. Nunca inclua alimentos incompatíveis:
${selectedRestrictions.join(', ')}` : ''}
Use também a base de alimentos disponível do sistema para escolher substituições adequadas.

=== ESTRUTURA OBRIGATÓRIA DA TABELA ===
A tabela DEVE ter as colunas: Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G | Substituição
REGRA CRÍTICA: A coluna "Refeição" deve conter SOMENTE os nomes das refeições: ${mealNames.join(', ')}
Cada refeição deve ter VÁRIOS alimentos (linhas), onde a primeira linha de cada refeição mostra o nome da refeição e as linhas seguintes ficam com a célula "Refeição" VAZIA (continuação da mesma refeição).
NÃO coloque nomes de refeições na coluna "Alimento". A coluna "Alimento" é SOMENTE para os alimentos.
Inclua uma linha de TOTAL por refeição e TOTAL DIÁRIO no final.

GERE TUDO DE UMA VEZ:
${studentCtx.questionario_dieta ? `
=== FEEDBACK DO ALUNO (Questionário respondido em ${new Date(studentCtx.questionario_dieta.respondido_em).toLocaleDateString('pt-BR')}) ===
- Estilo de dieta preferido: ${studentCtx.questionario_dieta.estilo_dieta || 'Não informado'}
- Fase informada pelo aluno: ${studentCtx.questionario_dieta.fase_atual || 'Não informada'}
- Alimentos preferidos: ${studentCtx.questionario_dieta.preferencias_alimentares || 'Não informado'}
- Restrições do aluno: ${studentCtx.questionario_dieta.restricoes_alimentares || 'Nenhuma'}
- Usa hormônios: ${studentCtx.questionario_dieta.usa_hormonios || 'Não informado'}
- Como se sente: ${studentCtx.questionario_dieta.como_se_sente || 'Não informou'}
- Sintomas relatados: ${[
    studentCtx.questionario_dieta.fraqueza && 'Fraqueza muscular',
    studentCtx.questionario_dieta.dor_cabeca && 'Dor de cabeça',
    studentCtx.questionario_dieta.reduziu_peso && 'Reduziu peso',
    studentCtx.questionario_dieta.pele_fina && 'Pele mais fina',
    studentCtx.questionario_dieta.fome_excessiva && 'Fome excessiva',
    studentCtx.questionario_dieta.insonia && 'Insônia',
    studentCtx.questionario_dieta.baixa_energia && 'Baixa energia',
    studentCtx.questionario_dieta.irritabilidade && 'Irritabilidade',
  ].filter(Boolean).join(', ') || 'Nenhum'}
- Observações do aluno: ${studentCtx.questionario_dieta.observacoes || 'Nenhuma'}

IMPORTANTE: Considere os sintomas e feedback do aluno ao montar a dieta. Se há fraqueza/baixa energia, priorize mais calorias ou distribuição melhor. Se há insônia, evite estimulantes à noite. Se reduziu peso, pode estar em déficit excessivo.
` : ''}
1) Utilize a TMB e o GET fornecidos pelo app apenas como referência
2) NÃO recalcule a TMB/GET nem escolha outra fórmula — a fórmula já foi definida pelo app
3) Monte o plano exatamente conforme os targets fornecidos${carbCycling.enabled ? ' para CADA dia (bloco METAS DIÁRIAS OBRIGATÓRIAS)' : ''}
4) Apresente a distribuição de macronutrientes usando os gramas fornecidos
5) EXATAMENTE 1 cardápio completo em tabela com: Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G | Substituição.
6) Total de cada refeição e do dia
7) Timing nutricional (pré-treino, intra-treino, pós-treino) baseado no horário de treino informado
${selectedAdjustments.includes('carb_cycling') ? '8) Protocolo de Carb Cycling com tabela de dias High/Medium/Low' : ''}
${selectedAdjustments.includes('refeed') ? '9) Protocolo de Refeed: frequência, calorias e macros no dia de refeed' : ''}
${selectedAdjustments.includes('diet_break') ? '10) Protocolo de Diet Break: duração, calorias de manutenção' : ''}
${selectedAdjustments.includes('plato') ? '11) Estratégias para quebrar platô metabólico' : ''}
${selectedAdjustments.includes('sodium_adjust') ? '12) Protocolo de manipulação de sódio (especialmente para pré-contest)' : ''}
${selectedAdjustments.includes('water_adjust') ? '13) Protocolo de manipulação hídrica' : ''}
${enableFitoterapia ? '14) Receitas e protocolos de fitoterapia' : ''}
${enableSuplementos ? '15) Protocolo de suplementação completo' : ''}
${enableEmagrecimentoRapido ? '16) Estratégias avançadas de emagrecimento' : ''}
17) Mensagens prontas para WhatsApp`;

        const cyclePlan = null;
        // Fase 4.2: prompt structured por construção positiva (sem sanitizar o legado).
        const structuredPrompt = buildStructuredDietPrompt({
          studentContext: criticalInputsText,
          routine: [
            `Rotina diária: ${dailyRoutine || 'Não informada'}`,
            `Horário de treino: ${selectedTrainingTime?.label || 'Não informado'}`,
          ].join('\n'),
          training: trainingDays ? `${trainingDays}x/semana` : 'Não informado',
          phase: `${selectedPhase?.label ?? 'Não informada'} — ${selectedPhase?.desc ?? ''}`,
          strategy: `${selectedStrategy?.label ?? 'Não informada'} (${(selectedStrategy?.pct ?? 0) > 0 ? '+' : ''}${selectedStrategy?.pct ?? 0}%)`,
          style: `${selectedDietStyle?.label || 'Não definido'} — ${selectedDietStyle?.desc || ''}`,
          meals: [
            `Número de refeições: ${mealCount} por dia`,
            `Nomes das refeições (use exatamente): ${mealNames.join(', ')}`,
            alimentosPorRefeicaoText.trim(),
          ].filter(Boolean).join('\n'),
          restrictions: [getRestrictionsText(), ...selectedRestrictions].filter(Boolean).join('; '),
          preferences: [getPreferencesText(), ...selectedPreferences].filter(Boolean).join('; '),
          targets: carbCycling.enabled ? '' : recText,
          carbCycling: carbCycling.enabled ? recText : '',
          modelDiet: modelDiet.trim(),
          extras: adjustmentLabels.length > 0 ? adjustmentLabels.map((a) => `- ${a}`).join('\n') : '',
        });
          const captured = capture(
            structuredPrompt,
            {
              objective: phase || undefined,
              strategy: strategy || undefined,
              style: dietStyle || undefined,
              ...(cyclePlan ? { carbCyclePlan: cyclePlan } : {}),
              // Autoridade explícita: carb cycling materializa cada weekday e
              // por isso NÃO exige dailyAdjustments add/remove.
              carbCyclingEnabled: carbCycling.enabled,
              weeklyEnergySchedule: {
                base_daily_kcal: currentTargets.calories,
                base_source: weeklySchedule.base_source,
                calculation_snapshot: weeklySchedule.calculation_snapshot,
                days: Object.fromEntries(
                  ENERGY_WEEKDAYS.map((wd) => {
                    const entry = weeklySchedule.days[wd];
                    // Rebase adjustments over the definitive currentTargets.calories.
                    const adj = entry.adjustment_kcal;
                    const fixed = entry.fixed_kcal;
                    // Fase 3: quando o carb cycling está ativo, o dia já vem
                    // materializado com {kcal,p,c,g} — resolveDayTarget é o
                    // ponto único de consumo e nada é reescalonado depois.
                    const cycleDay = carbCycling.enabled ? weeklyCarbTargets[wd] : undefined;
                    const dayTarget = resolveDayTarget({
                      schedule: weeklySchedule as unknown as Parameters<typeof resolveDayTarget>[0]['schedule'],
                      dayIndex: ENERGY_WEEKDAYS.indexOf(wd),
                      planTargetKcal: currentTargets.calories,
                      planTargetMacros: { p: canonicalTargets.p, c: canonicalTargets.c, g: canonicalTargets.g },
                      dayTarget: cycleDay ?? null,
                    });
                    const target = cycleDay
                      ? dayTarget.kcal
                      : fixed != null && fixed > 0
                        ? Math.round(fixed)
                        : Math.round(currentTargets.calories + adj);
                    return [wd, {
                      base_kcal: currentTargets.calories,
                      adjustment_kcal: cycleDay ? 0 : adj,
                      fixed_kcal: cycleDay ? target : fixed,
                      target_kcal: target,
                      day_type: cycleDay?.type ?? null,
                      protein_g: dayTarget.p || null,
                      carbs_g: dayTarget.c || null,
                      fat_g: dayTarget.g || null,
                      workout: entry.workout,
                    }];
                  }),
                ),
              },
            },
            {
              kcal: currentTargets.calories,
              p: currentTargets.protein,
              c: currentTargets.carbs,
              g: currentTargets.fats,
              tmb: currentBmr ?? undefined,
              get: currentGET ?? undefined,
            },
            intent,
          );

  return { prompt, ...captured };
}

const ctx = {
  nome: 'Heracto', sexo: 'masculino', data_nascimento: '1995-04-10', altura: 182, peso: 92, percentual_gordura: 14,
  massa_magra: 79, massa_magra_data: '2026-10-01', objetivo: 'hipertrofia', observacoes: 'Treina cedo',
  anamnese: { rotina: 'Escritório 9-18h' },
  questionario_dieta: { preferencias_alimentares: 'Frango, arroz', restricoes_alimentares: 'Sem lactose', respondido_em: '2026-10-20', alimentos_por_refeicao: { cafe: 'Ovos' } },
};
const workouts = { seg: { label: 'Peito', type: null, muscles: ['peito'] }, qua: { label: 'Pernas', type: null, muscles: ['pernas'] } } as any;

const respostasBase = {
  horario_treino: 'manha', dias_treino: '5', fase: 'bulking', usa_hormonios: false, nivel_atividade: '1.55',
  estrategia: 'superavit_leve', estilo_dieta: 'convencional', num_refeicoes: '5', suplementacao: true,
  restricoes: ['Sem lactose'], preferencias: ['Frango'], preferencias_outras: 'Batata doce',
  formula_energetica: 'katch_mcardle',
};

function both(respostas: Record<string, unknown>) {
  const v = validateDietaAnswers(respostas, 'Prefere jantar leve');
  if (v.ok !== true) throw new Error(JSON.stringify(v));
  const d = deriveDietaWizard(v.state, ctx, workouts);
  expect(d.canGenerate).toBe(true);
  const input = { state: v.state, studentCtx: ctx, baseKcal: d.baseKcal, macroConfig: d.macroConfig, macroResolution: d.macroResolution, macroBody: d.macroBody, canonicalTargets: d.canonicalTargets, carbCycling: d.carbCycling, weeklyCarbTargets: d.weeklyCarbTargets, weeklySchedule: d.weeklySchedule! };
  return { shared: buildDietGenerationPrompts(input), old: legacy(input, 'new'), state: v.state, d };
}

describe('Agente de Dieta — admin e escritório montam o mesmo pedido', () => {
  it('linear: prompt, prompt structured, dietConfig e metas idênticos', () => {
    const { shared, old } = both(respostasBase);
    expect(shared.prompt).toBe(old.prompt);
    expect(shared.structuredPrompt).toBe(old.structuredPrompt);
    expect(shared.dietConfig).toEqual(old.dietConfig);
    expect(shared.targets).toEqual(old.targets);
  });

  it('carb cycling + ajustes + dieta modelo: idênticos', () => {
    const { shared, old, d } = both({ ...respostasBase, conducao: ['carb_cycling', 'refeed'], ajustes_finos: ['sodium_adjust'], dieta_modelo: '### 1. Café — 07h00\n* Ovos: 3 un', substituicoes: [{ alimento: 'Inhame', porcao: '150g' }] });
    expect(d.carbCycling.enabled).toBe(true);
    expect(shared.prompt).toBe(old.prompt);
    expect(shared.structuredPrompt).toBe(old.structuredPrompt);
    expect(shared.dietConfig).toEqual(old.dietConfig);
  });

  it('meta manual e ajuste por dia entram no cronograma', () => {
    const { shared, old } = both({ ...respostasBase, meta_base_modo: 'manual', meta_base_manual_kcal: 3397, ajuste_kcal_por_dia: { sab: 300 } });
    expect(shared.targets.kcal).toBe(3397);
    expect(shared.dietConfig.weeklyEnergySchedule.days.sab.target_kcal).toBe(3697);
    expect(shared.dietConfig).toEqual(old.dietConfig);
  });

  it('instruções do escritório entram nas observações da rotina', () => {
    const { state } = both(respostasBase);
    expect(state.dailyRoutine).toBe('Prefere jantar leve');
  });

  it('g/kg informado substitui o preset (proteína 2.2 × 92 kg = 202 g)', () => {
    const { shared } = both({ ...respostasBase, proteina_g_kg: 2.2 });
    expect(shared.targets.p).toBe(202);
  });
});

describe('perguntas da dieta', () => {
  it('422: faltam os mesmos obrigatórios que a tela exige para avançar', () => {
    const v = validateDietaAnswers({}, null);
    expect(v.ok).toBe(false);
    const ids = (v as any).faltando.map((f: any) => f.id).sort();
    expect(ids).toEqual(['dias_treino', 'estilo_dieta', 'estrategia', 'fase', 'horario_treino', 'nivel_atividade', 'num_refeicoes', 'usa_hormonios']);
  });
  it('meta manual exige o valor em kcal', () => {
    const v = validateDietaAnswers({ ...respostasBase, meta_base_modo: 'manual' }, null);
    expect((v as any).faltando.map((f: any) => f.id)).toEqual(['meta_base_manual_kcal']);
  });
  it('opção fora da lista é inválida', () => {
    const v = validateDietaAnswers({ ...respostasBase, estrategia: 'auto' }, null);
    expect((v as any).invalidos[0].id).toBe('estrategia');
  });
  it('opções vêm das constantes da tela', () => {
    const f = dietaFields().find((x) => x.id === 'nivel_atividade')!;
    expect(f.opcoes!.map((o) => o.valor)).toEqual(ACTIVITY_LEVELS.map((a) => a.value));
  });
  it('corpo do diet-agent é structured com metas canônicas', () => {
    const b = buildDietAgentBody({ userPrompt: 'x', foodAliasBlock: '', studentCtx: ctx, dietConfig: {}, trainingContext: undefined, studentId: 's', variationIntensity: 'media' as any, intent: 'new', modelDiet: '', targets: { kcal: 3397, p: 199, c: 482, g: 75 }, allowedUnresolvedFoods: [] });
    expect(b.mode).toBe('structured');
    expect(b.canonicalTargets).toEqual({ kcal: 3397, p: 199, c: 482, g: 75 });
  });
});
