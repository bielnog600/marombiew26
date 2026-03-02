import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo_marombiew.png';

const BRAND = {
  gold: [234, 179, 8] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  gray: [120, 120, 120] as [number, number, number],
  light: [245, 245, 245] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const CHART_COLORS: [number, number, number][] = [
  [234, 179, 8],   // gold
  [59, 165, 220],  // blue
  [72, 180, 97],   // green
  [168, 100, 220], // purple
  [240, 120, 50],  // orange
];

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

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
    anchorX = nose.x * w; anchorY = nose.y * h;
  } else if (lEar && lEar.confidence >= 0.15) {
    anchorX = lEar.x * w; anchorY = lEar.y * h;
  } else if (rEar && rEar.confidence >= 0.15) {
    anchorX = rEar.x * w; anchorY = rEar.y * h;
  }
  if (anchorX === null || anchorY === null) return;

  let faceRadius: number;
  if (position === 'side') {
    const shoulder = (lShoulder && lShoulder.confidence > 0.2) ? lShoulder : ((rShoulder && rShoulder.confidence > 0.2) ? rShoulder : null);
    if (shoulder) {
      faceRadius = Math.abs(anchorY / h - shoulder.y) * h * 0.55;
    } else {
      faceRadius = w * 0.12;
    }
    faceRadius = Math.max(faceRadius, w * 0.08);
  } else {
    if (lShoulder && rShoulder && lShoulder.confidence > 0.2 && rShoulder.confidence > 0.2) {
      faceRadius = Math.abs(lShoulder.x - rShoulder.x) * w * 0.45;
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

async function loadPhotoWithBlur(url: string, keypoints: any, position: 'front' | 'side' | 'back'): Promise<string> {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  blurFaceOnCanvas(canvas, keypoints, position);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ═══════════════════════════════════════════════
// CHART DRAWING HELPERS (pure jsPDF primitives)
// ═══════════════════════════════════════════════

interface ChartConfig {
  doc: jsPDF;
  x: number; y: number; w: number; h: number;
  title: string;
}

/** Draw a line chart directly on the PDF */
function drawLineChart(
  cfg: ChartConfig,
  labels: string[],
  series: { name: string; values: (number | null)[]; color: [number, number, number] }[],
) {
  const { doc, x, y, w, h, title } = cfg;
  const padL = 18; const padR = 4; const padT = 14; const padB = 14;
  const chartX = x + padL;
  const chartY = y + padT;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // Background
  doc.setFillColor(250, 250, 248);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');

  // Title
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BRAND.dark);
  doc.text(title, x + 3, y + 8);

  // Compute min/max across all series
  let allVals: number[] = [];
  series.forEach(s => s.values.forEach(v => { if (v != null) allVals.push(v); }));
  if (allVals.length === 0) return;
  let minVal = Math.min(...allVals);
  let maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;
  minVal -= range * 0.1;
  maxVal += range * 0.1;
  const finalRange = maxVal - minVal;

  // Grid lines (5 horizontal)
  doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + chartH - (chartH * i / 4);
    doc.line(chartX, gy, chartX + chartW, gy);
    const val = minVal + (finalRange * i / 4);
    doc.setFontSize(6); doc.setTextColor(...BRAND.gray); doc.setFont('helvetica', 'normal');
    doc.text(val.toFixed(1), chartX - 2, gy + 1.5, { align: 'right' });
  }

  // X labels
  const step = labels.length > 1 ? chartW / (labels.length - 1) : 0;
  doc.setFontSize(6); doc.setTextColor(...BRAND.gray);
  labels.forEach((l, i) => {
    const lx = chartX + i * step;
    doc.text(l, lx, chartY + chartH + 6, { align: 'center' });
  });

  // Draw each series
  series.forEach(s => {
    doc.setDrawColor(...s.color); doc.setLineWidth(0.6);
    let prevPx: number | null = null; let prevPy: number | null = null;
    s.values.forEach((v, i) => {
      if (v == null) { prevPx = null; prevPy = null; return; }
      const px = chartX + i * step;
      const py = chartY + chartH - ((v - minVal) / finalRange) * chartH;
      if (prevPx != null && prevPy != null) {
        doc.line(prevPx, prevPy, px, py);
      }
      // dot
      doc.setFillColor(...s.color);
      doc.circle(px, py, 0.8, 'F');
      // value label
      doc.setFontSize(5.5); doc.setTextColor(...s.color); doc.setFont('helvetica', 'bold');
      doc.text(v.toFixed(1), px, py - 2, { align: 'center' });
      prevPx = px; prevPy = py;
    });
  });

  // Legend
  let legX = chartX;
  const legY = y + h - 2;
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
  series.forEach(s => {
    doc.setFillColor(...s.color);
    doc.rect(legX, legY - 2, 3, 2, 'F');
    doc.setTextColor(...BRAND.dark);
    doc.text(s.name, legX + 4, legY);
    legX += doc.getTextWidth(s.name) + 7;
  });
}

/** Draw a grouped bar chart directly on the PDF */
function drawBarChart(
  cfg: ChartConfig,
  categories: string[],
  seriesNames: string[],
  data: { [cat: string]: { [series: string]: number | null } },
  colors: [number, number, number][],
) {
  const { doc, x, y, w, h, title } = cfg;
  const padL = 18; const padR = 4; const padT = 14; const padB = 16;
  const chartX = x + padL;
  const chartY = y + padT;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // Background
  doc.setFillColor(250, 250, 248);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');

  // Title
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BRAND.dark);
  doc.text(title, x + 3, y + 8);

  // Compute max value
  let maxVal = 0;
  categories.forEach(cat => {
    seriesNames.forEach(sn => {
      const v = data[cat]?.[sn];
      if (v != null && v > maxVal) maxVal = v;
    });
  });
  if (maxVal === 0) maxVal = 1;
  maxVal *= 1.15;

  // Grid
  doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + chartH - (chartH * i / 4);
    doc.line(chartX, gy, chartX + chartW, gy);
    const val = (maxVal * i / 4);
    doc.setFontSize(6); doc.setTextColor(...BRAND.gray); doc.setFont('helvetica', 'normal');
    doc.text(val.toFixed(1), chartX - 2, gy + 1.5, { align: 'right' });
  }

  const groupW = chartW / categories.length;
  const barW = Math.min((groupW - 4) / seriesNames.length, 8);

  categories.forEach((cat, ci) => {
    const groupX = chartX + ci * groupW;
    // Category label
    doc.setFontSize(5); doc.setTextColor(...BRAND.gray); doc.setFont('helvetica', 'normal');
    doc.text(cat, groupX + groupW / 2, chartY + chartH + 5, { align: 'center' });

    seriesNames.forEach((sn, si) => {
      const v = data[cat]?.[sn];
      if (v == null || v === 0) return;
      const barH = (v / maxVal) * chartH;
      const bx = groupX + (groupW - barW * seriesNames.length) / 2 + si * barW;
      const by = chartY + chartH - barH;
      doc.setFillColor(...(colors[si % colors.length]));
      doc.rect(bx, by, barW - 0.5, barH, 'F');
      // value on top
      doc.setFontSize(5); doc.setTextColor(...(colors[si % colors.length])); doc.setFont('helvetica', 'bold');
      doc.text(v.toFixed(1), bx + (barW - 0.5) / 2, by - 1.5, { align: 'center' });
    });
  });

  // Legend
  let legX = chartX;
  const legY = y + h - 2;
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
  seriesNames.forEach((sn, i) => {
    doc.setFillColor(...(colors[i % colors.length]));
    doc.rect(legX, legY - 2, 3, 2, 'F');
    doc.setTextColor(...BRAND.dark);
    doc.text(sn, legX + 4, legY);
    legX += doc.getTextWidth(sn) + 7;
  });
}

