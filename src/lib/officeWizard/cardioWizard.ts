/**
 * Wizard "Cardio IA" — FONTE ÚNICA das opções, leitura do aluno, montagem do
 * pedido ao cardio-agent e do registro salvo. Usado pela tela CardioIA e pela
 * edge function office-gerar (via bundle gerado).
 */
import { isWeeklyPlan, MODALITY_LABEL, type CardioModality, type CardioPayload } from '../cardioParser';

export const CARDIO_MODALITY_VALUES: CardioModality[] = ['passadeira', 'bike', 'eliptica', 'escada'];

export const CARDIO_INTENSITIES = [
  { value: 'auto', label: 'Auto' },
  { value: 'leve', label: 'Leve' },
  { value: 'moderada', label: 'Moderada' },
  { value: 'intensa', label: 'Intensa' },
];

export const CARDIO_STYLES = [
  { value: 'auto', label: 'Automático (IA decide)' },
  { value: 'continuo', label: 'Contínuo (intensidade constante)' },
  { value: 'intervalado', label: 'Intervalado (blocos alternados)' },
  { value: 'hiit', label: 'HIIT (picos curtos e intensos)' },
  { value: 'zona2', label: 'Zona 2 pura (queima de gordura)' },
];

export const CARDIO_FREQUENCIES = ['1', '2', '3', '4', '5', '6'];
export const CARDIO_DURATIONS = ['auto', '15', '20', '25', '30', '40', '45', '60'];

export const CARDIO_SPEEDS = ['3','4','5','5.5','6','6.5','7','7.5','8','8.5','9','10','11','12','13','14','15','16'];
export const CARDIO_INCLINES = ['0','1','2','3','4','5','6','7','8','9','10','12','15'];
export const CARDIO_TIMES = ['10','15','20','30','40','45','60','90','120','180','240','300'];
export const CARDIO_BIKE_LEVELS = Array.from({ length: 20 }, (_, i) => String(i + 1));
export const CARDIO_ROUNDS = ['4','5','6','8','10','12','15','20'];
export const CARDIO_BIKE_POSITIONS = ['auto', 'alternado', 'sentado', 'em_pe'];

/** Campos de equipamento (chave do estado `eq` da tela → rótulo e opções). */
export const CARDIO_EQUIPMENT_FIELDS: Array<{ key: string; label: string; options: string[]; modality?: CardioModality }> = [
  { key: 'tSpeedEasy', label: 'Esteira: velocidade leve (km/h)', options: CARDIO_SPEEDS, modality: 'passadeira' },
  { key: 'tSpeedHard', label: 'Esteira: velocidade forte (km/h)', options: CARDIO_SPEEDS, modality: 'passadeira' },
  { key: 'tInclineEasy', label: 'Esteira: inclinação leve (%)', options: CARDIO_INCLINES, modality: 'passadeira' },
  { key: 'tInclineHard', label: 'Esteira: inclinação forte (%)', options: CARDIO_INCLINES, modality: 'passadeira' },
  { key: 'tWorkSec', label: 'Esteira: tempo forte (s)', options: CARDIO_TIMES, modality: 'passadeira' },
  { key: 'tRestSec', label: 'Esteira: tempo recuperação (s)', options: CARDIO_TIMES, modality: 'passadeira' },
  { key: 'bHiit', label: 'Bike: HIIT na bike', options: ['auto', 'sim'], modality: 'bike' },
  { key: 'bPosition', label: 'Bike: posição', options: CARDIO_BIKE_POSITIONS, modality: 'bike' },
  { key: 'bStandSec', label: 'Bike: tempo em pé (s)', options: CARDIO_TIMES, modality: 'bike' },
  { key: 'bSeatSec', label: 'Bike: tempo sentado (s)', options: CARDIO_TIMES, modality: 'bike' },
  { key: 'bHardSec', label: 'Bike: tempo mais carga (s)', options: CARDIO_TIMES, modality: 'bike' },
  { key: 'bEasySec', label: 'Bike: tempo menos carga (s)', options: CARDIO_TIMES, modality: 'bike' },
  { key: 'bHardLevel', label: 'Bike: carga alta (nível)', options: CARDIO_BIKE_LEVELS, modality: 'bike' },
  { key: 'bEasyLevel', label: 'Bike: carga baixa (nível)', options: CARDIO_BIKE_LEVELS, modality: 'bike' },
  { key: 'rounds', label: 'Nº de ciclos (intervalado)', options: CARDIO_ROUNDS },
];

