/**
 * Folha "Receitas para o <refeição>": receitas do banco do mesmo horário com as
 * gramas já ajustadas à refeição. Só leitura até o aluno tocar em "Substituir".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { EngineMacros } from '@/lib/nutritionEngine';
import type { MealSlot } from '@/lib/mealBank';
import {
  defaultRecipeFilters,
  mealArticle,
  studentRecipesFor,
  type RecipeFilters,
  type StudentRecipe,
} from '@/lib/mealBank/studentRecipes';
import type { StudentRecipeData } from '@/hooks/useStudentRecipeData';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealName: string;
  /** "hoje" ou o dia escolhido ("Ter"). */
  dayLabel: string;
  isToday: boolean;
  target: EngineMacros;
  slots: MealSlot[];
  excludeCodes: string[];
  data: StudentRecipeData;
  /** Receita já escolhida neste dia. */
  currentCode?: string | null;
  displayText?: (text: string) => string;
  onSubstitute: (recipe: StudentRecipe) => void;
}

const r = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const signed = (n: number, unit = '') => `${r(n) > 0 ? '+' : ''}${r(n)}${unit}`;
const ORIGIN_FLAG: Record<string, string> = { PT: '🇵🇹', BR: '🇧🇷', 'BR/PT': '🇧🇷🇵🇹' };

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 bg-background/40 text-muted-foreground'
    }`}
  >
    {children}
  </button>
);

const MealRecipesSheet: React.FC<Props> = ({
  open, onOpenChange, mealName, dayLabel, isToday, target, slots, excludeCodes, data, currentCode, displayText, onSubstitute,
}) => {
  const show = displayText ?? ((t: string) => t);
  const [filters, setFilters] = useState<RecipeFilters>(() => defaultRecipeFilters(data.country));
  const [detail, setDetail] = useState<StudentRecipe | null>(null);
  useEffect(() => {
    if (open) { setDetail(null); setFilters(defaultRecipeFilters(data.country)); }
  }, [open, data.country]);

  const recipes = useMemo(
    () => (open ? studentRecipesFor({ bank: data.bank, index: data.index, ctx: data.ctx, slots, target, filters, excludeCodes }) : []),
    [open, data, slots, target, filters, excludeCodes],
  );
  const okCount = recipes.filter((x) => x.ok).length;
  const toggle = (key: keyof Omit<RecipeFilters, 'countries'>) => setFilters((f) => ({ ...f, [key]: !f[key] }));
  const toggleCountry = (c: 'PT' | 'BR') =>
    setFilters((f) => ({ ...f, countries: f.countries.includes(c) ? f.countries.filter((x) => x !== c) : [...f.countries, c] }));
  const art = mealArticle(mealName);
  const shownName = show(mealName);

  const macroRow = (m: EngineMacros) => `${r(m.kcal)} kcal · P ${r(m.p)} · C ${r(m.c)} · G ${r(m.g)}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl border-border/60 bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-5" data-testid="recipes-sheet">
        {!detail ? (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" /> Receitas para {art} {shownName}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Gramas já ajustadas para as calorias e macros desta refeição.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2" data-testid="recipes-target">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meta da refeição</p>
              <p className="text-sm font-bold text-foreground">{macroRow(target)}</p>
            </div>
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" data-testid="recipes-filters">
              <Chip active={filters.semOvo} onClick={() => toggle('semOvo')}>Sem ovo</Chip>
              <Chip active={filters.semLactose} onClick={() => toggle('semLactose')}>Sem lactose</Chip>
              <Chip active={filters.doce} onClick={() => toggle('doce')}>Doce</Chip>
              <Chip active={filters.salgado} onClick={() => toggle('salgado')}>Salgado</Chip>
              <Chip active={filters.pratico} onClick={() => toggle('pratico')}>Prático</Chip>
              <Chip active={filters.countries.includes('PT')} onClick={() => toggleCountry('PT')}>🇵🇹 PT</Chip>
              <Chip active={filters.countries.includes('BR')} onClick={() => toggleCountry('BR')}>🇧🇷 BR</Chip>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground" data-testid="recipes-count">
              {okCount === 1 ? '1 receita bate' : `${okCount} receitas batem`} com a refeição
            </p>
            <div className="mt-2 space-y-2">
              {recipes.length === 0 && (
                <p className="rounded-xl bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma receita com estes filtros.
                </p>
              )}
              {recipes.map((rec) => (
                <button
                  key={rec.meal.code}
                  type="button"
                  disabled={!rec.ok}
                  onClick={() => setDetail(rec)}
                  aria-label={`Receita ${rec.fit.option.name}`}
                  data-testid={`recipe-${rec.meal.code}`}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    rec.ok ? 'border-border/60 bg-background/40 hover:border-primary/40' : 'cursor-not-allowed border-border/30 bg-background/20 opacity-45'
                  } ${currentCode === rec.meal.code ? 'border-primary' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-tight text-foreground">{show(rec.fit.option.name)}</p>
                    <span className="shrink-0 text-xs">{ORIGIN_FLAG[rec.meal.origin] ?? ''}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{macroRow(rec.totals)}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {rec.fit.option.items.map((i) => `${show(i.name)} ${r(i.qtyGrams)} g`).join(' · ')}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {rec.ok ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-500" data-testid="recipe-fits">
                        <Check className="h-3 w-3" /> Bate com a refeição
                      </span>
                    ) : (
                      <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Não bate com a refeição</span>
                    )}
                    {rec.traits.receita && (
                      <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">📖 receita</span>
                    )}
                    {currentCode === rec.meal.code && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Escolhida</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div data-testid="recipe-detail">
            <button type="button" onClick={() => setDetail(null)} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Receitas
            </button>
            <SheetHeader className="text-left">
              <SheetTitle className="text-base">{show(detail.fit.option.name)}</SheetTitle>
              <SheetDescription className="text-xs">
                {ORIGIN_FLAG[detail.meal.origin] ?? ''} Gramas ajustadas para {art} {shownName}.
              </SheetDescription>
            </SheetHeader>
            <table className="mt-3 w-full text-xs" data-testid="recipe-compare">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1 text-left font-semibold" />
                  <th className="py-1 text-right font-semibold">Refeição atual</th>
                  <th className="py-1 text-right font-semibold">Esta receita</th>
                  <th className="py-1 text-right font-semibold">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {([['kcal', 'Kcal', ''], ['p', 'Proteína', ' g'], ['c', 'Carbo', ' g'], ['g', 'Gordura', ' g']] as const).map(([k, label, unit]) => (
                  <tr key={k} className="border-t border-border/40">
                    <td className="py-1.5 font-semibold text-foreground">{label}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{r(target[k])}{unit}</td>
                    <td className="py-1.5 text-right font-semibold text-foreground">{r(detail.totals[k])}{unit}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{signed(r(detail.totals[k]) - r(target[k]), unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ingredientes</p>
            <ul className="mt-1 space-y-1 text-xs" data-testid="recipe-ingredients">
              {detail.fit.option.items.map((i, k) => (
                <li key={`${i.foodId ?? i.name}-${k}`} className="flex justify-between gap-2 border-b border-border/30 pb-1">
                  <span className="min-w-0 text-foreground">{show(i.name)}</span>
                  <span className="whitespace-nowrap text-muted-foreground">{r(i.qtyGrams)} g · {r(i.macros.kcal)} kcal</span>
                </li>
              ))}
            </ul>
            {detail.fit.option.prep && (
              <>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Modo de preparo</p>
                <p className="mt-1 whitespace-pre-line text-xs text-foreground" data-testid="recipe-prep">{show(detail.fit.option.prep)}</p>
              </>
            )}
            <Button className="mt-5 w-full" onClick={() => onSubstitute(detail)} data-testid="recipe-substitute">
              Substituir {art} {shownName} {isToday ? 'de hoje' : `de ${dayLabel}`}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {isToday ? 'Troca só hoje.' : `Troca só neste dia (${dayLabel}).`} A tua dieta continua igual nos outros dias.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default MealRecipesSheet;
