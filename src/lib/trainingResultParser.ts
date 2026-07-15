export interface ParsedExercise {
  exercise: string;
  series: string;
  series2: string;
  reps: string;
  rir: string;
  pause: string;
  description: string;
  variation: string;
  /** Optional structured per-set prescription. When present, source of truth for the set list. */
  setScheme?: {
    mode: 'uniform' | 'recognition_work' | 'per_set';
    sets: Array<{ set_number: number; set_type: 'work' | 'recognition'; target_reps: string }>;
  };
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

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const cleanTitle = (value: string) =>
  cleanCell(value)
    .replace(/^#+\s*/, '')
    .replace(/^[-*]\s*/, '')
    .replace(/:$/, '')
    .trim();

const extractDayFromTitle = (title: string) => {
  const cleaned = cleanTitle(title);
  const normalized = normalizeText(cleaned);
  const match = normalized.match(/\b(segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|treino\s+[a-z])\b/i);
  return match ? cleaned : '';
};

// Normalize pause values: convert 60", 60'', 60 seg, 60 segundos -> 60s
const normalizePause = (value: string): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return trimmed;
  // Match a leading number, optionally followed by quote/seg/segundos/s
  const match = trimmed.match(/^(\d+)\s*(?:["''”″`]|seg(?:undos?)?|s)?\s*$/i);
  if (match) return `${match[1]}s`;
  return trimmed;
};

const isTrainingTable = (firstLine: string) => {
  const lower = firstLine.toLowerCase();
  return (
    (lower.includes('treino') || lower.includes('exerc') || lower.includes('série') || lower.includes('serie')) &&
    (lower.includes('repeti') || lower.includes('rir') || lower.includes('pausa') || lower.includes('exerc'))
  );
};

export const parseTrainingTable = (tableLines: string[], fallbackTitle = ''): ParsedTrainingDay[] => {
  const rows: string[][] = [];
  const headerCells = splitMarkdownRow(tableLines.find((line) => line.trim().startsWith('|') && !line.includes('---')) || '');
  const header = headerCells.map(normalizeText);
  const findHeader = (predicate: (cell: string) => boolean) => header.findIndex(predicate);
  const dayIndex = findHeader((cell) => (cell.includes('treino') && cell.includes('dia')) || (cell === 'dia' || cell.includes('dia do treino')));
  const exerciseIndex = findHeader((cell) => cell.includes('exerc'));
  const seriesIndex = findHeader((cell) => cell.includes('serie') && !cell.includes('2'));
  const series2Index = findHeader((cell) => cell.includes('serie') && cell.includes('2'));
  const repsIndex = findHeader((cell) => cell.includes('repet'));
  const rirIndex = findHeader((cell) => cell.includes('rir'));
  const pauseIndex = findHeader((cell) => cell.includes('pausa') || cell.includes('descanso'));
  const descIndex = findHeader((cell) => cell.includes('descr') || cell.includes('instr'));
  const variationIndex = findHeader((cell) => cell.includes('vari'));
  const fallbackDay = extractDayFromTitle(fallbackTitle);
  const hasMappedHeader = exerciseIndex >= 0;

  for (const line of tableLines) {
    if (!line.trim().startsWith('|')) continue;
    if (line.includes('---')) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length < 4) continue;

    const first = normalizeText(cells[0] || '');
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
    const hasDayColumn = dayIndex >= 0;
    const get = (idx: number, positionalFallback: number, optional = false) => {
      if (idx >= 0) return cleanCell(cells[idx] || '');
      if (hasMappedHeader && optional) return '';
      return cleanCell(cells[positionalFallback] || '');
    };
    const dayCell = hasDayColumn ? get(dayIndex, 0) : fallbackDay;
    const exerciseCell = hasMappedHeader ? get(exerciseIndex, hasDayColumn ? 1 : 0) : get(hasDayColumn ? 1 : 0, hasDayColumn ? 1 : 0);
    const seriesCell = hasMappedHeader ? get(seriesIndex, hasDayColumn ? 2 : 1) : get(hasDayColumn ? 2 : 1, hasDayColumn ? 2 : 1);
    const series2Cell = hasMappedHeader ? get(series2Index, hasDayColumn ? 3 : 2, true) : get(hasDayColumn ? 3 : 2, hasDayColumn ? 3 : 2);
    const repsCell = hasMappedHeader ? get(repsIndex, hasDayColumn ? 4 : 3) : get(hasDayColumn ? 4 : 3, hasDayColumn ? 4 : 3);
    const rirCell = hasMappedHeader ? get(rirIndex, hasDayColumn ? 5 : 4, true) : get(hasDayColumn ? 5 : 4, hasDayColumn ? 5 : 4);
    const pauseCell = normalizePause(hasMappedHeader ? get(pauseIndex, hasDayColumn ? 6 : 5, true) : get(hasDayColumn ? 6 : 5, hasDayColumn ? 6 : 5));
    const descCell = hasMappedHeader ? get(descIndex, hasDayColumn ? 7 : 6, true) : get(hasDayColumn ? 7 : 6, hasDayColumn ? 7 : 6);
    const variationCell = hasMappedHeader ? get(variationIndex, hasDayColumn ? 8 : 7, true) : get(hasDayColumn ? 8 : 7, hasDayColumn ? 8 : 7);

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

    const normalizedExercise = normalizeText(exerciseCell);
    if (exerciseCell && exerciseCell !== '-' && exerciseCell !== '—' && normalizedExercise !== 'exercicio') {
      currentDay.exercises.push({
        exercise: exerciseCell,
        series: seriesCell,
        series2: series2Cell,
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

  // Merge days with the same name (dedup from corrupted data)
  const merged: ParsedTrainingDay[] = [];
  const seen = new Map<string, number>();
  for (const day of days) {
    const key = day.day.toUpperCase();
    if (seen.has(key)) {
      // Keep the LAST occurrence (later rows contain user edits)
      merged[seen.get(key)!] = day;
    } else {
      seen.set(key, merged.length);
      merged.push(day);
    }
  }
  return merged;
};

export const parseTrainingSections = (markdown: string): ParsedTrainingSection[] => {
  const sections: ParsedTrainingSection[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

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
        const days = parseTrainingTable(tableLines, title);
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

/** Rebuild the full markdown content after exercise edits */
export const rebuildTrainingMarkdown = (
  originalMarkdown: string,
  updatedDays: ParsedTrainingDay[],
): string => {
  const sections = parseTrainingSections(originalMarkdown);
  const lines: string[] = [];
  let trainingEmitted = false;
  // Day name patterns to strip orphan headings that referred to individual day tables
  const dayNamePattern = /^#+\s*(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)/i;

  // Sort days by weekday order (segunda -> domingo). Unknown/other labels keep original order at the end.
  const weekdayOrder = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  const weekdayIndex = (label: string): number => {
    const n = (label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (let i = 0; i < weekdayOrder.length; i++) {
      if (n.includes(weekdayOrder[i])) return i;
    }
    return 99;
  };
  const sortedDays = [...updatedDays]
    .map((d, i) => ({ d, i, w: weekdayIndex(d.day) }))
    .sort((a, b) => (a.w - b.w) || (a.i - b.i))
    .map((x) => x.d);

  for (const section of sections) {
    if (section.type === 'training' && section.days) {
      // Only emit one training table with ALL days (avoid duplication)
      if (trainingEmitted) continue;
      trainingEmitted = true;
      lines.push('| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |');
      lines.push('|---|---|---|---|---|---|---|---|---|');
      for (const day of sortedDays) {
        for (const ex of day.exercises) {
          lines.push(`| ${day.day} | ${ex.exercise} | ${ex.series || '-'} | ${ex.series2 || '-'} | ${ex.reps || '-'} | ${ex.rir || '-'} | ${ex.pause || '-'} | ${ex.description || '-'} | ${ex.variation || '-'} |`);
        }
      }
      lines.push('');
    } else {
      // Skip orphan day-name headings (they become misleading after merge)
      const trimmed = section.content.trim();
      if (section.type === 'text' && dayNamePattern.test(trimmed)) continue;
      lines.push(section.content);
      lines.push('');
    }
  }

  return lines.join('\n');
};
