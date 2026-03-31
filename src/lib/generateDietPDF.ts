import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseSections, type ParsedMeal, type ParsedSection } from '@/lib/dietResultParser';

const PRIMARY = [41, 98, 255];
const DARK = [30, 30, 40];
const MUTED = [120, 120, 140];
const WHITE = [255, 255, 255];
const LIGHT_BG = [245, 246, 250];
const ACCENT_BG = [235, 240, 255];

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
      y = 15;
    }
  };

  const drawRoundedRect = (x: number, yPos: number, w: number, h: number, r: number, fill: number[]) => {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.roundedRect(x, yPos, w, h, r, r, 'F');
  };

  // === HEADER ===
  drawRoundedRect(0, 0, pageW, 45, 0, PRIMARY);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Plano Alimentar', margin, 20);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(studentName, margin, 30);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), margin, 38);
  y = 55;

  const sections = parseSections(markdown);

  for (const section of sections) {
    if (section.type === 'meal' && section.meals) {
      for (const meal of section.meals) {
        renderMealCard(doc, meal, margin, contentW, pageH);
      }
      continue;
    }

    if (section.type === 'summary') {
      renderSummaryTable(doc, section, margin, contentW, pageH);
      continue;
    }

    if (section.type === 'tip') {
      checkPage(25);
      const tipText = section.content.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();
      drawRoundedRect(margin, y, contentW, 1, 0.5, PRIMARY);
      y += 4;
      doc.setFontSize(8);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.setFont('helvetica', 'italic');
      const tipLines = doc.splitTextToSize(`💡 ${tipText}`, contentW - 4);
      doc.text(tipLines, margin + 2, y + 3);
      y += tipLines.length * 3.5 + 6;
      continue;
    }

    if (section.type === 'text' && section.content.trim()) {
      const trimmed = section.content.trim();
      if (trimmed.startsWith('#')) {
        checkPage(12);
        const title = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '');
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        doc.text(title, margin, y);
        y += 8;
      } else if (trimmed.length > 10) {
        checkPage(10);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        const lines = doc.splitTextToSize(trimmed.replace(/\*\*/g, ''), contentW);
        doc.text(lines, margin, y);
        y += lines.length * 4 + 4;
      }
    }

    if (section.type === 'table') {
      renderGenericTable(doc, section, margin, contentW, pageH);
    }

    if (section.type === 'message') continue; // skip whatsapp messages in PDF
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${totalPages}`, pageW / 2, pageH - 8, { align: 'center' });
    doc.text('Gerado por MarombiEW', pageW - margin, pageH - 8, { align: 'right' });
  }

  doc.save(`Dieta_${studentName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);

  function renderMealCard(doc: jsPDF, meal: ParsedMeal, margin: number, contentW: number, pageH: number) {
    const headerH = 10;
    const rowH = 6;
    const footerH = 8;
    const tableHeaderH = 7;
    const totalH = headerH + tableHeaderH + meal.foods.length * rowH + footerH + 8;
    checkPage(totalH);

    // Card background
    drawRoundedRect(margin, y, contentW, totalH, 3, LIGHT_BG);

    // Meal header
    drawRoundedRect(margin, y, contentW, headerH, 3, PRIMARY);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(meal.name, margin + 5, y + 7);
    if (meal.time) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`⏰ ${meal.time}`, margin + contentW - 5, y + 7, { align: 'right' });
    }
    y += headerH + 2;

    // Table
    const cols = ['Alimento', 'Porção', 'Kcal', 'P(g)', 'C(g)', 'G(g)'];
    const colWidths = [contentW * 0.32, contentW * 0.16, contentW * 0.13, contentW * 0.13, contentW * 0.13, contentW * 0.13];

    // Table header
    doc.setFillColor(ACCENT_BG[0], ACCENT_BG[1], ACCENT_BG[2]);
    doc.rect(margin + 2, y, contentW - 4, tableHeaderH, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);
    let colX = margin + 4;
    cols.forEach((col, i) => {
      doc.text(col, colX, y + 5);
      colX += colWidths[i];
    });
    y += tableHeaderH;

    // Table rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    for (const food of meal.foods) {
      const values = [food.food, food.qty || '—', food.kcal || '—', food.p || '—', food.c || '—', food.g || '—'];
      colX = margin + 4;
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      values.forEach((val, i) => {
        const txt = doc.splitTextToSize(val, colWidths[i] - 2)[0] || '—';
        doc.text(txt, colX, y + 4);
        colX += colWidths[i];
      });
      y += rowH;
    }

    // Footer totals
    y += 1;
    drawRoundedRect(margin + 2, y, contentW - 4, footerH, 2, ACCENT_BG);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    doc.text('Total:', margin + 6, y + 5.5);
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);
    const totals = `${meal.totalKcal || '—'}  |  P: ${meal.totalP || '—'}  |  C: ${meal.totalC || '—'}  |  G: ${meal.totalG || '—'}`;
    doc.text(totals, margin + 22, y + 5.5);
    y += footerH + 6;
  }

  function renderSummaryTable(doc: jsPDF, section: ParsedSection, margin: number, contentW: number, pageH: number) {
    const lines = section.content.split('\n').filter(l => l.trim().startsWith('|'));
    if (lines.length < 2) return;

    const splitRow = (line: string) => line.trim().split('|').slice(1, -1).map(c => c.replace(/\*\*/g, '').trim());
    const headers = splitRow(lines[0]);
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes('---')) continue;
      const cells = splitRow(lines[i]);
      if (cells.length > 0 && cells.some(c => c)) rows.push(cells);
    }

    if (rows.length === 0) return;

    checkPage(20);

    if (section.title) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text(section.title, margin, y);
      y += 6;
    }

    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5,
        textColor: DARK as [number, number, number],
      },
      headStyles: {
        fillColor: PRIMARY as [number, number, number],
        textColor: WHITE as [number, number, number],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: LIGHT_BG as [number, number, number],
      },
      theme: 'grid',
    });

    y = (doc as any).lastAutoTable?.finalY + 8 || y + 20;
  }

  function renderGenericTable(doc: jsPDF, section: ParsedSection, margin: number, contentW: number, pageH: number) {
    renderSummaryTable(doc, section, margin, contentW, pageH);
  }
};
