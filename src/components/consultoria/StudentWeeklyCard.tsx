import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  Sparkles,
  MessageSquare,
  Copy,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { buildWhatsAppUrl } from '@/hooks/useNotifications';
import { ADHERENCE_SHORT_LABEL, ADHERENCE_BADGE_CLASS } from '@/lib/weeklyAdherence';
import { formatDelta } from '@/lib/weeklyProgression';
import type { StudentWeeklySummary, AttentionKind } from '@/hooks/useStudentsWeeklySummary';

const ATTENTION_BADGE: Record<AttentionKind, { label: string; cls: string }> = {
  regressao: { label: 'Regressão', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  baixa_aderencia: { label: 'Baixa aderência', cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
  sem_progresso: { label: 'Sem progresso', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  dados_insuficientes: { label: 'Dados insuficientes', cls: 'bg-muted text-muted-foreground border-border' },
  reanalisar: { label: 'Reanalisar', cls: 'bg-violet-500/15 text-violet-500 border-violet-500/30' },
  ok: { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
};

interface Props {
  summary: StudentWeeklySummary;
}

const buildSummaryText = (s: StudentWeeklySummary): string => {
  const a = s.adherence;
  const p = s.progression;
  const firstName = (s.studentName ?? 'aluno').split(' ')[0];
  const lines: string[] = [`Oi ${firstName}! 💪 Bora um resumo rápido da sua semana?`];

  if (a) {
    const sessions = `${a.sessionsExecuted}/${a.sessionsPlanned || '?'} treinos`;
    const sets = a.setsTotal > 0 ? ` · ${a.setsWithLoad}/${a.setsTotal} séries com carga` : '';
    lines.push(`📊 *Aderência:* ${sessions}${sets}`);
  }
  if (p?.improved?.length) {
    lines.push(`✅ *Evoluiu em:* ${p.improved.map(formatDelta).join(' • ')}`);
  }
  if (p?.regressed?.length) {
    lines.push(`⚠️ *Caiu em:* ${p.regressed.map(formatDelta).join(' • ')}`);
  }
  if (p?.missing?.length) {
    lines.push(`📝 *Sem registro:* ${p.missing.join(', ')}`);
  }
  lines.push(`\n👉 *Ação:* ${s.actionLabel}`);
  return lines.join('\n');
};

const StudentWeeklyCard: React.FC<Props> = ({ summary }) => {
  const navigate = useNavigate();
  const att = ATTENTION_BADGE[summary.attention];
  const a = summary.adherence;
  const p = summary.progression;

  const sessionsLine = a
    ? `${a.sessionsExecuted}/${a.sessionsPlanned || '?'} treinos${a.setsTotal > 0 ? ` • ${a.setsWithLoad}/${a.setsTotal} séries c/ carga` : ''}`
    : 'Sem plano de treino ativo';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText(summary));
      toast({ title: 'Resumo copiado', description: 'Cole no WhatsApp do aluno.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const whatsappUrl = summary.studentPhone
    ? buildWhatsAppUrl(summary.studentPhone, buildSummaryText(summary))
    : null;

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

        {/* Action */}
        <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-foreground/90">
          <span className="text-primary font-medium">Ação: </span>
          {summary.actionLabel}
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${summary.studentId}`)}>
            <ExternalLink className="h-3 w-3 mr-1" />
            Ver aluno
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${summary.studentId}?tab=ia`)}>
            <Sparkles className="h-3 w-3 mr-1" />
            Reanalisar
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
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentWeeklyCard;