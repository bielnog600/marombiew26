import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, UtensilsCrossed, Calculator, MessageCircle, Lightbulb, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface DietResultCardsProps {
  markdown: string;
}

interface ParsedFood {
  food: string;
  qty: string;
  kcal: string;
  p: string;
  c: string;
  g: string;
}

interface ParsedMeal {
  name: string;
  time?: string;
  foods: ParsedFood[];
  totalKcal?: string;
  totalP?: string;
  totalC?: string;
  totalG?: string;
}

interface ParsedSection {
  type: 'summary' | 'meal' | 'message' | 'tip' | 'text' | 'table';
  title?: string;
  content: string;
  meals?: ParsedMeal[];
}

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Erro ao copiar'); }
  };
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs gap-1 h-7 px-2">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {label || 'Copiar'}
    </Button>
  );
};

/** Parse a markdown table block into structured meals */
const parseMealTable = (tableLines: string[]): ParsedMeal[] => {
  // Parse all rows
  const rows: string[][] = [];
  let headerCells: string[] = [];

  for (const line of tableLines) {
    if (!line.trim().startsWith('|')) continue;
    if (line.includes('---')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 5) continue;

    // Detect header
    if (!headerCells.length && (
      cells[0]?.toLowerCase().includes('refei') ||
      cells[0]?.toLowerCase().includes('meal')
    )) {
      headerCells = cells.map(c => c.toLowerCase());
      continue;
    }
    rows.push(cells);
  }

  if (rows.length === 0) return [];

  // Detect column indices based on header or assume standard layout
  // Standard: Refeição | Horário | Alimento | Quantidade | Kcal | P | C | G
  // Or:       Refeição | Alimento | Quantidade | Kcal | P | C | G
  const hasTimeCol = headerCells.some(h => h.includes('horário') || h.includes('hora') || h.includes('time'));
  const colCount = rows[0]?.length || 0;
  // Heuristic: if 8+ columns, likely has time column
  const hasTime = hasTimeCol || colCount >= 8;

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

  for (const cells of rows) {
    const mealCell = cells[idx.meal] || '';
    const isTotal = mealCell.toLowerCase().includes('total') ||
      (cells[idx.food] && cells[idx.food].toLowerCase().includes('total'));

    if (isTotal) {
      // Assign totals to current meal
      if (currentMeal) {
        const numCells = cells.filter(c => /^\d/.test(c));
        if (numCells.length >= 4) {
          currentMeal.totalKcal = numCells[0];
          currentMeal.totalP = numCells[1];
          currentMeal.totalC = numCells[2];
          currentMeal.totalG = numCells[3];
        }
      }
      continue;
    }

    // Determine if this is a new meal or continuation
    const mealName = mealCell.replace(/\*\*/g, '').trim();
    const isNewMeal = mealName && mealName !== lastMealName && mealName !== '-' && mealName !== '';

    if (isNewMeal) {
      if (currentMeal && currentMeal.foods.length > 0) meals.push(currentMeal);
      currentMeal = {
        name: mealName,
        time: idx.time >= 0 ? (cells[idx.time] || '').replace(/\*\*/g, '').trim() : undefined,
        foods: [],
      };
      lastMealName = mealName;
    }

    if (!currentMeal) {
      // First row without a meal name — create a generic meal
      currentMeal = { name: mealName || 'Refeição', foods: [] };
      if (mealName) lastMealName = mealName;
    }

    const foodName = (cells[idx.food] || '').replace(/\*\*/g, '').trim();
    if (foodName && !foodName.toLowerCase().includes('alimento')) {
      currentMeal.foods.push({
        food: foodName,
        qty: (cells[idx.qty] || '').replace(/\*\*/g, '').trim(),
        kcal: (cells[idx.kcal] || '').replace(/\*\*/g, '').trim(),
        p: (cells[idx.p] || '').replace(/\*\*/g, '').trim(),
        c: (cells[idx.c] || '').replace(/\*\*/g, '').trim(),
        g: (cells[idx.g] || '').replace(/\*\*/g, '').trim(),
      });
    }

    // Update time if present
    if (idx.time >= 0 && cells[idx.time] && !currentMeal.time) {
      currentMeal.time = cells[idx.time].replace(/\*\*/g, '').trim();
    }
  }
  if (currentMeal && currentMeal.foods.length > 0) meals.push(currentMeal);
  return meals;
};

