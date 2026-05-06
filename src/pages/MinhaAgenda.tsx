import React, { useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, MapPin, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { EVENT_TYPE_LABELS, STATUS_COLORS, EVENT_STATUS_LABELS } from '@/hooks/useCalendarEvents';

const MinhaAgenda: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery({
    queryKey: ['student-agenda', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Get event IDs linked to this student
      const { data: links } = await supabase
        .from('calendar_event_students')
        .select('event_id, attendance_status')
        .eq('student_id', user!.id);

      if (!links || links.length === 0) return [];

      const eventIds = links.map(l => l.event_id);
      const statusMap: Record<string, string> = {};
      links.forEach(l => { statusMap[l.event_id] = l.attendance_status; });

      const { data: evs } = await supabase
        .from('calendar_events')
        .select('*')
        .in('id', eventIds)
        .gte('start_datetime', new Date().toISOString())
        .order('start_datetime', { ascending: true })
        .limit(20);

      return (evs || []).map(e => ({
        ...e,
        attendance_status: statusMap[e.id] || 'pendente',
      }));
    },
  });

  const updateAttendance = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: string }) => {
      const updates: any = { attendance_status: status };
      if (status === 'confirmado') updates.confirmed_at = new Date().toISOString();
      if (status === 'cancelado') updates.cancelled_at = new Date().toISOString();

      const { error } = await supabase
        .from('calendar_event_students')
        .update(updates)
        .eq('event_id', eventId)
        .eq('student_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-agenda'] });
      toast.success('Status atualizado');
    },
    onError: () => toast.error('Erro ao atualizar'),
  });

  return (
    <AppLayout>
      <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Minha Agenda
        </h1>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : !events || events.length === 0 ? (
          <div className="text-center py-12">
            <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum treino agendado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev: any) => (
              <Card key={ev.id} className="bg-card border-border/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {format(new Date(ev.start_datetime), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </p>
                      <p className="text-lg font-bold text-primary flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {format(new Date(ev.start_datetime), 'HH:mm')} — {format(new Date(ev.end_datetime), 'HH:mm')}
                      </p>
                    </div>
                    <Badge className={STATUS_COLORS[ev.status] || ''}>
                      {EVENT_STATUS_LABELS[ev.status]}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</span>
                    {ev.location && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" /> {ev.location}
                      </span>
                    )}
                  </div>

                  {ev.notes && <p className="text-xs text-muted-foreground">{ev.notes}</p>}

                  {/* Attendance status */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Sua presença: <span className="capitalize font-medium text-foreground">{ev.attendance_status}</span>
                    </p>
                  </div>

                  {/* Actions */}
                  {ev.status !== 'cancelado' && ev.status !== 'concluido' && (
                    <div className="flex gap-2">
                      {ev.attendance_status !== 'confirmado' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-green-400 border-green-500/30 flex-1"
                          onClick={() => updateAttendance.mutate({ eventId: ev.id, status: 'confirmado' })}
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> Confirmar
                        </Button>
                      )}
                      {ev.attendance_status !== 'cancelado' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-red-400 border-red-500/30 flex-1"
                          onClick={() => updateAttendance.mutate({ eventId: ev.id, status: 'cancelado' })}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-yellow-400 border-yellow-500/30 flex-1"
                        onClick={() => updateAttendance.mutate({ eventId: ev.id, status: 'atrasado' })}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Atraso
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default MinhaAgenda;