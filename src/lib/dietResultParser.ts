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
    totalKcal: meal.totalKcal || formatNumber(totalKcal, ' kcal'),
    totalP: meal.totalP || formatNumber(totalP),
    totalC: meal.totalC || formatNumber(totalC),
    totalG: meal.totalG || formatNumber(totalG),
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

const isMealBoundary = (value: string) => {
  const normalized = normalizeMealName(value);
  if (!normalized) return false;

  return [
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
  ].some((label) => normalized.includes(label));
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
  const colCount = rows[0]?.length || 0;
  const hasTime = hasTimeCol || colCount >= 8;
  const expectedCols = hasTime ? 8 : 7;

  const idx = {
    meal: 0,
    time: hasTime ? 1 : -1,
    food: hasTime ? 2 : 1,
    qty: hasTime ? 3 : 2,
    kcal: hasTime ? 4 : 3,
    p: hasTime ? 5 : 4,
    c: hasTime ? 6 : 5,
    g: hasTime ? 7 : 6,
  };

  const meals: ParsedMeal[] = [];
  let currentMeal: ParsedMeal | null = null;
  let lastMealName = '';

  for (const rawCells of rows) {
    const cells =
      rawCells.length >= expectedCols
        ? rawCells.slice(0, expectedCols)
        : Array.from({ length: expectedCols - rawCells.length }, () => '').concat(rawCells);

    const mealCell = cleanCell(cells[idx.meal] || '');
    const foodCell = cleanCell(cells[idx.food] || '');
    const qtyCell = cleanCell(cells[idx.qty] || '');
    const isTotal = mealCell.toLowerCase().includes('total') || foodCell.toLowerCase().includes('total');

    if (isTotal) {
      if (currentMeal) {
        currentMeal.totalKcal = formatNumber(parseNumericValue(cells[idx.kcal]), ' kcal') || currentMeal.totalKcal;
        currentMeal.totalP = formatNumber(parseNumericValue(cells[idx.p])) || currentMeal.totalP;
        currentMeal.totalC = formatNumber(parseNumericValue(cells[idx.c])) || currentMeal.totalC;
        currentMeal.totalG = formatNumber(parseNumericValue(cells[idx.g])) || currentMeal.totalG;
      }
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

    if (foodCell && !foodCell.toLowerCase().includes('alimento') && qtyCell) {
      currentMeal.foods.push({
        food: foodCell,
        qty: ensureGrams(qtyCell),
        kcal: cleanCell(cells[idx.kcal] || ''),
        p: cleanCell(cells[idx.p] || ''),
        c: cleanCell(cells[idx.c] || ''),
        g: cleanCell(cells[idx.g] || ''),
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

export const parseSections = (markdown: string): ParsedSection[] => {
  const sections: ParsedSection[] = [];
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

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      let title = '';
      if (sections.length > 0 && sections[sections.length - 1].type === 'text') {
        const lastText = sections[sections.length - 1].content.trim();
        if (lastText.startsWith('#') || lastText.startsWith('**') || lastText.toLowerCase().includes('opção') || lastText.toLowerCase().includes('cardápio')) {
          title = lastText.replace(/^#+\s*/, '').replace(/\*\*/g, '');
          sections.pop();
        }
      }

      while (i < lines.length && (lines[i].trim().startsWith('|') || lines[i].trim() === '')) {
        if (lines[i].trim()) tableLines.push(lines[i]);
        i++;
      }

      const firstLine = tableLines[0]?.toLowerCase() || '';
      const isMealTable = firstLine.includes('refei') && (firstLine.includes('alimento') || firstLine.includes('kcal') || firstLine.includes('proteí') || firstLine.includes('quantidade'));

      if (isMealTable) {
        const meals = parseMealTable(tableLines);
        if (meals.length > 0) sections.push({ type: 'meal', title, content: tableLines.join('\n'), meals });
        else sections.push({ type: 'table', title, content: tableLines.join('\n') });
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