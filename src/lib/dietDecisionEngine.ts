/**
 * Diet Decision Engine — Fase 3
 *
 * Pure, deterministic classifier that turns a structured check-in into
 * (1) a scenario label and (2) a suggested next action for the admin.
 *
 * Rules are intentionally small and conservative. Anything that looks
 * ambiguous returns `manter` + `revisar_manual` so the admin stays in control.
 */

export type DietDecisionGoal = 'cutting' | 'bulking' | 'manutencao';

export interface DietDecisionInput {
  goal?: DietDecisionGoal;
  // Subjective (from check-in form)
  fome?: 'baixa' | 'moderada' | 'alta';
  energia?: 'baixa' | 'normal' | 'alta';
  saciedade?: 'ruim' | 'ok' | 'boa';
  sono?: 'piorou' | 'igual' | 'melhorou';
  digestao?: 'ruim' | 'ok' | 'boa';
  facilidade?: 'dificil' | 'media' | 'facil';
  performance?: 'piorou' | 'igual' | 'melhorou';
  adesao?: 'baixa' | 'media' | 'alta';
  retencao?: 'nenhuma' | 'leve' | 'alta';
  // Objective (computed by caller from weight_logs / anthropometrics)
  weightDeltaKg?: number;       // current - previous (kg)
  weeksBetweenWeights?: number; // span used to compute the delta
  waistDeltaCm?: number;        // current - previous (cm)
}

export type DietScenario =
  | 'progresso_adequado'
  | 'estagnacao'
  | 'deficit_agressivo'
  | 'baixa_aderencia'
  | 'fome_alta_performance_ok'
  | 'queda_performance'
  | 'necessita_refeed'
  | 'revisar_manual';

export type DietAction =
  | 'manter'
  | 'atualizar_dieta'
  | 'regenerar_dieta'
  | 'subir_proteina'
  | 'reduzir_densidade'
  | 'aplicar_refeed'
  | 'aliviar_agressividade'
  | 'revisar_manual';

export interface DietDecisionResult {
  scenario: DietScenario;
  action: DietAction;
  confidence: number;        // 0..1
  rationale: string;         // human-readable, PT-BR
  signals: string[];         // bullet list of what drove the decision
}

const SCENARIO_LABEL: Record<DietScenario, string> = {
  progresso_adequado: 'Progresso adequado',
  estagnacao: 'Estagnação',
  deficit_agressivo: 'Déficit agressivo demais',
  baixa_aderencia: 'Baixa aderência',
  fome_alta_performance_ok: 'Fome alta com performance preservada',
  queda_performance: 'Queda de performance',
  necessita_refeed: 'Necessidade de refeed',
  revisar_manual: 'Revisar manualmente',
};

const ACTION_LABEL: Record<DietAction, string> = {
  manter: 'Manter plano',
  atualizar_dieta: 'Atualizar dieta',
  regenerar_dieta: 'Regenerar dieta',
  subir_proteina: 'Subir proteína',
  reduzir_densidade: 'Reduzir densidade calórica',
  aplicar_refeed: 'Aplicar refeed',
  aliviar_agressividade: 'Aliviar agressividade do déficit',
  revisar_manual: 'Exigir revisão manual',
};

export function scenarioLabel(s: DietScenario): string {
  return SCENARIO_LABEL[s];
}

export function actionLabel(a: DietAction): string {
  return ACTION_LABEL[a];
}

/**
 * Weekly rate of weight change (kg/week), positive = gaining.
 */
function weeklyRate(input: DietDecisionInput): number | null {
  if (
    input.weightDeltaKg == null ||
    !input.weeksBetweenWeights ||
    input.weeksBetweenWeights <= 0
  ) {
    return null;
  }
  return input.weightDeltaKg / input.weeksBetweenWeights;
}

