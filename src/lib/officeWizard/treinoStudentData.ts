/**
 * Leitura dos dados do aluno para o wizard Gerar Treino — FONTE ÚNICA usada
 * pela tela TreinoIA e pela edge function office-gerar (via bundle).
 * O preenchimento automático de saúde é o mesmo que a tela fazia.
 */
import type { TreinoWizardState } from './treinoWizard';

type StudentCtx = Record<string, any>;
// deno-lint-ignore no-explicit-any
type AnyClient = { from: (table: string) => any };

export async function loadTreinoWizardData(client: AnyClient, studentId: string): Promise<{
  ctx: StudentCtx;
  studentName: string;
  lastWorkoutPlan: any;
  health: Partial<TreinoWizardState>;
}> {
    const [profileRes, spRes, assessRes] = await Promise.all([
      client.from('profiles').select('*').eq('user_id', studentId).maybeSingle(),
      client.from('students_profile').select('*').eq('user_id', studentId).maybeSingle(),
      client.from('assessments').select('id').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1),
    ]);

    const profile = profileRes.data;
    const sp = spRes.data;
    const latestAssessmentId = assessRes.data?.[0]?.id;

    let anthro: any = null, comp: any = null, vitals: any = null, anamnese: any = null;
    let skinfolds: any = null, performance: any = null, posture: any = null;
    let photos: any[] = [];

    if (latestAssessmentId) {
      const [anthroRes, compRes, vitalsRes, sfRes, anRes, perfRes, postureRes, photosRes] = await Promise.all([
        client.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        client.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        client.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        client.from('skinfolds').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        client.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        client.from('performance_tests').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        client.from('posture').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        client.from('assessment_photos').select('*').eq('assessment_id', latestAssessmentId),
      ]);
      anthro = anthroRes.data;
      comp = compRes.data;
      vitals = vitalsRes.data;
      skinfolds = sfRes.data;
      anamnese = anRes.data;
      performance = perfRes.data;
      posture = postureRes.data;
      photos = photosRes.data ?? [];
    }

    const { data: postureScans } = await client
      .from('posture_scans').select('*').eq('student_id', studentId)
      .order('created_at', { ascending: false }).limit(1);

    const ctx: StudentCtx = {
      nome: profile?.nome, email: profile?.email, sexo: sp?.sexo,
      data_nascimento: sp?.data_nascimento, altura: sp?.altura || anthro?.altura,
      objetivo: sp?.objetivo, restricoes: sp?.restricoes, lesoes: sp?.lesoes,
      observacoes: sp?.observacoes, raca: sp?.raca,
      peso: anthro?.peso, imc: anthro?.imc, cintura: anthro?.cintura,
      quadril: anthro?.quadril, rcq: anthro?.rcq, torax: anthro?.torax,
      abdomen: anthro?.abdomen, ombro: anthro?.ombro, pescoco: anthro?.pescoco,
      braco_direito: anthro?.braco_direito, braco_esquerdo: anthro?.braco_esquerdo,
      coxa_direita: anthro?.coxa_direita, coxa_esquerda: anthro?.coxa_esquerda,
      panturrilha_direita: anthro?.panturrilha_direita, panturrilha_esquerda: anthro?.panturrilha_esquerda,
      percentual_gordura: comp?.percentual_gordura, massa_magra: comp?.massa_magra, massa_gorda: comp?.massa_gorda,
      fc_repouso: vitals?.fc_repouso, pressao: vitals?.pressao, spo2: vitals?.spo2, glicemia: vitals?.glicemia,
      skinfolds: skinfolds ? { metodo: skinfolds.metodo, triceps: skinfolds.triceps, peitoral: skinfolds.peitoral, subescapular: skinfolds.subescapular, axilar_media: skinfolds.axilar_media, suprailiaca: skinfolds.suprailiaca, abdominal: skinfolds.abdominal, coxa: skinfolds.coxa } : null,
      anamnese: anamnese ? { historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao, suplementos: anamnese.suplementos, cirurgias: anamnese.cirurgias, dores: anamnese.dores, sono: anamnese.sono, stress: anamnese.stress, rotina: anamnese.rotina, treino_atual: anamnese.treino_atual, tabagismo: anamnese.tabagismo, alcool: anamnese.alcool } : null,
      performance: performance ? { cooper_12min: performance.cooper_12min, pushup: performance.pushup, plank: performance.plank, salto_vertical: performance.salto_vertical, agachamento_score: performance.agachamento_score, mobilidade_ombro: performance.mobilidade_ombro, mobilidade_quadril: performance.mobilidade_quadril, mobilidade_tornozelo: performance.mobilidade_tornozelo } : null,
      posture: posture ? { vista_anterior: posture.vista_anterior, vista_lateral: posture.vista_lateral, vista_posterior: posture.vista_posterior, observacoes: posture.observacoes } : null,
      posture_scan: postureScans?.[0] ? { angles: postureScans[0].angles_json, attention_points: postureScans[0].attention_points_json, region_scores: postureScans[0].region_scores_json, notes: postureScans[0].notes } : null,
      fotos_avaliacao: photos.length > 0 ? photos.map(p => ({ tipo: p.tipo, url: p.url })) : null,
      fotos_perfil: sp?.fotos ?? null,
    };

    const { data: lastWorkoutRes } = await client
      .from('ai_plans')
      .select('id, titulo, conteudo, created_at')
      .eq('student_id', studentId)
      .eq('tipo', 'treino')
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .limit(1);
    
    const lastWorkoutPlan = lastWorkoutRes?.[0] || null;

    const studentName = profile?.nome || 'Aluno';
    const health: Partial<TreinoWizardState> = {};

    // Auto-fill health conditions from student data
    if (sp?.lesoes) { health.hasLesao = true; }
    if (anamnese?.dores) { health.hasDor = true; health.dorLocal = anamnese.dores; }
    if (anamnese?.tabagismo) { health.tabagismo = true; }
    if (anamnese?.stress && ['alto', 'muito alto'].some(s => anamnese.stress?.toLowerCase().includes(s))) { health.stressAlto = true; }
    if (anamnese?.sono && ['ruim', 'péssimo', 'insônia', 'pouco'].some(s => anamnese.sono?.toLowerCase().includes(s))) { health.sonoRuim = true; }

    // Auto-fill from posture scan
    const attentionPoints = postureScans?.[0]?.attention_points_json as any[] | null;
    if (attentionPoints?.length) {
      const labels = attentionPoints.map((p: any) => (p.label || p.name || '').toLowerCase());
      if (labels.some(l => l.includes('cifose') || l.includes('kyphosis'))) health.hipercifose = true;
      if (labels.some(l => l.includes('escoliose') || l.includes('scoliosis'))) health.escoliose = true;
      if (labels.some(l => l.includes('lordose') || l.includes('lordosis'))) health.hiperlordose = true;
      if (labels.some(l => l.includes('ombro') || l.includes('shoulder'))) health.protrusaoOmbro = true;
      if (labels.some(l => l.includes('valgo') || l.includes('valgus'))) health.valgoJoelho = true;
    }

  return { ctx, studentName, lastWorkoutPlan, health };
}
