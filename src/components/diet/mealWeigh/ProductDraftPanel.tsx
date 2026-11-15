import React, { useMemo, useRef } from 'react';
import { AlertTriangle, Camera, Check, Loader2, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { classifyNutrient, macrosFor, saltOf, type AdditiveInfo, type ProductData } from '@/lib/foodScore';
import { PRODUCT_SOURCE_LABEL, type OffCandidate } from '@/lib/foodPhotoScan';
import { GRAMS_SOURCE_LABEL, productScore, type GramsSource } from '@/lib/mealWeigh/unifiedScan';
import { MacroLine } from './WeighItemEditSheet';
import { ScoreBadge } from './ScanParts';

export interface ProductDraft {
  photo: string | null;
  status: 'ready' | 'candidates' | 'need_label' | 'busy';
  product: ProductData | null;
  barcode: string | null;
  source: string;
  foodId: string | null;
  candidates: OffCandidate[];
  grams: string;
  gramsFrom: GramsSource;
  /** Confiança da IA na identificação (para o auto-adicionar ao banco). */
  confidence: number | null;
}

interface Props {
  header: React.ReactNode;
  draft: ProductDraft;
  onChange: (d: ProductDraft) => void;
  onPickCandidate: (c: OffCandidate) => void;
  onLabelPhoto: (file: File) => void;
  onRetake: () => void;
  onConfirm: (next: 'camera' | 'summary') => void;
}

const fmt = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? '–' : String(Math.round(Number(v) * 10) / 10).replace('.', ','));
const LEVEL_TEXT = { baixo: 'text-score-excellent', moderado: 'text-score-poor', alto: 'text-score-bad' } as const;
const ADD_LEVEL: Record<AdditiveInfo['level'], string> = { alto: 'border-score-bad text-score-bad', moderado: 'border-score-poor text-score-poor', baixo: 'border-border text-muted-foreground', 'sem risco': 'border-border text-muted-foreground' };

