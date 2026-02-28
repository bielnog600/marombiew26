// Posture analysis utilities — angle calculations from pose keypoints

export interface PoseKeypoint {
  name: string;
  x: number;
  y: number;
  confidence: number;
}

export interface PostureAngles {
  shoulder_tilt: number | null;       // graus de inclinação ombros
  pelvic_tilt: number | null;         // graus de inclinação quadril
  head_forward: number | null;        // estimativa de anteriorização cabeça
  trunk_lateral: number | null;       // inclinação lateral tronco
  knee_alignment_left: number | null; // alinhamento joelho esq
  knee_alignment_right: number | null;// alinhamento joelho dir
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

function distanceBetweenPoints(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

export function calculatePostureAngles(keypoints: PoseKeypoint[]): PostureAngles {
  if (!keypoints || keypoints.length < 29) {
    return { shoulder_tilt: null, pelvic_tilt: null, head_forward: null, trunk_lateral: null, knee_alignment_left: null, knee_alignment_right: null };
  }

  const get = (idx: number) => keypoints[idx];
  const lShoulder = get(LANDMARKS.LEFT_SHOULDER);
  const rShoulder = get(LANDMARKS.RIGHT_SHOULDER);
  const lHip = get(LANDMARKS.LEFT_HIP);
  const rHip = get(LANDMARKS.RIGHT_HIP);
  const nose = get(LANDMARKS.NOSE);
  const lKnee = get(LANDMARKS.LEFT_KNEE);
  const rKnee = get(LANDMARKS.RIGHT_KNEE);
  const lAnkle = get(LANDMARKS.LEFT_ANKLE);
  const rAnkle = get(LANDMARKS.RIGHT_ANKLE);

  // Shoulder tilt (difference in Y between shoulders, converted to degrees)
  const shoulder_tilt = lShoulder && rShoulder
    ? Math.round(angleBetweenPoints(lShoulder, rShoulder) * 10) / 10
    : null;

  // Pelvic tilt
  const pelvic_tilt = lHip && rHip
    ? Math.round(angleBetweenPoints(lHip, rHip) * 10) / 10
    : null;

  // Head forward (lateral view - ratio of nose-to-shoulder horizontal distance vs shoulder height)
  const head_forward = nose && lShoulder && rShoulder
    ? Math.round(Math.abs(nose.x - (lShoulder.x + rShoulder.x) / 2) * 100) / 100
    : null;

  // Trunk lateral tilt (midpoint shoulders vs midpoint hips)
  const trunk_lateral = lShoulder && rShoulder && lHip && rHip
    ? Math.round(angleBetweenPoints(
        { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 },
        { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 }
      ) * 10) / 10 + 90
    : null;

  // Knee alignment (lateral deviation)
  const knee_alignment_left = lHip && lKnee && lAnkle
    ? Math.round(angleBetweenPoints(lHip, lKnee) - angleBetweenPoints(lKnee, lAnkle))
    : null;

  const knee_alignment_right = rHip && rKnee && rAnkle
    ? Math.round(angleBetweenPoints(rHip, rKnee) - angleBetweenPoints(rKnee, rAnkle))
    : null;

  return { shoulder_tilt, pelvic_tilt, head_forward, trunk_lateral, knee_alignment_left, knee_alignment_right };
}

export function calculateRegionScores(angles: PostureAngles): RegionScore[] {
  const scores: RegionScore[] = [];

  // Pescoço / Cabeça
  const headFwd = angles.head_forward;
  scores.push({
    region: 'pescoco',
    label: 'Pescoço / Cabeça',
    status: headFwd === null ? 'ok' : headFwd > 0.15 ? 'risk' : headFwd > 0.08 ? 'attention' : 'ok',
    note: headFwd === null ? 'Sem dados' : headFwd > 0.15 ? 'Cabeça anteriorizada significativa' : headFwd > 0.08 ? 'Leve anteriorização da cabeça' : 'Alinhamento adequado',
    angle: headFwd,
  });

  // Ombros
  const shoulderTilt = angles.shoulder_tilt;
  const shoulderAbs = shoulderTilt !== null ? Math.abs(shoulderTilt) : null;
  scores.push({
    region: 'ombro',
    label: 'Ombros',
    status: shoulderAbs === null ? 'ok' : shoulderAbs > 5 ? 'risk' : shoulderAbs > 2 ? 'attention' : 'ok',
    note: shoulderAbs === null ? 'Sem dados' : shoulderAbs > 5 ? `Assimetria importante (${shoulderTilt}°)` : shoulderAbs > 2 ? `Leve assimetria (${shoulderTilt}°)` : 'Simétricos',
    angle: shoulderTilt,
  });

  // Coluna torácica
  const trunkLat = angles.trunk_lateral;
  const trunkAbs = trunkLat !== null ? Math.abs(trunkLat) : null;
  scores.push({
    region: 'torax',
    label: 'Coluna Torácica',
    status: trunkAbs === null ? 'ok' : trunkAbs > 5 ? 'risk' : trunkAbs > 2 ? 'attention' : 'ok',
    note: trunkAbs === null ? 'Sem dados' : trunkAbs > 5 ? 'Inclinação lateral significativa' : trunkAbs > 2 ? 'Leve inclinação lateral' : 'Alinhamento adequado',
    angle: trunkLat,
  });

  // Lombar (estimativa via pelvis + tronco)
  scores.push({
    region: 'abdomen',
    label: 'Lombar',
    status: trunkAbs !== null && trunkAbs > 4 ? 'attention' : 'ok',
    note: trunkAbs !== null && trunkAbs > 4 ? 'Possível compensação lombar' : 'Sem achados significativos',
  });

  // Quadril / Pelve
  const pelvicTilt = angles.pelvic_tilt;
  const pelvicAbs = pelvicTilt !== null ? Math.abs(pelvicTilt) : null;
  scores.push({
    region: 'quadril',
    label: 'Quadril / Pelve',
    status: pelvicAbs === null ? 'ok' : pelvicAbs > 5 ? 'risk' : pelvicAbs > 2 ? 'attention' : 'ok',
    note: pelvicAbs === null ? 'Sem dados' : pelvicAbs > 5 ? `Assimetria pélvica (${pelvicTilt}°)` : pelvicAbs > 2 ? `Leve inclinação pélvica (${pelvicTilt}°)` : 'Simétrico',
    angle: pelvicTilt,
  });

  // Joelhos
  const kneeL = angles.knee_alignment_left;
  const kneeR = angles.knee_alignment_right;
  const kneeMax = Math.max(Math.abs(kneeL ?? 0), Math.abs(kneeR ?? 0));
  scores.push({
    region: 'coxa_direita',
    label: 'Joelhos',
    status: kneeMax > 10 ? 'risk' : kneeMax > 5 ? 'attention' : 'ok',
    note: kneeMax > 10 ? 'Desvio significativo no alinhamento' : kneeMax > 5 ? 'Leve desvio no alinhamento' : 'Alinhamento adequado',
  });

  // Tornozelos
  scores.push({
    region: 'panturrilha_direita',
    label: 'Tornozelos',
    status: 'ok',
    note: 'Avaliação visual recomendada',
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

  // Connection pairs
  const connections: [number, number, string][] = [
    [LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER, 'ombro'],
    [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_ELBOW, 'ombro'],
    [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_ELBOW, 'ombro'],
    [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_HIP, 'torax'],
    [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_HIP, 'torax'],
    [LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP, 'quadril'],
    [LANDMARKS.LEFT_HIP, LANDMARKS.LEFT_KNEE, 'coxa_direita'],
    [LANDMARKS.RIGHT_HIP, LANDMARKS.RIGHT_KNEE, 'coxa_direita'],
    [LANDMARKS.LEFT_KNEE, LANDMARKS.LEFT_ANKLE, 'panturrilha_direita'],
    [LANDMARKS.RIGHT_KNEE, LANDMARKS.RIGHT_ANKLE, 'panturrilha_direita'],
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

  // Draw keypoints
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
