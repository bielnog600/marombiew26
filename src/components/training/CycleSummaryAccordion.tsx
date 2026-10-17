import React, { useEffect, useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';
import PeriodizationCard from '@/components/training/PeriodizationCard';
import WeeklyAdherenceBanner from '@/components/training/WeeklyAdherenceBanner';
import { MODEL_LABELS, type PeriodizationModel } from '@/lib/periodization';
import {
  ADHERENCE_BADGE_CLASS,
  ADHERENCE_SHORT_LABEL,
  type AdherenceReport,
} from '@/lib/weeklyAdherence';
import { PHASE_SHORT_LABELS, type TrainingPhase } from '@/lib/trainingPhase';
import type { WeekResolution } from '@/lib/weeklyProgression';
import { WEEK_ACTION_LABEL } from '@/lib/weeklyProgression';

interface PlanLike {
  periodization_model?: string | null;
  periodization_reason?: string | null;
  block_type?: string | null;
  block_number?: number | null;
  block_total?: number | null;
  next_block_type?: string | null;
  periodization_snapshot?: unknown;
  fase?: string | null;
}

interface Props {
  plan: PlanLike | null | undefined;
  report: AdherenceReport | null;
  loading?: boolean;
  progression?: WeekResolution | null;
  /** Chave por aluno para lembrar aberto/fechado. */
  storageKey: string;
}

/**
 * Linha compacta recolhível que junta o card do ciclo (periodização) e o
 * card de recomendação semanal. Recolhido por padrão; o estado fica salvo
 * por aluno no aparelho. Apenas apresentação — não recalcula nada.
 */
const CycleSummaryAccordion: React.FC<Props> = ({ plan, report, loading, progression, storageKey }) => {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      /* sem storage disponível */
    }
  }, [open, storageKey]);

  const model = plan?.periodization_model
    ? MODEL_LABELS[plan.periodization_model as PeriodizationModel] ?? plan.periodization_model
    : null;

  // Semana ativa: prioriza a resolução semanal (fonte única), caindo para a
  // fase do plano exibido. Evita a divergência "Semana 1 de 4" x "Ativa: Semana 2".
  const activePhase = (progression?.activePhase ?? (plan?.fase as TrainingPhase) ?? 'semana_1') as TrainingPhase;
  const activeWeekLabel = PHASE_SHORT_LABELS[activePhase] ?? 'Semana 1';

  const badge = report ? ADHERENCE_BADGE_CLASS[report.status] : null;
  const recLabel = report ? ADHERENCE_SHORT_LABEL[report.status] : null;

  // Explicação da diferença planejada x ativa (intencional: repetir/manter).
  const plannedDiffers =
    progression && progression.plannedPhase !== progression.activePhase;
  const clarification = plannedDiffers
    ? `Pelo calendário, o ciclo estaria na ${PHASE_SHORT_LABELS[progression.plannedPhase]}, mas pela sua execução a recomendação é "${WEEK_ACTION_LABEL[progression.action]}", então a semana ativa continua sendo a ${PHASE_SHORT_LABELS[progression.activePhase]}.`
    : null;

  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 min-h-[52px] text-left"
      >
        <CalendarRange className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground shrink-0">Seu ciclo</span>
        {model && (
          <span className="text-[11px] text-muted-foreground truncate">· {model}</span>
        )}
        <span className="text-[11px] text-muted-foreground truncate">· {activeWeekLabel}</span>
        {recLabel && badge && (
          <span
            className={`ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge}`}
          >
            {recLabel}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''} ${recLabel ? '' : 'ml-auto'}`}
        />
      </button>

      <div
        className={`grid transition-all duration-200 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="p-3 pt-1 space-y-3 border-t border-border/60">
            {clarification && (
              <p className="text-[11px] text-muted-foreground leading-relaxed pt-2">
                {clarification}
              </p>
            )}
            <PeriodizationCard plan={plan} variant="student" />
            <WeeklyAdherenceBanner report={report} loading={loading} progression={progression} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CycleSummaryAccordion;