export function decideDietAction(input: DietDecisionInput): DietDecisionResult {
  const goal = input.goal ?? 'manutencao';
  const signals: string[] = [];
  const rate = weeklyRate(input);

  // 1) Adherence first — nothing else matters if the plan isn't being followed.
  if (input.adesao === 'baixa' || input.facilidade === 'dificil') {
    signals.push(`Aderência ${input.adesao ?? 'baixa'} / facilidade ${input.facilidade ?? 'difícil'}`);
    return {
      scenario: 'baixa_aderencia',
      action: 'atualizar_dieta',
      confidence: 0.8,
      rationale:
        'Aluno relata dificuldade em seguir a dieta. Antes de mudar metas, simplifique a estrutura: reduza complexidade, mantenha alimentos preferidos e preserve a proteína das refeições principais.',
      signals,
    };
  }

  // 2) Aggressive deficit — losing too fast OR multiple negative signals at once.
  const aggressiveByRate =
    goal === 'cutting' && rate != null && rate <= -1.0; // perdendo > 1 kg/sem = rápido demais
  const aggressiveBySymptoms =
    (input.energia === 'baixa' && input.fome === 'alta') ||
    (input.energia === 'baixa' && input.sono === 'piorou');
  if (aggressiveByRate || (goal === 'cutting' && aggressiveBySymptoms)) {
    if (aggressiveByRate) signals.push(`Perda de peso rápida (${rate!.toFixed(2)} kg/sem)`);
    if (aggressiveBySymptoms) signals.push('Energia baixa + (fome alta ou sono piorou)');
    return {
      scenario: 'deficit_agressivo',
      action: 'aliviar_agressividade',
      confidence: aggressiveByRate ? 0.85 : 0.7,
      rationale:
        'O déficit está alto demais para sustentar. Recomendo reduzir o corte calórico (subir carbo principalmente em dia de treino) e manter ou subir proteína para preservar massa.',
      signals,
    };
  }

  // 3) Refeed — long cut + plateau + low energy/performance, even if not "aggressive".
  if (
    goal === 'cutting' &&
    rate != null &&
    Math.abs(rate) < 0.002 &&
    (input.energia === 'baixa' || input.performance === 'piorou')
  ) {
    signals.push('Peso estagnado + energia/performance caindo em cutting');
    return {
      scenario: 'necessita_refeed',
      action: 'aplicar_refeed',
      confidence: 0.7,
      rationale:
        'Indício de fadiga metabólica: peso parou e o aluno está caindo de rendimento. Sugiro aplicar refeed (1-2 dias com carbo elevado) antes de cortar mais calorias.',
      signals,
    };
  }

  // 4) Stagnation — no progress over enough time.
  if (rate != null && Math.abs(rate) < 0.002 && (input.weeksBetweenWeights ?? 0) >= 2) {
    signals.push(`Sem mudança de peso em ${input.weeksBetweenWeights} sem.`);
    if (input.waistDeltaCm != null && input.waistDeltaCm <= -0.5) {
      signals.push(`Cintura reduziu ${Math.abs(input.waistDeltaCm).toFixed(1)} cm — recomposição em curso`);
      return {
        scenario: 'progresso_adequado',
        action: 'manter',
        confidence: 0.7,
        rationale:
          'Peso parado mas cintura reduzindo: recomposição em andamento. Manter o plano e reavaliar no próximo ciclo.',
        signals,
      };
    }
    return {
      scenario: 'estagnacao',
      action: goal === 'cutting' ? 'atualizar_dieta' : 'atualizar_dieta',
      confidence: 0.75,
      rationale:
        goal === 'cutting'
          ? 'Estagnação no cutting: ajustar metas (cortar ~150-200 kcal de carbo/gordura, manter proteína) antes de regenerar todo o cardápio.'
          : 'Estagnação fora de cutting: revisar metas para alinhar com o objetivo atual antes de trocar o cardápio.',
      signals,
    };
  }

  // 5) Performance drop without weight evidence.
  if (input.performance === 'piorou' && input.energia !== 'alta') {
    signals.push('Queda de performance no treino + energia não alta');
    return {
      scenario: 'queda_performance',
      action: 'atualizar_dieta',
      confidence: 0.65,
      rationale:
        'Performance caiu sem ganho/perda clara de peso. Recomendo subir carbo nos dias de treino e checar sono/hidratação antes de mexer no cardápio inteiro.',
      signals,
    };
  }

  // 6) High hunger but performance OK — satiety problem, not caloric.
  if (input.fome === 'alta' && input.performance !== 'piorou' && input.energia !== 'baixa') {
    signals.push('Fome alta, energia e performance preservadas');
    return {
      scenario: 'fome_alta_performance_ok',
      action: 'reduzir_densidade',
      confidence: 0.75,
      rationale:
        'Fome alta isolada normalmente é problema de saciedade, não de calorias. Substituir parte dos alimentos densos por opções de maior volume (vegetais, proteínas magras, fibras) sem mexer nas metas.',
      signals,
    };
  }

  // 7) Protein gap — saciety bad + hunger high in cutting often = low protein floor.
  if (input.saciedade === 'ruim' && input.fome !== 'baixa') {
    signals.push('Saciedade ruim + fome moderada/alta');
    return {
      scenario: 'fome_alta_performance_ok',
      action: 'subir_proteina',
      confidence: 0.6,
      rationale:
        'Saciedade insuficiente. Subir proteína no almoço/jantar e/ou adicionar fonte proteica no lanche costuma resolver antes de qualquer ajuste calórico.',
      signals,
    };
  }

  // 8) Good progress — everything looks stable / positive.
  const positiveProgress =
    (goal !== 'cutting' || (rate != null && rate < 0 && rate > -0.012)) &&
    input.energia !== 'baixa' &&
    input.performance !== 'piorou' &&
    (input.adesao === 'alta' || input.adesao === 'media' || input.adesao == null);
  if (positiveProgress) {
    if (rate != null) signals.push(`Variação de peso: ${rate.toFixed(2)} kg/sem`);
    if (input.energia) signals.push(`Energia ${input.energia}`);
    if (input.performance) signals.push(`Performance ${input.performance}`);
    return {
      scenario: 'progresso_adequado',
      action: 'manter',
      confidence: 0.7,
      rationale:
        'Sinais consistentes com progresso saudável. Manter o plano e reavaliar no próximo check-in.',
      signals,
    };
  }

  // 9) Fallback — keep humans in the loop.
  signals.push('Sinais mistos ou insuficientes');
  return {
    scenario: 'revisar_manual',
    action: 'revisar_manual',
    confidence: 0.4,
    rationale:
      'O check-in mostra sinais conflitantes ou dados insuficientes para uma decisão automática segura. Recomendo revisão manual do plano.',
    signals,
  };
}
