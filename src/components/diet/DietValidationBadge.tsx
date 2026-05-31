import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ValidationReport } from '@/lib/dietSchema';
import { cn } from '@/lib/utils';

interface Props {
  report?: ValidationReport | null;
  className?: string;
}

const STATUS_COPY: Record<ValidationReport['status'], { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: 'Dieta validada', className: 'bg-green-500/10 text-green-300 border-green-500/30', Icon: CheckCircle2 },
  warning: { label: 'Atenção', className: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30', Icon: AlertTriangle },
  invalid: { label: 'Fora da meta', className: 'bg-red-500/10 text-red-300 border-red-500/30', Icon: XCircle },
};

const DietValidationBadge: React.FC<Props> = ({ report, className }) => {
  if (!report) return null;
  const { label, className: statusClass, Icon } = STATUS_COPY[report.status];
  const errors = report.issues.filter((i) => i.severity === 'error');
  const warnings = report.issues.filter((i) => i.severity === 'warning');

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              statusClass,
              className,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <span className="opacity-80">
              ({report.kcalDelta > 0 ? '+' : ''}{report.kcalDelta} kcal)
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs space-y-1 text-xs">
          <div className="font-semibold">Diferenças vs meta</div>
          <div>kcal: {report.kcalDelta > 0 ? '+' : ''}{report.kcalDelta}</div>
          <div>P: {report.macroDeltas.p > 0 ? '+' : ''}{report.macroDeltas.p}g · C: {report.macroDeltas.c > 0 ? '+' : ''}{report.macroDeltas.c}g · G: {report.macroDeltas.g > 0 ? '+' : ''}{report.macroDeltas.g}g</div>
          {errors.length > 0 && (
            <div className="pt-1">
              <div className="font-semibold text-red-300">Erros ({errors.length})</div>
              <ul className="list-disc pl-4">
                {errors.slice(0, 4).map((i, idx) => <li key={idx}>{i.message}</li>)}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="pt-1">
              <div className="font-semibold text-yellow-300">Avisos ({warnings.length})</div>
              <ul className="list-disc pl-4">
                {warnings.slice(0, 4).map((i, idx) => <li key={idx}>{i.message}</li>)}
              </ul>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default DietValidationBadge;