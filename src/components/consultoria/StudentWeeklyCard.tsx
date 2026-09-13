import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink, Check, RotateCcw, ChevronDown, Target, UtensilsCrossed, Droplets, UserMinus,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ADHERENCE_SHORT_LABEL, ADHERENCE_BADGE_CLASS } from '@/lib/weeklyAdherence';
import type { StudentWeeklySummary, AttentionKind } from '@/hooks/useStudentsWeeklySummary';
import {
  bucketFor, type SnoozeOption, type StudentFollowup,
} from '@/hooks/useStudentFollowups';
import {
  buildWeeklyFocus, type CoachingActionType, type CoachingStatus,
  type FocusItem, type ManualCoachingAction,
} from '@/lib/weeklyCoachingFocus';
import WeeklyFocusList from '@/components/consultoria/WeeklyFocusList';
import PrepareMessageDialog from '@/components/consultoria/PrepareMessageDialog';

const ATTENTION_BADGE: Record<AttentionKind, { label: string; cls: string }> = {
  regressao: { label: 'Regressão', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  baixa_aderencia: { label: 'Baixa aderência', cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
  sem_progresso: { label: 'Sem progresso', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  dados_insuficientes: { label: 'Sem dados', cls: 'bg-muted text-muted-foreground border-border' },
  reanalisar: { label: 'Reanalisar', cls: 'bg-violet-500/15 text-violet-500 border-violet-500/30' },
  ok: { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  novo: { label: 'Novo', cls: 'bg-primary/15 text-primary border-primary/30' },
  pendente: { label: 'Pendente', cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
  falado_hoje: { label: 'Falado hoje', cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  em_espera: { label: 'Em espera', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
};

const formatSnoozeDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

interface Props {
  summary: StudentWeeklySummary;
  followup?: StudentFollowup;
  onMarkDone: (studentId: string, snooze: SnoozeOption) => Promise<unknown>;
  onReopen: (studentId: string) => Promise<unknown>;
  onArchive?: (studentId: string) => Promise<unknown> | void;
  /** Ações manuais de coaching da semana atual (persistidas). */
  coachingActions?: ManualCoachingAction[];
  onSetAction?: (studentId: string, exerciseName: string, action: CoachingActionType, planId: string | null) => void;
  onSetStatus?: (studentId: string, exerciseName: string, status: CoachingStatus, fallback: CoachingActionType, planId: string | null) => void;
  onMarkSent?: (studentId: string, entries: { exerciseName: string; actionType: CoachingActionType }[], planId: string | null) => void;
}

const StudentWeeklyCard: React.FC<Props> = ({
  summary, followup, onMarkDone, onReopen, onArchive,
  coachingActions, onSetAction, onSetStatus, onMarkSent,
}) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const att = ATTENTION_BADGE[summary.attention];
  const a = summary.adherence;
  const d = summary.diet;
  const bucket = bucketFor(followup);

  const statusKey = followup ? followup.status : 'novo';
  const status = STATUS_BADGE[statusKey] ?? STATUS_BADGE.novo;

  const sessionsLine = a
    ? `${a.sessionsExecuted}/${a.sessionsPlanned || '?'} treinos${a.setsTotal > 0 ? ` • ${a.setsWithLoad}/${a.setsTotal} séries c/ carga` : ''}`
    : 'Sem plano de treino ativo';

  const focusItems: FocusItem[] = useMemo(() => buildWeeklyFocus({
    performances: summary.progression?.performances ?? [],
    quantitative: summary.quantitative ?? [],
    videosNeedsRedo: summary.videosNeedsRedo ?? [],
    manualActions: coachingActions ?? [],
    deload: summary.activePhase === 'deload',
  }), [summary.progression, summary.quantitative, summary.videosNeedsRedo, summary.activePhase, coachingActions]);

  const handleMark = async (opt: SnoozeOption) => {
    setBusy(true);
    try {
      await onMarkDone(summary.studentId, opt);
      const labels: Record<SnoozeOption, string> = {
        none: 'Marcado como falado hoje',
        amanha: 'Volta amanhã',
        '3d': 'Volta em 3 dias',
        '7d': 'Volta em 7 dias',
        proxima_semana: 'Volta na próxima semana',
      };
      toast({ title: labels[opt] });
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!onArchive) return;
    setBusy(true);
    try {
      await onArchive(summary.studentId);
      toast({ title: 'Aluno marcado como “não treina mais”', description: 'Os alertas dele deixam de aparecer.' });
    } finally { setBusy(false); }
  };

  const handleReopen = async () => {
    setBusy(true);
    try {
      await onReopen(summary.studentId);
      toast({ title: 'Aluno reaberto para follow-up' });
    } finally { setBusy(false); }
  };

  return (
    <Card className="glass-card hover:bg-secondary/30 transition-colors">
      <CardContent className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => navigate(`/alunos/${summary.studentId}`)}
            className="flex items-center gap-2 min-w-0 hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-xs shrink-0">
              {summary.studentName[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold truncate">{summary.studentName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{sessionsLine}</p>
            </div>
          </button>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className={`text-[10px] ${status.cls}`}>{status.label}</Badge>
            <Badge variant="outline" className={`text-[10px] ${att.cls}`}>{att.label}</Badge>
            {summary.presencial && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                Presencial
              </Badge>
            )}
            {a && (
              <Badge variant="outline" className={`text-[10px] ${ADHERENCE_BADGE_CLASS[a.status]}`}>
                {ADHERENCE_SHORT_LABEL[a.status]}
              </Badge>
            )}
          </div>
        </div>

        {/* Foco desta semana */}
        <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 text-primary" />
              <p className="text-[10px] uppercase tracking-wide text-primary font-semibold">
                Foco desta semana
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {focusItems.length} orientaç{focusItems.length === 1 ? 'ão' : 'ões'}
            </span>
          </div>
          <WeeklyFocusList
            items={focusItems}
            onSetAction={(ex, action) => onSetAction?.(summary.studentId, ex, action, summary.planId)}
            onSetStatus={(ex, st, fallback) => onSetStatus?.(summary.studentId, ex, st, fallback, summary.planId)}
          />
        </div>

        {/* Dieta & hidratação (resumo curto) */}
        {d.hasDietPlan && (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <UtensilsCrossed className="h-3 w-3 text-emerald-500" />
              {d.daysWithMeals}/7 dias ({d.totalMealsMarked} ref.)
            </span>
            <span className="flex items-center gap-1.5">
              <Droplets className={`h-3 w-3 ${d.avgWaterGlasses < 6 ? 'text-amber-500' : 'text-sky-500'}`} />
              {d.avgWaterGlasses} copos/dia
            </span>
          </div>
        )}

        {/* Status follow-up */}
        {followup && bucket === 'espera' && followup.snoozed_until && (
          <p className="text-[10px] text-amber-500">⏰ Volta em {formatSnoozeDate(followup.snoozed_until)}</p>
        )}
        {followup && bucket === 'falados' && followup.last_contacted_at && (
          <p className="text-[10px] text-emerald-500">✓ Falado hoje</p>
        )}

        {/* Buttons */}
        <div className="flex flex-wrap gap-1.5">
          <PrepareMessageDialog
            studentName={summary.studentName}
            studentPhone={summary.studentPhone}
            items={focusItems}
            onSent={(selected) => onMarkSent?.(
              summary.studentId,
              selected.map((i) => ({ exerciseName: i.exerciseName, actionType: i.actionType })),
              summary.planId,
            )}
          />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${summary.studentId}`)}>
            <ExternalLink className="h-3 w-3 mr-1" />
            Ver aluno
          </Button>

          {bucket === 'hoje' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}>
                  <Check className="h-3 w-3 mr-1" />
                  Marcar como feito
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50">
                <DropdownMenuItem onClick={() => handleMark('none')}>Só marcar (hoje)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMark('amanha')}>Voltar amanhã</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMark('3d')}>Voltar em 3 dias</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMark('7d')}>Voltar em 7 dias</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMark('proxima_semana')}>Próxima semana</DropdownMenuItem>
                {onArchive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleArchive}>
                      <UserMinus className="h-3.5 w-3.5 mr-2" />
                      Não treina mais (parar alertas)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReopen} disabled={busy}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Reabrir
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentWeeklyCard;
