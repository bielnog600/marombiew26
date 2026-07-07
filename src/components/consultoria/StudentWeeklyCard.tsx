import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink, MessageSquare, Copy, TrendingUp, TrendingDown, AlertTriangle,
  Check, RotateCcw, Mic, ChevronDown, Sparkles, UtensilsCrossed, Droplets,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { buildWhatsAppUrl } from '@/hooks/useNotifications';
import { ADHERENCE_SHORT_LABEL, ADHERENCE_BADGE_CLASS } from '@/lib/weeklyAdherence';
import { formatDelta } from '@/lib/weeklyProgression';
import { buildNextSessionGuidance } from '@/lib/nextSessionGuidance';
import type { StudentWeeklySummary, AttentionKind } from '@/hooks/useStudentsWeeklySummary';
import {
  bucketFor, type SnoozeOption, type StudentFollowup,
} from '@/hooks/useStudentFollowups';

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

const buildAudioSummary = (s: StudentWeeklySummary): string => {
  const a = s.adherence;
  const p = s.progression;
  const d = s.diet;
  const lines: string[] = [];
  if (a) {
    lines.push(`• Fez ${a.sessionsExecuted} de ${a.sessionsPlanned || '?'} treinos na semana`);
    if (a.setsTotal > 0) lines.push(`• ${a.setsWithLoad} de ${a.setsTotal} séries com carga registrada`);
  } else {
    lines.push('• Sem plano de treino ativo');
  }
  if (p?.improved?.length) lines.push(`• Evoluiu em: ${p.improved.map(formatDelta).join(' • ')}`);
  if (p?.regressed?.length) lines.push(`• Caiu em: ${p.regressed.map(formatDelta).join(' • ')}`);
  if (p?.missing?.length) lines.push(`• Sem registro em: ${p.missing.join(', ')}`);
  if (d.hasDietPlan) {
    lines.push(`• Refeições marcadas em ${d.daysWithMeals}/7 dias (${d.totalMealsMarked} refeições)`);
    lines.push(`• Água: média de ${d.avgWaterGlasses} copos/dia${d.daysBelowWaterGoal > 0 ? ` (${d.daysBelowWaterGoal} dia(s) abaixo de 6)` : ''}`);
  }
  if (d.lastCheckin) {
    const c = d.lastCheckin;
    const bits = [
      c.facilidade ? `ingestão: ${c.facilidade}` : null,
      c.fome ? `fome: ${c.fome}` : null,
      c.saciedade ? `saciedade: ${c.saciedade}` : null,
      c.digestao ? `digestão: ${c.digestao}` : null,
      c.adesao ? `adesão: ${c.adesao}` : null,
    ].filter(Boolean).join(' • ');
    if (bits) lines.push(`• Último check-in de dieta — ${bits}`);
  }
  lines.push(`• Decisão: ${s.actionLabel}`);
  return lines.join('\n');
};

const buildWhatsAppMessage = (s: StudentWeeklySummary): string => {
  const firstName = (s.studentName ?? 'aluno').split(' ')[0];
  return `Oi ${firstName}! 💪 Resumo rápido da sua semana:\n\n${buildAudioSummary(s)}`;
};

interface Props {
  summary: StudentWeeklySummary;
  followup?: StudentFollowup;
  onMarkDone: (studentId: string, snooze: SnoozeOption) => Promise<unknown>;
  onReopen: (studentId: string) => Promise<unknown>;
}

