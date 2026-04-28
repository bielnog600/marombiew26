import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo_marombiew.png';
import { type PdfLang, getTranslations } from './pdfTranslations';
import { getCanvasFitSize, loadImageForCanvas } from './canvasImage';

interface ReportData {
  profile: { nome: string; email?: string; telefone?: string } | null;
  assessment: { created_at: string; notas_gerais?: string } | null;
  anthro: any;
  comp: any;
  skinfolds: any;
  vitals: any;
  perf: any;
  anamnese: any;
  postureScan?: any;
  studentProfile?: any;
  hrZones?: any;
}

const BRAND = {
  gold: [234, 179, 8] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  gray: [120, 120, 120] as [number, number, number],
  light: [245, 245, 245] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const classifyIMC = (imc: number, t: ReturnType<typeof getTranslations>) => {
  if (imc < 18.5) return t.imcUnderweight;
  if (imc < 25) return t.imcNormal;
  if (imc < 30) return t.imcOverweight;
  if (imc < 35) return t.imcObesity1;
  if (imc < 40) return t.imcObesity2;
  return t.imcObesity3;
};

const classifyRCQ = (rcq: number, t: ReturnType<typeof getTranslations>) => {
  if (rcq < 0.80) return t.rcqLow;
  if (rcq < 0.86) return t.rcqModerate;
  if (rcq < 0.95) return t.rcqHigh;
  return t.rcqVeryHigh;
};

const loadImageAsCleanCanvas = async (src: string): Promise<HTMLCanvasElement> => {
  const { image: img, cleanup } = await loadImageForCanvas(src);
  const canvas = document.createElement('canvas');
  try {
    const size = getCanvasFitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, 1400);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    cleanup();
  }
};

/** Blur face region on a canvas using pose keypoints */
const blurFaceOnCanvas = (canvas: HTMLCanvasElement, keypoints: any, position: 'front' | 'side' | 'back') => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const kp = keypoints?.[position];
  
  if (!kp || kp.length < 1) return;
  
  const nose = kp[0];
  const lShoulder = kp.length > 11 ? kp[11] : null;
  const rShoulder = kp.length > 12 ? kp[12] : null;
  const lEar = kp.length > 7 ? kp[7] : null;
  const rEar = kp.length > 8 ? kp[8] : null;
  
  let anchorX: number | null = null;
  let anchorY: number | null = null;
  
  if (nose && nose.confidence >= 0.15) {
    anchorX = nose.x * w;
    anchorY = nose.y * h;
  } else if (lEar && lEar.confidence >= 0.15) {
    anchorX = lEar.x * w;
    anchorY = lEar.y * h;
  } else if (rEar && rEar.confidence >= 0.15) {
    anchorX = rEar.x * w;
    anchorY = rEar.y * h;
  }
  
  if (anchorX === null || anchorY === null) return;
  
  let faceRadius: number;
  if (position === 'side') {
    const shoulder = (lShoulder && lShoulder.confidence > 0.2) ? lShoulder : ((rShoulder && rShoulder.confidence > 0.2) ? rShoulder : null);
    if (shoulder) {
      const noseToShoulder = Math.abs(anchorY / h - shoulder.y) * h;
      faceRadius = noseToShoulder * 0.55;
    } else {
      faceRadius = w * 0.12;
    }
    faceRadius = Math.max(faceRadius, w * 0.08);
  } else {
    if (lShoulder && rShoulder && lShoulder.confidence > 0.2 && rShoulder.confidence > 0.2) {
      const shoulderDist = Math.abs(lShoulder.x - rShoulder.x) * w;
      faceRadius = shoulderDist * 0.45;
    } else {
      faceRadius = w * 0.08;
    }
  }
  
  const fx = anchorX - faceRadius;
  const fy = anchorY - faceRadius * 1.3;
  const fw = faceRadius * 2;
  const fh = faceRadius * 2.6;
  
  const sx = Math.max(0, Math.floor(fx));
  const sy = Math.max(0, Math.floor(fy));
  const sw = Math.min(Math.ceil(fw), w - sx);
  const sh = Math.min(Math.ceil(fh), h - sy);
  if (sw <= 0 || sh <= 0) return;
  
  const scale = 0.04;
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = Math.max(1, Math.round(sw * scale));
  tmpCanvas.height = Math.max(1, Math.round(sh * scale));
  const tmpCtx = tmpCanvas.getContext('2d')!;
  tmpCtx.imageSmoothingEnabled = true;
  tmpCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tmpCanvas.width, tmpCanvas.height);
  
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(anchorX, anchorY + faceRadius * 0.15, faceRadius, faceRadius * 1.3, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmpCanvas, 0, 0, tmpCanvas.width, tmpCanvas.height, sx, sy, sw, sh);
  ctx.restore();
};

