/**
 * FASE 5 — preview obrigatório do ajuste determinístico de porções.
 * O optimizer nunca aplica sozinho: o treinador confirma aqui.
 */
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { AutoAdjustMacros, AutoAdjustChange } from '@/lib/dietAutoAdjust';
import type { DayTarget } from '@/lib/dietDayTargets';

export interface AutoAdjustPreviewData {
  status: string;
  changes: AutoAdjustChange[];
  before: AutoAdjustMacros;
  after?: AutoAdjustMacros;
  target: DayTarget;
  withinTolerance: boolean;
  reason?: string;
}

const line = (m?: AutoAdjustMacros | DayTarget | null) =>
  m
    ? `${Math.round(m.kcal)} kcal · ${Math.round(m.p)}P · ${Math.round(m.c)}C · ${Math.round(m.g)}G`
    : '—';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AutoAdjustPreviewData | null;
  onApply: () => void;
}

const AutoAdjustPreviewDialog: React.FC<Props> = ({ open, onOpenChange, data, onApply }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Ajustes sugeridos</DialogTitle>
      </DialogHeader>
      {!data ? null : (
        <div className="space-y-3 text-xs">
          {!data.withinTolerance && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {data.reason || 'Não foi possível fechar os macros apenas ajustando quantidades.'}
                </p>
                <p className="opacity-80">
                  Pode ser necessário substituir um alimento ou desbloquear uma quantidade.
                </p>
              </div>
            </div>
          )}

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {data.changes.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma quantidade precisaria mudar.</p>
            ) : (
              data.changes.map((c, i) => (
                <div
                  key={`${c.dayIndex}-${c.mealIndex}-${c.itemIndex}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2"
                >
                  <div>
                    <p className="font-medium text-foreground">{c.foodName}</p>
                    <p className="text-muted-foreground">{c.mealName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {Math.round(c.beforeGrams)} g → {Math.round(c.afterGrams)} g
                    </p>
                    <p className={c.deltaGrams > 0 ? 'text-green-500' : 'text-yellow-500'}>
                      {c.deltaGrams > 0 ? '+' : ''}
                      {Math.round(c.deltaGrams)} g
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid gap-1 rounded-lg border border-border p-3 text-muted-foreground">
            <span>ANTES: <strong className="text-foreground">{line(data.before)}</strong></span>
            <span>DEPOIS: <strong className="text-foreground">{line(data.after)}</strong></span>
            <span>META: <strong className="text-foreground">{line(data.target)}</strong></span>
          </div>

          {data.withinTolerance && (
            <p className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" /> Dentro da tolerância
            </p>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={!data || data.changes.length === 0}
          variant={data?.withinTolerance ? 'default' : 'secondary'}
          onClick={onApply}
        >
          {data?.withinTolerance ? 'Aplicar ajuste' : 'Aplicar mesmo fora da meta'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default AutoAdjustPreviewDialog;
