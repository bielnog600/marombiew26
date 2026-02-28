// Posture analysis utilities — angle calculations from pose keypoints

export interface PoseKeypoint {
  name: string;
  x: number;
  y: number;
  confidence: number;
}

export interface PostureAngles {
  shoulder_tilt: number | null;
  pelvic_tilt: number | null;
  head_forward: number | null;
  trunk_lateral: number | null;
  knee_alignment_left: number | null;
  knee_alignment_right: number | null;
  // New detailed angles
  shoulder_protusion: number | null;       // protrusão de ombros (graus)
  kyphosis_angle: number | null;           // ângulo cifose torácica
  lordosis_angle: number | null;           // ângulo lordose lombar
  scoliosis_angle: number | null;          // ângulo de desvio lateral coluna
  knee_valgus_left: number | null;         // valgo joelho esq (graus)
  knee_valgus_right: number | null;        // valgo joelho dir (graus)
}

export interface PostureCondition {
  condition: string;
  label: string;
  severity: 'normal' | 'leve' | 'moderada' | 'grave';
  description: string;
  angle: number | null;
  details: string;
}

export interface RegionScore {
  region: string;
  label: string;
  status: 'ok' | 'attention' | 'risk';
  note: string;
  angle?: number | null;
}

// MediaPipe Pose landmark indices
const LANDMARKS = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

