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