const StudentWeeklyCard: React.FC<Props> = ({ summary, followup, onMarkDone, onReopen }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const att = ATTENTION_BADGE[summary.attention];
  const a = summary.adherence;
  const p = summary.progression;
  const bucket = bucketFor(followup);

  const statusKey = followup
    ? followup.status
    : (summary.attention === 'ok' ? 'novo' : 'novo');
  const status = STATUS_BADGE[statusKey] ?? STATUS_BADGE.novo;

  const sessionsLine = a
    ? `${a.sessionsExecuted}/${a.sessionsPlanned || '?'} treinos${a.setsTotal > 0 ? ` • ${a.setsWithLoad}/${a.setsTotal} séries c/ carga` : ''}`
    : 'Sem plano de treino ativo';

  const audioSummary = buildAudioSummary(summary);
  const nextGuidance = buildNextSessionGuidance(summary);
  const whatsappUrl = summary.studentPhone
    ? buildWhatsAppUrl(
        summary.studentPhone,
        `${buildWhatsAppMessage(summary)}\n\n👉 Próxima sessão: ${nextGuidance}`,
      )
    : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${audioSummary}\n\nOrientação da próxima sessão:\n${nextGuidance}`);
      toast({ title: 'Resumo copiado', description: 'Cole onde quiser ou use como base para o áudio.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const handleCopyGuidance = async () => {
    try {
      await navigator.clipboard.writeText(nextGuidance);
      toast({ title: 'Orientação copiada', description: 'Pronta para enviar como áudio no WhatsApp.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

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
            {a && (
              <Badge variant="outline" className={`text-[10px] ${ADHERENCE_BADGE_CLASS[a.status]}`}>
                {ADHERENCE_SHORT_LABEL[a.status]}
              </Badge>
            )}
          </div>
        </div>

        {/* Progress lines */}
        {p && (p.improved.length > 0 || p.regressed.length > 0 || p.missing.length > 0) && (
          <div className="space-y-1.5 text-xs">
            {p.improved.length > 0 && (
              <div className="flex items-start gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-foreground/90 leading-tight">
                  <span className="text-emerald-500 font-medium">Evoluiu: </span>
                  {p.improved.map(formatDelta).join(' • ')}
                </p>
              </div>
            )}
            {p.regressed.length > 0 && (
              <div className="flex items-start gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-foreground/90 leading-tight">
                  <span className="text-destructive font-medium">Caiu: </span>
                  {p.regressed.map(formatDelta).join(' • ')}
                </p>
              </div>
            )}
            {p.missing.length > 0 && (
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-muted-foreground leading-tight">
                  <span className="text-amber-500 font-medium">Sem registro: </span>
                  {p.missing.join(', ')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action sugerida */}
        <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-foreground/90">
          <span className="text-primary font-medium">Ação: </span>
          {summary.actionLabel}
        </div>

        {/* Resumo para áudio */}
        <div className="rounded-md border border-border bg-secondary/30 p-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <Mic className="h-3 w-3 text-primary" />
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Resumo para áudio
            </p>
          </div>
          <pre className="text-xs text-foreground/90 leading-snug whitespace-pre-wrap font-sans">
{audioSummary}
          </pre>
        </div>

        {/* Orientação da próxima sessão */}
        <div className="rounded-md border border-primary/30 bg-primary/10 p-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <p className="text-[10px] uppercase tracking-wide text-primary font-medium">
                Orientação da próxima sessão
              </p>
            </div>
            <button
              onClick={handleCopyGuidance}
              className="text-[10px] text-primary hover:underline flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> Copiar
            </button>
          </div>
          <p className="text-xs text-foreground/90 leading-snug whitespace-pre-wrap">
            {nextGuidance}
          </p>
        </div>

        {/* Status follow-up info */}
        {followup && bucket === 'espera' && followup.snoozed_until && (
          <p className="text-[10px] text-amber-500">
            ⏰ Volta em {formatSnoozeDate(followup.snoozed_until)}
          </p>
        )}
        {followup && bucket === 'falados' && followup.last_contacted_at && (
          <p className="text-[10px] text-emerald-500">
            ✓ Falado hoje
          </p>
        )}

        {/* Buttons */}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${summary.studentId}`)}>
            <ExternalLink className="h-3 w-3 mr-1" />
            Ver aluno
          </Button>
          {whatsappUrl ? (
            <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10" asChild>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-3 w-3 mr-1" />
                WhatsApp
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs opacity-60" disabled>
              <MessageSquare className="h-3 w-3 mr-1" />
              Sem telefone
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCopy}>
            <Copy className="h-3 w-3 mr-1" />
            Copiar resumo
          </Button>

          {bucket === 'hoje' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-7 text-xs" disabled={busy}>
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
