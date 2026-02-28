import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo_marombiew.png';

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

const classifyIMC = (imc: number) => {
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Peso normal';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidade I';
  if (imc < 40) return 'Obesidade II';
  return 'Obesidade III';
};

const classifyRCQ = (rcq: number) => {
  if (rcq < 0.80) return 'Baixo risco';
  if (rcq < 0.86) return 'Risco moderado';
  if (rcq < 0.95) return 'Risco alto';
  return 'Risco muito alto';
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Render photo with grid + pose overlay onto a canvas and return as data URL */
const renderOverlayPhoto = async (
  photoUrl: string,
  allKeypoints: any,
  position: 'front' | 'side' | 'back',
  regionScores: any[]
): Promise<HTMLCanvasElement | null> => {
  try {
    const img = await loadImage(photoUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    
    // Draw base photo
    ctx.drawImage(img, 0, 0);
    
    const w = canvas.width;
    const h = canvas.height;
    
    // Draw grid (24x32)
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
    // Center lines
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    
    // Draw pose overlay if keypoints available
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
  }
};

const hasValue = (v: any) => v != null && v !== '' && v !== 0;
const fmt = (v: any, unit = '') => (hasValue(v) ? `${v}${unit}` : null);

/** Filter rows that have non-null values */
const filterRows = (rows: [string, string | null][]): [string, string][] =>
  rows.filter(([, v]) => v !== null) as [string, string][];

export const generatePDF = async (data: ReportData) => {
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
    doc.text('Relatório de Avaliação Física', margin + logoSize + 6, y + 22);
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
  doc.text(profile?.nome || 'Aluno', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND.gray);
  if (assessment) {
    doc.text(`Data da avaliação: ${new Date(assessment.created_at).toLocaleDateString('pt-BR')}`, margin, y);
  }
  if (profile?.email) {
    doc.text(profile.email, pageW - margin, y, { align: 'right' });
  }
  y += 10;

  // ══════════════════════════════════════════════
  // RESUMO (only filled values)
  // ══════════════════════════════════════════════
  const pesoIdeal = anthro?.altura ? (22 * Math.pow(anthro.altura / 100, 2)).toFixed(1) : null;
  const summaryRows = filterRows([
    ['Peso', fmt(anthro?.peso, ' kg')],
    ['Peso Ideal (IMC 22)', pesoIdeal ? `${pesoIdeal} kg` : null],
    ['Altura', fmt(anthro?.altura, ' cm')],
    ['IMC', anthro?.imc ? `${anthro.imc} — ${classifyIMC(anthro.imc)}` : null],
    ['% Gordura', fmt(comp?.percentual_gordura, '%')],
    ['Massa Magra', fmt(comp?.massa_magra, ' kg')],
    ['Massa Gorda', fmt(comp?.massa_gorda, ' kg')],
    ['Cintura', fmt(anthro?.cintura, ' cm')],
    ['Quadril', fmt(anthro?.quadril, ' cm')],
    ['RCQ', anthro?.rcq ? `${anthro.rcq} — ${classifyRCQ(anthro.rcq)}` : null],
  ]);
  if (summaryRows.length > 0) {
    sectionTitle('Resumo');
    kvTable(summaryRows);
  }

  // ══════════════════════════════════════════════
  // MEDIDAS CORPORAIS (only filled)
  // ══════════════════════════════════════════════
  const medidasRows = filterRows([
    ['Pescoço', fmt(anthro?.pescoco, ' cm')],
    ['Tórax', fmt(anthro?.torax, ' cm')],
    ['Ombro', fmt(anthro?.ombro, ' cm')],
    ['Abdômen', fmt(anthro?.abdomen, ' cm')],
    ['Braço Direito', fmt(anthro?.braco_direito, ' cm')],
    ['Braço Esquerdo', fmt(anthro?.braco_esquerdo, ' cm')],
    ['Bíceps Contraído Dir.', fmt(anthro?.biceps_contraido_direito, ' cm')],
    ['Bíceps Contraído Esq.', fmt(anthro?.biceps_contraido_esquerdo, ' cm')],
    ['Antebraço Direito', fmt(anthro?.antebraco, ' cm')],
    ['Antebraço Esquerdo', fmt(anthro?.antebraco_esquerdo, ' cm')],
    ['Coxa Direita', fmt(anthro?.coxa_direita, ' cm')],
    ['Coxa Esquerda', fmt(anthro?.coxa_esquerda, ' cm')],
    ['Panturrilha Direita', fmt(anthro?.panturrilha_direita, ' cm')],
    ['Panturrilha Esquerda', fmt(anthro?.panturrilha_esquerda, ' cm')],
  ]);
  if (medidasRows.length > 0) {
    sectionTitle('Medidas Corporais');
    kvTable(medidasRows);
  }

  // ══════════════════════════════════════════════
  // COMPOSIÇÃO CORPORAL (only if data exists) + PIE CHART
  // ══════════════════════════════════════════════
  if (comp && (hasValue(comp.percentual_gordura) || hasValue(comp.massa_magra) || hasValue(comp.massa_gorda))) {
    const sexo = studentProfile?.sexo;
    const idealFat = sexo === 'feminino' ? 20 : 15;
    const idealFatWeight = anthro?.peso ? (anthro.peso * idealFat / 100).toFixed(1) : null;
    const compRows = filterRows([
      ['% Gordura', fmt(comp.percentual_gordura, '%')],
      ['% Gordura Ideal', `${idealFat}% (${sexo === 'feminino' ? 'feminino' : 'masculino'})`],
      ['Massa Magra', fmt(comp.massa_magra, ' kg')],
      ['Massa Gorda', fmt(comp.massa_gorda, ' kg')],
      ['Peso de Gordura Ideal', idealFatWeight ? `${idealFatWeight} kg` : null],
    ]);
    sectionTitle('Composição Corporal');
    kvTable(compRows);

    // Pie chart for body composition
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

      // Add total weight and lean mass text above chart
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND.dark);
      doc.text(`Peso Total: ${total.toFixed(1)} kg`, margin, y);
      doc.text(`Massa Magra: ${comp.massa_magra.toFixed(1)} kg`, pageW / 2, y, { align: 'center' });
      doc.text(`Massa Gorda: ${comp.massa_gorda.toFixed(1)} kg`, pageW - margin, y, { align: 'right' });
      y += 6;

      const slices = [
        { value: comp.massa_magra, color: '#22c55e', label: `Massa Magra ${comp.massa_magra.toFixed(1)} kg` },
        { value: comp.massa_gorda, color: '#ef4444', label: `Massa Gorda ${comp.massa_gorda.toFixed(1)} kg` },
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
  // DOBRAS CUTÂNEAS (only if any filled)
  // ══════════════════════════════════════════════
  const dobrasRows = filterRows([
    ['Tríceps', fmt(skinfolds?.triceps, ' mm')],
    ['Subescapular', fmt(skinfolds?.subescapular, ' mm')],
    ['Suprailíaca', fmt(skinfolds?.suprailiaca, ' mm')],
    ['Abdominal', fmt(skinfolds?.abdominal, ' mm')],
    ['Peitoral', fmt(skinfolds?.peitoral, ' mm')],
    ['Axilar Média', fmt(skinfolds?.axilar_media, ' mm')],
    ['Coxa', fmt(skinfolds?.coxa, ' mm')],
  ]);
  if (dobrasRows.length > 0) {
    sectionTitle('Dobras Cutâneas');
    if (skinfolds?.metodo) {
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.gray);
      doc.text(`Método: ${skinfolds.metodo.replace(/_/g, ' ')}`, margin, y - 4);
    }
    kvTable(dobrasRows);
  }

  // ══════════════════════════════════════════════
  // SINAIS VITAIS (only if any filled)
  // ══════════════════════════════════════════════
  if (vitals) {
    const vitaisRows = filterRows([
      ['Pressão Arterial', fmt(vitals.pressao)],
      ['FC Repouso', fmt(vitals.fc_repouso, ' bpm')],
      ['SpO2', fmt(vitals.spo2, '%')],
      ['Glicemia', fmt(vitals.glicemia, ' mg/dL')],
      ['Observações', vitals.observacoes || null],
    ]);
    if (vitaisRows.length > 0) {
      sectionTitle('Sinais Vitais');
      kvTable(vitaisRows);
    }
  }

  // ══════════════════════════════════════════════
  // ZONAS DE FREQUÊNCIA CARDÍACA (KARVONEN)
  // ══════════════════════════════════════════════
  if (hrZones) {
    sectionTitle('Zonas de Frequência Cardíaca (Karvonen)');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.gray);
    const formulaLabel = hrZones.fcmax_formula === 'tanaka' ? 'Tanaka (208 - 0,7 x idade)' : '220 - idade';
    doc.text(`FC Máx estimada: ${hrZones.fcmax_estimada} bpm (${formulaLabel})  |  FC Repouso: ${hrZones.fc_repouso} bpm  |  Reserva (HRR): ${hrZones.hrr} bpm`, margin, y);
    y += 2;
    doc.setFontSize(7);
    doc.text('* FC Máx é uma estimativa e pode variar por pessoa.', margin, y);
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
      head: [['Zona de Frequência', 'Intervalo (bpm)', 'Descrição']],
      body: zoneRows,
      theme: 'grid',
      headStyles: { fillColor: BRAND.gold, textColor: BRAND.dark, fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: BRAND.dark },
      alternateRowStyles: { fillColor: BRAND.light },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else if (studentProfile?.data_nascimento && vitals?.fc_repouso) {
    // Fallback: calculate on the fly if no saved zones
    const age = Math.floor((Date.now() - new Date(studentProfile.data_nascimento).getTime()) / (365.25 * 24 * 3600 * 1000));
    const fcMax = Math.round(208 - 0.7 * age);
    const hrr = fcMax - vitals.fc_repouso;

    sectionTitle('Zonas de Frequência Cardíaca (Karvonen)');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.gray);
    doc.text(`FC Máx estimada: ${fcMax} bpm (Tanaka)  |  FC Repouso: ${vitals.fc_repouso} bpm  |  Reserva (HRR): ${hrr} bpm`, margin, y);
    y += 5;

    const zoneDefs = [
      { zona: 'Z1', label: 'Recuperação', lo: 0.50, hi: 0.60, desc: 'Aquecimento, recuperação ativa' },
      { zona: 'Z2', label: 'Base', lo: 0.60, hi: 0.70, desc: 'Exercício leve, oxidação lipídica' },
      { zona: 'Z3', label: 'Moderada', lo: 0.70, hi: 0.80, desc: 'Resistência cardiovascular' },
      { zona: 'Z4', label: 'Forte', lo: 0.80, hi: 0.90, desc: 'Alta intensidade, VO2max' },
      { zona: 'Z5', label: 'Máxima', lo: 0.90, hi: 1.00, desc: 'Esforço máximo, sprints' },
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
      head: [['Zona de Frequência', 'Intervalo (bpm)', 'Descrição']],
      body: zoneRows,
      theme: 'grid',
      headStyles: { fillColor: BRAND.gold, textColor: BRAND.dark, fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: BRAND.dark },
      alternateRowStyles: { fillColor: BRAND.light },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ══════════════════════════════════════════════
  // CONSUMO DE ÁGUA RECOMENDADO
  // ══════════════════════════════════════════════
  if (anthro?.peso) {
    sectionTitle('Hidratação Recomendada');
    const waterMl = Math.round(anthro.peso * 50);
    const waterL = (waterMl / 1000).toFixed(1);
    const waterRows: [string, string][] = [
      ['Peso corporal', `${anthro.peso} kg`],
      ['Fórmula', '50 ml por kg de peso corporal'],
      ['Consumo diário recomendado', `${waterL} litros (${waterMl} ml)`],
      ['Em dias de treino', `${(waterMl * 1.3 / 1000).toFixed(1)} – ${(waterMl * 1.5 / 1000).toFixed(1)} litros`],
    ];
    kvTable(waterRows);
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.gray);
    doc.text('* Em dias de treino intenso, aumente o consumo em 30–50%. Distribua ao longo do dia.', margin, y);
    y += 6;
  }

  // ══════════════════════════════════════════════
  // TESTES FÍSICOS (only if any filled)
  // ══════════════════════════════════════════════
  if (perf) {
    const testRows = filterRows([
      ['Flexões', fmt(perf.pushup, ' rep')],
      ['Prancha', fmt(perf.plank, ' seg')],
      ['Cooper 12min', fmt(perf.cooper_12min, ' m')],
      ['Salto Vertical', fmt(perf.salto_vertical, ' cm')],
      ['Agachamento Score', fmt(perf.agachamento_score, '/5')],
      ['Mobilidade Ombro', fmt(perf.mobilidade_ombro)],
      ['Mobilidade Quadril', fmt(perf.mobilidade_quadril)],
      ['Mobilidade Tornozelo', fmt(perf.mobilidade_tornozelo)],
      ['Observações', perf.observacoes || null],
    ]);
    if (testRows.length > 0) {
      sectionTitle('Testes Físicos');
      kvTable(testRows);
    }
  }

  // ══════════════════════════════════════════════
  // ANAMNESE (only if any filled)
  // ══════════════════════════════════════════════
  if (anamnese) {
    const anamRows = filterRows([
      ['Sono', fmt(anamnese.sono)],
      ['Stress', fmt(anamnese.stress)],
      ['Rotina', fmt(anamnese.rotina)],
      ['Treino Atual', fmt(anamnese.treino_atual)],
      ['Medicação', fmt(anamnese.medicacao)],
      ['Suplementos', fmt(anamnese.suplementos)],
      ['Histórico de Saúde', fmt(anamnese.historico_saude)],
      ['Dores', fmt(anamnese.dores)],
      ['Cirurgias', fmt(anamnese.cirurgias)],
      ['Tabagismo', anamnese.tabagismo === true ? 'Sim' : anamnese.tabagismo === false ? 'Não' : null],
      ['Álcool', fmt(anamnese.alcool)],
    ]);
    if (anamRows.length > 0) {
      sectionTitle('Anamnese');
      kvTable(anamRows);
    }
  }

  // ══════════════════════════════════════════════
  // ANÁLISE POSTURAL (photos + summary)
  // ══════════════════════════════════════════════
  if (postureScan) {
    const hasPhotos = postureScan.front_photo_url || postureScan.side_photo_url || postureScan.back_photo_url;
    const regionScores = (postureScan.region_scores_json as any[]) || [];
    const attentionPoints = (postureScan.attention_points_json as any[]) || [];
    const angles = postureScan.angles_json as any;
    const poseKeypoints = postureScan.pose_keypoints_json as any;

    if (hasPhotos || regionScores.length > 0 || attentionPoints.length > 0) {
      // Start on new page for posture section
      doc.addPage();
      y = margin;

      sectionTitle('Análise Postural');

      doc.setFontSize(8);
      doc.setTextColor(...BRAND.gray);
      doc.text(`Data: ${new Date(postureScan.created_at).toLocaleDateString('pt-BR')}`, margin, y);
      y += 6;

      // Photos
      if (hasPhotos) {
        const photoEntries: { url: string; label: string; position: 'front' | 'side' | 'back' }[] = [];
        if (postureScan.front_photo_url) photoEntries.push({ url: postureScan.front_photo_url, label: 'Frente', position: 'front' });
        if (postureScan.side_photo_url) photoEntries.push({ url: postureScan.side_photo_url, label: 'Lado', position: 'side' });
        if (postureScan.back_photo_url) photoEntries.push({ url: postureScan.back_photo_url, label: 'Costas', position: 'back' });

        // Pre-load all images/canvases to get real dimensions
        const loadedPhotos: { canvas: HTMLCanvasElement | null; img: HTMLImageElement | null; label: string; ratio: number }[] = [];
        for (const entry of photoEntries) {
          try {
            const overlayCanvas = await renderOverlayPhoto(entry.url, poseKeypoints, entry.position, regionScores);
            if (overlayCanvas) {
              loadedPhotos.push({ canvas: overlayCanvas, img: null, label: entry.label, ratio: overlayCanvas.height / overlayCanvas.width });
            } else {
              const img = await loadImage(entry.url);
              loadedPhotos.push({ canvas: null, img, label: entry.label, ratio: img.naturalHeight / img.naturalWidth });
            }
          } catch {
            // Skip
          }
        }

        if (loadedPhotos.length > 0) {
          const maxPhotoWidth = loadedPhotos.length === 1 ? 80 : loadedPhotos.length === 2 ? 65 : 55;
          const gap = 5;
          const maxAvailHeight = pageH - y - 30;

          // Calculate individual photo widths and heights preserving aspect ratio
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
            const imgY = y + (maxH - ph) / 2; // center vertically
            if (photo.canvas) {
              doc.addImage(photo.canvas.toDataURL('image/jpeg', 0.92), 'JPEG', curX, imgY, pw, ph);
            } else if (photo.img) {
              doc.addImage(photo.img, 'JPEG', curX, imgY, pw, ph);
            }
            doc.setFontSize(7);
            doc.setTextColor(...BRAND.gray);
            doc.text(photo.label, curX + pw / 2, y + maxH + 4, { align: 'center' });
            curX += pw + gap;
          }
          y += maxH + 10;
        }
      }

      // Region Scores — Resumo Postural
      if (regionScores.length > 0) {
        checkPage(20);
        y += 4;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.dark);
        doc.text('Resumo Postural', margin, y);
        y += 6;

        const statusLabelPdf = (s: string) => s === 'risk' ? 'Risco' : s === 'attention' ? 'Atenção' : 'OK';
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
          ['Inclinação Ombros', getVal('shoulder_tilt')],
          ['Protrusão Ombros', getVal('shoulder_protusion')],
          ['Inclinação Pélvica', getVal('pelvic_tilt')],
          ['Inclinação Tronco', getVal('trunk_lateral')],
          ['Cabeça Anteriorizada', (() => { const v = manualFlags.head_forward ? overrides.head_forward : angles.head_forward; return v != null ? `${v}` : null; })()],
          ['Cifose Torácica', getVal('kyphosis_angle')],
          ['Lordose Lombar', getVal('lordosis_angle')],
          ['Escoliose (Desvio Lateral)', getVal('scoliosis_angle')],
          ['Valgo/Varo Joelho Esq.', getVal('knee_valgus_left')],
          ['Valgo/Varo Joelho Dir.', getVal('knee_valgus_right')],
          ['Alinhamento Joelho Esq.', getVal('knee_alignment_left')],
          ['Alinhamento Joelho Dir.', getVal('knee_alignment_right')],
        ];
        const filteredAngles = filterRows(angleEntries);
        if (filteredAngles.length > 0) {
          checkPage(15);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...BRAND.dark);
          doc.text('Métricas e Ângulos', margin, y);
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
        doc.text('Condições Posturais Detalhadas', margin, y);
        y += 6;

        for (const cond of significantConditions) {
          checkPage(25);
          // Condition header
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...BRAND.dark);
          const severityText = cond.severity === 'grave' ? '[!] GRAVE' : cond.severity === 'moderada' ? '[!] MODERADA' : '[i] LEVE';
          const severityColor: [number, number, number] = cond.severity === 'grave' ? [239, 68, 68] : cond.severity === 'moderada' ? [245, 158, 11] : [34, 197, 94];
          doc.setTextColor(...severityColor);
          const headerText = `${cond.label} — ${severityText}${cond.angle != null ? ` (${cond.angle})` : ''}`;
          doc.text(headerText, margin + 2, y);
          y += 5;
          // Description
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
        doc.text('Pontos de Atenção', margin, y);
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
        doc.text('Notas do Avaliador', margin, y);
        y += 6;
        addWrappedText(postureScan.notes);
      }
    }
  }

  // ══════════════════════════════════════════════
  // NOTAS GERAIS
  // ══════════════════════════════════════════════
  if (assessment?.notas_gerais) {
    sectionTitle('Notas Gerais');
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
    doc.text('Marombiew Fitness Application — Documento gerado automaticamente', margin, ph - 10);
    doc.text(`Página ${i} de ${totalPages}`, pageW - margin, ph - 10, { align: 'right' });
  }

  // ══════════════════════════════════════════════
  // SAVE (iOS PWA compatible)
  // ══════════════════════════════════════════════
  const nome = (profile?.nome || 'aluno').replace(/\s+/g, '_').toLowerCase();
  const dateStr = assessment ? new Date(assessment.created_at).toISOString().split('T')[0] : 'report';
  const filename = `avaliacao_${nome}_${dateStr}.pdf`;

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
