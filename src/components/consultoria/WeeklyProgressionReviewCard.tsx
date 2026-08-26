import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, TrendingUp, Calendar, CheckCircle2, AlertCircle, Gauge } from 'lucide-react';
import { buildWhatsAppUrl } from '@/hooks/useNotifications';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { StudentProgressionReview } from '@/hooks/useWeeklyProgressionReview';
import { buildProgressionContactMessage } from '@/lib/progressionContactMessage';
import { attentionPriorityLabel, intensityLabel } from '@/lib/trainingIntensityAttention';

interface WeeklyProgressionReviewCardProps {
  review: StudentProgressionReview;
  onContacted: (studentId: string, planId: string) => void;
}

const priorityClass = (p: StudentProgressionReview['attentionPriority']) => {
  if (p === 'high') return 'bg-destructive/10 text-destructive border-destructive/30';
  if (p === 'attention_only') return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
  if (p === 'medium') return 'bg-primary/10 text-primary border-primary/30';
  return 'bg-secondary/50 text-muted-foreground border-border/50';
};

const WeeklyProgressionReviewCard: React.FC<WeeklyProgressionReviewCardProps> = ({ 
  review, 
  onContacted 
}) => {
  const message = buildProgressionContactMessage({
    studentName: review.studentName,
    rpe: review.latestSessionRpe,
    priority: review.attentionPriority,
    recommendations: review.recommendations,
  });

  const increases = review.recommendations.filter(r => r.nextAction !== 'maintain');
  const hasIncreases = increases.length > 0;
  const lowIntensity = review.intensityStatus === 'low' || review.intensityStatus === 'very_low';

  return (
    <Card className={`glass-card transition-all hover:shadow-lg ${!review.hasPendingReview ? 'opacity-70' : ''}`}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
              {review.studentName[0]}
            </div>
            <div>
              <h4 className="font-semibold text-sm">{review.studentName}</h4>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] uppercase font-bold bg-secondary/50">
                  Fase: {review.currentPhase}
                </Badge>
                {review.attentionPriority !== 'none' && (
                  <Badge className={`text-[10px] font-bold ${priorityClass(review.attentionPriority)}`}>
                    {attentionPriorityLabel(review.attentionPriority)}
                  </Badge>
                )}
                {review.hasPendingReview ? (
                  <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-[10px]">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Contato iniciado
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          {review.studentPhone && (
            <Button 
              size="sm" 
              variant="outline" 
              className="h-8 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10"
              asChild
              onClick={() => review.planId && onContacted(review.studentId, review.planId)}
            >
              <a 
                href={buildWhatsAppUrl(review.studentPhone, message)} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                WhatsApp
              </a>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold mb-1">
              <Gauge className="h-3 w-3" />
              RPE último treino
            </div>
            <p className="text-xs font-medium">
              {review.latestSessionRpe != null ? `${review.latestSessionRpe}/10` : 'Sem registro'}
              {lowIntensity && ' · Intensidade baixa'}
              {review.intensityStatus === 'maximal' && ' · Esforço máximo'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold mb-1">
              <TrendingUp className="h-3 w-3" />
              Progresso
            </div>
            <p className="text-xs font-medium">
              {hasIncreases ? `${increases.length} ajustes sugeridos` : intensityLabel(review.intensityStatus)}
            </p>
          </div>
        </div>

        {hasIncreases && (
          <ul className="space-y-1">
            {increases.slice(0, 4).map((r) => (
              <li key={r.exerciseName} className="text-xs text-muted-foreground">
                • {r.exerciseName}{' '}
                <span className="text-foreground font-medium">
                  {r.nextAction === 'increase_load' ? `+${Math.round(r.suggestedIncrement * 10) / 10} kg` : '+1 rep'}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!hasIncreases && review.attentionPriority === 'attention_only' && (
          <p className="text-xs text-orange-500">Intensidade abaixo do alvo — revisar execução/esforço</p>
        )}

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {review.lastContactedAt
            ? `Último contato: ${format(new Date(review.lastContactedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}`
            : 'Nenhum contato'}
        </div>
      </CardContent>
    </Card>
  );
};

export default WeeklyProgressionReviewCard;
