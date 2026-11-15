import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PiggyBank } from 'lucide-react';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { defaultGoalId, formatEuro, goalProgress, localDay } from '@/lib/savingsGoal';
import SavingsGoalDialog from './SavingsGoalDialog';

/** Card resumo da Meta de depósitos na tela Financeiro; abre o modal. */
const SavingsGoalCard: React.FC = () => {
  const api = useSavingsGoals();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = localDay();

  const shownId = selectedId ?? defaultGoalId(api.goals, today);
  const goal = api.goals.find(g => g.id === shownId) ?? null;
  const progress = useMemo(
    () => (goal ? goalProgress(goal, api.deposits.filter(d => d.goal_id === goal.id), today) : null),
    [goal, api.deposits, today],
  );

  if (api.loading) return <Skeleton className="h-20 rounded-xl" />;

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        aria-label="Abrir meta de depósitos"
        className="glass-card cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => { if (shownId) setSelectedId(shownId); setOpen(true); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            {goal && progress ? (
              <>
                <p className="text-sm font-semibold truncate" data-testid="savings-card-summary">
                  {goal.nome}: {formatEuro(progress.saved)} de {formatEuro(progress.total)} ({Math.round((progress.saved / progress.total) * 100)}%)
                </p>
                <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, (progress.saved / progress.total) * 100)}%` }} />
                </div>
                <p className={`mt-1 text-xs ${progress.onPace ? 'text-green-400' : 'text-orange-400'}`}>
                  {progress.onPace ? 'No ritmo' : `Abaixo do ritmo em ${formatEuro(progress.behindBy)}`}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Meta de depósitos</p>
                <p className="text-xs text-muted-foreground">Cria a tua grade de 1 € até N € e acompanha o ritmo.</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      <SavingsGoalDialog
        open={open}
        onOpenChange={setOpen}
        api={api}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </>
  );
};

export default SavingsGoalCard;
