import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarRange } from 'lucide-react';
import {
  BLOCK_LABELS,
  MODEL_LABELS,
  resolveWeekStrategy,
  weekNumberToPhase,
  type BlockType,
  type PeriodizationModel,
  type PeriodizationSnapshot,
  type WeekPhase,
  type WeekStrategy,
} from '@/lib/periodization';

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
  /** Linguagem simples (aluno) x detalhe técnico (admin). */
  variant?: 'admin' | 'student';
}

/**
 * Mostra a periodização do plano. Campos derivados (volume, intensidade, RIR)
 * são recalculados pelo resolver — nunca lidos de colunas redundantes; o
 * snapshot só é usado quando existe (congela o que foi usado na geração).
 */
export const PeriodizationCard: React.FC<Props> = ({ plan, variant = 'admin' }) => {
  if (!plan?.periodization_model) return null;

  const snap = (plan.periodization_snapshot as PeriodizationSnapshot | null) ?? null;
  const model = plan.periodization_model as PeriodizationModel;
  const blockType = (plan.block_type as BlockType) || 'acumulacao';
  const phase = (plan.fase as WeekPhase) || 'semana_1';
  const week = snap?.week ?? resolveWeekStrategy({ model, blockType, phase });

  const isStudent = variant === 'student';

  return (
    <Card className="glass-card">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm">
            {isStudent ? 'Como está organizado o seu ciclo' : 'Periodização'}
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-primary/15 px-2.5 py-1 font-semibold text-primary">
            {MODEL_LABELS[model] ?? model}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {BLOCK_LABELS[blockType]} {plan.block_number ?? 1}/{plan.block_total ?? 1}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            Semana {week.weekNumber} de 4
          </span>
        </div>

        <p className="text-sm text-foreground/90 leading-relaxed">{week.label}</p>

        {isStudent ? (
          <p className="text-xs text-muted-foreground leading-relaxed">{week.notes}</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Volume: <span className="text-foreground">{week.volumeTarget}</span></span>
            <span>Intensidade: <span className="text-foreground">{week.intensityTarget}</span></span>
            <span>RIR alvo: <span className="text-foreground">{week.effortTarget}</span></span>
            <span>Reps: <span className="text-foreground">{week.repStrategy}</span></span>
            {plan.next_block_type && (
              <span className="col-span-2">
                Próximo bloco: <span className="text-foreground">{BLOCK_LABELS[plan.next_block_type as BlockType]}</span>
              </span>
            )}
            {plan.periodization_reason && (
              <span className="col-span-2 italic">{plan.periodization_reason}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PeriodizationCard;

// ------------------------------------------------------------------
// Variante "inline" (admin, dentro do card do treino)
// ------------------------------------------------------------------

/**
 * Estratégia da semana para a fase informada (a fase atual resolvida pelo
 * chamador). O snapshot só é reaproveitado quando congela a MESMA semana;
 * caso contrário recalcula pelo resolver, para o selo e a faixa nunca
 * mostrarem semanas diferentes.
 */
export const resolvePlanWeekStrategy = (
  plan: PlanLike | null | undefined,
  phase: WeekPhase,
): WeekStrategy | null => {
  if (!plan?.periodization_model) return null;
  const snap = (plan.periodization_snapshot as PeriodizationSnapshot | null) ?? null;
  if (snap?.week && snap.week.phase === phase) return snap.week;
  return resolveWeekStrategy({
    model: plan.periodization_model as PeriodizationModel,
    blockType: (plan.block_type as BlockType) || 'acumulacao',
    phase,
  });
};

const humanize = (value: string) => value.replace(/_/g, ' ');

interface InlineProps {
  plan: PlanLike | null | undefined;
  /** Fase atual já resolvida (resolveCurrentTrainingPhase, incluindo edições não salvas). */
  phase: WeekPhase;
}

/** Faixa compacta: modelo · bloco · semana · volume · intensidade · RIR. */
export const PeriodizationStrip: React.FC<InlineProps> = ({ plan, phase }) => {
  const week = resolvePlanWeekStrategy(plan, phase);
  if (!plan?.periodization_model || !week) return null;
  const model = plan.periodization_model as PeriodizationModel;
  const blockType = (plan.block_type as BlockType) || 'acumulacao';
  const items = [
    `${BLOCK_LABELS[blockType] ?? blockType} ${plan.block_number ?? 1}/${plan.block_total ?? 1}`,
    `Semana ${week.weekNumber} de 4`,
    `Volume ${humanize(week.volumeTarget)}`,
    `Intensidade ${humanize(week.intensityTarget)}`,
    `RIR ${week.effortTarget}`,
  ];
  return (
    <div
      data-testid="periodization-strip"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight text-muted-foreground"
    >
      <CalendarRange className="h-3 w-3 shrink-0 text-primary" />
      <span className="font-semibold text-primary">{MODEL_LABELS[model] ?? model}</span>
      {items.map((item) => (
        <React.Fragment key={item}>
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <span className="whitespace-nowrap">{item}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

/** Texto longo da semana (só com o treino expandido). */
export const PeriodizationDetails: React.FC<InlineProps> = ({ plan, phase }) => {
  const week = resolvePlanWeekStrategy(plan, phase);
  if (!plan?.periodization_model || !week) return null;
  return (
    <div data-testid="periodization-details" className="rounded-xl bg-muted/40 p-3 space-y-1.5">
      <p className="text-sm text-foreground/90 leading-relaxed">{week.label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="sm:col-span-2">Reps: <span className="text-foreground">{week.repStrategy}</span></span>
        {plan.next_block_type && (
          <span className="sm:col-span-2">
            Próximo bloco: <span className="text-foreground">{BLOCK_LABELS[plan.next_block_type as BlockType]}</span>
          </span>
        )}
        {plan.periodization_reason && (
          <span className="sm:col-span-2 italic">{plan.periodization_reason}</span>
        )}
      </div>
    </div>
  );
};
