// Camada central de labels em português para valores canónicos (slugs em inglês).
// Os valores continuam sendo persistidos em inglês no banco/RPC/payload.
// Este arquivo trata APENAS a apresentação visual.

export const METADATA_OPTION_LABELS: Record<string, Record<string, string>> = {
  movement_pattern: {
    squat: 'Agachamento',
    hip_hinge: 'Dobradiça de quadril',
    horizontal_push: 'Empurrar horizontal',
    vertical_push: 'Empurrar vertical',
    horizontal_pull: 'Puxar horizontal',
    vertical_pull: 'Puxar vertical',
    knee_extension: 'Extensão do joelho',
    knee_flexion: 'Flexão do joelho',
    hip_extension: 'Extensão do quadril',
    hip_abduction: 'Abdução do quadril',
    hip_adduction: 'Adução do quadril',
    elbow_flexion: 'Flexão do cotovelo',
    elbow_extension: 'Extensão do cotovelo',
    shoulder_abduction: 'Abdução do ombro',
    shoulder_flexion: 'Flexão do ombro',
    plantar_flexion: 'Flexão plantar',
    anti_extension: 'Anti-extensão do tronco',
    anti_rotation: 'Anti-rotação do tronco',
    trunk_flexion: 'Flexão do tronco',
    trunk_extension: 'Extensão do tronco',
    locomotion: 'Locomoção',
    jump: 'Salto',
    mobility: 'Mobilidade',
    other: 'Outro',
  },

  exercise_class: {
    compound: 'Composto',
    isolation: 'Isolador',
    power: 'Potência',
    plyometric: 'Pliométrico',
    mobility: 'Mobilidade',
    cardio: 'Cardio',
    cardio_cyclic: 'Cardio cíclico',
    metabolic_conditioning: 'Condicionamento metabólico',
    core: 'Core',
    core_stability: 'Estabilidade de core',
    rehabilitation: 'Reabilitação',
    other: 'Outro',
  },

  equipment_type: {
    machine: 'Máquina',
    smith_machine: 'Máquina Smith',
    cable: 'Polia / Cabo',
    barbell: 'Barra',
    dumbbell: 'Halteres',
    kettlebell: 'Kettlebell',
    bodyweight: 'Peso corporal',
    cardio_machine: 'Máquina de cardio',
    resistance_band: 'Banda elástica',
    band: 'Elástico',
    medicine_ball: 'Bola medicinal',
    stability_ball: 'Bola suíça',
    bench: 'Banco',
    bar: 'Barra fixa',
    other: 'Outro',
    unknown: 'Não identificado',
  },

  level: {
    none: 'Nenhuma',
    low: 'Baixa',
    moderate: 'Moderada',
    high: 'Alta',
    very_high: 'Muito alta',
  },

  muscles: {
    // Peitoral
    pectoralis_major: 'Peitoral maior',
    pectoralis_major_clavicular: 'Peitoral maior (clavicular)',
    pectoralis_major_sternal: 'Peitoral maior (esternal)',
    pectoralis_minor: 'Peitoral menor',
    // Costas
    latissimus_dorsi: 'Grande dorsal',
    trapezius: 'Trapézio',
    trapezius_upper: 'Trapézio superior',
    trapezius_middle: 'Trapézio médio',
    trapezius_lower: 'Trapézio inferior',
    rhomboids: 'Romboides',
    teres_major: 'Redondo maior',
    teres_minor: 'Redondo menor',
    infraspinatus: 'Infraespinhoso',
    supraspinatus: 'Supraespinhoso',
    subscapularis: 'Subescapular',
    erector_spinae: 'Eretores da coluna',
    // Ombros
    deltoid_anterior: 'Deltoide anterior',
    deltoid_lateral: 'Deltoide lateral',
    deltoid_posterior: 'Deltoide posterior',
    // Braços
    biceps_brachii: 'Bíceps braquial',
    brachialis: 'Braquial',
    brachioradialis: 'Braquiorradial',
    triceps_brachii: 'Tríceps braquial',
    triceps_long_head: 'Tríceps (cabeça longa)',
    triceps_lateral_head: 'Tríceps (cabeça lateral)',
    triceps_medial_head: 'Tríceps (cabeça medial)',
    forearm_flexors: 'Flexores do antebraço',
    forearm_extensors: 'Extensores do antebraço',
    // Core
    rectus_abdominis: 'Reto abdominal',
    obliques: 'Oblíquos',
    external_obliques: 'Oblíquos externos',
    internal_obliques: 'Oblíquos internos',
    transverse_abdominis: 'Transverso do abdome',
    // Quadril / glúteos
    gluteus_maximus: 'Glúteo máximo',
    gluteus_medius: 'Glúteo médio',
    gluteus_minimus: 'Glúteo mínimo',
    hip_flexors: 'Flexores do quadril',
    iliopsoas: 'Iliopsoas',
    adductors: 'Adutores',
    // Coxa
    quadriceps: 'Quadríceps',
    rectus_femoris: 'Reto femoral',
    vastus_lateralis: 'Vasto lateral',
    vastus_medialis: 'Vasto medial',
    vastus_intermedius: 'Vasto intermédio',
    hamstrings: 'Isquiotibiais',
    biceps_femoris: 'Bíceps femoral',
    semitendinosus: 'Semitendíneo',
    semimembranosus: 'Semimembranáceo',
    // Panturrilha
    gastrocnemius: 'Gastrocnêmio',
    soleus: 'Sóleo',
    tibialis_anterior: 'Tibial anterior',
    // Pescoço
    sternocleidomastoid: 'Esternocleidomastoideo',
    neck_extensors: 'Extensores do pescoço',
    // Proibidos / regiões
    knee: 'Joelho',
    spine: 'Coluna',
    core: 'Core',
    back: 'Costas',
    chest: 'Peito',
    shoulder: 'Ombro',
    arm: 'Braço',
    leg: 'Perna',
    hip: 'Quadril',
  },

  evidence: {
    exercise_name: 'Nome do exercício',
    legacy_muscle_group: 'Grupo muscular cadastrado',
    image: 'Imagem',
    video: 'Vídeo',
    adjustments: 'Ajustes do equipamento',
    professional_knowledge: 'Conhecimento profissional',
    equipment_documentation: 'Documentação do equipamento',
    insufficient_evidence: 'Evidência insuficiente',
  },

  state: {
    resolved: 'Sim, campo avaliado',
    not_applicable: 'Não se aplica a este exercício',
    insufficient_information: 'Não tenho informação suficiente',
    requires_video_review: 'Preciso analisar o vídeo',
    requires_equipment_confirmation: 'Preciso confirmar o equipamento',
  },
};

