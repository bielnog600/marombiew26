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
  try {
    const logo = await loadImage(logoUrl);
    doc.addImage(logo, 'PNG', margin, 10, 30, 30);
  } catch { /* skip */ }

  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, pageW, 50, 'F');
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

  // ═══ COMPOSIÇÃO CORPORAL ═══
  sectionTitle('Composição Corporal - Evolução');
  const compHeaders = ['Data', '% Gordura', 'Massa Gorda (kg)', 'Massa Magra (kg)', 'IMC'];
  const compRows = compositionChartData.map(d => [
    d.date,
    d['% Gordura'] != null ? String(d['% Gordura']) : '-',
    d['Massa Gorda (kg)'] != null ? String(d['Massa Gorda (kg)']) : '-',
    d['Massa Magra (kg)'] != null ? String(d['Massa Magra (kg)']) : '-',
    d['IMC'] != null ? String(d['IMC']) : '-',
  ]);
  autoTable(doc, {
    startY: y,
    head: [compHeaders],
    body: compRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2, textColor: BRAND.dark },
    headStyles: { fillColor: BRAND.gold, textColor: BRAND.dark, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ═══ MEDIDAS ═══
  sectionTitle('Medidas Antropométricas - Evolução');
  const measureKeys = ['Peso (kg)', 'Cintura (cm)', 'Quadril (cm)', 'Braço D (cm)', 'Braço E (cm)',
    'Coxa D (cm)', 'Coxa E (cm)', 'Pant. D (cm)', 'Pant. E (cm)', 'Tórax (cm)', 'Abdômen (cm)', 'Ombro (cm)', 'Pescoço (cm)'];
  const mHeaders = ['Medida', ...dateLabels];
  const mRows = measureKeys.map(key => {
    const row = [key];
    measurementChartData.forEach(d => {
      row.push(d[key] != null ? String(d[key]) : '-');
    });
    return row;
  });
  // Add delta column if 2 assessments
  if (dateLabels.length === 2) {
    mHeaders.push('Δ');
    mRows.forEach(row => {
      const v1 = parseFloat(row[1]);
      const v2 = parseFloat(row[2]);
      if (!isNaN(v1) && !isNaN(v2)) {
        const diff = v2 - v1;
        row.push((diff >= 0 ? '+' : '') + diff.toFixed(1));
      } else {
        row.push('-');
      }
    });
  }
  autoTable(doc, {
    startY: y,
    head: [mHeaders],
    body: mRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7, cellPadding: 1.5, textColor: BRAND.dark },
    headStyles: { fillColor: BRAND.gold, textColor: BRAND.dark, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ═══ DOBRAS ═══
  const hasSkinfolds = skinfoldChartData.some((d: any) => dateLabels.some(l => d[l] != null));
  if (hasSkinfolds) {
    sectionTitle('Dobras Cutâneas (mm)');
    const sHeaders = ['Dobra', ...dateLabels];
    if (dateLabels.length === 2) sHeaders.push('Δ');
    const sRows = skinfoldChartData.map((d: any) => {
      const row = [d.dobra];
      dateLabels.forEach(l => row.push(d[l] != null ? String(d[l]) : '-'));
      if (dateLabels.length === 2) {
        const v1 = parseFloat(row[1]);
        const v2 = parseFloat(row[2]);
        if (!isNaN(v1) && !isNaN(v2)) {
          const diff = v2 - v1;
          row.push((diff >= 0 ? '+' : '') + diff.toFixed(1));
        } else {
          row.push('-');
        }
      }
      return row;
    });
    autoTable(doc, {
      startY: y,
      head: [sHeaders],
      body: sRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2, textColor: BRAND.dark },
      headStyles: { fillColor: BRAND.gold, textColor: BRAND.dark, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══ FOTOS ANTES E DEPOIS ═══
  const hasPhotos = photosGrouped.some(g => g.photos.length > 0);
  if (hasPhotos) {
    doc.addPage();
    y = 15;
    sectionTitle('Fotos - Antes e Depois');

    // Find posture scans for face blur keypoints
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
            
            // Label
            doc.setFontSize(7);
            doc.setTextColor(...BRAND.gray);
            doc.text(photo.tipo || 'Foto', x + colW / 2, photoY + imgH + 3, { align: 'center' });
            
            photoY += imgH + 7;
          } catch { /* skip */ }
        }
      }
      y = y + 90; // approximate jump
    }
  }

  // ═══ AVALIAÇÃO POSTURAL ═══
  const hasPosture = postureGrouped.some(g => g.posture || g.scan);
  if (hasPosture) {
    doc.addPage();
    y = 15;
    sectionTitle('Avaliação Postural - Comparação');

    // Posture scan photos side by side
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
        // Collect all deviation keys across assessments
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