/** Produto embalado dentro do scanner único: nota, aditivos, nutrientes e gramas editáveis. */
const ProductDraftPanel: React.FC<Props> = ({ header, draft, onChange, onPickCandidate, onLabelPhoto, onRetake, onConfirm }) => {
  const labelRef = useRef<HTMLInputElement | null>(null);
  const p = draft.product;
  const score = useMemo(() => (p ? productScore(p) : null), [p]);
  const grams = Number(String(draft.grams).replace(',', '.'));
  const m = p && grams > 0 ? macrosFor(p.nutriments ?? {}, grams) : null;
  const n = p?.nutriments ?? {};
  const valid = !!p && grams > 0 && draft.status === 'ready';

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {header}
      <input ref={labelRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onLabelPhoto(f); }} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3" data-testid="scan-product-draft">
        {draft.photo && <img src={draft.photo} alt="Foto do produto" className="h-32 w-full rounded-2xl object-cover border border-border" />}
        {draft.status === 'busy' && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-sm" role="status">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Buscando o produto…
          </div>
        )}
        {draft.status === 'candidates' && (
          <div className="space-y-2" data-testid="scan-product-candidates">
            <p className="text-sm font-semibold">É algum destes?</p>
            {draft.candidates.map((c, i) => (
              <button key={i} type="button" onClick={() => onPickCandidate(c)}
                className="w-full rounded-xl border border-border bg-secondary/30 p-3 text-left text-sm active:bg-secondary/60">
                <span className="font-semibold">{c.product.product_name}</span>
                {c.product.brands ? <span className="text-muted-foreground"> · {c.product.brands}</span> : null}
              </button>
            ))}
            <Button variant="outline" className="w-full gap-1.5" onClick={() => labelRef.current?.click()}><Camera className="h-4 w-4" /> Nenhum — fotografar a tabela</Button>
          </div>
        )}
        {draft.status === 'need_label' && (
          <div role="alert" className="rounded-xl border border-primary/50 bg-primary/10 p-3 text-sm space-y-2" data-testid="scan-product-need-label">
            <p className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Não achei esse produto</p>
            <p className="text-xs text-muted-foreground">Tira uma foto da tabela nutricional que a IA lê os valores.</p>
            <Button className="w-full gap-1.5" onClick={() => labelRef.current?.click()}><Camera className="h-4 w-4" /> Fotografar a tabela</Button>
          </div>
        )}
        {p && draft.status === 'ready' && score && (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/30 p-3">
              <ScoreBadge score={score.score} className="h-12 w-12 text-base" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold truncate" data-testid="scan-product-name">{p.product_name || 'Produto'}</p>
                <p className="text-xs text-muted-foreground truncate">{p.brands ?? 'Sem marca'}{draft.barcode ? ` · ${draft.barcode}` : ''}</p>
                <p className="text-xs font-semibold text-primary" data-testid="scan-product-score">Nota {score.score} · {score.label}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-1.5 text-xs">
              <p className="font-semibold">Por 100 g</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
                <span>Calorias <b className={LEVEL_TEXT[classifyNutrient('kcal', Number(n['energy-kcal_100g']) || 0)]}>{fmt(n['energy-kcal_100g'])} kcal</b></span>
                <span>Proteína <b>{fmt(n.proteins_100g)} g</b></span>
                <span>Carboidrato <b>{fmt(n.carbohydrates_100g)} g</b></span>
                <span>Açúcar <b className={LEVEL_TEXT[classifyNutrient('sugar', Number(n.sugars_100g) || 0)]}>{fmt(n.sugars_100g)} g</b></span>
                <span>Gordura <b>{fmt(n.fat_100g)} g</b></span>
                <span>Saturada <b className={LEVEL_TEXT[classifyNutrient('satfat', Number(n['saturated-fat_100g']) || 0)]}>{fmt(n['saturated-fat_100g'])} g</b></span>
                <span>Fibras <b>{fmt(n.fiber_100g)} g</b></span>
                <span>Sal <b className={LEVEL_TEXT[classifyNutrient('salt', saltOf(n))]}>{fmt(saltOf(n))} g</b></span>
              </div>
              {score.additives.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1" data-testid="scan-product-additives">
                  {score.additives.map((a) => (
                    <span key={a.code} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ADD_LEVEL[a.level]}`}>{a.code} {a.name !== a.code ? a.name : ''}</span>
                  ))}
                </div>
              ) : <p className="text-muted-foreground pt-1">Sem aditivos de risco.</p>}
              <p className="text-[10px] text-muted-foreground">Origem: {PRODUCT_SOURCE_LABEL[draft.source] ?? draft.source}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-2">
              <label htmlFor="scan-product-grams" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gramas</label>
              <div className="flex items-center gap-2">
                <Input id="scan-product-grams" inputMode="decimal" value={draft.grams}
                  onChange={(e) => onChange({ ...draft, grams: e.target.value.replace(/[^\d.,]/g, '') })}
                  className="text-lg font-bold tabular-nums" placeholder="Digite as gramas" />
                <span className="text-sm text-muted-foreground">g</span>
              </div>
              <p className="text-[11px] text-muted-foreground" data-testid="scan-product-grams-source">{GRAMS_SOURCE_LABEL[draft.gramsFrom]}</p>
              {m && <MacroLine m={{ kcal: m.kcal, p: m.protein, c: m.carbs, g: m.fat }} />}
            </div>
          </>
        )}
      </div>
      <div className="sticky bottom-0 shrink-0 border-t border-border bg-background px-4 pt-3 space-y-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <Button className="w-full h-12 gap-1.5 text-base font-semibold" disabled={!valid} onClick={() => onConfirm('camera')}>
          <Plus className="h-4 w-4" /> Próximo alimento
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 gap-1.5" onClick={onRetake}><RotateCcw className="h-4 w-4" /> Tirar de novo</Button>
          <Button variant="outline" className="flex-1 gap-1.5" disabled={!valid} onClick={() => onConfirm('summary')}><Check className="h-4 w-4" /> Concluir refeição</Button>
        </div>
      </div>
    </div>
  );
};

export default ProductDraftPanel;
