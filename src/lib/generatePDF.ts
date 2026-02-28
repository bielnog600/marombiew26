import jsPDF from 'jspdf';
import 'jspdf-autotable';
import logoUrl from '@/assets/logo_marombiew.png';

// Extend jsPDF types for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface ReportData {
  profile: { nome: string; email?: string; telefone?: string } | null;
  assessment: { created_at: string; notas_gerais?: string } | null;
  anthro: any;
  comp: any;
  skinfolds: any;
  vitals: any;
  perf: any;
  anamnese: any;
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
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const fmt = (v: any, unit = '') => (v != null && v !== '' ? `${v}${unit}` : '—');

export const generatePDF = async (data: ReportData) => {
  const { profile, assessment, anthro, comp, skinfolds, vitals, perf, anamnese } = data;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ── Helper: add new page if needed ──
  const checkPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  // ── Helper: section title ──
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

  // ── Helper: key-value table ──
  const kvTable = (rows: [string, string][]) => {
    checkPage(rows.length * 7 + 5);
    doc.autoTable({
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
    y = doc.lastAutoTable.finalY + 4;
  };

  // ══════════════════════════════════════════════
  // 1. HEADER WITH LOGO
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

  // Gold separator line
  doc.setDrawColor(...BRAND.gold);
  doc.setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── Student info ──
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
  // 2. RESUMO PRINCIPAL
  // ══════════════════════════════════════════════
  sectionTitle('Resumo');
  
  const pesoIdeal = anthro?.altura ? (22 * Math.pow(anthro.altura / 100, 2)).toFixed(1) : null;
  
  const summaryRows: [string, string][] = [
    ['Peso', fmt(anthro?.peso, ' kg')],
    ['Peso Ideal (IMC 22)', pesoIdeal ? `${pesoIdeal} kg` : '—'],
    ['Altura', fmt(anthro?.altura, ' cm')],
    ['IMC', anthro?.imc ? `${anthro.imc} — ${classifyIMC(anthro.imc)}` : '—'],
    ['% Gordura', fmt(comp?.percentual_gordura, '%')],
    ['Massa Magra', fmt(comp?.massa_magra, ' kg')],
    ['Massa Gorda', fmt(comp?.massa_gorda, ' kg')],
    ['Cintura', fmt(anthro?.cintura, ' cm')],
    ['Quadril', fmt(anthro?.quadril, ' cm')],
    ['RCQ', anthro?.rcq ? `${anthro.rcq} — ${classifyRCQ(anthro.rcq)}` : '—'],
  ];
  kvTable(summaryRows);

  // ══════════════════════════════════════════════
  // 3. MEDIDAS CORPORAIS
  // ══════════════════════════════════════════════
  sectionTitle('Medidas Corporais');
  const medidasRows: [string, string][] = [
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
  ];
  kvTable(medidasRows);

  // ══════════════════════════════════════════════
  // 4. DOBRAS CUTÂNEAS
  // ══════════════════════════════════════════════
  sectionTitle('Dobras Cutâneas');
  const metodo = skinfolds?.metodo?.replace(/_/g, ' ') || '—';
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.gray);
  doc.text(`Método: ${metodo}`, margin, y - 4);
  
  const dobrasRows: [string, string][] = [
    ['Tríceps', fmt(skinfolds?.triceps, ' mm')],
    ['Subescapular', fmt(skinfolds?.subescapular, ' mm')],
    ['Suprailíaca', fmt(skinfolds?.suprailiaca, ' mm')],
    ['Abdominal', fmt(skinfolds?.abdominal, ' mm')],
    ['Peitoral', fmt(skinfolds?.peitoral, ' mm')],
    ['Axilar Média', fmt(skinfolds?.axilar_media, ' mm')],
    ['Coxa', fmt(skinfolds?.coxa, ' mm')],
  ];
  kvTable(dobrasRows);

  // ══════════════════════════════════════════════
  // 5. SINAIS VITAIS
  // ══════════════════════════════════════════════
  if (vitals) {
    sectionTitle('Sinais Vitais');
    const vitaisRows: [string, string][] = [
      ['Pressão Arterial', fmt(vitals.pressao)],
      ['FC Repouso', fmt(vitals.fc_repouso, ' bpm')],
      ['SpO2', fmt(vitals.spo2, '%')],
      ['Glicemia', fmt(vitals.glicemia, ' mg/dL')],
    ];
    if (vitals.observacoes) vitaisRows.push(['Observações', vitals.observacoes]);
    kvTable(vitaisRows);
  }

  // ══════════════════════════════════════════════
  // 6. TESTES FÍSICOS
  // ══════════════════════════════════════════════
  if (perf) {
    sectionTitle('Testes Físicos');
    const testRows: [string, string][] = [
      ['Flexões', fmt(perf.pushup, ' rep')],
      ['Prancha', fmt(perf.plank, ' seg')],
      ['Cooper 12min', fmt(perf.cooper_12min, ' m')],
      ['Salto Vertical', fmt(perf.salto_vertical, ' cm')],
      ['Agachamento Score', fmt(perf.agachamento_score, '/5')],
      ['Mobilidade Ombro', fmt(perf.mobilidade_ombro)],
      ['Mobilidade Quadril', fmt(perf.mobilidade_quadril)],
      ['Mobilidade Tornozelo', fmt(perf.mobilidade_tornozelo)],
    ];
    if (perf.observacoes) testRows.push(['Observações', perf.observacoes]);
    kvTable(testRows);
  }

  // ══════════════════════════════════════════════
  // 7. ANAMNESE
  // ══════════════════════════════════════════════
  if (anamnese) {
    sectionTitle('Anamnese');
    const anamRows: [string, string][] = [
      ['Sono', fmt(anamnese.sono)],
      ['Stress', fmt(anamnese.stress)],
      ['Rotina', fmt(anamnese.rotina)],
      ['Treino Atual', fmt(anamnese.treino_atual)],
      ['Medicação', fmt(anamnese.medicacao)],
      ['Suplementos', fmt(anamnese.suplementos)],
      ['Histórico de Saúde', fmt(anamnese.historico_saude)],
      ['Dores', fmt(anamnese.dores)],
      ['Cirurgias', fmt(anamnese.cirurgias)],
      ['Tabagismo', anamnese.tabagismo ? 'Sim' : 'Não'],
      ['Álcool', fmt(anamnese.alcool)],
    ];
    kvTable(anamRows);
  }

  // ══════════════════════════════════════════════
  // 8. NOTAS GERAIS
  // ══════════════════════════════════════════════
  if (assessment?.notas_gerais) {
    sectionTitle('Notas Gerais');
    checkPage(20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND.dark);
    const lines = doc.splitTextToSize(assessment.notas_gerais, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 6;
  }

  // ══════════════════════════════════════════════
  // FOOTER on each page
  // ══════════════════════════════════════════════
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    
    // Gold line
    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - 15, pageW - margin, pageH - 15);
    
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.gray);
    doc.text('Marombiew Fitness Application — Documento gerado automaticamente', margin, pageH - 10);
    doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 10, { align: 'right' });
  }

  // Save
  const nome = (profile?.nome || 'aluno').replace(/\s+/g, '_').toLowerCase();
  const dateStr = assessment ? new Date(assessment.created_at).toISOString().split('T')[0] : 'report';
  doc.save(`avaliacao_${nome}_${dateStr}.pdf`);
};