/** Render photo with grid + pose overlay onto a canvas and return as data URL */
const renderOverlayPhoto = async (
  photoUrl: string,
  allKeypoints: any,
  position: 'front' | 'side' | 'back',
  regionScores: any[]
): Promise<HTMLCanvasElement | null> => {
  let cleanup = () => {};
  try {
    const loaded = await loadImageForCanvas(photoUrl);
    const img = loaded.image;
    cleanup = loaded.cleanup;
    const canvas = document.createElement('canvas');
    const size = getCanvasFitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, 1400);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d')!;
    if (!canvas.width || !canvas.height) return null;
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blurFaceOnCanvas(canvas, allKeypoints, position);
    
    const w = canvas.width;
    const h = canvas.height;
    
    const cols = 24;
    const rows = 32;
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.2)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const yy = (j / rows) * h;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    
    const kp = allKeypoints?.[position];
    if (kp && kp.length >= 29) {
      const LANDMARKS = {
        NOSE: 0, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
        LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
        LEFT_HIP: 23, RIGHT_HIP: 24,
        LEFT_KNEE: 25, RIGHT_KNEE: 26,
        LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
      };
      
      const get = (idx: number) => ({
        x: kp[idx].x * w, y: kp[idx].y * h, c: kp[idx].confidence,
      });
      
      const getColor = (region: string) => {
        const score = regionScores.find((s: any) => s.region === region);
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
      
      ctx.lineWidth = 14;
      connections.forEach(([a, b, region]) => {
        const pa = get(a);
        const pb = get(b);
        if (pa.c > 0.3 && pb.c > 0.3) {
          ctx.strokeStyle = getColor(region);
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        }
      });
      
      const points = [
        LANDMARKS.NOSE, LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER,
        LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP, LANDMARKS.LEFT_KNEE,
        LANDMARKS.RIGHT_KNEE, LANDMARKS.LEFT_ANKLE, LANDMARKS.RIGHT_ANKLE,
        LANDMARKS.LEFT_ELBOW, LANDMARKS.RIGHT_ELBOW,
      ];
      points.forEach(idx => {
        const p = get(idx);
        if (p.c > 0.3) {
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
        }
      });
    }
    
    return canvas;
  } catch {
    return null;
  } finally {
    cleanup();
  }
};

const hasValue = (v: any) => v != null && v !== '' && v !== 0;
const fmt = (v: any, unit = '') => (hasValue(v) ? `${v}${unit}` : null);

/** Filter rows that have non-null values */
const filterRows = (rows: [string, string | null][]): [string, string][] =>
  rows.filter(([, v]) => v !== null) as [string, string][];

