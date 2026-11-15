import React from 'react';
import { Loader2, ScanBarcode, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EstimatedBadge } from './PlateReview';
import {
  ORIGIN_CHIP_LABEL, itemOriginChips, itemPlanLine, liveProductLine, scoreTone, type ScoreTone,
} from '@/lib/mealWeigh/unifiedScan';
import type { PlannedMeal, WeighedItem } from '@/lib/mealWeigh';

const TONE_CLASS: Record<ScoreTone, string> = {
  excellent: 'bg-score-excellent text-foreground',
  good: 'bg-score-good text-background',
  poor: 'bg-score-poor text-background',
  bad: 'bg-score-bad text-foreground',
  none: 'bg-secondary text-muted-foreground',
};

/** Ícone redondo com a nota do produto (verde/lima/laranja/vermelho); "—" sem nota. */
export const ScoreBadge: React.FC<{ score: number | null | undefined; className?: string }> = ({ score, className }) => (
  <span data-testid="scan-score" data-tone={scoreTone(score)}
    className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums', TONE_CLASS[scoreTone(score)], className)}
    aria-label={score == null ? 'Sem nota' : `Nota ${Math.round(score)}`}>
    {score == null ? '—' : Math.round(score)}
  </span>
);

/** Linha da lista da refeição: nota, nome, chips de origem, gramas e previsto / no lugar de. */
export const ScanItemList: React.FC<{ items: WeighedItem[]; planned: PlannedMeal; onEdit?: (i: number) => void }> = ({ items, planned, onEdit }) => (
  <ul className="space-y-2" data-testid="meal-weigh-item-list">
    {items.map((it, i) => {
      const chips = itemOriginChips(it, planned);
      const planLine = itemPlanLine(it, planned);
      return (
        <li key={i}>
          <button type="button" disabled={!onEdit} onClick={() => onEdit?.(i)} aria-label={`Editar ${it.alimento} ${Math.round(it.gramas)} g`}
            data-testid="scan-item-row"
            className="w-full rounded-xl border border-border bg-secondary/30 p-3 text-left active:bg-secondary/60 disabled:cursor-default">
            <div className="flex items-start gap-2.5">
              <ScoreBadge score={it.nota} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{it.alimento}</p>
                <div className="mt-1 flex flex-wrap gap-1" data-testid="scan-item-chips">
                  {chips.map((c) => c === 'estimado' ? <EstimatedBadge key={c} /> : (
                    <span key={c} className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                      c === 'novo_ia' ? 'border-primary bg-primary/15 text-primary'
                        : c === 'fora_do_plano' ? 'border-border text-muted-foreground'
                          : 'border-primary/40 bg-primary/5 text-primary')}>
                      {ORIGIN_CHIP_LABEL[c]}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  <span className="font-bold text-primary">{Math.round(it.gramas)} g</span>
                  {planLine ? ` · ${planLine}` : ''} · {it.kcal} kcal · P {it.p} · C {it.c} · G {it.g}
                </p>
              </div>
            </div>
          </button>
        </li>
      );
    })}
  </ul>
);

export interface LiveProduct { code: string; name: string; score: number | null; label: string | null; loading?: boolean; notFound?: boolean }

/** Cartão por cima da câmera com o produto lido ao vivo, antes da foto. */
export const LiveProductCard: React.FC<{ live: LiveProduct; onUse: () => void; onDismiss: () => void }> = ({ live, onUse, onDismiss }) => (
  <div data-testid="scan-live-product" role="status"
    className="pointer-events-auto mx-4 flex items-center gap-2.5 rounded-2xl border border-primary/60 bg-card/95 p-2.5 shadow-lg animate-in fade-in slide-in-from-top-2">
    {live.loading ? <Loader2 className="h-6 w-6 shrink-0 animate-spin text-primary" /> : live.notFound
      ? <ScanBarcode className="h-6 w-6 shrink-0 text-muted-foreground" /> : <ScoreBadge score={live.score} />}
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold truncate" data-testid="scan-live-line">
        {live.loading ? `Código ${live.code}…` : live.notFound ? 'Produto não encontrado — tira a foto do rótulo' : liveProductLine(live)}
      </p>
      <p className="text-[11px] text-muted-foreground truncate">Código {live.code}</p>
    </div>
    {!live.loading && !live.notFound && (
      <button type="button" onClick={onUse} className="h-9 shrink-0 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground">Usar</button>
    )}
    <button type="button" onClick={onDismiss} aria-label="Fechar produto lido" className="h-9 w-9 shrink-0 rounded-full bg-secondary/80 flex items-center justify-center">
      <X className="h-4 w-4" />
    </button>
  </div>
);