function angleBetweenPoints(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

function angleBetween3Points(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

export function calculatePostureAngles(keypoints: PoseKeypoint[]): PostureAngles {
  const empty: PostureAngles = {
    shoulder_tilt: null, pelvic_tilt: null, head_forward: null, trunk_lateral: null,
    knee_alignment_left: null, knee_alignment_right: null,
    shoulder_protusion: null, kyphosis_angle: null, lordosis_angle: null,
    scoliosis_angle: null, knee_valgus_left: null, knee_valgus_right: null,
  };
  if (!keypoints || keypoints.length < 29) return empty;

  const get = (idx: number) => keypoints[idx];
  const lShoulder = get(LANDMARKS.LEFT_SHOULDER);
  const rShoulder = get(LANDMARKS.RIGHT_SHOULDER);
  const lHip = get(LANDMARKS.LEFT_HIP);
  const rHip = get(LANDMARKS.RIGHT_HIP);
  const nose = get(LANDMARKS.NOSE);
  const lEar = get(LANDMARKS.LEFT_EAR);
  const rEar = get(LANDMARKS.RIGHT_EAR);
  const lKnee = get(LANDMARKS.LEFT_KNEE);
  const rKnee = get(LANDMARKS.RIGHT_KNEE);
  const lAnkle = get(LANDMARKS.LEFT_ANKLE);
  const rAnkle = get(LANDMARKS.RIGHT_ANKLE);

  // Shoulder tilt
  const shoulder_tilt = lShoulder && rShoulder
    ? Math.round(angleBetweenPoints(lShoulder, rShoulder) * 10) / 10
    : null;

  // Pelvic tilt
  const pelvic_tilt = lHip && rHip
    ? Math.round(angleBetweenPoints(lHip, rHip) * 10) / 10
    : null;

  // Head forward
  const head_forward = nose && lShoulder && rShoulder
    ? Math.round(Math.abs(nose.x - (lShoulder.x + rShoulder.x) / 2) * 100) / 100
    : null;

  // Trunk lateral tilt
  const trunk_lateral = lShoulder && rShoulder && lHip && rHip
    ? Math.round(angleBetweenPoints(
        { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 },
        { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 }
      ) * 10) / 10 + 90
    : null;

  // Knee alignment (deviation angle)
  const knee_alignment_left = lHip && lKnee && lAnkle
    ? Math.round(angleBetweenPoints(lHip, lKnee) - angleBetweenPoints(lKnee, lAnkle))
    : null;

  const knee_alignment_right = rHip && rKnee && rAnkle
    ? Math.round(angleBetweenPoints(rHip, rKnee) - angleBetweenPoints(rKnee, rAnkle))
    : null;

  // ── NEW: Shoulder protusion (anteriorização dos ombros) ──
  // Estimated from ear-to-shoulder horizontal offset in side view
  const earMidX = lEar && rEar ? (lEar.x + rEar.x) / 2 : null;
  const shoulderMidX = lShoulder && rShoulder ? (lShoulder.x + rShoulder.x) / 2 : null;
  const shoulderMidY = lShoulder && rShoulder ? (lShoulder.y + rShoulder.y) / 2 : null;
  const earMidY = lEar && rEar ? (lEar.y + rEar.y) / 2 : null;
  const shoulder_protusion = earMidX !== null && shoulderMidX !== null && earMidY !== null && shoulderMidY !== null
    ? Math.round(Math.atan2(Math.abs(shoulderMidX - earMidX), Math.abs(shoulderMidY - earMidY)) * (180 / Math.PI) * 10) / 10
    : null;

  // ── NEW: Kyphosis angle (cifose torácica) ──
  // Approximated using shoulder-midHip-nose angle from lateral view
  const hipMid = lHip && rHip ? { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 } : null;
  const shoulderMid = lShoulder && rShoulder ? { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 } : null;
  const kyphosis_angle = shoulderMid && hipMid && nose
    ? Math.round((180 - angleBetween3Points(hipMid, shoulderMid, nose)) * 10) / 10
    : null;

  // ── NEW: Lordosis angle (lordose lombar) ──
  // Approximated from pelvic tilt + trunk angle relationship
  const lordosis_angle = shoulderMid && hipMid && lKnee && rKnee
    ? Math.round((180 - angleBetween3Points(shoulderMid, hipMid, { x: (lKnee.x + rKnee.x) / 2, y: (lKnee.y + rKnee.y) / 2 })) * 10) / 10
    : null;

  // ── NEW: Scoliosis angle (desvio lateral da coluna) ──
  // Difference between shoulder midpoint X and hip midpoint X relative to height
  const scoliosis_angle = shoulderMid && hipMid
    ? Math.round(Math.atan2(shoulderMid.x - hipMid.x, Math.abs(shoulderMid.y - hipMid.y)) * (180 / Math.PI) * 10) / 10
    : null;

  // ── NEW: Knee valgus/varus ──
  // Angle at the knee between hip-knee-ankle
  const knee_valgus_left = lHip && lKnee && lAnkle
    ? Math.round((180 - angleBetween3Points(lHip, lKnee, lAnkle)) * 10) / 10
    : null;

  const knee_valgus_right = rHip && rKnee && rAnkle
    ? Math.round((180 - angleBetween3Points(rHip, rKnee, rAnkle)) * 10) / 10
    : null;

  return {
    shoulder_tilt, pelvic_tilt, head_forward, trunk_lateral,
    knee_alignment_left, knee_alignment_right,
    shoulder_protusion, kyphosis_angle, lordosis_angle,
    scoliosis_angle, knee_valgus_left, knee_valgus_right,
  };
}

// ── Detailed condition analysis ──
export function analyzePostureConditions(angles: PostureAngles): PostureCondition[] {
  const conditions: PostureCondition[] = [];

  // Escoliose
  const scolAngle = angles.scoliosis_angle;
  const scolAbs = scolAngle !== null ? Math.abs(scolAngle) : null;
  if (scolAbs !== null) {
    const severity = scolAbs > 8 ? 'grave' : scolAbs > 4 ? 'moderada' : scolAbs > 1.5 ? 'leve' : 'normal';
    const side = scolAngle! > 0 ? 'direita' : 'esquerda';
    conditions.push({
      condition: 'escoliose',
      label: 'Escoliose',
      severity,
      angle: scolAngle,
      description: severity === 'normal'
        ? 'Coluna com alinhamento lateral adequado.'
        : `Desvio lateral da coluna para ${side}.`,
      details: severity === 'normal'
        ? 'Sem desvio lateral significativo detectado. A coluna apresenta simetria satisfatória no plano frontal.'
        : severity === 'leve'
        ? `Desvio lateral de ${scolAbs}° para a ${side}. Curvatura funcional que pode ser corrigida com fortalecimento muscular unilateral e alongamentos. Monitorar a progressão a cada 3 meses.`
        : severity === 'moderada'
        ? `Desvio lateral de ${scolAbs}° para a ${side}. Curvatura moderada que requer atenção clínica. Recomenda-se avaliação com raio-X e acompanhamento fisioterapêutico. Exercícios assimétricos de fortalecimento são indicados.`
        : `Desvio lateral de ${scolAbs}° para a ${side}. Curvatura significativa que necessita de avaliação médica especializada. Possível indicação de uso de colete ortopédico ou intervenção cirúrgica dependendo da progressão.`,
    });
  }

  // Hipercifose
  const kyph = angles.kyphosis_angle;
  if (kyph !== null) {
    const severity = kyph > 25 ? 'grave' : kyph > 15 ? 'moderada' : kyph > 8 ? 'leve' : 'normal';
    conditions.push({
      condition: 'hipercifose',
      label: 'Hipercifose Torácica',
      severity,
      angle: kyph,
      description: severity === 'normal'
        ? 'Curvatura torácica dentro dos parâmetros normais.'
        : `Aumento da curvatura torácica (cifose ${severity}).`,
      details: severity === 'normal'
        ? 'A curvatura torácica está dentro da faixa fisiológica normal (20°-45°). Sem necessidade de intervenção corretiva.'
        : severity === 'leve'
        ? `Ângulo cifótico estimado de ${kyph}°. Leve aumento da curvatura torácica, geralmente associado a postura inadequada prolongada. Recomenda-se exercícios de extensão torácica, fortalecimento de rombóides e trapézio médio, e alongamento de peitoral.`
        : severity === 'moderada'
        ? `Ângulo cifótico estimado de ${kyph}°. Aumento moderado da curvatura torácica com potencial compressão discal anterior. Indicado programa intensivo de correção postural, fortalecimento de extensores, RPG e avaliação fisioterapêutica.`
        : `Ângulo cifótico estimado de ${kyph}°. Hipercifose significativa com possível comprometimento respiratório e dor crônica. Necessita avaliação médica, fisioterapia especializada e possível uso de órtese corretiva.`,
    });
  }

  // Hiperlordose
  const lord = angles.lordosis_angle;
  if (lord !== null) {
    const severity = lord > 25 ? 'grave' : lord > 15 ? 'moderada' : lord > 8 ? 'leve' : 'normal';
    conditions.push({
      condition: 'hiperlordose',
      label: 'Hiperlordose Lombar',
      severity,
      angle: lord,
      description: severity === 'normal'
        ? 'Curvatura lombar dentro dos parâmetros normais.'
        : `Aumento da curvatura lombar (lordose ${severity}).`,
      details: severity === 'normal'
        ? 'A lordose lombar está dentro da faixa fisiológica normal (30°-50°). Sem achados significativos.'
        : severity === 'leve'
        ? `Ângulo lordótico estimado de ${lord}° além do normal. Pode estar associada a fraqueza abdominal e encurtamento de flexores do quadril. Recomenda-se fortalecimento do core (transverso abdominal), alongamento de iliopsoas e correção postural.`
        : severity === 'moderada'
        ? `Ângulo lordótico estimado de ${lord}° além do normal. Hiperlordose moderada com possível síndrome cruzada inferior. Recomenda-se programa de RPG, fortalecimento abdominal, alongamento de flexores de quadril e paravertebrais, e avaliação fisioterapêutica.`
        : `Ângulo lordótico estimado de ${lord}° além do normal. Hiperlordose significativa com risco de compressão discal posterior e espondilolistese. Necessita avaliação médica e programa intensivo de reabilitação.`,
    });
  }

  // Protrusão de ombros
  const protusion = angles.shoulder_protusion;
  if (protusion !== null) {
    const severity = protusion > 20 ? 'grave' : protusion > 12 ? 'moderada' : protusion > 6 ? 'leve' : 'normal';
    conditions.push({
      condition: 'protusao_ombros',
      label: 'Protrusão dos Ombros',
      severity,
      angle: protusion,
      description: severity === 'normal'
        ? 'Posição dos ombros alinhada.'
        : `Anteriorização dos ombros (protrusão ${severity}).`,
      details: severity === 'normal'
        ? 'Os ombros estão alinhados com o eixo auricular. Sem sinais de anteriorização significativa.'
        : severity === 'leve'
        ? `Protrusão de ${protusion}°. Ombros levemente anteriorizados, geralmente associado a encurtamento de peitoral menor. Recomenda-se alongamento de peitoral, fortalecimento de rotadores externos e retração escapular.`
        : severity === 'moderada'
        ? `Protrusão de ${protusion}°. Anteriorização moderada dos ombros com possível síndrome cruzada superior. Indicado programa de correção postural com foco em abertura torácica, fortalecimento de rombóides/trapézio inferior e alongamento de peitoral menor.`
        : `Protrusão de ${protusion}°. Anteriorização significativa dos ombros com risco de impacto subacromial e lesão do manguito rotador. Necessita avaliação ortopédica e programa de reabilitação.`,
    });
  }

  // Desvios de Joelho - Esquerdo
  const valgL = angles.knee_valgus_left;
  if (valgL !== null) {
    const absVal = Math.abs(valgL);
    const type = valgL > 0 ? 'valgo' : 'varo';
    const severity = absVal > 15 ? 'grave' : absVal > 8 ? 'moderada' : absVal > 3 ? 'leve' : 'normal';
    conditions.push({
      condition: 'joelho_esquerdo',
      label: 'Joelho Esquerdo',
      severity,
      angle: valgL,
      description: severity === 'normal'
        ? 'Alinhamento do joelho esquerdo adequado.'
        : `Joelho esquerdo em ${type} (${absVal}°).`,
      details: severity === 'normal'
        ? 'O joelho esquerdo apresenta alinhamento neutro dentro da faixa de normalidade. Eixo mecânico preservado.'
        : `Desvio de ${absVal}° em ${type} no joelho esquerdo. ${
          type === 'valgo'
            ? 'Joelhos voltados para dentro (valgo). Pode estar associado a fraqueza de glúteo médio, rotadores externos do quadril e/ou pé pronado. Risco aumentado de lesão de LCA e condromalácia patelar.'
            : 'Joelhos voltados para fora (varo). Pode estar associado a encurtamento de banda iliotibial e desequilíbrio muscular. Risco de desgaste do compartimento medial.'
        } ${severity === 'grave' ? 'Necessita avaliação ortopédica.' : 'Recomenda-se exercícios de correção e fortalecimento.'}`,
    });
  }

  // Desvios de Joelho - Direito
  const valgR = angles.knee_valgus_right;
  if (valgR !== null) {
    const absVal = Math.abs(valgR);
    const type = valgR > 0 ? 'valgo' : 'varo';
    const severity = absVal > 15 ? 'grave' : absVal > 8 ? 'moderada' : absVal > 3 ? 'leve' : 'normal';
    conditions.push({
      condition: 'joelho_direito',
      label: 'Joelho Direito',
      severity,
      angle: valgR,
      description: severity === 'normal'
        ? 'Alinhamento do joelho direito adequado.'
        : `Joelho direito em ${type} (${absVal}°).`,
      details: severity === 'normal'
        ? 'O joelho direito apresenta alinhamento neutro dentro da faixa de normalidade. Eixo mecânico preservado.'
        : `Desvio de ${absVal}° em ${type} no joelho direito. ${
          type === 'valgo'
            ? 'Joelhos voltados para dentro (valgo). Pode estar associado a fraqueza de glúteo médio, rotadores externos do quadril e/ou pé pronado. Risco aumentado de lesão de LCA e condromalácia patelar.'
            : 'Joelhos voltados para fora (varo). Pode estar associado a encurtamento de banda iliotibial e desequilíbrio muscular. Risco de desgaste do compartimento medial.'
        } ${severity === 'grave' ? 'Necessita avaliação ortopédica.' : 'Recomenda-se exercícios de correção e fortalecimento.'}`,
    });
  }

  return conditions;
}

export function calculateRegionScores(angles: PostureAngles): RegionScore[] {
  const scores: RegionScore[] = [];

  // Pescoço / Cabeça
  const headFwd = angles.head_forward;
  scores.push({
    region: 'pescoco', label: 'Pescoço / Cabeça',
    status: headFwd === null ? 'ok' : headFwd > 0.15 ? 'risk' : headFwd > 0.08 ? 'attention' : 'ok',
    note: headFwd === null ? 'Sem dados' : headFwd > 0.15 ? 'Cabeça anteriorizada significativa' : headFwd > 0.08 ? 'Leve anteriorização da cabeça' : 'Alinhamento adequado',
    angle: headFwd,
  });

  // Ombros
  const shoulderTilt = angles.shoulder_tilt;
  const shoulderAbs = shoulderTilt !== null ? Math.abs(shoulderTilt) : null;
  scores.push({
    region: 'ombro', label: 'Ombros',
    status: shoulderAbs === null ? 'ok' : shoulderAbs > 5 ? 'risk' : shoulderAbs > 2 ? 'attention' : 'ok',
    note: shoulderAbs === null ? 'Sem dados' : shoulderAbs > 5 ? `Assimetria importante (${shoulderTilt}°)` : shoulderAbs > 2 ? `Leve assimetria (${shoulderTilt}°)` : 'Simétricos',
    angle: shoulderTilt,
  });

  // Protrusão de ombros
  const protusion = angles.shoulder_protusion;
  if (protusion !== null) {
    scores.push({
      region: 'ombro_protusao', label: 'Protrusão Ombros',
      status: protusion > 20 ? 'risk' : protusion > 12 ? 'attention' : 'ok',
      note: protusion > 20 ? `Protrusão significativa (${protusion}°)` : protusion > 12 ? `Protrusão moderada (${protusion}°)` : protusion > 6 ? `Leve protrusão (${protusion}°)` : 'Sem protrusão significativa',
      angle: protusion,
    });
  }

  // Coluna torácica (cifose)
  const trunkLat = angles.trunk_lateral;
  const trunkAbs = trunkLat !== null ? Math.abs(trunkLat) : null;
  const kyph = angles.kyphosis_angle;
  scores.push({
    region: 'torax', label: 'Coluna Torácica',
    status: (kyph !== null && kyph > 15) ? 'risk' : (kyph !== null && kyph > 8) ? 'attention' : trunkAbs !== null && trunkAbs > 5 ? 'risk' : trunkAbs !== null && trunkAbs > 2 ? 'attention' : 'ok',
    note: kyph !== null && kyph > 15 ? `Hipercifose (${kyph}°)` : kyph !== null && kyph > 8 ? `Aumento leve da cifose (${kyph}°)` : trunkAbs !== null && trunkAbs > 5 ? 'Inclinação lateral significativa' : trunkAbs !== null && trunkAbs > 2 ? 'Leve inclinação lateral' : 'Alinhamento adequado',
    angle: kyph ?? trunkLat,
  });

  // Escoliose
  const scol = angles.scoliosis_angle;
  const scolAbs = scol !== null ? Math.abs(scol) : null;
  if (scolAbs !== null) {
    scores.push({
      region: 'escoliose', label: 'Escoliose',
      status: scolAbs > 8 ? 'risk' : scolAbs > 4 ? 'attention' : scolAbs > 1.5 ? 'attention' : 'ok',
      note: scolAbs > 8 ? `Desvio lateral grave (${scol}°)` : scolAbs > 4 ? `Desvio lateral moderado (${scol}°)` : scolAbs > 1.5 ? `Desvio lateral leve (${scol}°)` : 'Coluna alinhada lateralmente',
      angle: scol,
    });
  }

  // Lombar (lordose)
  const lord = angles.lordosis_angle;
  scores.push({
    region: 'abdomen', label: 'Lombar',
    status: lord !== null && lord > 15 ? 'risk' : lord !== null && lord > 8 ? 'attention' : trunkAbs !== null && trunkAbs > 4 ? 'attention' : 'ok',
    note: lord !== null && lord > 15 ? `Hiperlordose (${lord}°)` : lord !== null && lord > 8 ? `Aumento leve da lordose (${lord}°)` : trunkAbs !== null && trunkAbs > 4 ? 'Possível compensação lombar' : 'Sem achados significativos',
    angle: lord,
  });

  // Quadril / Pelve
  const pelvicTilt = angles.pelvic_tilt;
  const pelvicAbs = pelvicTilt !== null ? Math.abs(pelvicTilt) : null;
  scores.push({
    region: 'quadril', label: 'Quadril / Pelve',
    status: pelvicAbs === null ? 'ok' : pelvicAbs > 5 ? 'risk' : pelvicAbs > 2 ? 'attention' : 'ok',
    note: pelvicAbs === null ? 'Sem dados' : pelvicAbs > 5 ? `Assimetria pélvica (${pelvicTilt}°)` : pelvicAbs > 2 ? `Leve inclinação pélvica (${pelvicTilt}°)` : 'Simétrico',
    angle: pelvicTilt,
  });

  // Joelho Esquerdo
  const valgL = angles.knee_valgus_left;
  const valgLAbs = valgL !== null ? Math.abs(valgL) : null;
  scores.push({
    region: 'joelho_esquerdo', label: 'Joelho Esquerdo',
    status: valgLAbs !== null && valgLAbs > 8 ? 'risk' : valgLAbs !== null && valgLAbs > 3 ? 'attention' : 'ok',
    note: valgLAbs === null ? 'Sem dados' : valgLAbs > 8 ? `${valgL! > 0 ? 'Valgo' : 'Varo'} significativo (${valgL}°)` : valgLAbs > 3 ? `Leve ${valgL! > 0 ? 'valgo' : 'varo'} (${valgL}°)` : 'Alinhamento adequado',
    angle: valgL,
  });

  // Joelho Direito
  const valgR = angles.knee_valgus_right;
  const valgRAbs = valgR !== null ? Math.abs(valgR) : null;
  scores.push({
    region: 'joelho_direito', label: 'Joelho Direito',
    status: valgRAbs !== null && valgRAbs > 8 ? 'risk' : valgRAbs !== null && valgRAbs > 3 ? 'attention' : 'ok',
    note: valgRAbs === null ? 'Sem dados' : valgRAbs > 8 ? `${valgR! > 0 ? 'Valgo' : 'Varo'} significativo (${valgR}°)` : valgRAbs > 3 ? `Leve ${valgR! > 0 ? 'valgo' : 'varo'} (${valgR}°)` : 'Alinhamento adequado',
    angle: valgR,
  });

  // Tornozelos
  scores.push({
    region: 'panturrilha_direita', label: 'Tornozelos',
    status: 'ok', note: 'Avaliação visual recomendada',
  });

  return scores;
}

// Draw overlay lines on canvas from keypoints
export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  keypoints: PoseKeypoint[],
  width: number,
  height: number,
  scores: RegionScore[]
) {
  if (!keypoints || keypoints.length < 29) return;

  const get = (idx: number) => ({
    x: keypoints[idx].x * width,
    y: keypoints[idx].y * height,
    c: keypoints[idx].confidence,
  });

  const statusColor = (region: string) => {
    const score = scores.find(s => s.region === region);
    if (!score) return '#22c55e';
    return score.status === 'risk' ? '#ef4444' : score.status === 'attention' ? '#f59e0b' : '#22c55e';
  };

  const connections: [number, number, string][] = [
    [LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER, 'ombro'],
    [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_ELBOW, 'ombro'],
    [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_ELBOW, 'ombro'],
    [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_HIP, 'torax'],
    [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_HIP, 'torax'],
    [LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP, 'quadril'],
    [LANDMARKS.LEFT_HIP, LANDMARKS.LEFT_KNEE, 'joelho_esquerdo'],
    [LANDMARKS.RIGHT_HIP, LANDMARKS.RIGHT_KNEE, 'joelho_direito'],
    [LANDMARKS.LEFT_KNEE, LANDMARKS.LEFT_ANKLE, 'joelho_esquerdo'],
    [LANDMARKS.RIGHT_KNEE, LANDMARKS.RIGHT_ANKLE, 'joelho_direito'],
    [LANDMARKS.NOSE, LANDMARKS.LEFT_SHOULDER, 'pescoco'],
    [LANDMARKS.NOSE, LANDMARKS.RIGHT_SHOULDER, 'pescoco'],
  ];

  ctx.lineWidth = 10;
  connections.forEach(([a, b, region]) => {
    const pa = get(a);
    const pb = get(b);
    if (pa.c > 0.3 && pb.c > 0.3) {
      ctx.strokeStyle = statusColor(region);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  });

  const importantPoints = [
    LANDMARKS.NOSE, LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER,
    LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP, LANDMARKS.LEFT_KNEE,
    LANDMARKS.RIGHT_KNEE, LANDMARKS.LEFT_ANKLE, LANDMARKS.RIGHT_ANKLE,
    LANDMARKS.LEFT_ELBOW, LANDMARKS.RIGHT_ELBOW,
  ];

  importantPoints.forEach(idx => {
    const p = get(idx);
    if (p.c > 0.3) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}