const parseSections = (markdown: string): ParsedSection[] => {
  const sections: ParsedSection[] = [];
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

    // Table detection
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      let title = '';
      // Grab preceding heading
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

      // Check if it's a meal table
      const firstLine = tableLines[0]?.toLowerCase() || '';
      const isMealTable = firstLine.includes('refei') && (firstLine.includes('alimento') || firstLine.includes('kcal') || firstLine.includes('proteí') || firstLine.includes('quantidade'));

      if (isMealTable) {
        const meals = parseMealTable(tableLines);
        if (meals.length > 0) {
          sections.push({ type: 'meal', title, content: tableLines.join('\n'), meals });
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

const MEAL_COLORS = [
  'from-amber-500/20 to-orange-500/10 border-amber-500/30',
  'from-green-500/20 to-emerald-500/10 border-green-500/30',
  'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
  'from-purple-500/20 to-violet-500/10 border-purple-500/30',
  'from-pink-500/20 to-rose-500/10 border-pink-500/30',
  'from-teal-500/20 to-green-500/10 border-teal-500/30',
  'from-indigo-500/20 to-blue-500/10 border-indigo-500/30',
];

const MealCard: React.FC<{ meal: ParsedMeal; index: number }> = ({ meal, index }) => {
  const color = MEAL_COLORS[index % MEAL_COLORS.length];
  const mealText = `${meal.name}${meal.time ? ` (${meal.time})` : ''}:\n${meal.foods.map(f => `• ${f.food} - ${f.qty}`).join('\n')}`;

  return (
    <Card className={`border bg-gradient-to-br ${color} overflow-hidden`}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-primary" />
            <h4 className="font-bold text-sm">{meal.name}</h4>
            {meal.time && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {meal.time}
              </span>
            )}
          </div>
          <CopyButton text={mealText} />
        </div>
        <div className="divide-y divide-border/30">
          {meal.foods.map((food, fi) => (
            <div key={fi} className="px-4 py-2 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{food.food}</p>
                <p className="text-xs text-muted-foreground">{food.qty}</p>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                {food.kcal && <span className="font-medium text-foreground">{food.kcal}</span>}
                {food.p && <span>P:{food.p}</span>}
                {food.c && <span>C:{food.c}</span>}
                {food.g && <span>G:{food.g}</span>}
              </div>
            </div>
          ))}
        </div>
        {(meal.totalKcal || meal.totalP) && (
          <div className="px-4 py-2 bg-background/50 border-t border-border/50 flex items-center justify-between">
            <span className="text-xs font-bold">TOTAL</span>
            <div className="flex gap-3 text-xs font-bold">
              {meal.totalKcal && <span>{meal.totalKcal} kcal</span>}
              {meal.totalP && <span>P:{meal.totalP}</span>}
              {meal.totalC && <span>C:{meal.totalC}</span>}
              {meal.totalG && <span>G:{meal.totalG}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const DietResultCards: React.FC<DietResultCardsProps> = ({ markdown }) => {
  const sections = parseSections(markdown);
  const rendered: React.ReactNode[] = [];
  let messageGroup: string[] = [];

  const flushMessages = () => {
    if (messageGroup.length === 0) return;
    rendered.push(
      <Card key={`msg-${rendered.length}`} className="glass-card border-blue-500/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="h-5 w-5 text-blue-500" />
            <h3 className="font-bold text-sm">Mensagens para WhatsApp</h3>
          </div>
          {messageGroup.map((msg, mi) => (
            <div key={mi} className="bg-secondary/50 rounded-xl p-3 space-y-2">
              <div className="text-sm whitespace-pre-wrap">{msg.replace(/\*\*/g, '').replace(/^#+\s*/gm, '')}</div>
              <div className="flex justify-end">
                <CopyButton text={msg.replace(/\*\*/g, '').replace(/^#+\s*/gm, '')} label="Copiar mensagem" />
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-1">
            <CopyButton text={messageGroup.map(m => m.replace(/\*\*/g, '').replace(/^#+\s*/gm, '')).join('\n\n---\n\n')} label="Copiar todas" />
          </div>
        </CardContent>
      </Card>
    );
    messageGroup = [];
  };

  for (const section of sections) {
    if (section.type === 'message') { messageGroup.push(section.content); continue; }
    flushMessages();

    if (section.type === 'meal' && section.meals) {
      rendered.push(
        <div key={`meals-${rendered.length}`} className="space-y-3">
          {section.title && (
            <h3 className="font-bold text-base flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
              {section.title}
            </h3>
          )}
          {section.meals.map((meal, mi) => (
            <MealCard key={mi} meal={meal} index={mi} />
          ))}
        </div>
      );
    } else if (section.type === 'summary') {
      rendered.push(
        <Card key={`summary-${rendered.length}`} className="glass-card border-primary/30">
          <CardContent className="p-4">
            {section.title && (
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-sm">{section.title}</h3>
              </div>
            )}
            <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_table]:w-full [&_th]:bg-muted [&_th]:p-1.5 [&_td]:p-1.5 [&_td]:border [&_th]:border [&_table]:block [&_table]:overflow-x-auto">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
            <div className="flex justify-end mt-2"><CopyButton text={section.content} /></div>
          </CardContent>
        </Card>
      );
    } else if (section.type === 'tip') {
      rendered.push(
        <Card key={`tip-${rendered.length}`} className="glass-card border-yellow-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                </div>
                <div className="flex justify-end mt-2">
                  <CopyButton text={section.content.replace(/\*\*/g, '').replace(/^#+\s*/gm, '')} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    } else if (section.type === 'table') {
      rendered.push(
        <Card key={`table-${rendered.length}`} className="glass-card">
          <CardContent className="p-4">
            {section.title && <h3 className="font-bold text-sm mb-2">{section.title}</h3>}
            <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_table]:w-full [&_th]:bg-muted [&_th]:p-1.5 [&_td]:p-1.5 [&_td]:border [&_th]:border [&_table]:block [&_table]:overflow-x-auto">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      );
    } else if (section.type === 'text' && section.content.trim()) {
      const trimmed = section.content.trim();
      if (trimmed.startsWith('#')) {
        rendered.push(
          <h3 key={`h-${rendered.length}`} className="font-bold text-base mt-2">
            {trimmed.replace(/^#+\s*/, '')}
          </h3>
        );
      } else if (trimmed.length > 10) {
        rendered.push(
          <p key={`p-${rendered.length}`} className="text-sm text-muted-foreground">{trimmed}</p>
        );
      }
    }
  }
  flushMessages();

  return <div className="space-y-4">{rendered}</div>;
};

export default DietResultCards;
