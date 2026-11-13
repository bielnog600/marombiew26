import React, { useState } from 'react';
import { Check, ListChecks, PlusCircle, Replace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCAN_APPLY_OPTIONS, type ScanApplyMode } from '@/lib/mealWeigh/scanApply';

const ICONS: Record<ScanApplyMode, React.ElementType> = { replace: Replace, add: PlusCircle, review: ListChecks };

interface Props {
  /** Última escolha do aluno (pré-selecionada). */
  initial: ScanApplyMode;
  /** Ex.: "Pão de centeio 75 g · Omelete 118 g". */
  summary?: string;
  busy?: boolean;
  onConfirm: (mode: ScanApplyMode) => void;
  onCancel?: () => void;
}

/** Concluir um scan numa refeição com plano/pesagem: substituir, adicionar ou revisar item por item. */
const ScanApplyChoice: React.FC<Props> = ({ initial, summary, busy, onConfirm, onCancel }) => {
  const [mode, setMode] = useState<ScanApplyMode>(initial);
  return (
    <div className="space-y-3" data-testid="scan-apply-choice">
      <div>
        <p className="text-base font-bold">O que fazer com o que você escaneou?</p>
        {summary && <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>}
      </div>
      <div className="space-y-2" role="radiogroup" aria-label="O que fazer com o que você escaneou">
        {SCAN_APPLY_OPTIONS.map((o) => {
          const Icon = ICONS[o.mode];
          const active = mode === o.mode;
          return (
            <button key={o.mode} type="button" role="radio" aria-checked={active} onClick={() => setMode(o.mode)}
              className={`w-full rounded-2xl border p-3 text-left flex gap-3 items-start ${active ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40'}`}>
              <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.hint}</span>
              </span>
              {active && <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={busy}>Voltar</Button>}
        <Button className="flex-1 font-semibold" disabled={busy} onClick={() => onConfirm(mode)}>Continuar</Button>
      </div>
    </div>
  );
};

export default ScanApplyChoice;
