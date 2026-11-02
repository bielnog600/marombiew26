/**
 * Leitura dos dados do aluno para o Agente de Dieta — a MESMA usada pela tela
 * DietaIA (admin) e pelo office-gerar. Recebe o cliente como parâmetro para
 * rodar no navegador e no servidor. Só lê.
 */
import type { StudentCtx } from './dietaWizard';

export interface DietaPrefill {
  mealCount?: string;
  trainingTime?: string;
  trainingDays?: string;
  customRestriction?: string;
  customPreference?: string;
  usesHormones?: boolean;
  hormoneDetails?: string;
  strategy?: string;
  phase?: string;
  dietStyle?: string;
}

/**
 * Pré-preenchimento do wizard a partir do questionário e da composição
 * corporal (mesmas regras que a tela aplicava ao abrir o aluno).
 */
// deno-lint-ignore no-explicit-any
export function computeDietaPrefill({ latestQuestionnaire, sp, anthro, comp }: { latestQuestionnaire: any; sp: any; anthro: any; comp: any }): DietaPrefill {
  const out: DietaPrefill = {};
  if (latestQuestionnaire) {
    if (latestQuestionnaire.num_refeicoes) out.mealCount = String(latestQuestionnaire.num_refeicoes);
    if (latestQuestionnaire.horario_treino) {
      const timeMap: Record<string, string> = { '05:00': 'manha', '06:00': 'manha', '07:00': 'manha', '08:00': 'manha', '09:00': 'manha', '10:00': 'manha', '11:00': 'manha', '12:00': 'tarde', '13:00': 'tarde', '14:00': 'tarde', '15:00': 'tarde', '16:00': 'tarde', '17:00': 'noite', '18:00': 'noite', '19:00': 'noite', '20:00': 'noite', '21:00': 'noite', '22:00': 'madrugada' };
      if (timeMap[latestQuestionnaire.horario_treino]) out.trainingTime = timeMap[latestQuestionnaire.horario_treino];
    }
    if (latestQuestionnaire.dias_treino) {
      const days = latestQuestionnaire.dias_treino.replace('x', '');
      if (['3', '4', '5', '6', '7'].includes(days)) out.trainingDays = days;
    }
    if (latestQuestionnaire.restricoes_alimentares) out.customRestriction = latestQuestionnaire.restricoes_alimentares;
    if (latestQuestionnaire.preferencias_alimentares) out.customPreference = latestQuestionnaire.preferencias_alimentares;
    if (latestQuestionnaire.usa_hormonios) {
      const uh = latestQuestionnaire.usa_hormonios;
      if (uh === 'Não' || uh === 'não' || uh === 'Natural') out.usesHormones = false;
      else { out.usesHormones = true; out.hormoneDetails = uh; }
    }
  }

  // ── Recomendação a partir dos dados do aluno ──
  const peso = anthro?.peso ? Number(anthro.peso) : null;
  const altura = sp?.altura || anthro?.altura ? Number(sp?.altura || anthro?.altura) : null;
  const bf = comp?.percentual_gordura ? Number(comp.percentual_gordura) : null;
  const isMale = sp?.sexo === 'masculino';
  let birthAge: number | null = null;
  if (sp?.data_nascimento) {
    birthAge = Math.floor((Date.now() - new Date(sp.data_nascimento).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }

  if (peso && altura && birthAge) {
    let suggestedStrategy = 'manutencao';
    let suggestedPhase = 'manutencao';
    let suggestedDietStyle = 'convencional';

    if (bf !== null) {
      if ((isMale && bf > 20) || (!isMale && bf > 28)) { suggestedStrategy = 'deficit_moderado'; suggestedPhase = 'cutting'; }
      else if ((isMale && bf < 12) || (!isMale && bf < 18)) { suggestedStrategy = 'superavit_leve'; suggestedPhase = 'bulking'; }
    }
    const obj = (sp?.objetivo || '').toLowerCase();
    if (obj.includes('emagrec') || obj.includes('perd') || obj.includes('defin')) { suggestedStrategy = 'deficit_leve'; suggestedPhase = 'cutting'; }
    if (obj.includes('hipertrofia') || obj.includes('massa') || obj.includes('ganho')) { suggestedStrategy = 'superavit_leve'; suggestedPhase = 'bulking'; }
    if (obj.includes('recomp')) { suggestedStrategy = 'manutencao'; suggestedPhase = 'recomposicao'; }
    if (latestQuestionnaire?.fase_atual) {
      const fase = latestQuestionnaire.fase_atual.toLowerCase();
      if (fase.includes('bulk')) { suggestedStrategy = 'superavit_leve'; suggestedPhase = 'bulking'; }
      if (fase.includes('cut')) { suggestedStrategy = 'deficit_moderado'; suggestedPhase = 'cutting'; }
      if (fase.includes('recomp')) { suggestedStrategy = 'manutencao'; suggestedPhase = 'recomposicao'; }
      if (fase.includes('manutenção') || fase.includes('manut')) { suggestedPhase = 'manutencao'; }
      if (fase.includes('pré-contest') || fase.includes('pre_contest') || fase.includes('contest')) { suggestedPhase = 'pre_contest'; suggestedStrategy = 'deficit_agressivo'; }
    }
    if (latestQuestionnaire?.estilo_dieta) {
      const estiloMap: Record<string, string> = { 'Flexível (IIFYM)': 'flexivel', 'Low Carb': 'low_carb', 'Cetogênica': 'cetogenica', 'Mediterrânea': 'mediterranea', 'Paleolítica': 'paleolitica', 'Vegetariana': 'vegetariana', 'Vegana': 'vegana', 'Convencional': 'convencional' };
      suggestedDietStyle = estiloMap[latestQuestionnaire.estilo_dieta] || suggestedDietStyle;
    }
    if (suggestedPhase === 'cutting' && bf !== null && bf > (isMale ? 25 : 32) && !latestQuestionnaire?.estilo_dieta) {
      suggestedDietStyle = 'low_carb';
    }
    if (latestQuestionnaire && (latestQuestionnaire.baixa_energia || latestQuestionnaire.fraqueza)) {
      if (suggestedStrategy === 'deficit_agressivo') suggestedStrategy = 'deficit_moderado';
      else if (suggestedStrategy === 'deficit_moderado') suggestedStrategy = 'deficit_leve';
    }
    out.strategy = suggestedStrategy;
    out.phase = suggestedPhase;
    out.dietStyle = suggestedDietStyle;
  } else if (bf !== null) {
    if ((isMale && bf > 20) || (!isMale && bf > 28)) out.strategy = 'deficit_moderado';
    else if ((isMale && bf < 12) || (!isMale && bf < 18)) out.strategy = 'superavit_leve';
    else out.strategy = 'manutencao';
  }

  if (!latestQuestionnaire && sp?.restricoes) out.customRestriction = sp.restricoes;
  return out;
}

/** Contexto completo do aluno + última dieta publicada + pré-preenchimento. */
// deno-lint-ignore no-explicit-any
export async function loadDietaStudentData(sb: any, studentId: string) {
  const [profileRes, spRes, assessRes, questRes] = await Promise.all([
    sb.from('profiles').select('*').eq('user_id', studentId).maybeSingle(),
    sb.from('students_profile').select('*').eq('user_id', studentId).maybeSingle(),
    sb.from('assessments').select('id, created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1),
    sb.from('diet_questionnaires').select('*').eq('student_id', studentId).eq('status', 'completed').order('created_at', { ascending: false }).limit(1),
  ]);

  const profile = profileRes.data;
  const sp = spRes.data;
  const latestAssessmentId = assessRes.data?.[0]?.id;
  const latestAssessmentDate = assessRes.data?.[0]?.created_at ?? null;
  const latestQuestionnaire = questRes.data?.[0] || null;

  let anthro: any = null, comp: any = null, vitals: any = null, anamnese: any = null;
  let photos: any[] = [];
  let skinfolds: any = null, perfTests: any = null, posture: any = null;

  // Also fetch posture scans and HR zones (not assessment-dependent)
  const [postureScansRes, hrZonesRes] = await Promise.all([
    sb.from('posture_scans').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1),
    sb.from('hr_zones').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1),
  ]);
  const latestPostureScan = postureScansRes.data?.[0] || null;
  const latestHrZones = hrZonesRes.data?.[0] || null;

  if (latestAssessmentId) {
    const [anthroRes, compRes, vitalsRes, anRes, photosRes, skinRes, perfRes, postureRes] = await Promise.all([
      sb.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      sb.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      sb.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      sb.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      sb.from('assessment_photos').select('*').eq('assessment_id', latestAssessmentId),
      sb.from('skinfolds').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      sb.from('performance_tests').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      sb.from('posture').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
    ]);
    anthro = anthroRes.data;
    comp = compRes.data;
    vitals = vitalsRes.data;
    anamnese = anRes.data;
    photos = photosRes.data ?? [];
    skinfolds = skinRes.data;
    perfTests = perfRes.data;
    posture = postureRes.data;
  }

  // Peso mais recente: prioriza weight_logs se for mais novo que a última avaliação
  try {
    const { data: latestWeightLog } = await sb
      .from('weight_logs')
      .select('peso, data')
      .eq('student_id', studentId)
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestWeightLog?.peso != null) {
      const logDate = latestWeightLog.data;
      const assessDate = anthro && latestAssessmentId
        ? (await sb.from('assessments').select('created_at').eq('id', latestAssessmentId).maybeSingle()).data?.created_at?.slice(0, 10)
        : null;
      if (!anthro || !assessDate || logDate >= assessDate) {
        anthro = { ...(anthro || {}), peso: Number(latestWeightLog.peso) };
      }
    }
  } catch { /* ignore */ }

  // ── HISTÓRICO LONGITUDINAL: última dieta, tendência, aderência, reajuste ──
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [lastDietRes, trendAssessRes, trackingRes, lastReadjustRes] = await Promise.all([
    sb
      .from('ai_plans')
      .select('id, titulo, fase, conteudo, created_at, protocols')
      .eq('student_id', studentId)
      .eq('tipo', 'dieta')
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .limit(1),
    sb
      .from('assessments')
      .select('id, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(4),
    sb
      .from('daily_tracking')
      .select('date, meals_completed, water_glasses, workout_completed')
      .eq('student_id', studentId)
      .gte('date', since14)
      .order('date', { ascending: false }),
    sb
      .from('diet_readjustments')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  // Última dieta — extrai resumo
  const lastDiet = lastDietRes.data?.[0] || null;
  let ultima_dieta: any = null;
  if (lastDiet) {
    const c = lastDiet.conteudo || '';
    const grab = (re: RegExp) => {
      const m = c.match(re);
      return m ? Number(m[1].replace(/[^\d.]/g, '')) || null : null;
    };
    const totalKcal =
      grab(/total\s+di[áa]rio[^\n]*?(\d{3,5})\s*kcal/i) ||
      grab(/calorias?\s*(?:totais|alvo|consumo)?[:\s]+(\d{3,5})/i);
    const totalP = grab(/prote[íi]na[^\n]*?(\d{2,4})\s*g/i);
    const totalC = grab(/carboidrato[^\n]*?(\d{2,4})\s*g/i);
    const totalG = grab(/gordura[^\n]*?(\d{2,4})\s*g/i);
    const mealMatches = c.match(/(?:caf[eé]\s+da\s+manh[ãa]|almo[çc]o|jantar|lanche|ceia|p[óo]s[\s-]?treino|pr[eé][\s-]?treino)/gi) || [];
    const numRef = new Set(mealMatches.map(m => m.toLowerCase())).size;
    const dias = Math.floor((Date.now() - new Date(lastDiet.created_at).getTime()) / 86400000);
    ultima_dieta = {
      titulo: lastDiet.titulo,
      fase: lastDiet.fase,
      criada_em: lastDiet.created_at,
      dias_desde: dias,
      kcal_total: totalKcal,
      proteina_g: totalP,
      carbs_g: totalC,
      gordura_g: totalG,
      num_refeicoes: numRef || null,
      excerto: c.slice(0, 1800),
    };
  }

  // Tendência de peso/composição (últimas 3-4 avaliações)
  let tendencia_peso: any = null;
  const trendIds = (trendAssessRes.data || []).map(a => a.id);
  if (trendIds.length >= 1) {
    const [anthArr, compArr] = await Promise.all([
      sb.from('anthropometrics').select('assessment_id, peso, cintura').in('assessment_id', trendIds),
      sb.from('composition').select('assessment_id, percentual_gordura, massa_magra').in('assessment_id', trendIds),
    ]);
    const byAssId: Record<string, any> = {};
    (trendAssessRes.data || []).forEach(a => { byAssId[a.id] = { data: a.created_at }; });
    (anthArr.data || []).forEach(r => { Object.assign(byAssId[r.assessment_id] || {}, { peso: r.peso, cintura: r.cintura }); });
    (compArr.data || []).forEach(r => { Object.assign(byAssId[r.assessment_id] || {}, { percentual_gordura: r.percentual_gordura, massa_magra: r.massa_magra }); });
    const historico = trendIds.map(id => byAssId[id]).filter(x => x && x.peso != null);
    let direcao = 'estavel';
    let variacao_kg = 0;
    let intervalo_dias = 0;
    let velocidade_kg_semana = 0;
    let relevancia: 'irrelevante' | 'leve' | 'moderada' | 'alta' = 'irrelevante';
    if (historico.length >= 2) {
      variacao_kg = Number(historico[0].peso) - Number(historico[historico.length - 1].peso);
      const dRecent = new Date(historico[0].data).getTime();
      const dOldest = new Date(historico[historico.length - 1].data).getTime();
      intervalo_dias = Math.max(1, Math.round((dRecent - dOldest) / 86400000));
      velocidade_kg_semana = Number(((variacao_kg / intervalo_dias) * 7).toFixed(2));
      const pesoBase = Number(historico[historico.length - 1].peso) || 70;
      const pctVar = Math.abs(variacao_kg) / pesoBase;
      if (pctVar < 0.005) relevancia = 'irrelevante';
      else if (pctVar < 0.015) relevancia = 'leve';
      else if (pctVar < 0.04) relevancia = 'moderada';
      else relevancia = 'alta';
      if (variacao_kg > 0.5) direcao = 'subindo';
      else if (variacao_kg < -0.5) direcao = 'descendo';
    }
    tendencia_peso = {
      peso_atual: historico[0]?.peso ?? anthro?.peso ?? null,
      variacao_kg: Number(variacao_kg.toFixed(2)),
      direcao,
      intervalo_dias,
      velocidade_kg_semana,
      relevancia,
      historico,
    };
  }

  // Aderência 14 dias
  let aderencia_recente: any = null;
  const tracking = trackingRes.data || [];
  if (tracking.length > 0) {
    const totalRef = tracking.reduce((s, d: any) => s + (Array.isArray(d.meals_completed) ? d.meals_completed.length : 0), 0);
    const expectedPerDay = lastDiet ? (ultima_dieta?.num_refeicoes || 5) : 5;
    const expectedTotal = 14 * expectedPerDay;
    const aguaMedia = tracking.reduce((s, d: any) => s + (d.water_glasses || 0), 0) / tracking.length;
    // Consistência por índice de refeição (qual refeição é mais marcada/falhada)
    const consistencia_por_refeicao: Record<number, number> = {};
    for (let i = 0; i < expectedPerDay; i++) consistencia_por_refeicao[i] = 0;
    for (const d of tracking as any[]) {
      const arr = Array.isArray(d.meals_completed) ? d.meals_completed : [];
      for (const idx of arr) {
        const n = Number(idx);
        if (Number.isInteger(n) && n >= 0 && n < expectedPerDay) {
          consistencia_por_refeicao[n] = (consistencia_por_refeicao[n] || 0) + 1;
        }
      }
    }
    const refeicoes_mais_falhadas = Object.entries(consistencia_por_refeicao)
      .map(([idx, c]) => ({ indice: Number(idx), marcadas: c, falhadas: tracking.length - c }))
      .sort((a, b) => b.falhadas - a.falhadas)
      .slice(0, 3);
    aderencia_recente = {
      dias_com_registro: tracking.length,
      dias_total: 14,
      dias_com_registro_pct: Math.round((tracking.length / 14) * 100),
      refeicoes_marcadas: totalRef,
      refeicoes_esperadas: expectedTotal,
      percentual_aderencia: Math.round((totalRef / expectedTotal) * 100),
      agua_media_copos_dia: Number(aguaMedia.toFixed(1)),
      consistencia_por_refeicao,
      refeicoes_mais_falhadas,
    };
  }

  // Último reajuste
  let ultimo_reajuste: any = null;
  const lr = lastReadjustRes.data?.[0];
  if (lr) {
    const sintomas: string[] = [];
    if (lr.fome_excessiva) sintomas.push('fome excessiva');
    if (lr.insonia) sintomas.push('insônia');
    if (!lr.energia_ok) sintomas.push('energia baixa');
    if (!lr.humor_ok) sintomas.push('humor instável');
    if (!lr.intestino_ok) sintomas.push('desconforto intestinal');
    if (lr.perdeu_peso) sintomas.push('perdeu peso');
    if (lr.ganhou_massa) sintomas.push('ganhou massa');
    ultimo_reajuste = {
      data: lr.created_at,
      peso_atual: lr.peso_atual,
      sintomas,
      rendimento_treino: lr.rendimento_treino,
      satisfacao: lr.satisfacao,
      observacoes: lr.observacoes,
    };
  }

  // Score de confiança explicável (com fatores positivos e negativos)
  type Factor = { key: string; label: string; weight: number; status: 'positive' | 'negative' | 'neutral' };
  const factors: Factor[] = [];
  let score = 0;
  if (ultima_dieta) { factors.push({ key: 'last_diet', label: 'Dieta anterior encontrada', weight: 25, status: 'positive' }); score += 25; }
  else factors.push({ key: 'last_diet', label: 'Sem dieta anterior — geração inicial', weight: 0, status: 'neutral' });
  if (tendencia_peso && tendencia_peso.historico?.length >= 2) {
    factors.push({ key: 'weight_trend', label: `Tendência de peso disponível (${tendencia_peso.historico.length} avaliações em ${tendencia_peso.intervalo_dias}d)`, weight: 25, status: 'positive' });
    score += 25;
  } else {
    factors.push({ key: 'weight_trend', label: 'Tendência de peso indisponível (avaliações insuficientes)', weight: 0, status: 'negative' });
  }
  if (aderencia_recente && aderencia_recente.dias_com_registro >= 7) {
    factors.push({ key: 'adherence', label: `Aderência recente suficiente (${aderencia_recente.dias_com_registro}/14 dias)`, weight: 25, status: 'positive' });
    score += 25;
  } else if (aderencia_recente && aderencia_recente.dias_com_registro >= 3) {
    factors.push({ key: 'adherence', label: `Aderência parcial (${aderencia_recente.dias_com_registro}/14 dias)`, weight: 10, status: 'neutral' });
    score += 10;
  } else {
    factors.push({ key: 'adherence', label: 'Sem aderência registrada nos últimos 14 dias', weight: 0, status: 'negative' });
  }
  if (ultimo_reajuste) { factors.push({ key: 'readjustment', label: 'Último reajuste/feedback encontrado', weight: 15, status: 'positive' }); score += 15; }
  else factors.push({ key: 'readjustment', label: 'Sem reajuste anterior registrado', weight: 0, status: 'neutral' });
  if (latestQuestionnaire) { factors.push({ key: 'questionnaire', label: 'Questionário de dieta recente', weight: 10, status: 'positive' }); score += 10; }
  else factors.push({ key: 'questionnaire', label: 'Sem questionário recente respondido', weight: 0, status: 'negative' });

  // Heurística de decisão recomendada (a IA pode override, mas isso vira input forte)
  let decisao_recomendada: 'manter' | 'ajustar' | 'nova' | 'pedir_dados' = 'nova';
  const motivos_decisao: string[] = [];
  if (!ultima_dieta) {
    decisao_recomendada = 'nova';
    motivos_decisao.push('Nenhuma dieta anterior — gerar do zero.');
  } else {
    const adesaoBaixa = aderencia_recente && aderencia_recente.percentual_aderencia < 60;
    const sintomasNeg = !!(ultimo_reajuste?.sintomas?.some((s: string) => /fome|insônia|insonia|energia baixa|humor/i.test(s)));
    const tendenciaContraria = tendencia_peso?.relevancia === 'alta' || tendencia_peso?.relevancia === 'moderada';
    const reajusteRecente = ultimo_reajuste && (Date.now() - new Date(ultimo_reajuste.data).getTime()) / 86400000 < 21;

    if (adesaoBaixa) { motivos_decisao.push('Aderência <60% — simplificar.'); decisao_recomendada = 'ajustar'; }
    if (sintomasNeg) { motivos_decisao.push('Sintomas negativos no último reajuste — revisar.'); decisao_recomendada = 'ajustar'; }
    if (tendenciaContraria) { motivos_decisao.push(`Tendência ${tendencia_peso.direcao} relevante (${tendencia_peso.velocidade_kg_semana}kg/sem) — calibrar.`); decisao_recomendada = 'ajustar'; }
    if (!adesaoBaixa && !sintomasNeg && !tendenciaContraria) {
      decisao_recomendada = 'manter';
      motivos_decisao.push('Sem variação relevante — preservar estrutura anterior.');
    }
    if (reajusteRecente && ultimo_reajuste?.satisfacao && /ruim|insatisf/i.test(String(ultimo_reajuste.satisfacao))) {
      decisao_recomendada = 'nova';
      motivos_decisao.push('Aluno insatisfeito no último reajuste — repensar plano.');
    }
  }

  const confianca = { score: Math.min(score, 100), factors, motivos: factors.filter(f => f.status === 'positive').map(f => f.label) };

  const ctx: StudentCtx = {
    nome: profile?.nome, sexo: sp?.sexo, data_nascimento: sp?.data_nascimento,
    raca: sp?.raca,
    altura: sp?.altura || anthro?.altura, objetivo: sp?.objetivo,
    restricoes: sp?.restricoes, lesoes: sp?.lesoes, observacoes: sp?.observacoes,
    peso: anthro?.peso, imc: anthro?.imc, cintura: anthro?.cintura,
    quadril: anthro?.quadril, rcq: anthro?.rcq,
    // All anthropometric measurements
    antropometria_completa: anthro ? {
      pescoco: anthro.pescoco, torax: anthro.torax, ombro: anthro.ombro,
      abdomen: anthro.abdomen, braco_direito: anthro.braco_direito,
      braco_esquerdo: anthro.braco_esquerdo, antebraco: anthro.antebraco,
      antebraco_esquerdo: anthro.antebraco_esquerdo,
      biceps_contraido_direito: anthro.biceps_contraido_direito,
      biceps_contraido_esquerdo: anthro.biceps_contraido_esquerdo,
      coxa_direita: anthro.coxa_direita, coxa_esquerda: anthro.coxa_esquerda,
      panturrilha_direita: anthro.panturrilha_direita, panturrilha_esquerda: anthro.panturrilha_esquerda,
    } : null,
    percentual_gordura: comp?.percentual_gordura,
    massa_magra: comp?.massa_magra, massa_gorda: comp?.massa_gorda,
    massa_magra_data: comp?.massa_magra != null ? latestAssessmentDate : null,
    massa_magra_origem: comp?.massa_magra != null ? 'Composição corporal da avaliação física' : null,
    composicao_obs: comp?.observacoes,
    // Skinfolds
    dobras_cutaneas: skinfolds ? {
      metodo: skinfolds.metodo, triceps: skinfolds.triceps, subescapular: skinfolds.subescapular,
      suprailiaca: skinfolds.suprailiaca, abdominal: skinfolds.abdominal,
      peitoral: skinfolds.peitoral, axilar_media: skinfolds.axilar_media, coxa: skinfolds.coxa,
    } : null,
    // Vitals
    sinais_vitais: vitals ? {
      fc_repouso: vitals.fc_repouso, pressao: vitals.pressao,
      spo2: vitals.spo2, glicemia: vitals.glicemia, observacoes: vitals.observacoes,
    } : null,
    fc_repouso: vitals?.fc_repouso,
    // Performance tests
    testes_performance: perfTests ? {
      pushup: perfTests.pushup, plank: perfTests.plank, cooper_12min: perfTests.cooper_12min,
      salto_vertical: perfTests.salto_vertical, agachamento_score: perfTests.agachamento_score,
      mobilidade_ombro: perfTests.mobilidade_ombro, mobilidade_quadril: perfTests.mobilidade_quadril,
      mobilidade_tornozelo: perfTests.mobilidade_tornozelo, observacoes: perfTests.observacoes,
    } : null,
    // Posture (from assessment)
    postura: posture ? {
      vista_anterior: posture.vista_anterior, vista_lateral: posture.vista_lateral,
      vista_posterior: posture.vista_posterior, observacoes: posture.observacoes,
    } : null,
    // Posture scan (latest)
    analise_postural: latestPostureScan ? {
      angles: latestPostureScan.angles_json, region_scores: latestPostureScan.region_scores_json,
      attention_points: latestPostureScan.attention_points_json, notes: latestPostureScan.notes,
    } : null,
    // HR zones
    zonas_fc: latestHrZones ? {
      fc_repouso: latestHrZones.fc_repouso, fcmax: latestHrZones.fcmax_estimada,
      formula: latestHrZones.fcmax_formula, zonas: latestHrZones.zonas_karvonen,
    } : null,
    anamnese: anamnese ? {
      historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao,
      suplementos: anamnese.suplementos, sono: anamnese.sono, stress: anamnese.stress,
      rotina: anamnese.rotina, treino_atual: anamnese.treino_atual,
      dores: anamnese.dores, cirurgias: anamnese.cirurgias,
      tabagismo: anamnese.tabagismo, alcool: anamnese.alcool,
    } : null,
    fotos_avaliacao: photos.length > 0 ? photos.map(p => ({ tipo: p.tipo, url: p.url })) : null,
    // ── HISTÓRICO LONGITUDINAL ──
    historico_processo: {
      ultima_dieta,
      tendencia_peso,
      aderencia_recente,
      ultimo_reajuste,
      confianca_geracao: confianca,
      decisao_recomendada,
      motivos_decisao,
    },
    questionario_dieta: latestQuestionnaire ? {
      estilo_dieta: latestQuestionnaire.estilo_dieta,
      fase_atual: latestQuestionnaire.fase_atual,
      num_refeicoes: latestQuestionnaire.num_refeicoes,
      horario_treino: latestQuestionnaire.horario_treino,
      dias_treino: latestQuestionnaire.dias_treino,
      usa_hormonios: latestQuestionnaire.usa_hormonios,
      restricoes_alimentares: latestQuestionnaire.restricoes_alimentares,
      preferencias_alimentares: latestQuestionnaire.preferencias_alimentares,
      alimentos_por_refeicao: latestQuestionnaire.alimentos_por_refeicao,
      como_se_sente: latestQuestionnaire.como_se_sente,
      fraqueza: latestQuestionnaire.fraqueza,
      dor_cabeca: latestQuestionnaire.dor_cabeca,
      reduziu_peso: latestQuestionnaire.reduziu_peso,
      pele_fina: latestQuestionnaire.pele_fina,
      fome_excessiva: latestQuestionnaire.fome_excessiva,
      insonia: latestQuestionnaire.insonia,
      baixa_energia: latestQuestionnaire.baixa_energia,
      irritabilidade: latestQuestionnaire.irritabilidade,
      observacoes: latestQuestionnaire.observacoes,
      respondido_em: latestQuestionnaire.responded_at,
    } : null,
  };

  return {
    ctx,
    studentName: (profile?.nome as string) || 'Aluno',
    lastDiet,
    latestQuestionnaire,
    prefill: computeDietaPrefill({ latestQuestionnaire, sp, anthro, comp }),
  };
}

/** Markdown do treino ativo publicado (mais recente). */
// deno-lint-ignore no-explicit-any
export async function loadActiveTrainingMarkdown(sb: any, studentId: string): Promise<string> {
  const { data } = await sb
    .from('ai_plans')
    .select('conteudo')
    .eq('student_id', studentId)
    .eq('tipo', 'treino')
    .eq('is_draft', false)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0]?.conteudo as string | undefined) ?? '';
}
