import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronDown, Flame, Candy, Droplet, Beef, Wheat, FlaskConical, CircleDot, Sparkles, Loader2, Check } from 'lucide-react';
import {
  classifyNutrient, classifyPositive, macrosFor, saltOf, scoreLabel,
  type AdditiveInfo, type Nutriments,
} from '@/lib/foodScore';
import { cn } from '@/lib/utils';

export interface ScanRecord {
  id: string;
  aluno_id: string;
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
  image_url: string | null;
  score: number | null;
  score_label: string | null;
  nutriments: Nutriments & { serving_quantity?: number | null };
  additives: AdditiveInfo[];
  ai_evaluation: string | null;
  consumed_grams: number | null;
  consumed_at: string | null;
  created_at: string;
}

// Cores semânticas das faixas (tokens --score-*)
const scoreColor = (s: number) =>
  s < 25 ? 'bg-score-bad' : s < 50 ? 'bg-score-poor' : s < 75 ? 'bg-score-good' : 'bg-score-excellent';
const levelColor = { baixo: 'bg-score-excellent', moderado: 'bg-score-poor', alto: 'bg-score-bad', 'sem risco': 'bg-score-excellent' } as const;
const posColor = { bom: 'bg-score-excellent', razoável: 'bg-score-good', pouco: 'bg-score-poor' } as const;

export const ScoreDot = ({ score, className }: { score: number; className?: string }) => (
  <span className={cn('inline-block h-3 w-3 rounded-full', scoreColor(score), className)} />
);

interface Row { key: string; icon: React.ElementType; title: string; value: string; color: string; desc: string; detail?: React.ReactNode }

function NutrientRow({ r }: { r: Row }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/50 last:border-0">
      <button className="w-full flex items-center gap-3 py-3 min-h-[52px] text-left" onClick={() => r.detail && setOpen(!open)}>
        <r.icon className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{r.title}</p>
          <p className="text-xs text-muted-foreground">{r.desc}</p>
        </div>
        <span className="text-sm tabular-nums">{r.value}</span>
        <span className={cn('h-3 w-3 rounded-full shrink-0', r.color)} />
        {r.detail && <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && r.detail && <div className="pb-3 pl-8">{r.detail}</div>}
    </div>
  );
}

