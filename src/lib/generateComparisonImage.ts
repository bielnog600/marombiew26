import logoUrl from '@/assets/logo_marombiew.png';

const BRAND = {
  gold: '#eab308',
  dark: '#1e1e1e',
  gray: '#888888',
  lightBg: '#fafaf8',
  white: '#ffffff',
};

const CHART_COLORS = ['#eab308', '#3ba5dc', '#48b461', '#a864dc', '#f07832'];

const SIZE = 1080;
const PAD = 50;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

interface ComparisonImageData {
  dateLabels: string[];
  compositionChartData: any[];
  measurementChartData: any[];
  skinfoldChartData: any[];
}

// ── Canvas chart helpers ──

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawLineChartCanvas(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  title: string,
  labels: string[],
  series: { name: string; values: (number | null)[]; color: string }[],
) {
  const padL = 55; const padR = 15; const padT = 45; const padB = 50;
  const chartX = x + padL;
  const chartY = y + padT;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // Background
  drawRoundedRect(ctx, x, y, w, h, 12, BRAND.lightBg);

  // Title
  ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
  ctx.fillStyle = BRAND.dark;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 15, y + 30);

  // Compute range
  let allVals: number[] = [];
  series.forEach(s => s.values.forEach(v => { if (v != null) allVals.push(v); }));
  if (allVals.length === 0) return;
  let minVal = Math.min(...allVals);
  let maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;
  minVal -= range * 0.1;
  maxVal += range * 0.1;
  const finalRange = maxVal - minVal;

  // Grid
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.font = '16px Helvetica, Arial, sans-serif';
  ctx.fillStyle = BRAND.gray;
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + chartH - (chartH * i / 4);
    ctx.beginPath(); ctx.moveTo(chartX, gy); ctx.lineTo(chartX + chartW, gy); ctx.stroke();
    const val = minVal + (finalRange * i / 4);
    ctx.fillText(val.toFixed(1), chartX - 8, gy + 5);
  }

  // X labels
  const step = labels.length > 1 ? chartW / (labels.length - 1) : 0;
  ctx.font = '16px Helvetica, Arial, sans-serif';
  ctx.fillStyle = BRAND.gray;
  ctx.textAlign = 'center';
  labels.forEach((l, i) => {
    ctx.fillText(l, chartX + i * step, chartY + chartH + 22);
  });

  // Lines
  series.forEach(s => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    let started = false;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      if (v == null) { started = false; return; }
      const px = chartX + i * step;
      const py = chartY + chartH - ((v - minVal) / finalRange) * chartH;
      if (!started) { ctx.moveTo(px, py); started = true; } else { ctx.lineTo(px, py); }
    });
    ctx.stroke();

    // Dots + values
    s.values.forEach((v, i) => {
      if (v == null) return;
      const px = chartX + i * step;
      const py = chartY + chartH - ((v - minVal) / finalRange) * chartH;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.font = 'bold 14px Helvetica, Arial, sans-serif';
      ctx.fillStyle = s.color;
      ctx.textAlign = 'center';
      ctx.fillText(v.toFixed(1), px, py - 12);
    });
  });

  // Legend
  let legX = chartX;
  const legY = y + h - 12;
  ctx.font = '15px Helvetica, Arial, sans-serif';
  series.forEach(s => {
    ctx.fillStyle = s.color;
    ctx.fillRect(legX, legY - 10, 14, 10);
    ctx.fillStyle = BRAND.dark;
    ctx.textAlign = 'left';
    ctx.fillText(s.name, legX + 18, legY);
    legX += ctx.measureText(s.name).width + 35;
  });
}

function drawBarChartCanvas(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  title: string,
  categories: string[],
  seriesNames: string[],
  data: { [cat: string]: { [series: string]: number | null } },
  colors: string[],
) {
  const padL = 55; const padR = 15; const padT = 45; const padB = 55;
  const chartX = x + padL;
  const chartY = y + padT;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  drawRoundedRect(ctx, x, y, w, h, 12, BRAND.lightBg);

  ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
  ctx.fillStyle = BRAND.dark;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 15, y + 30);

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
  ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1;
  ctx.font = '14px Helvetica, Arial, sans-serif'; ctx.fillStyle = BRAND.gray; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + chartH - (chartH * i / 4);
    ctx.beginPath(); ctx.moveTo(chartX, gy); ctx.lineTo(chartX + chartW, gy); ctx.stroke();
    ctx.fillText((maxVal * i / 4).toFixed(1), chartX - 8, gy + 5);
  }

  const groupW = chartW / categories.length;
  const barW = Math.min((groupW - 10) / seriesNames.length, 30);

  categories.forEach((cat, ci) => {
    const groupX = chartX + ci * groupW;
    ctx.font = '12px Helvetica, Arial, sans-serif'; ctx.fillStyle = BRAND.gray; ctx.textAlign = 'center';
    // truncate long category names
    const maxLabelW = groupW - 4;
    let label = cat;
    while (ctx.measureText(label).width > maxLabelW && label.length > 3) label = label.slice(0, -1);
    if (label !== cat) label += '…';
    ctx.fillText(label, groupX + groupW / 2, chartY + chartH + 18);

    seriesNames.forEach((sn, si) => {
      const v = data[cat]?.[sn];
      if (v == null || v === 0) return;
      const barH = (v / maxVal) * chartH;
      const bx = groupX + (groupW - barW * seriesNames.length) / 2 + si * barW;
      const by = chartY + chartH - barH;
      ctx.fillStyle = colors[si % colors.length];
      ctx.fillRect(bx, by, barW - 2, barH);
      ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(v.toFixed(1), bx + (barW - 2) / 2, by - 5);
    });
  });

  // Legend
  let legX = chartX;
  const legY = y + h - 10;
  ctx.font = '15px Helvetica, Arial, sans-serif';
  seriesNames.forEach((sn, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(legX, legY - 10, 14, 10);
    ctx.fillStyle = BRAND.dark; ctx.textAlign = 'left';
    ctx.fillText(sn, legX + 18, legY);
    legX += ctx.measureText(sn).width + 35;
  });
}

