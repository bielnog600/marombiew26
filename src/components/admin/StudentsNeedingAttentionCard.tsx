import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, MessageSquare, ArrowRight } from 'lucide-react';
import { startOfWeek, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { buildWhatsAppUrl } from '@/hooks/useNotifications';
import { useWeeklyProgressionReview } from '@/hooks/useWeeklyProgressionReview';
import { buildProgressionContactMessage } from '@/lib/progressionContactMessage';
import { attentionPriorityLabel } from '@/lib/trainingIntensityAttention';

const MAX_ITEMS = 5;

const StudentsNeedingAttentionCard: React.FC = () => {
  const navigate = useNavigate();
  const { data: reviews, isLoading, refetch } = useWeeklyProgressionReview();

  const pending = (reviews || []).filter(
    (r) => r.hasPendingReview && r.attentionPriority !== 'none',
  );
  const visible = pending.slice(0, MAX_ITEMS);

  const markContacted = async (studentId: string) => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('weekly_progression_contacts').upsert(
      {
        student_id: studentId,
        week_start: format(weekStart, 'yyyy-MM-dd'),
        admin_id: user.id,
        whatsapp_opened_at: new Date().toISOString(),
      } as any,
      { onConflict: 'admin_id,student_id,week_start' },
    );
    refetch();
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Alunos que precisam de atenção
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Intensidade e progressão</p>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {pending.length} pendentes
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aluno pendente nesta semana.</p>
        ) : (
          visible.map((r) => {
            const increases = r.recommendations.filter((x) => x.nextAction !== 'maintain');
            const message = buildProgressionContactMessage({
              studentName: r.studentName,
              rpe: r.latestSessionRpe,
              priority: r.attentionPriority,
              recommendations: r.recommendations,
            });
            return (
              <div
                key={r.studentId}
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{r.studentName}</p>
                    <Badge variant="outline" className="text-[9px] font-bold">
                      {attentionPriorityLabel(r.attentionPriority)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.latestSessionRpe != null ? `RPE ${r.latestSessionRpe}/10` : 'Sem RPE'}
                    {' · '}
                    {increases.length > 0 ? `${increases.length} progressões` : 'Intensidade baixa'}
                  </p>
                </div>
                {r.studentPhone && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10 shrink-0"
                    asChild
                    onClick={() => markContacted(r.studentId)}
                  >
                    <a
                      href={buildWhatsAppUrl(r.studentPhone, message)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            );
          })
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => navigate('/consultoria?tab=alertas&filtro=progressao')}
        >
          Ver todos os alertas
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default StudentsNeedingAttentionCard;