/** Draw a simple delta comparison table with colored arrows */
function drawDeltaTable(
  doc: jsPDF, x: number, y: number, w: number,
  rows: { label: string; values: (number | null)[]; unit?: string }[],
  dateLabels: string[],
) {
  if (dateLabels.length < 2 || rows.length === 0) return y;

  const colW = (w - 50) / (dateLabels.length + 1);
  let cy = y;

  // Header
  doc.setFillColor(...BRAND.gold);
  doc.rect(x, cy, w, 6, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BRAND.dark);
  doc.text('Medida', x + 2, cy + 4);
  dateLabels.forEach((dl, i) => {
    doc.text(dl, x + 50 + i * colW + colW / 2, cy + 4, { align: 'center' });
  });
  doc.text('Δ', x + 50 + dateLabels.length * colW + colW / 2, cy + 4, { align: 'center' });
  cy += 7;

  rows.forEach((row, ri) => {
    if (ri % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(x, cy - 1, w, 5.5, 'F');
    }
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...BRAND.dark);
    doc.text(row.label, x + 2, cy + 3);

    row.values.forEach((v, i) => {
      doc.setTextColor(...BRAND.dark);
      doc.text(v != null ? v.toFixed(1) : '-', x + 50 + i * colW + colW / 2, cy + 3, { align: 'center' });
    });

    // Delta (last - first)
    const first = row.values[0];
    const last = row.values[row.values.length - 1];
    if (first != null && last != null) {
      const diff = last - first;
      const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '=';
      const color: [number, number, number] = diff > 0 ? [72, 180, 97] : diff < 0 ? [220, 60, 60] : BRAND.gray;
      doc.setTextColor(...color); doc.setFont('helvetica', 'bold');
      doc.text(`${arrow} ${Math.abs(diff).toFixed(1)}`, x + 50 + dateLabels.length * colW + colW / 2, cy + 3, { align: 'center' });
    } else {
      doc.setTextColor(...BRAND.gray);
      doc.text('-', x + 50 + dateLabels.length * colW + colW / 2, cy + 3, { align: 'center' });
    }
    cy += 5.5;
  });

  return cy + 2;
}

