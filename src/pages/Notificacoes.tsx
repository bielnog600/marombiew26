import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useNotifications, NotificationType, buildWhatsAppUrl, Notification } from '@/hooks/useNotifications';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, CalendarClock, Cake, Phone, AlertTriangle, RefreshCw, ExternalLink, Dumbbell, UtensilsCrossed, X, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const typeConfig: Record<NotificationType, { icon: React.ElementType; label: string; color: string }> = {
  reavaliacao: { icon: CalendarClock, label: 'Reavaliação', color: 'text-orange-500' },
  aniversario: { icon: Cake, label: 'Aniversário', color: 'text-pink-500' },
  mensagem_semanal: { icon: MessageSquare, label: 'Mensagem Semanal', color: 'text-blue-500' },
  sem_telefone: { icon: Phone, label: 'Sem Telefone', color: 'text-red-500' },
  sem_treino: { icon: Dumbbell, label: 'Sem Treino', color: 'text-amber-500' },
  sem_dieta: { icon: UtensilsCrossed, label: 'Sem Dieta', color: 'text-emerald-500' },
  ficha_mensal: { icon: FileText, label: 'Ficha Mensal', color: 'text-violet-500' },
};

const priorityBadge: Record<string, string> = {
  high: 'bg-destructive text-destructive-foreground',
  medium: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  low: 'bg-muted text-muted-foreground',
};

interface GroupedStudent {
  studentId: string;
  studentName: string;
  studentPhone?: string | null;
  notifications: Notification[];
  highestPriority: 'high' | 'medium' | 'low';
}

const Notificacoes: React.FC = () => {
  const { notifications, loading, count, refresh, dismissNotification } = useNotifications();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');

  const filtered = tab === 'all' ? notifications : notifications.filter(n => n.type === tab);

  // Group filtered notifications by student
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedStudent>();
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    for (const n of filtered) {
      if (!map.has(n.studentId)) {
        map.set(n.studentId, {
          studentId: n.studentId,
          studentName: n.studentName,
          studentPhone: n.studentPhone,
          notifications: [],
          highestPriority: n.priority,
        });
      }
      const group = map.get(n.studentId)!;
      group.notifications.push(n);
      if (priorityOrder[n.priority] < priorityOrder[group.highestPriority]) {
        group.highestPriority = n.priority;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => priorityOrder[a.highestPriority] - priorityOrder[b.highestPriority]
    );
  }, [filtered]);

  const getQuickMessage = (n: Notification) => {
    switch (n.type) {
      case 'reavaliacao':
        return `Olá ${n.studentName}! 😊 Está na hora da sua reavaliação. Vamos agendar? Entre em contato para marcarmos o melhor horário!`;
      case 'aniversario':
        return `Parabéns ${n.studentName}! 🎂🎉 Desejo tudo de melhor nesse novo ciclo! Continue firme nos treinos! 💪`;
      case 'mensagem_semanal':
        return `Olá ${n.studentName}! Como foi a semana de treinos? Alguma dúvida ou feedback? Estou aqui para ajudar! 💪`;
      default:
        return '';
    }
  };

  const tabCounts = {
    all: count,
    reavaliacao: notifications.filter(n => n.type === 'reavaliacao').length,
    aniversario: notifications.filter(n => n.type === 'aniversario').length,
    mensagem_semanal: notifications.filter(n => n.type === 'mensagem_semanal').length,
    sem_telefone: notifications.filter(n => n.type === 'sem_telefone').length,
    sem_treino: notifications.filter(n => n.type === 'sem_treino').length,
    sem_dieta: notifications.filter(n => n.type === 'sem_dieta').length,
    ficha_mensal: notifications.filter(n => n.type === 'ficha_mensal').length,
  };

  const renderNotifAction = (n: Notification) => {
    if (n.type === 'sem_telefone') {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos?edit=${n.studentId}`)}>
          <ExternalLink className="h-3 w-3 mr-1" />
          Editar cadastro
        </Button>
      );
    }
    if (n.type === 'sem_treino' || n.type === 'sem_dieta') {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${n.studentId}`)}>
          <ExternalLink className="h-3 w-3 mr-1" />
          {n.type === 'sem_treino' ? 'Gerar treino' : 'Gerar dieta'}
        </Button>
      );
    }
    if (n.type === 'ficha_mensal') {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${n.studentId}`)}>
          <FileText className="h-3 w-3 mr-1" />
          Enviar ficha
        </Button>
      );
    }
    if (n.studentPhone) {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10" asChild>
          <a href={buildWhatsAppUrl(n.studentPhone, getQuickMessage(n))} target="_blank" rel="noopener noreferrer">
            <MessageSquare className="h-3 w-3 mr-1" />
            WhatsApp
          </a>
        </Button>
      );
    }
    return (
      <div className="flex items-center gap-1 text-xs text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Sem telefone
      </div>
    );
  };

  return (
    <AppLayout title="Notificações">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {count} alerta{count !== 1 ? 's' : ''} pendente{count !== 1 ? 's' : ''}
          </p>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full flex overflow-x-auto">
            <TabsTrigger value="all" className="flex-1 min-w-0">Todos ({tabCounts.all})</TabsTrigger>
            <TabsTrigger value="reavaliacao" className="flex-1 min-w-0">Reavaliação ({tabCounts.reavaliacao})</TabsTrigger>
            <TabsTrigger value="aniversario" className="flex-1 min-w-0">Aniversário ({tabCounts.aniversario})</TabsTrigger>
            <TabsTrigger value="mensagem_semanal" className="flex-1 min-w-0">Semanal ({tabCounts.mensagem_semanal})</TabsTrigger>
            <TabsTrigger value="sem_telefone" className="flex-1 min-w-0">Sem Tel ({tabCounts.sem_telefone})</TabsTrigger>
            <TabsTrigger value="sem_treino" className="flex-1 min-w-0">Sem Treino ({tabCounts.sem_treino})</TabsTrigger>
            <TabsTrigger value="sem_dieta" className="flex-1 min-w-0">Sem Dieta ({tabCounts.sem_dieta})</TabsTrigger>
            <TabsTrigger value="ficha_mensal" className="flex-1 min-w-0">Ficha ({tabCounts.ficha_mensal})</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4 space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))
            ) : grouped.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum alerta nesta categoria 🎉
                </CardContent>
              </Card>
            ) : (
              grouped.map((group) => (
                <Card key={group.studentId} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    {/* Student header */}
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80"
                        onClick={() => navigate(`/alunos/${group.studentId}`)}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-xs">
                          {group.studentName[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-sm">{group.studentName}</span>
                        <Badge variant="outline" className={`text-[10px] ${priorityBadge[group.highestPriority]}`}>
                          {group.notifications.length} alerta{group.notifications.length > 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => navigate(`/alunos/${group.studentId}`)}
                      >
                        Ver aluno
                      </Button>
                    </div>

                    {/* Individual alerts within the group */}
                    <div className="space-y-2 pl-10">
                      {group.notifications.map((n) => {
                        const config = typeConfig[n.type];
                        const Icon = config.icon;
                        return (
                          <div key={n.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
                            <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium">{n.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{n.description}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {renderNotifAction(n)}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => dismissNotification(n.id)}
                                title="Dispensar até o próximo mês"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Notificacoes;
