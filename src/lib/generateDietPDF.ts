import jsPDF from 'jspdf';
import { parseSections, type ParsedMeal } from '@/lib/dietResultParser';
import logo from '@/assets/logo_marombiew.png';

// Dark theme colors matching app identity
const BG_DARK = [15, 17, 21];       // #0F1115
const CARD_BG = [23, 26, 33];       // #171A21
const YELLOW = [255, 196, 0];       // #FFC400
const WHITE = [255, 255, 255];
const MUTED = [140, 140, 160];
const CARD_HEADER = [30, 34, 44];
const ROW_ALT = [19, 22, 28];

export const generateDietPDF = (markdown: string, studentName: string) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 0;

  const checkPage = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage();
      drawPageBg();
      y = 15;
    }
  };

  const drawPageBg = () => {
    doc.setFillColor(BG_DARK[0], BG_DARK[1], BG_DARK[2]);
    doc.rect(0, 0, pageW, pageH, 'F');
  };

  const drawRoundedRect = (x: number, yPos: number, w: number, h: number, r: number, fill: number[]) => {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.roundedRect(x, yPos, w, h, r, r, 'F');
  };

  // === PAGE BG ===
  drawPageBg();

  // === HEADER ===
  drawRoundedRect(0, 0, pageW, 48, 0, CARD_HEADER);

  // Logo
  try {
    doc.addImage(logo, 'PNG', margin, 8, 14, 14);
  } catch { /* logo not available */ }

  // Title
  doc.setTextColor(YELLOW[0], YELLOW[1], YELLOW[2]);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Plano Alimentar', margin + 18, 16);

  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(studentName, margin + 18, 26);

  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), margin + 18, 34);

  // Yellow accent line
  doc.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
  doc.rect(0, 47, pageW, 1, 'F');

  y = 56;

  const sections = parseSections(markdown);

  for (const section of sections) {
    if (section.type === 'meal' && section.meals) {
      for (const meal of section.meals) {
        renderMealCard(doc, meal, margin, contentW, pageH);
      }
    }
    // Skip all other sections (summary, tip, text, table, message)
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Yellow line above footer
    doc.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    doc.rect(0, pageH - 12, pageW, 0.5, 'F');
    doc.setFontSize(7);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${totalPages}`, pageW / 2, pageH - 6, { align: 'center' });
    doc.setTextColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    doc.text('MarombiEW', pageW - margin, pageH - 6, { align: 'right' });
  }

  doc.save(`Dieta_${studentName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);

  function renderMealCard(doc: jsPDF, meal: ParsedMeal, margin: number, contentW: number, _pageH: number) {
    const hasSubs = meal.foods.some(f => f.sub);
    const headerH = 10;
    const rowH = 6;
    const footerH = 8;
    const tableHeaderH = 7;
    const totalH = headerH + tableHeaderH + meal.foods.length * rowH + footerH + 8;
    checkPage(totalH);

    // Card background
    drawRoundedRect(margin, y, contentW, totalH, 3, CARD_BG);

    // Meal header with yellow accent
    drawRoundedRect(margin, y, contentW, headerH, 3, CARD_HEADER);
    doc.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    doc.rect(margin, y, 2.5, headerH, 'F');

    doc.setTextColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(meal.name, margin + 6, y + 7);
    if (meal.time) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(meal.time, margin + contentW - 5, y + 7, { align: 'right' });
    }
    y += headerH + 2;

    // Table columns
    const cols = hasSubs
      ? ['Alimento', 'Porção', 'Kcal', 'P', 'C', 'G', 'Substituição']
      : ['Alimento', 'Porção', 'Kcal', 'P(g)', 'C(g)', 'G(g)'];

    const colWidths = hasSubs
      ? [contentW * 0.22, contentW * 0.12, contentW * 0.09, contentW * 0.09, contentW * 0.09, contentW * 0.09, contentW * 0.30]
      : [contentW * 0.32, contentW * 0.16, contentW * 0.13, contentW * 0.13, contentW * 0.13, contentW * 0.13];

    // Table header
    doc.setFillColor(ROW_ALT[0], ROW_ALT[1], ROW_ALT[2]);
    doc.rect(margin + 2, y, contentW - 4, tableHeaderH, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    let colX = margin + 4;
    cols.forEach((col, i) => {
      doc.text(col, colX, y + 5);
      colX += colWidths[i];
    });
    y += tableHeaderH;

    // Table rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    meal.foods.forEach((food, fi) => {
      // Alternate row bg
      if (fi % 2 === 1) {
        doc.setFillColor(ROW_ALT[0], ROW_ALT[1], ROW_ALT[2]);
        doc.rect(margin + 2, y, contentW - 4, rowH, 'F');
      }

      const values = hasSubs
        ? [food.food, food.qty || '—', food.kcal || '—', food.p || '—', food.c || '—', food.g || '—', food.sub || '—']
        : [food.food, food.qty || '—', food.kcal || '—', food.p || '—', food.c || '—', food.g || '—'];

      colX = margin + 4;
      doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
      values.forEach((val, i) => {
        const isSubCol = hasSubs && i === values.length - 1;
        if (isSubCol) {
          doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
          doc.setFont('helvetica', 'italic');
        }
        const txt = doc.splitTextToSize(val, colWidths[i] - 2)[0] || '—';
        doc.text(txt, colX, y + 4);
        if (isSubCol) {
          doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
          doc.setFont('helvetica', 'normal');
        }
        colX += colWidths[i];
      });
      y += rowH;
    });

    // Footer totals
    y += 1;
    drawRoundedRect(margin + 2, y, contentW - 4, footerH, 2, CARD_HEADER);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    doc.text('Total:', margin + 6, y + 5.5);
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    const totals = `${meal.totalKcal || '—'}  |  P: ${meal.totalP || '—'}  |  C: ${meal.totalC || '—'}  |  G: ${meal.totalG || '—'}`;
    doc.text(totals, margin + 22, y + 5.5);
    y += footerH + 6;
  }
};
