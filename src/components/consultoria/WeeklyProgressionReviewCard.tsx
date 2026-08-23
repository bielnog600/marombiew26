import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, TrendingUp, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { buildWhatsAppUrl } from '@/hooks/useNotifications';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { StudentProgressionReview } from '@/hooks/useWeeklyProgressionReview';

interface WeeklyProgressionReviewCardProps {
  review: StudentProgressionReview;
  onContacted: (studentId: string, planId: string) => void;
}

const WeeklyProgressionReviewCard: React.FC<WeeklyProgressionReviewCardProps> = ({ 
  review, 
  onContacted 
}) => {
  const getProgressionMessage = () => {
    const firstName = review.studentName.split(' ')[0];
    const recs = review.recommendations.filter(r => r.nextAction !== 'maintain');
    
    if (recs.length === 0) {
      return `Oi ${firstName}! 🔥 Passando pra avisar que analisei seus treinos e você está mandando muito bem na constância! Para essa semana, vamos manter as cargas e focar na técnica perfeita. Bora pra cima! 💪`;
    }

    const recText = recs.map(r => {
      const action = r.nextAction === 'increase_load' ? 'Aumentar carga' : 'Aumentar reps';
      const detail = r.nextAction === 'increase_load' 
        ? `+${r.suggestedIncrement}kg` 
        : `+1 rep`;
      return `• ${r.exerciseName}: ${action} (${detail})`;
    }).join('\n');

    return `Oi ${firstName}! 🔥 Analisei sua performance da semana passada e preparei os ajustes de progressão para essa nova fase:\n\n${recText}\n\nO app já vai te mostrar essas sugestões na hora do treino. Qualquer dúvida me chama! Bora esmagar! 🚀`;
  };

  const hasIncreases = review.recommendations.some(r => r.nextAction !== 'maintain');

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
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] uppercase font-bold bg-secondary/50">
                  Fase: {review.currentPhase}
                </Badge>
                {review.hasPendingReview ? (
                  <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-[10px]">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Enviado
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
                href={buildWhatsAppUrl(review.studentPhone, getProgressionMessage())} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Enviar Feedback
              </a>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold mb-1">
              <TrendingUp className="h-3 w-3" />
              Progresso
            </div>
            <p className="text-xs font-medium">
              {hasIncreases 
                ? `${review.recommendations.filter(r => r.nextAction !== 'maintain').length} ajustes sugeridos` 
                : 'Manutenção de cargas'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold mb-1">
              <Calendar className="h-3 w-3" />
              Último Contato
            </div>
            <p className="text-xs font-medium">
              {review.lastContactedAt 
                ? format(new Date(review.lastContactedAt), "dd/MM 'às' HH:mm", { locale: ptBR })
                : 'Nenhum contato'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WeeklyProgressionReviewCard;
