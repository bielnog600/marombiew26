import DietResultCards from '@/components/DietResultCards';
import MealCard from '@/components/diet/MealCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { parseSections, type ParsedMeal } from '@/lib/dietResultParser';

const weekdays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
interface DietDay {
  weekday?: string;
  label?: string;
  trainingDay?: boolean;
  carbBias?: string;
  totals?: { kcal?: number; p?: number; c?: number; g?: number };
  meals?: { name?: string; items?: { name?: string; qtyGrams?: number; portionLabel?: string }[] }[];
}
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
const signature = (day: DietDay) => JSON.stringify({
  kcal: day.totals?.kcal,
  meals: day.meals?.map(meal => ({
    name: normalized(meal.name),
    items: meal.items?.map(item => ({
      name: normalized(item.name),
      quantity: item.qtyGrams ?? normalized(item.portionLabel),
    })),
  })),
});
const dayType = (day: DietDay) => {
  const label = normalized(day.label);
  if (label === 'treino') return 'Treino';
  if (label === 'off' || label === 'descanso') return 'Descanso';
  return day.trainingDay === true ? 'Treino' : day.trainingDay === false ? 'Descanso' : '';
};
const fmt = (value?: number) => value == null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1, useGrouping: false });

/** Read-only: pairs markdown meal sections with persisted days before sorting. */
export const buildDietWeekView = (markdown: string, plan: { days?: DietDay[] } | null | undefined) => {
  const days = plan?.days;
  const sections = parseSections(markdown);
  const meals = sections.filter(section => section.type === 'meal');
  if (!Array.isArray(days) || days.length <= 1 || meals.length !== days.length ||
    days.some(day => !weekdays.includes(day.weekday ?? '')) ||
    new Set(days.map(day => day.weekday)).size !== days.length) return null;
  const paired = days.map((day, index) => ({ day, meals: meals[index].meals ?? [] }))
    .sort((a, b) => weekdays.indexOf(a.day.weekday ?? '') - weekdays.indexOf(b.day.weekday ?? ''));
  const identical = days.length === 7 && days.every(day =>
    Array.isArray(day.meals) && day.meals.length > 0 && day.totals?.kcal != null && signature(day) === signature(days[0]));
  const rest = sections.filter(section => section.type !== 'meal').map(section => {
    if (section.type === 'message') return `## Mensagens para WhatsApp\n${section.content}`;
    return `${section.title ? `## ${section.title}\n` : ''}${section.content}`;
  }).join('\n\n');
  return { paired, identical, rest };
};

const MealCopy = ({ text, label }: { text: string; label?: string }) => (
  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={async () => {
    try { await navigator.clipboard.writeText(text); toast.success('Copiado!'); }
    catch { toast.error('Erro ao copiar'); }
  }}><Copy className="h-3 w-3" />{label || 'Copiar'}</Button>
);

const DayMeals = ({ day, meals }: { day: DietDay; meals: ParsedMeal[] }) => (
  <div className="space-y-3">
    {meals.map((meal, index) => <MealCard key={`${meal.name}-${index}`} meal={meal} index={index}
      onCopy={(text, label) => <MealCopy text={text} label={label} />} />)}
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm font-medium text-foreground" aria-label="Total do dia">
      <span>Total: {fmt(day.totals?.kcal)} kcal</span>
      <span>P {fmt(day.totals?.p)} g</span><span>C {fmt(day.totals?.c)} g</span><span>G {fmt(day.totals?.g)} g</span>
    </div>
  </div>
);

const DietWeekView = ({ markdown, plan }: { markdown: string; plan: { days?: DietDay[] } | null }) => {
  const view = buildDietWeekView(markdown, plan);
  if (!view) return <DietResultCards markdown={markdown} />;
  const today = weekdays[(new Date().getDay() + 6) % 7];
  const first = view.paired[0];
  return <div className="space-y-4">
    {view.identical ? <div className="space-y-3">
      <Badge variant="secondary">Igual todos os dias · {fmt(first.day.totals?.kcal)} kcal</Badge>
      <DayMeals {...first} />
    </div> : <Tabs defaultValue={view.paired.some(entry => entry.day.weekday === today) ? today : first.day.weekday}>
      <div className="overflow-x-auto">
        <TabsList className="flex h-auto w-max min-w-full justify-start gap-1">
          {view.paired.map(({ day }) => <TabsTrigger key={day.weekday} value={day.weekday ?? ''} className="flex min-w-[100px] flex-1 flex-col gap-1 px-2 py-2">
            <span>{labels[weekdays.indexOf(day.weekday ?? '')]}</span>
            <span className="text-[10px]">{[dayType(day), `${fmt(day.totals?.kcal)} kcal`].filter(Boolean).join(' · ')}</span>
          </TabsTrigger>)}
        </TabsList>
      </div>
      {view.paired.map(({ day, meals }) => <TabsContent key={day.weekday} value={day.weekday ?? ''} className="space-y-3 pt-2">
        <h3 className="text-sm font-semibold text-foreground">{[labels[weekdays.indexOf(day.weekday ?? '')], dayType(day),
          normalized(day.carbBias) === 'high' ? 'carbo alto' : normalized(day.carbBias) === 'low' ? 'carbo baixo' : ''].filter(Boolean).join(' · ')}</h3>
        <DayMeals day={day} meals={meals} />
      </TabsContent>)}
    </Tabs>}
    {view.rest && <DietResultCards markdown={view.rest} />}
  </div>;
};
export default DietWeekView;