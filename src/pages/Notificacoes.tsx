import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useNotifications, NotificationType } from '@/hooks/useNotifications';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, CalendarClock, Cake, Phone, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const typeConfig: Record<NotificationType, { icon: React.ElementType; label: string; color: string }> = {
  reavaliacao: { icon: CalendarClock, label: 'Reavaliação', color: 'text-orange-500' },
  aniversario: { icon: Cake, label: 'Aniversário', color: 'text-pink-500' },
  mensagem_semanal: { icon: MessageSquare, label: 'Mensagem Semanal', color: 'text-blue-500' },
  sem_telefone: { icon: Phone, label: 'Sem Telefone', color: 'text-red-500' },
};

const priorityBadge: Record<string, string> = {
  high: 'bg-destructive text-destructive-foreground',
  medium: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  low: 'bg-muted text-muted-foreground',
};

const Notificacoes: React.FC = () => {
  const { notifications, loading, count, refresh } = useNotifications();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');

  const filtered = tab === 'all' ? notifications : notifications.filter(n => n.type === tab);

  const buildWhatsAppUrl = (phone: string, message: string) => {
    const cleaned = phone.replace(/\D/g, '');
    const num = cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  };

  const getQuickMessage = (n: typeof notifications[0]) => {
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
          </TabsList>

          <TabsContent value={tab} className="mt-4 space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum alerta nesta categoria 🎉
                </CardContent>
              </Card>
            ) : (
              filtered.map((n) => {
                const config = typeConfig[n.type];
                const Icon = config.icon;
                return (
                  <Card key={n.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${config.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{n.title}</span>
                            <Badge variant="outline" className={`text-[10px] ${priorityBadge[n.priority]}`}>
                              {n.priority === 'high' ? 'Urgente' : n.priority === 'medium' ? 'Atenção' : 'Info'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{n.description}</p>
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            {n.type === 'sem_telefone' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => navigate(`/alunos?edit=${n.studentId}`)}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Editar cadastro
                              </Button>
                            ) : n.studentPhone ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10"
                                asChild
                              >
                                <a
                                  href={buildWhatsAppUrl(n.studentPhone, getQuickMessage(n))}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <MessageSquare className="h-3 w-3 mr-1" />
                                  Enviar WhatsApp
                                </a>
                              </Button>
                            ) : (
                              <div className="flex items-center gap-1 text-xs text-destructive">
                                <AlertTriangle className="h-3 w-3" />
                                Sem telefone cadastrado
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => navigate(`/alunos/${n.studentId}`)}
                            >
                              Ver aluno
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Notificacoes;