export type CardioWizardState = {
  modalities: CardioModality[];
  frequency: string;
  intensity: string;
  style: string;
  duration: string;
  notes: string;
  eq: Record<string, string>;
};

/** Valores iniciais idênticos aos useState da tela CardioIA. */
export const defaultCardioWizardState = (): CardioWizardState => ({
  modalities: [], frequency: '3', intensity: 'auto', style: 'auto', duration: 'auto', notes: '', eq: {},
});

export function buildEquipment(eq: Record<string, string>) {
  const n = (k: string) => (eq[k] && eq[k] !== 'auto' ? Number(eq[k]) : undefined);
  return {
    treadmill: { speedEasy: n('tSpeedEasy'), speedHard: n('tSpeedHard'), inclineEasy: n('tInclineEasy'), inclineHard: n('tInclineHard'), workSec: n('tWorkSec'), restSec: n('tRestSec') },
    bike: { hiit: eq.bHiit === 'sim', position: eq.bPosition && eq.bPosition !== 'auto' ? eq.bPosition : undefined, standSec: n('bStandSec'), seatSec: n('bSeatSec'), hardSec: n('bHardSec'), easySec: n('bEasySec'), hardLevel: n('bHardLevel'), easyLevel: n('bEasyLevel') },
    rounds: n('rounds'),
  };
}

export function buildCardioRequestBody(state: CardioWizardState, studentCtx: Record<string, any>, hrZones: any) {
  const { modalities, frequency, intensity, style, duration, notes, eq } = state;
  return {
    studentContext: studentCtx,
    modalities, // [] = automático (IA escolhe entre todas)
    frequencyPerWeek: parseInt(frequency, 10),
    intensity,
    style,
    durationMinutes: duration === 'auto' ? 'auto' : parseInt(duration, 10),
    notes,
    hrZones,
    equipment: buildEquipment(eq),
  };
}

/** Linha inserida em ai_plans pelo botão Salvar do Cardio IA (plano novo). */
export function buildCardioPlanInsert(studentId: string, payload: CardioPayload) {
  const isWeekly = isWeeklyPlan(payload);
  const titulo = isWeekly
    ? `Plano Semanal de Cardio (${(payload as any).protocols.length} sessões)`
    : (payload as any).title || `Cardio ${MODALITY_LABEL[(payload as any).modality as CardioModality]} - ${new Date().toLocaleDateString('pt-BR')}`;
  return {
    student_id: studentId,
    tipo: 'cardio',
    titulo,
    conteudo: JSON.stringify(payload, null, 2),
  };
}

// deno-lint-ignore no-explicit-any
type AnyClient = { from: (table: string) => any };

/** Mesma leitura de dados do aluno que a tela CardioIA fazia. */
export async function loadCardioWizardData(client: AnyClient, studentId: string) {
  const [profileRes, spRes, assessRes, hrRes] = await Promise.all([
    client.from('profiles').select('*').eq('user_id', studentId).maybeSingle(),
    client.from('students_profile').select('*').eq('user_id', studentId).maybeSingle(),
    client.from('assessments').select('id').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1),
    client.from('hr_zones').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const profile = profileRes.data;
  const sp = spRes.data;
  const latestAssessmentId = assessRes.data?.[0]?.id;

  let anthro: any = null, comp: any = null, vitals: any = null, anamnese: any = null, performance: any = null;
  if (latestAssessmentId) {
    const [a, c, v, an, pf] = await Promise.all([
      client.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      client.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      client.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      client.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      client.from('performance_tests').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
    ]);
    anthro = a.data; comp = c.data; vitals = v.data; anamnese = an.data; performance = pf.data;
  }

  const studentCtx = {
    nome: profile?.nome,
    sexo: sp?.sexo,
    data_nascimento: sp?.data_nascimento,
    altura: sp?.altura || anthro?.altura,
    objetivo: sp?.objetivo,
    restricoes: sp?.restricoes,
    lesoes: sp?.lesoes,
    observacoes: sp?.observacoes,
    peso: anthro?.peso,
    imc: anthro?.imc,
    percentual_gordura: comp?.percentual_gordura,
    vitals,
    anamnese,
    performance,
  };

  const hrZones = hrRes.data
    ? {
        fcMax: hrRes.data.fcmax_estimada,
        fcRepouso: hrRes.data.fc_repouso,
        hrr: hrRes.data.hrr,
        zones: hrRes.data.zonas_karvonen,
      }
    : null;

  return { studentCtx, studentName: profile?.nome || 'Aluno', hrZones };
}