export const METADATA_FIELD_LABELS: Record<string, string> = {
  movement_pattern: 'Padrão de movimento',
  exercise_class: 'Classe do exercício',
  equipment_type: 'Tipo de equipamento',
  primary_muscles: 'Músculos principais',
  secondary_muscles: 'Músculos secundários',
  stability_level: 'Nível de estabilidade',
  technical_complexity: 'Complexidade técnica',
  axial_load: 'Carga axial',
  lumbar_load: 'Exigência sobre a lombar',
  balance_requirement: 'Exigência de equilíbrio',
  fatigue_cost: 'Custo de fadiga',
  safe_to_failure: 'Pode ser realizado até à falha?',
  contraindications: 'Contraindicações',
};

// Mapa: nome do campo -> categoria de valores no METADATA_OPTION_LABELS
const FIELD_TO_CATEGORY: Record<string, string> = {
  movement_pattern: 'movement_pattern',
  exercise_class: 'exercise_class',
  equipment_type: 'equipment_type',
  primary_muscles: 'muscles',
  secondary_muscles: 'muscles',
  stability_level: 'level',
  technical_complexity: 'level',
  axial_load: 'level',
  lumbar_load: 'level',
  balance_requirement: 'level',
  fatigue_cost: 'level',
};

const humanize = (raw: string) =>
  raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Retorna o rótulo pt-BR de um valor canónico dado o campo. */
export function labelForValue(field: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'boolean') return raw ? 'Sim' : 'Não';
  const s = String(raw);
  const category = FIELD_TO_CATEGORY[field];
  if (category && METADATA_OPTION_LABELS[category]?.[s]) {
    return METADATA_OPTION_LABELS[category][s];
  }
  // Fallback: procura em todas as categorias
  for (const cat of Object.values(METADATA_OPTION_LABELS)) {
    if (cat[s]) return cat[s];
  }
  return humanize(s);
}

/** Rótulo do nome do campo (ex.: movement_pattern -> "Padrão de movimento"). */
export function labelForField(field: string): string {
  return METADATA_FIELD_LABELS[field] ?? humanize(field);
}

/** Rótulo de um estado de revisão. */
export function labelForState(state: string): string {
  return METADATA_OPTION_LABELS.state[state] ?? humanize(state);
}

/** Rótulo de uma opção de evidência. */
export function labelForEvidence(ev: string): string {
  return METADATA_OPTION_LABELS.evidence[ev] ?? humanize(ev);
}

/** Traduz um array de campos alterados para exibição. */
export function labelChangedFields(fields: string[] | null | undefined): string[] {
  return (fields ?? []).map(labelForField);
}

/** Traduz um valor (escalar ou array) para exibição amigável. */
export function displayValue(field: string, value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((v) => labelForValue(field, v)).join(', ');
  }
  if (value === null || value === undefined || value === '') return '—';
  return labelForValue(field, value);
}