export async function generateComparisonImage(data: ComparisonImageData): Promise<void> {
  const { dateLabels, compositionChartData, measurementChartData, skinfoldChartData } = data;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = BRAND.dark;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ── Header with logo + dates ──
  const headerH = 90;
  try {
    const logo = await loadImage(logoUrl);
    const logoH = 55;
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, PAD, 18, logoW, logoH);

    // Dates on the right
    ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
    ctx.fillStyle = BRAND.gold;
    ctx.textAlign = 'right';
    ctx.fillText('Comparação de Avaliações', SIZE - PAD, 38);
    ctx.font = '18px Helvetica, Arial, sans-serif';
    ctx.fillStyle = BRAND.white;
    ctx.fillText(dateLabels.join('  vs  '), SIZE - PAD, 62);
  } catch {
    ctx.font = 'bold 24px Helvetica, Arial, sans-serif';
    ctx.fillStyle = BRAND.gold;
    ctx.textAlign = 'left';
    ctx.fillText('Comparação de Avaliações', PAD, 45);
    ctx.font = '18px Helvetica, Arial, sans-serif';
    ctx.fillStyle = BRAND.white;
    ctx.fillText(dateLabels.join('  vs  '), PAD, 70);
  }

  const contentW = SIZE - PAD * 2;
  let curY = headerH + 10;

  // ── Chart 1: Composição Corporal ──
  const compSeriesKeys = ['% Gordura', 'Massa Gorda (kg)', 'Massa Magra (kg)', 'IMC'];
  const compSeries = compSeriesKeys.map((key, i) => ({
    name: key,
    values: compositionChartData.map((d: any) => d[key] ?? null),
    color: CHART_COLORS[i % CHART_COLORS.length],
  })).filter(s => s.values.some((v: any) => v != null));

  const chartH = 280;

  if (compSeries.length > 0) {
    drawLineChartCanvas(ctx, PAD, curY, contentW, chartH, 'Composição Corporal', dateLabels, compSeries);
    curY += chartH + 15;
  }

  // ── Chart 2: Medidas ──
  const measureKeys = ['Peso (kg)', 'Cintura (cm)', 'Braço D (cm)', 'Coxa D (cm)', 'Tórax (cm)'];
  const measureSeries = measureKeys.map((key, i) => ({
    name: key,
    values: measurementChartData.map((d: any) => d[key] ?? null),
    color: CHART_COLORS[i % CHART_COLORS.length],
  })).filter(s => s.values.some((v: any) => v != null));

  const remainingH = SIZE - curY - PAD;

  if (measureSeries.length > 0) {
    // Check if we have skinfolds too
    const hasSkinfolds = skinfoldChartData.some((d: any) => dateLabels.some(l => d[l] != null));
    if (hasSkinfolds) {
      // Split remaining space
      const halfH = Math.floor((remainingH - 15) / 2);
      drawLineChartCanvas(ctx, PAD, curY, contentW, halfH, 'Medidas Antropométricas', dateLabels, measureSeries);
      curY += halfH + 15;

      // Bar chart for skinfolds
      const categories = skinfoldChartData.map((d: any) => d.dobra as string);
      const barData: { [cat: string]: { [series: string]: number | null } } = {};
      categories.forEach((cat: string, ci: number) => {
        barData[cat] = {};
        dateLabels.forEach(l => { barData[cat][l] = skinfoldChartData[ci][l] ?? null; });
      });
      drawBarChartCanvas(ctx, PAD, curY, contentW, halfH, 'Dobras Cutâneas (mm)', categories, dateLabels, barData, CHART_COLORS.slice(0, dateLabels.length));
    } else {
      drawLineChartCanvas(ctx, PAD, curY, contentW, remainingH, 'Medidas Antropométricas', dateLabels, measureSeries);
    }
  }

  // ── Footer watermark ──
  ctx.font = '13px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#555555';
  ctx.textAlign = 'center';
  ctx.fillText('Gerado por Marombiew', SIZE / 2, SIZE - 15);

  // ── Download ──
  const link = document.createElement('a');
  link.download = `comparacao_${dateLabels.join('_vs_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
