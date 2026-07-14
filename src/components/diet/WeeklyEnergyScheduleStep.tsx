import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  type WeeklyEnergySchedule,
  type EnergyWeekday,
  ENERGY_WEEKDAYS,
  WEEKDAY_LABELS,
  computeDayTarget,
  computeTotals,
  validateSchedule,
} from '@/lib/weeklyEnergy';

interface Props {
  schedule: WeeklyEnergySchedule;
  onChange: (next: WeeklyEnergySchedule) => void;
  noActiveWorkout: boolean;
}

function parseIntOrZero(raw: string): number {
  const n = parseInt(raw.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseIntOrNull(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function WeeklyEnergyScheduleStep({ schedule, onChange, noActiveWorkout }: Props) {
  const totals = computeTotals(schedule);
  const issues = validateSchedule(schedule);
  const sourceLabel = schedule.base_source === 'manual' ? 'Manual' : 'Cálculo automático';

  const updateDay = (wd: EnergyWeekday, patch: Partial<{ adjustment_kcal: number; fixed_kcal: number | null }>) => {
    onChange({
      ...schedule,
      days: {
        ...schedule.days,
        [wd]: { ...schedule.days[wd], ...patch },
      },
    });
  };

  return (
    <div className="space-y-3">
      <Card className="glass-card">
        <CardContent className="p-4 space-y-1">
          <p className="text-sm font-medium">Calorias por dia</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background p-2">
              <span className="block text-muted-foreground">Meta base</span>
              <span className="font-semibold text-foreground">{schedule.base_daily_kcal.toLocaleString('pt-BR')} kcal</span>
            </div>
            <div className="rounded-lg border border-border bg-background p-2">
              <span className="block text-muted-foreground">Origem</span>
              <span className="font-semibold text-foreground">{sourceLabel}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Ajuste a meta calórica de cada dia da semana. A dieta gerada terá um plano base e
            uma seção de ajustes por dia. A variação prioriza carboidratos; proteína permanece
            estável.
          </p>
          {noActiveWorkout && (
            <p className="text-[11px] text-amber-600 mt-1">
              Sem treino ativo associado ao aluno. A configuração é permitida manualmente e
              não bloqueia a geração.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ENERGY_WEEKDAYS.map((wd) => {
          const entry = schedule.days[wd];
          const target = computeDayTarget(entry);
          const hasFixed = entry.fixed_kcal != null && entry.fixed_kcal > 0;
          const workoutLabel =
            entry.workout?.label ??
            (entry.workout?.type === 'rest' ? 'Descanso' : null) ??
            'Sem treino associado';
          const muscles = entry.workout?.muscles ?? [];
          const diff = target - entry.base_kcal;
          return (
            <Card key={wd} className="glass-card">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{WEEKDAY_LABELS[wd]}</span>
                  <span
                    className={`text-[11px] font-medium ${
                      diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-muted-foreground'
                    }`}
                  >
                    {diff > 0 ? `+${diff}` : diff} kcal
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <div>Treino: {workoutLabel}</div>
                  {muscles.length > 0 && <div>Grupos: {muscles.join(', ')}</div>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Meta base: <span className="text-foreground font-medium">{entry.base_kcal} kcal</span>
                </div>
                <div className="flex gap-2 items-end">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground flex-1">
                    Ajuste (kcal)
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={entry.adjustment_kcal || ''}
                      placeholder="0"
                      disabled={hasFixed}
                      onChange={(e) => updateDay(wd, { adjustment_kcal: parseIntOrZero(e.target.value) })}
                      className="h-8 text-sm mt-1"
                    />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground flex-1">
                    Meta fixa (opcional)
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={entry.fixed_kcal ?? ''}
                      placeholder="—"
                      onChange={(e) => updateDay(wd, { fixed_kcal: parseIntOrNull(e.target.value) })}
                      className="h-8 text-sm mt-1"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-[11px] text-muted-foreground">Meta final</span>
                  <span className="text-sm font-semibold">{target} kcal</span>
                </div>
                {(entry.adjustment_kcal !== 0 || hasFixed) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2"
                    onClick={() => updateDay(wd, { adjustment_kcal: 0, fixed_kcal: null })}
                  >
                    Resetar dia
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="glass-card">
        <CardContent className="p-4 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total semanal original</span>
            <span className="font-medium">{totals.originalWeekly.toLocaleString('pt-BR')} kcal</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total semanal configurado</span>
            <span className="font-medium">{totals.configuredWeekly.toLocaleString('pt-BR')} kcal</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Diferença</span>
            <span
              className={`font-medium ${
                totals.diff > 0 ? 'text-emerald-600' : totals.diff < 0 ? 'text-rose-600' : ''
              }`}
            >
              {totals.diff > 0 ? '+' : ''}{totals.diff.toLocaleString('pt-BR')} kcal
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Média diária</span>
            <span className="font-medium">{totals.averageDaily.toLocaleString('pt-BR')} kcal</span>
          </div>
        </CardContent>
      </Card>

      {issues.length > 0 && (
        <Card className="glass-card border-rose-500/40">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-medium text-rose-600">Ajustes precisam de atenção:</p>
            <ul className="list-disc pl-5 text-[11px] text-rose-600">
              {issues.map((it, i) => (<li key={i}>{it}</li>))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}