// ═══════════════════════════════════════════════

interface ComparisonData {
  studentName: string;
  dateLabels: string[];
  compositionChartData: any[];
  measurementChartData: any[];
  skinfoldChartData: any[];
  photosGrouped: { date: string; photos: any[] }[];
  postureGrouped: { date: string; posture: any; scan: any }[];
  sortedAssessments: any[];
}

export const generateComparisonPDF = async (data: ComparisonData) => {
  const {
    studentName, dateLabels, compositionChartData, measurementChartData,
    skinfoldChartData, photosGrouped, postureGrouped,
  } = data;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 0;

  const checkPage = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage();
      y = 15;
    }
  };

  const sectionTitle = (title: string) => {
    checkPage(16);
    doc.setFillColor(...BRAND.gold);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setTextColor(...BRAND.dark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 3, y + 5.5);
    y += 12;
  };

  // ═══ HEADER ═══
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, pageW, 50, 'F');

  try {
    const logo = await loadImage(logoUrl);
    doc.addImage(logo, 'PNG', margin, 10, 30, 30);
  } catch { /* skip */ }
  doc.setTextColor(...BRAND.gold);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório de Comparação', margin + 35, 22);
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.white);
  doc.text(studentName, margin + 35, 30);
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.gray);
  doc.text(`Avaliações comparadas: ${dateLabels.join(' vs ')}`, margin + 35, 38);
  y = 58;

  // ═══ GRÁFICO: COMPOSIÇÃO CORPORAL ═══
  sectionTitle('Composição Corporal - Evolução');

  const compSeriesKeys = ['% Gordura', 'Massa Gorda (kg)', 'Massa Magra (kg)', 'IMC'];
  const compSeries = compSeriesKeys.map((key, i) => ({
    name: key,
    values: compositionChartData.map(d => d[key] ?? null),
    color: CHART_COLORS[i % CHART_COLORS.length],
  })).filter(s => s.values.some(v => v != null));

  if (compSeries.length > 0) {
    drawLineChart({ doc, x: margin, y, w: contentW, h: 60, title: '' }, dateLabels, compSeries);
    y += 64;
  }

  // Delta table for composition
  checkPage(40);
  y = drawDeltaTable(doc, margin, y, contentW,
    compSeriesKeys.map(key => ({
      label: key,
      values: compositionChartData.map(d => d[key] ?? null),
    })),
    dateLabels
  );
  y += 4;

  // ═══ GRÁFICO: MEDIDAS ANTROPOMÉTRICAS ═══
  checkPage(80);
  sectionTitle('Medidas Antropométricas - Evolução');

  // Split measurements into 2 charts for readability
  const measureKeys1 = ['Peso (kg)', 'Cintura (cm)', 'Quadril (cm)', 'Tórax (cm)', 'Abdômen (cm)'];
  const measureKeys2 = ['Braço D (cm)', 'Braço E (cm)', 'Coxa D (cm)', 'Coxa E (cm)', 'Pant. D (cm)'];

  const makeMeasureSeries = (keys: string[]) =>
    keys.map((key, i) => ({
      name: key,
      values: measurementChartData.map(d => d[key] ?? null),
      color: CHART_COLORS[i % CHART_COLORS.length],
    })).filter(s => s.values.some(v => v != null));

  const ms1 = makeMeasureSeries(measureKeys1);
  if (ms1.length > 0) {
    drawLineChart({ doc, x: margin, y, w: contentW, h: 55, title: 'Tronco e Peso' }, dateLabels, ms1);
    y += 59;
  }

  checkPage(60);
  const ms2 = makeMeasureSeries(measureKeys2);
  if (ms2.length > 0) {
    drawLineChart({ doc, x: margin, y, w: contentW, h: 55, title: 'Membros' }, dateLabels, ms2);
    y += 59;
  }

  // Full measurements delta table
  checkPage(90);
  const allMeasureKeys = ['Peso (kg)', 'Cintura (cm)', 'Quadril (cm)', 'Braço D (cm)', 'Braço E (cm)',
    'Coxa D (cm)', 'Coxa E (cm)', 'Pant. D (cm)', 'Pant. E (cm)', 'Tórax (cm)', 'Abdômen (cm)', 'Ombro (cm)', 'Pescoço (cm)'];
  y = drawDeltaTable(doc, margin, y, contentW,
    allMeasureKeys.map(key => ({
      label: key,
      values: measurementChartData.map(d => d[key] ?? null),
    })),
    dateLabels
  );
  y += 4;

  // ═══ GRÁFICO: DOBRAS CUTÂNEAS ═══
  const hasSkinfolds = skinfoldChartData.some((d: any) => dateLabels.some(l => d[l] != null));
  if (hasSkinfolds) {
    checkPage(80);
    sectionTitle('Dobras Cutâneas (mm)');

    // Build bar chart data
    const barData: { [cat: string]: { [series: string]: number | null } } = {};
    const categories = skinfoldChartData.map((d: any) => d.dobra as string);
    categories.forEach((cat, ci) => {
      barData[cat] = {};
      dateLabels.forEach(l => {
        barData[cat][l] = skinfoldChartData[ci][l] ?? null;
      });
    });

    drawBarChart(
      { doc, x: margin, y, w: contentW, h: 65, title: '' },
      categories, dateLabels, barData,
      CHART_COLORS.slice(0, dateLabels.length),
    );
    y += 69;

    // Delta table for skinfolds
    checkPage(50);
    y = drawDeltaTable(doc, margin, y, contentW,
      skinfoldChartData.map((d: any) => ({
        label: d.dobra,
        values: dateLabels.map(l => d[l] ?? null),
      })),
      dateLabels
    );
    y += 4;
  }

  // ═══ FOTOS ANTES E DEPOIS ═══
  const hasPhotos = photosGrouped.some(g => g.photos.length > 0);
  if (hasPhotos) {
    doc.addPage();
    y = 15;
    sectionTitle('Fotos - Antes e Depois');

    const scanMap = new Map<string, any>();
    postureGrouped.forEach(g => {
      if (g.scan) scanMap.set(g.date, g.scan);
    });

    const colW = (contentW - 4) / Math.min(photosGrouped.length, 3);

    for (let g = 0; g < photosGrouped.length; g += 3) {
      const chunk = photosGrouped.slice(g, g + 3);
      checkPage(100);

      for (let c = 0; c < chunk.length; c++) {
        const group = chunk[c];
        const x = margin + c * (colW + 2);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.gold);
        doc.text(group.date, x + colW / 2, y, { align: 'center' });

        let photoY = y + 5;
        for (const photo of group.photos) {
          try {
            const scan = scanMap.get(group.date);
            const kp = scan?.pose_keypoints_json;
            const position = photo.tipo === 'frontal' ? 'front' : photo.tipo === 'lateral' ? 'side' : 'back';
            const dataUrl = await loadPhotoWithBlur(photo.url, kp, position);
            const img = await loadImage(dataUrl);
            const ratio = img.naturalHeight / img.naturalWidth;
            const imgW = colW - 4;
            const imgH = imgW * ratio;

            checkPage(imgH + 10);
            doc.addImage(dataUrl, 'JPEG', x + 2, photoY, imgW, imgH);

            doc.setFontSize(7);
            doc.setTextColor(...BRAND.gray);
            doc.text(photo.tipo || 'Foto', x + colW / 2, photoY + imgH + 3, { align: 'center' });

            photoY += imgH + 7;
          } catch { /* skip */ }
        }
      }
      y = y + 90;
    }
  }

  // ═══ AVALIAÇÃO POSTURAL ═══
  const hasPosture = postureGrouped.some(g => g.posture || g.scan);
  if (hasPosture) {
    doc.addPage();
    y = 15;
    sectionTitle('Avaliação Postural - Comparação');

    const scansWithPhotos = postureGrouped.filter(g => g.scan?.front_photo_url || g.scan?.side_photo_url || g.scan?.back_photo_url);
    if (scansWithPhotos.length > 0) {
      const colW2 = (contentW - 4) / Math.min(scansWithPhotos.length, 3);

      for (const view of ['front', 'side', 'back'] as const) {
        const urlKey = `${view}_photo_url`;
        const viewLabel = view === 'front' ? 'Anterior' : view === 'side' ? 'Lateral' : 'Posterior';
        const hasThisView = scansWithPhotos.some(g => g.scan?.[urlKey]);
        if (!hasThisView) continue;

        checkPage(80);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.dark);
        doc.text(`Vista ${viewLabel}`, margin, y + 3);
        y += 7;

        for (let c = 0; c < scansWithPhotos.length; c++) {
          const g = scansWithPhotos[c];
          const photoUrl = g.scan?.[urlKey];
          if (!photoUrl) continue;
          const x = margin + c * (colW2 + 2);

          try {
            const kp = g.scan?.pose_keypoints_json;
            const dataUrl = await loadPhotoWithBlur(photoUrl, kp, view);
            const img = await loadImage(dataUrl);
            const ratio = img.naturalHeight / img.naturalWidth;
            const imgW = colW2 - 4;
            const imgH = Math.min(imgW * ratio, 70);

            doc.addImage(dataUrl, 'JPEG', x + 2, y, imgW, imgH);
            doc.setFontSize(7);
            doc.setTextColor(...BRAND.gold);
            doc.text(g.date, x + colW2 / 2, y + imgH + 3, { align: 'center' });
          } catch { /* skip */ }
        }
        y += 78;
      }
    }

    // Posture deviations table
    const postureWithData = postureGrouped.filter(g => g.posture);
    if (postureWithData.length > 0) {
      checkPage(40);
      sectionTitle('Desvios Posturais');

      const views = [
        { key: 'vista_anterior', label: 'Anterior' },
        { key: 'vista_lateral', label: 'Lateral' },
        { key: 'vista_posterior', label: 'Posterior' },
      ];

      for (const view of views) {
        const allKeys = new Set<string>();
        postureWithData.forEach(g => {
          const v = g.posture?.[view.key];
          if (v && typeof v === 'object') {
            Object.keys(v).forEach(k => allKeys.add(k));
          }
        });
        if (allKeys.size === 0) continue;

        checkPage(20);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.dark);
        doc.text(`Vista ${view.label}`, margin, y + 3);
        y += 5;

        const pHeaders = ['Desvio', ...postureWithData.map(g => g.date)];
        const pRows = Array.from(allKeys).map(k => {
          const row = [k.replace(/_/g, ' ')];
          postureWithData.forEach(g => {
            const val = g.posture?.[view.key]?.[k];
            row.push(val ? String(val) : 'Normal');
          });
          return row;
        });

        autoTable(doc, {
          startY: y,
          head: [pHeaders],
          body: pRows,
          margin: { left: margin, right: margin },
          styles: { fontSize: 7, cellPadding: 1.5, textColor: BRAND.dark },
          headStyles: { fillColor: BRAND.gold, textColor: BRAND.dark, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [250, 250, 250] },
        });
        y = (doc as any).lastAutoTable.finalY + 5;
      }
    }

    // Attention points from scans
    const scansWithPoints = postureGrouped.filter(g => {
      const pts = g.scan?.attention_points_json;
      return pts && Array.isArray(pts) && pts.length > 0;
    });
    if (scansWithPoints.length > 0) {
      checkPage(30);
      sectionTitle('Pontos de Atenção (Análise 2D)');

      for (const g of scansWithPoints) {
        checkPage(15);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.gold);
        doc.text(g.date, margin, y + 3);
        y += 5;

        const pts = g.scan.attention_points_json as any[];
        pts.forEach((pt: any) => {
          checkPage(6);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...BRAND.dark);
          const severity = pt.severity || pt.gravidade || '';
          const name = pt.name || pt.nome || pt.label || '';
          doc.text(`[${severity}] ${name}`, margin + 2, y + 3);
          y += 4;
        });
        y += 3;
      }
    }
  }

  // ═══ FOOTER ═══
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const ph = pageH;
    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(0.5);
    doc.line(margin, ph - 15, pageW - margin, ph - 15);
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.gray);
    doc.text('Marombiew Fitness Application — Relatório de Comparação', margin, ph - 10);
    doc.text(`Página ${i} de ${totalPages}`, pageW - margin, ph - 10, { align: 'right' });
  }

  // ═══ SAVE ═══
  const nome = (studentName || 'aluno').replace(/\s+/g, '_').toLowerCase();
  const filename = `comparacao_${nome}_${new Date().toISOString().split('T')[0]}.pdf`;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const blob = doc.output('blob');

  if (isStandalone || isIOS) {
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'application/pdf' });
      const shareData = { files: [file], title: filename };
      if (navigator.canShare(shareData)) {
        try { await navigator.share(shareData); return; } catch (err: any) {
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
