export interface ParsedExercise {
  exercise: string;
  series: string;
  reps: string;
  rir: string;
  pause: string;
  description: string;
  variation: string;
}

export interface ParsedTrainingDay {
  day: string;
  exercises: ParsedExercise[];
}

export interface ParsedTrainingSection {
  type: 'training' | 'summary' | 'tip' | 'message' | 'text' | 'table';
  title?: string;
  content: string;
  days?: ParsedTrainingDay[];
}

const splitMarkdownRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  return trimmed.split('|').slice(1, -1).map(cell => cell.trim());
};

const cleanCell = (value: string) => value.replace(/\*\*/g, '').trim();

const sanitizeCopyText = (value: string) =>
  value.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();

const isTrainingTable = (firstLine: string) => {
  const lower = firstLine.toLowerCase();
  return (
    (lower.includes('treino') || lower.includes('exerc') || lower.includes('série') || lower.includes('serie')) &&
    (lower.includes('repeti') || lower.includes('rir') || lower.includes('pausa') || lower.includes('exerc'))
  );
};

export const parseTrainingTable = (tableLines: string[]): ParsedTrainingDay[] => {
  const rows: string[][] = [];

  for (const line of tableLines) {
    if (!line.trim().startsWith('|')) continue;
    if (line.includes('---')) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length < 4) continue;

    // Skip header row
    const first = cells[0]?.toLowerCase() || '';
    if (first.includes('treino do dia') || first.includes('exercício') || first.includes('exercicio')) {
      continue;
    }

    rows.push(cells);
  }

  if (rows.length === 0) return [];

  const days: ParsedTrainingDay[] = [];
  let currentDay: ParsedTrainingDay | null = null;
  let lastDayName = '';

  for (const cells of rows) {
    const dayCell = cleanCell(cells[0] || '');
    const exerciseCell = cleanCell(cells[1] || '');
    const seriesCell = cleanCell(cells[2] || '');
    const repsCell = cleanCell(cells[3] || '');
    const rirCell = cleanCell(cells[4] || '');
    const pauseCell = cleanCell(cells[5] || '');
    const descCell = cleanCell(cells[6] || '');
    const variationCell = cleanCell(cells[7] || '');

    // Check if this is a new training day
    if (dayCell && dayCell !== '-' && dayCell.toLowerCase() !== lastDayName.toLowerCase()) {
      if (currentDay && currentDay.exercises.length > 0) {
        days.push(currentDay);
      }
      currentDay = { day: dayCell, exercises: [] };
      lastDayName = dayCell;
    }

    if (!currentDay) {
      currentDay = { day: dayCell || lastDayName || 'Treino', exercises: [] };
      if (dayCell) lastDayName = dayCell;
    }

    if (exerciseCell && !exerciseCell.toLowerCase().includes('exercício')) {
      currentDay.exercises.push({
        exercise: exerciseCell,
        series: seriesCell,
        reps: repsCell,
        rir: rirCell,
        pause: pauseCell,
        description: descCell,
        variation: variationCell,
      });
    }
  }

  if (currentDay && currentDay.exercises.length > 0) {
    days.push(currentDay);
  }

  return days;
};

export const parseTrainingSections = (markdown: string): ParsedTrainingSection[] => {
  const sections: ParsedTrainingSection[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // WhatsApp messages
    if (line.toLowerCase().includes('whatsapp') || (line.startsWith('#') && line.toLowerCase().includes('mensagen'))) {
      let msgContent = '';
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l.startsWith('#') && !l.toLowerCase().includes('whatsapp') && !l.toLowerCase().includes('mensag') && !l.toLowerCase().includes('parte')) break;
        msgContent += lines[i] + '\n';
        i++;
      }
      const msgBlocks = msgContent.split(/(?=(?:^|\n)(?:\*\*Parte|\*\*Mensagem|---|\*\*\d))/gi).filter(b => b.trim());
      for (const block of msgBlocks) {
        if (block.trim()) sections.push({ type: 'message', content: block.trim() });
      }
      continue;
    }

    // Tips
    if ((line.startsWith('#') || line.startsWith('**')) && (line.toLowerCase().includes('dica') || line.toLowerCase().includes('observ') || line.toLowerCase().includes('nota'))) {
      let tipContent = line + '\n';
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l.startsWith('#') && !l.toLowerCase().includes('dica')) break;
        if (l.startsWith('|')) break;
        tipContent += lines[i] + '\n';
        i++;
      }
      if (tipContent.trim()) sections.push({ type: 'tip', content: tipContent.trim() });
      continue;
    }

    // Tables
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      let title = '';
      if (sections.length > 0 && sections[sections.length - 1].type === 'text') {
        const lastText = sections[sections.length - 1].content.trim();
        if (lastText.startsWith('#') || lastText.startsWith('**')) {
          title = lastText.replace(/^#+\s*/, '').replace(/\*\*/g, '');
          sections.pop();
        }
      }

      while (i < lines.length && (lines[i].trim().startsWith('|') || lines[i].trim() === '')) {
        if (lines[i].trim()) tableLines.push(lines[i]);
        i++;
      }

      const firstLine = tableLines[0]?.toLowerCase() || '';
      if (isTrainingTable(firstLine)) {
        const days = parseTrainingTable(tableLines);
        if (days.length > 0) {
          sections.push({ type: 'training', title, content: tableLines.join('\n'), days });
        } else {
          sections.push({ type: 'table', title, content: tableLines.join('\n') });
        }
      } else {
        sections.push({ type: 'summary', title, content: tableLines.join('\n') });
      }
      continue;
    }

    if (line) sections.push({ type: 'text', content: lines[i] });
    i++;
  }

  return sections;
};