export default function FoodScanResult({ scan, onChange, readOnly }: { scan: ScanRecord; onChange?: (s: ScanRecord) => void; readOnly?: boolean }) {
  const n = scan.nutriments ?? {};
  const serving = Number(n.serving_quantity) || null;
  const [grams, setGrams] = useState(String(serving ?? 100));
  const [saving, setSaving] = useState(false);
  const score = scan.score ?? 0;
  const v = (k: string) => Number((n as any)[k]) || 0;
  const salt = saltOf(n);

  const neg: Row[] = [];
  const pos: Row[] = [];
  const adds = scan.additives ?? [];
  const risky = adds.filter((a) => a.level !== 'sem risco');
  const addRow: Row = {
    key: 'add', icon: FlaskConical, title: 'Aditivos', value: String(adds.length),
    color: adds.some((a) => a.level === 'alto') ? levelColor.alto : risky.length ? levelColor.moderado : levelColor.baixo,
    desc: adds.length ? (risky.length ? `${risky.length} com algum risco` : 'Sem risco conhecido') : 'Sem aditivos',
    detail: adds.length ? (
      <ul className="space-y-1.5">
        {adds.map((a) => (
          <li key={a.code} className="flex items-center gap-2 text-xs">
            <span className={cn('h-2.5 w-2.5 rounded-full', levelColor[a.level])} />
            <span className="font-medium">{a.code}</span> <span className="text-muted-foreground flex-1">{a.name}</span>
            <span className="capitalize">{a.level === 'sem risco' ? 'sem risco' : `risco ${a.level}`}</span>
          </li>
        ))}
      </ul>
    ) : undefined,
  };
  (risky.length ? neg : pos).push(addRow);

  const negDefs = [
    { key: 'kcal', icon: Flame, title: 'Calorias', val: v('energy-kcal_100g'), unit: ' kcal' },
    { key: 'sugar', icon: Candy, title: 'Açúcar', val: v('sugars_100g'), unit: ' g' },
    { key: 'satfat', icon: Droplet, title: 'Gorduras saturadas', val: v('saturated-fat_100g'), unit: ' g' },
    { key: 'salt', icon: CircleDot, title: 'Sal', val: salt, unit: ' g' },
  ] as const;
  for (const d of negDefs) {
    const lvl = classifyNutrient(d.key, d.val);
    const row: Row = { key: d.key, icon: d.icon, title: d.title, value: `${Math.round(d.val * 10) / 10}${d.unit}`, color: levelColor[lvl], desc: `Nível ${lvl}` };
    (lvl === 'baixo' ? pos : neg).push(row);
  }
  for (const d of [
    { key: 'protein', icon: Beef, title: 'Proteínas', val: v('proteins_100g') },
    { key: 'fiber', icon: Wheat, title: 'Fibras', val: v('fiber_100g') },
  ] as const) {
    const lvl = classifyPositive(d.key, d.val);
    const row: Row = { key: d.key, icon: d.icon, title: d.title, value: `${Math.round(d.val * 10) / 10} g`, color: posColor[lvl], desc: lvl === 'bom' ? 'Boa quantidade' : lvl === 'razoável' ? 'Quantidade razoável' : 'Pouca quantidade' };
    (lvl === 'pouco' ? neg : pos).push(row);
  }

  const per100 = macrosFor(n, 100);
  const perServ = serving ? macrosFor(n, serving) : null;
  const g = Math.max(0, Number(grams.replace(',', '.')) || 0);
  const chosen = macrosFor(n, g);

  const registrar = async () => {
    if (!g) return toast.error('Informe a quantidade em gramas.');
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('food_scans').update({ consumed_grams: g, consumed_at: now }).eq('id', scan.id);
    setSaving(false);
    if (error) return toast.error('Não foi possível registrar.');
    onChange?.({ ...scan, consumed_grams: g, consumed_at: now });
    toast.success(`Registrado: ${g} g · ${chosen.kcal} kcal`);
  };

  const MacroLine = ({ label, m }: { label: string; m: ReturnType<typeof macrosFor> }) => (
    <div className="grid grid-cols-5 gap-1 text-center text-xs py-1.5">
      <span className="text-left text-muted-foreground">{label}</span>
      <span>{m.kcal} kcal</span><span>P {m.protein}g</span><span>C {m.carbs}g</span><span>G {m.fat}g</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="glass-card-solid rounded-2xl p-4 flex gap-4">
        {scan.image_url ? (
          <img src={scan.image_url} alt={scan.product_name ?? ''} width={96} height={96} loading="lazy" decoding="async" className="h-24 w-24 rounded-xl object-cover bg-secondary" />
        ) : <div className="h-24 w-24 rounded-xl bg-secondary" />}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-bold leading-tight line-clamp-2">{scan.product_name}</p>
          <p className="text-sm text-muted-foreground truncate">{scan.brand}</p>
          <div className="flex items-center gap-2 pt-1">
            <ScoreDot score={score} className="h-5 w-5" />
            <div>
              <p className="text-xl font-bold leading-none">{score}<span className="text-sm text-muted-foreground">/100</span></p>
              <p className="text-xs text-muted-foreground">{scan.score_label ?? scoreLabel(score)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card-solid rounded-2xl p-4 border border-primary/30 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2 text-primary"><Sparkles className="h-4 w-4" /> Avaliação do seu personal</p>
        {scan.ai_evaluation === '__erro__' ? (
          <p className="text-sm text-muted-foreground">Não foi possível gerar a avaliação agora.</p>
        ) : scan.ai_evaluation ? (
          <p className="text-sm leading-relaxed">{scan.ai_evaluation}</p>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Analisando com base na sua dieta…</p>
        )}
      </div>

      {neg.length > 0 && (
        <div className="glass-card-solid rounded-2xl px-4 pt-3">
          <div className="flex justify-between text-sm font-semibold"><span>Pontos negativos</span><span className="text-xs text-muted-foreground font-normal">por 100 g/ml</span></div>
          {neg.map((r) => <NutrientRow key={r.key} r={r} />)}
        </div>
      )}
      {pos.length > 0 && (
        <div className="glass-card-solid rounded-2xl px-4 pt-3">
          <div className="flex justify-between text-sm font-semibold"><span>Pontos positivos</span><span className="text-xs text-muted-foreground font-normal">por 100 g/ml</span></div>
          {pos.map((r) => <NutrientRow key={r.key} r={r} />)}
        </div>
      )}

      <div className="glass-card-solid rounded-2xl p-4">
        <p className="text-sm font-semibold mb-1">Macros</p>
        <MacroLine label="100 g" m={per100} />
        {perServ && <MacroLine label={`Porção ${serving} g`} m={perServ} />}
      </div>

      {!readOnly && (
        <div className="glass-card-solid rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold">Registrar consumo</p>
          <div className="flex gap-2 items-center">
            <Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} className="h-12 w-28" aria-label="Quantidade em gramas" />
            <span className="text-sm text-muted-foreground">g · {chosen.kcal} kcal · P {chosen.protein} · C {chosen.carbs} · G {chosen.fat}</span>
          </div>
          <Button className="h-12 w-full font-semibold" onClick={registrar} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : scan.consumed_at ? <><Check className="h-4 w-4 mr-1" /> Atualizar registro</> : 'Adicionar à dieta / registrar consumo'}
          </Button>
          {scan.consumed_at && <p className="text-xs text-muted-foreground text-center">Registrado {scan.consumed_grams} g em {new Date(scan.consumed_at).toLocaleString('pt-BR')}</p>}
        </div>
      )}
    </div>
  );
}
