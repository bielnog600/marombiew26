import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SessionRpeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rpe: number | null) => void;
  isSaving?: boolean;
}

const RPE_LABELS: Record<number, string> = {
  1: 'Muito leve',
  2: 'Muito leve',
  3: 'Leve',
  4: 'Leve',
  5: 'Moderado',
  6: 'Moderado',
  7: 'Pesado',
  8: 'Pesado',
  9: 'Muito pesado',
  10: 'Máximo',
};

const RPE_COLORS: Record<number, string> = {
  1: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  2: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  3: 'bg-lime-500/15 text-lime-400 border-lime-500/40',
  4: 'bg-lime-500/15 text-lime-400 border-lime-500/40',
  5: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
  6: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
  7: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  8: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  9: 'bg-red-500/15 text-red-400 border-red-500/40',
  10: 'bg-red-600/20 text-red-500 border-red-600/50',
};

export const SessionRpeDialog: React.FC<SessionRpeDialogProps> = ({ open, onOpenChange, onConfirm, isSaving }) => {
  const [selected, setSelected] = useState<number | null>(null);

  const handleConfirm = () => {
    onConfirm(selected);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-2">
          <DialogTitle className="text-lg">Como foi o esforço do treino hoje?</DialogTitle>
          <DialogDescription className="text-xs">
            Escolha de 1 (muito leve) a 10 (máximo). Vale para o treino inteiro.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3">
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const isSelected = selected === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelected(n)}
                  className={cn(
                    'h-14 rounded-xl border-2 font-bold text-lg transition-all touch-manipulation',
                    isSelected
                      ? `${RPE_COLORS[n]} scale-105 shadow-lg`
                      : 'bg-secondary/50 border-border/40 text-muted-foreground hover:bg-secondary',
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="mt-3 min-h-[24px] text-center">
            {selected !== null && (
              <p className="text-sm font-semibold text-foreground">
                {selected} — {RPE_LABELS[selected]}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/30 p-3">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => onConfirm(null)}
            disabled={isSaving}
          >
            Pular
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={selected === null || isSaving}
          >
            {isSaving ? 'Salvando…' : 'Finalizar treino'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
