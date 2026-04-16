export interface ParsedFood {
  food: string;
  qty: string;
  kcal: string;
  p: string;
  c: string;
  g: string;
  sub?: string;
}

export interface ParsedMeal {
  name: string;
  time?: string;
  foods: ParsedFood[];
  totalKcal?: string;
  totalP?: string;
  totalC?: string;
  totalG?: string;
}

export interface ParsedSection {
  type: 'summary' | 'meal' | 'message' | 'tip' | 'text' | 'table';
  title?: string;
  content: string;
  meals?: ParsedMeal[];
}

const splitMarkdownRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];

  return trimmed
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
};

const normalizeMealName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*\*/g, '')
    .replace(/[:|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const cleanCell = (value: string) => value.replace(/\*\*/g, '').trim();

const parseNumericValue = (value?: string) => {
  if (!value) return 0;
  const normalized = value
    .replace(/kcal/gi, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value: number, suffix = '') => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = Math.round(value * 10) / 10;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
  return suffix ? `${formatted}${suffix}` : formatted;
};

const ensureGrams = (qty: string) => {
  const cleaned = cleanCell(qty);
  if (!cleaned) return '—';
  if (/\b(g|gramas?)\b/i.test(cleaned)) return cleaned;
  if (/^\d+(?:[.,]\d+)?$/.test(cleaned)) return `${cleaned} g`;
  return cleaned;
};

const finalizeMeal = (meal: ParsedMeal | null) => {
  if (!meal || meal.foods.length === 0) return null;

  const totalKcal = meal.foods.reduce((sum, food) => sum + parseNumericValue(food.kcal), 0);
  const totalP = meal.foods.reduce((sum, food) => sum + parseNumericValue(food.p), 0);
  const totalC = meal.foods.reduce((sum, food) => sum + parseNumericValue(food.c), 0);
  const totalG = meal.foods.reduce((sum, food) => sum + parseNumericValue(food.g), 0);

  return {
    ...meal,
    foods: meal.foods.map((food) => ({ ...food, qty: ensureGrams(food.qty) })),
    totalKcal: formatNumber(totalKcal, ' kcal'),
    totalP: formatNumber(totalP),
    totalC: formatNumber(totalC),
    totalG: formatNumber(totalG),
  };
};

const mergeParsedMeals = (meals: ParsedMeal[]): ParsedMeal[] => {
  const merged: ParsedMeal[] = [];

  for (const meal of meals) {
    const normalizedName = normalizeMealName(meal.name);
    const normalizedTime = normalizeMealName(meal.time || '');
    const existing = merged.find(
      (item) =>
        normalizeMealName(item.name) === normalizedName &&
        normalizeMealName(item.time || '') === normalizedTime,
    );

    if (!existing) {
      merged.push({ ...meal, foods: [...meal.foods] });
      continue;
    }

    existing.foods.push(...meal.foods);
    existing.totalKcal = meal.totalKcal || existing.totalKcal;
    existing.totalP = meal.totalP || existing.totalP;
    existing.totalC = meal.totalC || existing.totalC;
    existing.totalG = meal.totalG || existing.totalG;
  }

  return merged.map((meal) => finalizeMeal(meal)!).filter(Boolean);
};

const MEAL_LABELS = [
  'cafe da manha',
  'lanche da manha',
  'almoco',
  'lanche da tarde',
  'jantar',
  'ceia',
  'pre treino',
  'pos treino',
  'desjejum',
  'colacao',
  'merenda',
  'lanche noturno',
  'refeicao',
];

const isMealBoundary = (value: string) => {
  const normalized = normalizeMealName(value);
  if (!normalized) return false;
  return MEAL_LABELS.some((label) => normalized.includes(label));
};

export const parseMealTable = (tableLines: string[]): ParsedMeal[] => {
  const rows: string[][] = [];
  let headerCells: string[] = [];

  for (const line of tableLines) {
    if (!line.trim().startsWith('|')) continue;
    if (line.includes('---')) continue;

    const cells = splitMarkdownRow(line);
    if (cells.length < 5) continue;

    if (!headerCells.length && (cells[0]?.toLowerCase().includes('refei') || cells[0]?.toLowerCase().includes('meal'))) {
      headerCells = cells.map((c) => c.toLowerCase());
      continue;
    }

    rows.push(cells);
  }

  if (rows.length === 0) return [];

  const hasTimeCol = headerCells.some((h) => h.includes('horário') || h.includes('hora') || h.includes('time'));
  const hasSubCol = headerCells.some((h) => h.includes('substitu'));
  const colCount = rows[0]?.length || 0;
  const hasTime = hasTimeCol || colCount >= 8;
  const hasSub = hasSubCol || colCount >= 9;

  const idx = {
    meal: 0,
    time: hasTime ? 1 : -1,
    food: hasTime ? 2 : 1,
    qty: hasTime ? 3 : 2,
    kcal: hasTime ? 4 : 3,
    p: hasTime ? 5 : 4,
    c: hasTime ? 6 : 5,
    g: hasTime ? 7 : 6,
    sub: hasSub ? (hasTime ? 8 : 7) : -1,
  };

  const meals: ParsedMeal[] = [];
  let currentMeal: ParsedMeal | null = null;
  let lastMealName = '';

  for (const rawCells of rows) {
    const maxCols = Math.max(...Object.values(idx).filter(v => v >= 0)) + 1;
    const cells =
      rawCells.length >= maxCols
        ? rawCells
        : [...rawCells, ...Array.from({ length: maxCols - rawCells.length }, () => '')];

    const mealCell = cleanCell(cells[idx.meal] || '');
    const foodCell = cleanCell(cells[idx.food] || '');
    const qtyCell = cleanCell(cells[idx.qty] || '');
    const isTotal = mealCell.toLowerCase().includes('total') || foodCell.toLowerCase().includes('total');

    if (isTotal) {
      // Skip total rows entirely — let finalizeMeal calculate per-meal totals
      // from individual foods. This prevents the grand "Total" row from
      // overwriting the last meal's totals with the whole-day sum.
      continue;
    }

    const normalizedMealName = normalizeMealName(mealCell);
    const isNewMeal = Boolean(
      normalizedMealName &&
      mealCell !== '-' &&
      (normalizedMealName !== normalizeMealName(lastMealName) || isMealBoundary(mealCell)),
    );

    if (isNewMeal) {
      const finalized = finalizeMeal(currentMeal);
      if (finalized) meals.push(finalized);

      currentMeal = {
        name: mealCell,
        time: idx.time >= 0 ? cleanCell(cells[idx.time] || '') || undefined : undefined,
        foods: [],
      };
      lastMealName = mealCell;
    }

    if (!currentMeal) {
      currentMeal = {
        name: mealCell || lastMealName || 'Refeição',
        time: idx.time >= 0 ? cleanCell(cells[idx.time] || '') || undefined : undefined,
        foods: [],
      };
      if (mealCell) lastMealName = mealCell;
    }

    // If food cell looks like a meal name (AI put meal name in wrong column), treat as meal boundary
    const foodLooksMeal = isMealBoundary(foodCell);
    if (foodLooksMeal && !qtyCell) {
      // This row is a meal header placed in the food column — start new meal
      const finalized2 = finalizeMeal(currentMeal);
      if (finalized2) meals.push(finalized2);
      currentMeal = {
        name: foodCell,
        time: idx.time >= 0 ? cleanCell(cells[idx.time] || '') || undefined : undefined,
        foods: [],
      };
      lastMealName = foodCell;
    } else if (foodCell && !foodCell.toLowerCase().includes('alimento') && qtyCell) {
      currentMeal.foods.push({
        food: foodCell,
        qty: ensureGrams(qtyCell),
        kcal: cleanCell(cells[idx.kcal] || ''),
        p: cleanCell(cells[idx.p] || ''),
        c: cleanCell(cells[idx.c] || ''),
        g: cleanCell(cells[idx.g] || ''),
        sub: idx.sub >= 0 ? cleanCell(cells[idx.sub] || '') || undefined : undefined,
      });
    }

    if (idx.time >= 0 && cells[idx.time] && !currentMeal.time) {
      currentMeal.time = cleanCell(cells[idx.time]);
    }
  }

  const finalized = finalizeMeal(currentMeal);
  if (finalized) meals.push(finalized);

  return mergeParsedMeals(meals);
};

/** Parse a per-meal table (no "Refeição" column). Each table = 1 meal. */
const parseSingleMealTable = (tableLines: string[], mealName: string, mealTime?: string): ParsedMeal | null => {
  const rows: string[][] = [];
  let headerCells: string[] = [];
  let hasSubCol = false;

  for (const line of tableLines) {
    if (!line.trim().startsWith('|')) continue;
    if (line.includes('---')) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length < 4) continue;

    if (!headerCells.length && (cells[0]?.toLowerCase().includes('alimento') || cells[0]?.toLowerCase().includes('food'))) {
      headerCells = cells.map(c => c.toLowerCase());
      hasSubCol = headerCells.some(h => h.includes('substitu'));
      continue;
    }
    rows.push(cells);
  }

  if (rows.length === 0) return null;

  const foods: ParsedFood[] = [];
  for (const cells of rows) {
    const foodCell = cleanCell(cells[0] || '');
    const qtyCell = cleanCell(cells[1] || '');
    const kcalCell = cleanCell(cells[2] || '');
    const pCell = cleanCell(cells[3] || '');
    const cCell = cleanCell(cells[4] || '');
    const gCell = cleanCell(cells[5] || '');
    const subCell = hasSubCol ? cleanCell(cells[6] || '') : undefined;

    if (!foodCell || foodCell.toLowerCase().includes('alimento')) continue;
    if (foodCell.toLowerCase().includes('total')) continue;

    if (foodCell && qtyCell) {
      foods.push({ food: foodCell, qty: ensureGrams(qtyCell), kcal: kcalCell, p: pCell, c: cCell, g: gCell, sub: subCell || undefined });
    }
  }

  if (foods.length === 0) return null;
  return finalizeMeal({ name: mealName, time: mealTime, foods });
};

/** Detect if a table header looks like a per-meal food table (Alimento | Qtd | Kcal...) */
const isSingleMealTable = (firstLine: string): boolean => {
  const lower = firstLine.toLowerCase();
  return !lower.includes('refei') && lower.includes('alimento') && (lower.includes('kcal') || lower.includes('cal') || lower.includes('prote'));
};

export const parseSections = (markdown: string): ParsedSection[] => {
  const sections: ParsedSection[] = [];
  const lines = markdown.split('\n');
  let i = 0;
  // Track current group heading (e.g. "## CARDÁPIO 1") to group per-meal tables
  let currentGroupTitle = '';

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
      const msgBlocks = msgContent.split(/(?=(?:^|\n)(?:\*\*Parte|\*\*Mensagem|---|\*\*\d))/gi).filter((b) => b.trim());
      for (const block of msgBlocks) {
        if (block.trim()) sections.push({ type: 'message', content: block.trim() });
      }
      continue;
    }

    if ((line.startsWith('#') || line.startsWith('**')) && (line.toLowerCase().includes('dica') || line.toLowerCase().includes('timing') || line.toLowerCase().includes('observ'))) {
      let tipContent = line + '\n';
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l.startsWith('#') && !l.toLowerCase().includes('dica') && !l.toLowerCase().includes('timing')) break;
        if (l.startsWith('|')) break;
        tipContent += lines[i] + '\n';
        i++;
      }
      if (tipContent.trim()) sections.push({ type: 'tip', content: tipContent.trim() });
      continue;
    }

    // Detect group headings like "## CARDÁPIO 1" or "## Opção 1"
    if (line.match(/^#{1,3}\s/) && (line.toLowerCase().includes('card') || line.toLowerCase().includes('opç') || line.toLowerCase().includes('opc'))) {
      currentGroupTitle = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
      i++;
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      let title = '';
      // Check if the preceding text is a meal heading (e.g. "### Refeição 1 – Café da Manhã (07:00)")
      let precedingMealName = '';
      let precedingMealTime: string | undefined;
      if (sections.length > 0 && sections[sections.length - 1].type === 'text') {
        const lastText = sections[sections.length - 1].content.trim();
        if (lastText.startsWith('#') || lastText.startsWith('**') || lastText.toLowerCase().includes('opção') || lastText.toLowerCase().includes('cardápio')) {
          title = lastText.replace(/^#+\s*/, '').replace(/\*\*/g, '');
          sections.pop();
        }
        // Extract meal name and time from heading like "Refeição 1 – Café da Manhã (07:00)"
        const mealHeadingMatch = lastText.match(/refeição\s*\d*\s*[–-]\s*(.+?)(?:\((\d{1,2}:\d{2})\))?$/i) ||
          lastText.replace(/^#+\s*/, '').replace(/\*\*/g, '').match(/refeição\s*\d*\s*[–-]\s*(.+?)(?:\((\d{1,2}:\d{2})\))?$/i);
        if (mealHeadingMatch) {
          precedingMealName = mealHeadingMatch[1].trim();
          precedingMealTime = mealHeadingMatch[2];
        }
      }

      while (i < lines.length && (lines[i].trim().startsWith('|') || lines[i].trim() === '')) {
        if (lines[i].trim()) tableLines.push(lines[i]);
        i++;
      }

      const firstLine = tableLines[0]?.toLowerCase() || '';
      const isBigMealTable = firstLine.includes('refei') && (firstLine.includes('alimento') || firstLine.includes('kcal') || firstLine.includes('proteí') || firstLine.includes('quantidade'));

      if (isBigMealTable) {
        const meals = parseMealTable(tableLines);
        if (meals.length > 0) sections.push({ type: 'meal', title, content: tableLines.join('\n'), meals });
        else sections.push({ type: 'table', title, content: tableLines.join('\n') });
      } else if (isSingleMealTable(firstLine) && precedingMealName) {
        // Per-meal table format: merge into existing meal section for current group
        const meal = parseSingleMealTable(tableLines, precedingMealName, precedingMealTime);
        if (meal) {
          const groupLabel = currentGroupTitle || title || '';
          // Find existing meal section for this group
          const existingSection = sections.find(
            s => s.type === 'meal' && (s.title || '') === groupLabel
          );
          if (existingSection && existingSection.meals) {
            existingSection.meals.push(meal);
            existingSection.content += '\n' + tableLines.join('\n');
          } else {
            sections.push({ type: 'meal', title: groupLabel, content: tableLines.join('\n'), meals: [meal] });
          }
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