import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  PHASE_LABELS,
  PHASE_OBJECTIVE,
  PHASE_GUIDELINES,
  PHASE_SHORT_LABELS,
  type TrainingPhase,
} from '@/lib/trainingPhase';

interface PhaseInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: TrainingPhase;
}

export const PhaseInfoSheet: React.FC<PhaseInfoSheetProps> = ({ open, onOpenChange, phase }) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl border-t border-border bg-background/95 backdrop-blur-xl">
        <SheetHeader className="text-left">
          <span className="inline-flex w-fit items-center rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            {PHASE_SHORT_LABELS[phase]}
          </span>
          <SheetTitle className="text-xl text-foreground">{PHASE_LABELS[phase]}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Objetivo</p>
            <p className="text-sm text-foreground/90 leading-relaxed">{PHASE_OBJECTIVE[phase]}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Como treinar</p>
            <p className="text-sm text-foreground/90 leading-relaxed">{PHASE_GUIDELINES[phase]}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
