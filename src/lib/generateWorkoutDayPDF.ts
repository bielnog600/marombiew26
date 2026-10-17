import type { ParsedTrainingDay } from './trainingResultParser';
import { executionSummary } from './workoutExecutionMethods';

export async function generateWorkoutDayPDF(day: ParsedTrainingDay) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Treino · ${day.day}`, 14, 20);
  autoTable(doc, {
    startY: 27,
    head: [['Exercício', 'Séries', 'Reps', 'RIR', 'Pausa', 'Método']],
    body: day.exercises.map(ex => [ex.exercise, ex.setScheme?.mode === 'per_set' ? String(ex.setScheme.sets.length) : [ex.series, ex.series2].filter(Boolean).join(' + '), ex.reps, ex.rir, ex.pause, executionSummary(ex)]),
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 43 }, 5: { cellWidth: 50 } },
  });
  doc.save(`Treino-${day.day.replace(/[^\p{L}\p{N}-]/gu, '-')}.pdf`);
}