export const generatePDF = async (data: ReportData, lang: PdfLang = 'pt') => {
  const t = getTranslations(lang);
  const dateFmt = lang === 'pt' ? 'pt-BR' : 'en-US';
  const { profile, assessment, anthro, comp, skinfolds, vitals, perf, anamnese, postureScan, studentProfile, hrZones } = data;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  const sectionTitle = (title: string) => {
    checkPage(18);
    y += 4;
    doc.setFillColor(...BRAND.gold);
    doc.rect(margin, y, 4, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.dark);
    doc.text(title, margin + 8, y + 6);
    y += 14;
  };

  const kvTable = (rows: [string, string][]) => {
    if (rows.length === 0) return;
    checkPage(rows.length * 7 + 5);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [],
      body: rows,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2.5, textColor: BRAND.dark },
      columnStyles: {
        0: { fontStyle: 'normal', textColor: BRAND.gray, cellWidth: contentW * 0.45 },
        1: { fontStyle: 'bold', halign: 'right' },
      },
      alternateRowStyles: { fillColor: BRAND.light },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  };

  const addWrappedText = (text: string) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND.dark);
    const lines = doc.splitTextToSize(text, contentW);
    checkPage(lines.length * 4.5 + 6);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 6;
  };

  // ══════════════════════════════════════════════
  // HEADER
  // ══════════════════════════════════════════════
  try {
    const logo = await loadImage(logoUrl);
    const logoSize = 28;
    doc.addImage(logo, 'PNG', margin, y, logoSize, logoSize);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.dark);
    doc.text('MAROMBIEW', margin + logoSize + 6, y + 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND.gray);
    doc.text('FITNESS APPLICATION', margin + logoSize + 6, y + 16);
    doc.setFontSize(8);
    doc.text(t.reportTitle, margin + logoSize + 6, y + 22);
    y += logoSize + 4;
  } catch {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.dark);
    doc.text('MAROMBIEW', margin, y + 10);
    y += 16;
  }

  doc.setDrawColor(...BRAND.gold);
  doc.setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Student info
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND.dark);
  doc.text(profile?.nome || (lang === 'pt' ? 'Aluno' : 'Student'), margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND.gray);
  if (assessment) {
    doc.text(`${t.assessmentDate}: ${new Date(assessment.created_at).toLocaleDateString(dateFmt)}`, margin, y);
  }
  if (profile?.email) {
    doc.text(profile.email, pageW - margin, y, { align: 'right' });
  }
  y += 10;

  // ══════════════════════════════════════════════
  // RESUMO
  // ══════════════════════════════════════════════
  const pesoIdeal = anthro?.altura ? (22 * Math.pow(anthro.altura / 100, 2)).toFixed(1) : null;
  const summaryRows = filterRows([
    [t.weight, fmt(anthro?.peso, ' kg')],
    [t.idealWeight, pesoIdeal ? `${pesoIdeal} kg` : null],
    [t.height, fmt(anthro?.altura, ' cm')],
    [t.imc, anthro?.imc ? `${anthro.imc} — ${classifyIMC(anthro.imc, t)}` : null],
    [t.fatPct, fmt(comp?.percentual_gordura, '%')],
    [t.leanMass, fmt(comp?.massa_magra, ' kg')],
    [t.fatMass, fmt(comp?.massa_gorda, ' kg')],
    [t.waist, fmt(anthro?.cintura, ' cm')],
    [t.hip, fmt(anthro?.quadril, ' cm')],
    [t.rcq, anthro?.rcq ? `${anthro.rcq} — ${classifyRCQ(anthro.rcq, t)}` : null],
  ]);
  if (summaryRows.length > 0) {
    sectionTitle(t.summary);
    kvTable(summaryRows);
  }

  // ══════════════════════════════════════════════
  // MEDIDAS CORPORAIS
  // ══════════════════════════════════════════════
  const medidasRows = filterRows([
    [t.neck, fmt(anthro?.pescoco, ' cm')],
    [t.chest, fmt(anthro?.torax, ' cm')],
    [t.shoulder, fmt(anthro?.ombro, ' cm')],
    [t.abdomen, fmt(anthro?.abdomen, ' cm')],
    [t.rightArm, fmt(anthro?.braco_direito, ' cm')],
    [t.leftArm, fmt(anthro?.braco_esquerdo, ' cm')],
    [t.rightBicepContracted, fmt(anthro?.biceps_contraido_direito, ' cm')],
    [t.leftBicepContracted, fmt(anthro?.biceps_contraido_esquerdo, ' cm')],
    [t.rightForearm, fmt(anthro?.antebraco, ' cm')],
    [t.leftForearm, fmt(anthro?.antebraco_esquerdo, ' cm')],
    [t.rightThigh, fmt(anthro?.coxa_direita, ' cm')],
    [t.leftThigh, fmt(anthro?.coxa_esquerda, ' cm')],
    [t.rightCalf, fmt(anthro?.panturrilha_direita, ' cm')],
    [t.leftCalf, fmt(anthro?.panturrilha_esquerda, ' cm')],
  ]);
  if (medidasRows.length > 0) {
    sectionTitle(t.bodyMeasurements);
    kvTable(medidasRows);
  }

  // ══════════════════════════════════════════════
  // COMPOSIÇÃO CORPORAL + PIE CHART
  // ══════════════════════════════════════════════
  if (comp && (hasValue(comp.percentual_gordura) || hasValue(comp.massa_magra) || hasValue(comp.massa_gorda))) {
    const sexo = studentProfile?.sexo;
    const idealFat = sexo === 'feminino' ? 20 : 15;
    const idealFatWeight = anthro?.peso ? (anthro.peso * idealFat / 100).toFixed(1) : null;
    const genderLabel = sexo === 'feminino' ? t.female : t.male;
    const compRows = filterRows([
      [t.fatPct, fmt(comp.percentual_gordura, '%')],
      [t.idealFatPct, `${idealFat}% (${genderLabel})`],
      [t.leanMass, fmt(comp.massa_magra, ' kg')],
      [t.fatMass, fmt(comp.massa_gorda, ' kg')],
      [t.idealFatWeight, idealFatWeight ? `${idealFatWeight} kg` : null],
    ]);
    sectionTitle(t.bodyComposition);
    kvTable(compRows);

    if (hasValue(comp.massa_magra) && hasValue(comp.massa_gorda)) {
      checkPage(75);
      const pieSize = 200;
      const pieCanvas = document.createElement('canvas');
      pieCanvas.width = pieSize * 2;
      pieCanvas.height = pieSize * 2;
      const pctx = pieCanvas.getContext('2d')!;
      const cx = pieSize;
      const cy = pieSize;
      const r = pieSize * 0.7;

      const total = comp.massa_magra + comp.massa_gorda;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND.dark);
      doc.text(`${t.totalWeight}: ${total.toFixed(1)} kg`, margin, y);
      doc.text(`${t.leanMassLabel}: ${comp.massa_magra.toFixed(1)} kg`, pageW / 2, y, { align: 'center' });
      doc.text(`${t.fatMassLabel}: ${comp.massa_gorda.toFixed(1)} kg`, pageW - margin, y, { align: 'right' });
      y += 6;

      const slices = [
        { value: comp.massa_magra, color: '#22c55e', label: `${t.leanMassLabel} ${comp.massa_magra.toFixed(1)} kg` },
        { value: comp.massa_gorda, color: '#ef4444', label: `${t.fatMassLabel} ${comp.massa_gorda.toFixed(1)} kg` },
      ];

      let startAngle = -Math.PI / 2;
      slices.forEach(slice => {
        const sliceAngle = (slice.value / total) * Math.PI * 2;
        pctx.beginPath();
        pctx.moveTo(cx, cy);
        pctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
        pctx.closePath();
        pctx.fillStyle = slice.color;
        pctx.fill();
        pctx.strokeStyle = '#ffffff';
        pctx.lineWidth = 3;
        pctx.stroke();

        const midAngle = startAngle + sliceAngle / 2;
        const lx = cx + Math.cos(midAngle) * r * 0.55;
        const ly = cy + Math.sin(midAngle) * r * 0.55;
        const pct = ((slice.value / total) * 100).toFixed(1);
        pctx.fillStyle = '#ffffff';
        pctx.font = 'bold 22px sans-serif';
        pctx.textAlign = 'center';
        pctx.textBaseline = 'middle';
        pctx.fillText(`${pct}%`, lx, ly);

        startAngle += sliceAngle;
      });

      const legendY = pieSize * 2 - 20;
      slices.forEach((slice, i) => {
        const lx = i === 0 ? pieSize * 0.4 : pieSize * 1.6;
        pctx.fillStyle = slice.color;
        pctx.fillRect(lx - 40, legendY - 8, 12, 12);
        pctx.fillStyle = '#1e1e1e';
        pctx.font = '16px sans-serif';
        pctx.textAlign = 'left';
        pctx.fillText(slice.label, lx - 24, legendY + 2);
      });

      const chartW = 60;
      const chartH = 60;
      const chartX = (pageW - chartW) / 2;
      doc.addImage(pieCanvas.toDataURL('image/png'), 'PNG', chartX, y, chartW, chartH);
      y += chartH + 6;
    }
  }

  // ══════════════════════════════════════════════
  // DOBRAS CUTÂNEAS
  // ══════════════════════════════════════════════
  const dobrasRows = filterRows([
    [t.triceps, fmt(skinfolds?.triceps, ' mm')],
    [t.subscapular, fmt(skinfolds?.subescapular, ' mm')],
    [t.suprailiac, fmt(skinfolds?.suprailiaca, ' mm')],
    [t.abdominal, fmt(skinfolds?.abdominal, ' mm')],
    [t.pectoral, fmt(skinfolds?.peitoral, ' mm')],
    [t.midAxillary, fmt(skinfolds?.axilar_media, ' mm')],
    [t.thigh, fmt(skinfolds?.coxa, ' mm')],
  ]);
  if (dobrasRows.length > 0) {
    sectionTitle(t.skinfolds);
    if (skinfolds?.metodo) {
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.gray);
      doc.text(`${t.method}: ${skinfolds.metodo.replace(/_/g, ' ')}`, margin, y - 4);
    }
    kvTable(dobrasRows);
  }

  // ══════════════════════════════════════════════
  // SINAIS VITAIS
  // ══════════════════════════════════════════════
  if (vitals) {
    const vitaisRows = filterRows([
      [t.bloodPressure, fmt(vitals.pressao)],
      [t.restingHR, fmt(vitals.fc_repouso, ' bpm')],
      [t.spo2, fmt(vitals.spo2, '%')],
      [t.glucose, fmt(vitals.glicemia, ' mg/dL')],
      [t.observations, vitals.observacoes || null],
    ]);
    if (vitaisRows.length > 0) {
      sectionTitle(t.vitalSigns);
      kvTable(vitaisRows);
    }
  }

  // ══════════════════════════════════════════════
  // ZONAS DE FREQUÊNCIA CARDÍACA (KARVONEN)
  // ══════════════════════════════════════════════
  if (hrZones) {
    sectionTitle(t.hrZones);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.gray);
    const formulaLabel = hrZones.fcmax_formula === 'tanaka' ? 'Tanaka (208 - 0.7 x age)' : '220 - age';
    doc.text(`${t.estimatedMaxHR}: ${hrZones.fcmax_estimada} bpm (${formulaLabel})  |  ${t.restingHRLabel}: ${hrZones.fc_repouso} bpm  |  ${t.reserveHRR}: ${hrZones.hrr} bpm`, margin, y);
    y += 2;
    doc.setFontSize(7);
    doc.text(t.maxHRNote, margin, y);
    y += 5;

    const zonas = hrZones.zonas_karvonen as any[];
    const zoneRows: string[][] = zonas.map((z: any) => [
      `${z.zona} — ${z.label}`,
      `${z.min} – ${z.max} bpm`,
      z.desc,
    ]);

    checkPage(zonas.length * 8 + 10);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [[t.hrZoneCol, t.rangeCol, t.descriptionCol]],
      body: zoneRows,
      theme: 'grid',
      headStyles: { fillColor: BRAND.gold, textColor: BRAND.dark, fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: BRAND.dark },
      alternateRowStyles: { fillColor: BRAND.light },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else if (studentProfile?.data_nascimento && vitals?.fc_repouso) {
    const age = Math.floor((Date.now() - new Date(studentProfile.data_nascimento).getTime()) / (365.25 * 24 * 3600 * 1000));
    const fcMax = Math.round(208 - 0.7 * age);
    const hrr = fcMax - vitals.fc_repouso;

    sectionTitle(t.hrZones);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.gray);
    doc.text(`${t.estimatedMaxHR}: ${fcMax} bpm (Tanaka)  |  ${t.restingHRLabel}: ${vitals.fc_repouso} bpm  |  ${t.reserveHRR}: ${hrr} bpm`, margin, y);
    y += 5;

    const zoneDefs = [
      { zona: 'Z1', label: t.zoneRecovery, lo: 0.50, hi: 0.60, desc: t.zoneRecoveryDesc },
      { zona: 'Z2', label: t.zoneBase, lo: 0.60, hi: 0.70, desc: t.zoneBaseDesc },
      { zona: 'Z3', label: t.zoneModerate, lo: 0.70, hi: 0.80, desc: t.zoneModerateDesc },
      { zona: 'Z4', label: t.zoneHard, lo: 0.80, hi: 0.90, desc: t.zoneHardDesc },
      { zona: 'Z5', label: t.zoneMax, lo: 0.90, hi: 1.00, desc: t.zoneMaxDesc },
    ];

    const zoneRows = zoneDefs.map(z => [
      `${z.zona} — ${z.label}`,
      `${Math.round(vitals.fc_repouso + hrr * z.lo)} – ${Math.round(vitals.fc_repouso + hrr * z.hi)} bpm`,
      z.desc,
    ]);

    checkPage(zoneDefs.length * 8 + 10);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [[t.hrZoneCol, t.rangeCol, t.descriptionCol]],
      body: zoneRows,
      theme: 'grid',
      headStyles: { fillColor: BRAND.gold, textColor: BRAND.dark, fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: BRAND.dark },
      alternateRowStyles: { fillColor: BRAND.light },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ══════════════════════════════════════════════
  // HIDRATAÇÃO
  // ══════════════════════════════════════════════
  if (anthro?.peso) {
    sectionTitle(t.hydration);
    const waterMl = Math.round(anthro.peso * 50);
    const waterL = (waterMl / 1000).toFixed(1);
    const waterRows: [string, string][] = [
      [t.bodyWeight, `${anthro.peso} kg`],
      [t.formula, t.formulaValue],
      [t.dailyIntake, `${waterL} ${lang === 'pt' ? 'litros' : 'liters'} (${waterMl} ml)`],
      [t.trainingDays, `${(waterMl * 1.3 / 1000).toFixed(1)} – ${(waterMl * 1.5 / 1000).toFixed(1)} ${lang === 'pt' ? 'litros' : 'liters'}`],
    ];
    kvTable(waterRows);
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.gray);
    doc.text(t.hydrationNote, margin, y);
    y += 6;
  }

  // ══════════════════════════════════════════════
  // TESTES FÍSICOS
  // ══════════════════════════════════════════════
  if (perf) {
    const testRows = filterRows([
      [t.pushups, fmt(perf.pushup, ' rep')],
      [t.plank, fmt(perf.plank, lang === 'pt' ? ' seg' : ' sec')],
      [t.cooper, fmt(perf.cooper_12min, ' m')],
      [t.verticalJump, fmt(perf.salto_vertical, ' cm')],
      [t.squatScore, fmt(perf.agachamento_score, '/5')],
      [t.shoulderMobility, fmt(perf.mobilidade_ombro)],
      [t.hipMobility, fmt(perf.mobilidade_quadril)],
      [t.ankleMobility, fmt(perf.mobilidade_tornozelo)],
      [t.observations, perf.observacoes || null],
    ]);
    if (testRows.length > 0) {
      sectionTitle(t.physicalTests);
      kvTable(testRows);
    }
  }

  // ══════════════════════════════════════════════
  // ANAMNESE
  // ══════════════════════════════════════════════
  if (anamnese) {
    const anamRows = filterRows([
      [t.sleep, fmt(anamnese.sono)],
      [t.stress, fmt(anamnese.stress)],
      [t.routine, fmt(anamnese.rotina)],
      [t.currentTraining, fmt(anamnese.treino_atual)],
      [t.medication, fmt(anamnese.medicacao)],
      [t.supplements, fmt(anamnese.suplementos)],
      [t.healthHistory, fmt(anamnese.historico_saude)],
      [t.pain, fmt(anamnese.dores)],
      [t.surgeries, fmt(anamnese.cirurgias)],
      [t.smoking, anamnese.tabagismo === true ? t.yes : anamnese.tabagismo === false ? t.no : null],
      [t.alcohol, fmt(anamnese.alcool)],
    ]);
    if (anamRows.length > 0) {
      sectionTitle(t.anamnesis);
      kvTable(anamRows);
    }
  }

  // ══════════════════════════════════════════════
  // ANÁLISE POSTURAL
  // ══════════════════════════════════════════════
  if (postureScan) {
    const hasPhotos = postureScan.front_photo_url || postureScan.side_photo_url || postureScan.back_photo_url;
    const regionScores = (postureScan.region_scores_json as any[]) || [];
    const attentionPoints = (postureScan.attention_points_json as any[]) || [];
    const angles = postureScan.angles_json as any;
    const poseKeypoints = postureScan.pose_keypoints_json as any;

    if (hasPhotos || regionScores.length > 0 || attentionPoints.length > 0) {
      doc.addPage();
      y = margin;

      sectionTitle(t.postureAnalysis);

      doc.setFontSize(8);
      doc.setTextColor(...BRAND.gray);
      doc.text(`${t.date}: ${new Date(postureScan.created_at).toLocaleDateString(dateFmt)}`, margin, y);
      y += 6;

      if (hasPhotos) {
        const photoEntries: { url: string; label: string; position: 'front' | 'side' | 'back' }[] = [];
        if (postureScan.front_photo_url) photoEntries.push({ url: postureScan.front_photo_url, label: t.front, position: 'front' });
        if (postureScan.side_photo_url) photoEntries.push({ url: postureScan.side_photo_url, label: t.side, position: 'side' });
        if (postureScan.back_photo_url) photoEntries.push({ url: postureScan.back_photo_url, label: t.back, position: 'back' });

        const loadedPhotos: { canvas: HTMLCanvasElement; label: string; ratio: number }[] = [];
        for (const entry of photoEntries) {
          try {
            const overlayCanvas = await renderOverlayPhoto(entry.url, poseKeypoints, entry.position, regionScores);
            if (overlayCanvas) {
              loadedPhotos.push({ canvas: overlayCanvas, label: entry.label, ratio: overlayCanvas.height / overlayCanvas.width });
            } else {
              const fallbackCanvas = await loadImageAsCleanCanvas(entry.url);
              blurFaceOnCanvas(fallbackCanvas, poseKeypoints, entry.position);
              loadedPhotos.push({ canvas: fallbackCanvas, label: entry.label, ratio: fallbackCanvas.height / fallbackCanvas.width });
            }
          } catch {
            // Skip
          }
        }

        if (loadedPhotos.length > 0) {
          const maxPhotoWidth = loadedPhotos.length === 1 ? 80 : loadedPhotos.length === 2 ? 65 : 55;
          const gap = 5;
          const maxAvailHeight = pageH - y - 30;

          const photoDims = loadedPhotos.map(p => {
            let pw = maxPhotoWidth;
            let ph = pw * p.ratio;
            if (ph > maxAvailHeight) {
              ph = maxAvailHeight;
              pw = ph / p.ratio;
            }
            return { w: pw, h: ph };
          });

          const maxH = Math.max(...photoDims.map(d => d.h));
          const totalWidth = photoDims.reduce((sum, d) => sum + d.w, 0) + (loadedPhotos.length - 1) * gap;
          const startX = (pageW - totalWidth) / 2;

          checkPage(maxH + 15);

          let curX = startX;
          for (let i = 0; i < loadedPhotos.length; i++) {
            const { w: pw, h: ph } = photoDims[i];
            const photo = loadedPhotos[i];
            const imgY = y + (maxH - ph) / 2;
            doc.addImage(photo.canvas.toDataURL('image/jpeg', 0.92), 'JPEG', curX, imgY, pw, ph);
            doc.setFontSize(7);
            doc.setTextColor(...BRAND.gray);
            doc.text(photo.label, curX + pw / 2, y + maxH + 4, { align: 'center' });
            curX += pw + gap;
          }
          y += maxH + 10;
        }
      }

      // Region Scores
      if (regionScores.length > 0) {
        checkPage(20);
        y += 4;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.dark);
        doc.text(t.postureSummary, margin, y);
        y += 6;

        const statusLabelPdf = (s: string) => s === 'risk' ? t.statusRisk : s === 'attention' ? t.statusAttention : t.statusOk;
        const scoreRows: [string, string][] = regionScores.map((s: any) => {
          const angleStr = s.angle !== null && s.angle !== undefined ? ` (${s.angle}°)` : '';
          return [s.label, `${statusLabelPdf(s.status)}${angleStr} — ${s.note || ''}`];
        });
        kvTable(scoreRows);
      }

      // Angles / Metrics
      if (angles) {
        const overrides = (postureScan.overrides_json as any)?.values || {};
        const manualFlags = (postureScan.overrides_json as any)?.manual_flags || {};
        const getVal = (key: string) => { const v = manualFlags[key] ? overrides[key] : angles[key]; return v != null ? `${v}°` : null; };
        const angleEntries: [string, string | null][] = [
          [t.shoulderTilt, getVal('shoulder_tilt')],
          [t.shoulderProtusion, getVal('shoulder_protusion')],
          [t.pelvicTilt, getVal('pelvic_tilt')],
          [t.trunkLateral, getVal('trunk_lateral')],
          [t.headForward, (() => { const v = manualFlags.head_forward ? overrides.head_forward : angles.head_forward; return v != null ? `${v}` : null; })()],
          [t.kyphosis, getVal('kyphosis_angle')],
          [t.lordosis, getVal('lordosis_angle')],
          [t.scoliosis, getVal('scoliosis_angle')],
          [t.kneeValgusLeft, getVal('knee_valgus_left')],
          [t.kneeValgusRight, getVal('knee_valgus_right')],
          [t.kneeAlignLeft, getVal('knee_alignment_left')],
          [t.kneeAlignRight, getVal('knee_alignment_right')],
        ];
        const filteredAngles = filterRows(angleEntries);
        if (filteredAngles.length > 0) {
          checkPage(15);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...BRAND.dark);
          doc.text(t.metricsAngles, margin, y);
          y += 6;
          kvTable(filteredAngles);
        }
      }

      // Condições Posturais Detalhadas
      const conditions = (postureScan.overrides_json as any)?.conditions || [];
      const significantConditions = conditions.filter((c: any) => c.severity !== 'normal');
      if (significantConditions.length > 0) {
        checkPage(20);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.dark);
        doc.text(t.detailedPosture, margin, y);
        y += 6;

        for (const cond of significantConditions) {
          checkPage(25);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...BRAND.dark);
          const severityText = cond.severity === 'grave' ? t.severityGrave : cond.severity === 'moderada' ? t.severityModerate : t.severityMild;
          const severityColor: [number, number, number] = cond.severity === 'grave' ? [239, 68, 68] : cond.severity === 'moderada' ? [245, 158, 11] : [34, 197, 94];
          doc.setTextColor(...severityColor);
          const headerText = `${cond.label} — ${severityText}${cond.angle != null ? ` (${cond.angle})` : ''}`;
          doc.text(headerText, margin + 2, y);
          y += 5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...BRAND.gray);
          const detailLines = doc.splitTextToSize(cond.details, contentW - 4);
          checkPage(detailLines.length * 3.5 + 4);
          doc.text(detailLines, margin + 2, y);
          y += detailLines.length * 3.5 + 4;
        }
        y += 2;
      }

      // Attention points
      if (attentionPoints.length > 0) {
        checkPage(attentionPoints.length * 6 + 10);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.dark);
        doc.text(t.attentionPoints, margin, y);
        y += 6;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        for (const point of attentionPoints) {
          checkPage(6);
          doc.setTextColor(...BRAND.dark);
          doc.text(`• ${point.text}`, margin + 2, y);
          y += 5;
        }
        y += 4;
      }

      // Posture notes
      if (postureScan.notes) {
        checkPage(15);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.dark);
        doc.text(t.evaluatorNotes, margin, y);
        y += 6;
        addWrappedText(postureScan.notes);
      }
    }
  }

  // ══════════════════════════════════════════════
  // NOTAS GERAIS
  // ══════════════════════════════════════════════
  if (assessment?.notas_gerais) {
    sectionTitle(t.generalNotes);
    addWrappedText(assessment.notas_gerais);
  }

  // ══════════════════════════════════════════════
  // FOOTER
  // ══════════════════════════════════════════════
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(0.5);
    doc.line(margin, ph - 15, pageW - margin, ph - 15);
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.gray);
    doc.text(t.footer, margin, ph - 10);
    doc.text(`${t.page} ${i} ${t.of} ${totalPages}`, pageW - margin, ph - 10, { align: 'right' });
  }

  // ══════════════════════════════════════════════
  // SAVE
  // ══════════════════════════════════════════════
  const nome = (profile?.nome || (lang === 'pt' ? 'aluno' : 'student')).replace(/\s+/g, '_').toLowerCase();
  const dateStr = assessment ? new Date(assessment.created_at).toISOString().split('T')[0] : 'report';
  const prefix = lang === 'pt' ? 'avaliacao' : 'assessment';
  const filename = `${prefix}_${nome}_${dateStr}.pdf`;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const blob = doc.output('blob');

  if (isStandalone || isIOS) {
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'application/pdf' });
      const shareData = { files: [file], title: filename };
      if (navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
        }
      }
    }
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
