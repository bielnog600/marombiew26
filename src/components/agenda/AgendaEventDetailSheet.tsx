import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarEvent, EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, STATUS_COLORS, updateCalendarEvent, deleteCalendarEvent, deleteCalendarEventSeries, countFutureSeriesEvents } from '@/hooks/useCalendarEvents';
import { ClassPackage } from '@/hooks/useFinancial';
import { supabase } from '@/integrations/supabase/client';
import ClassDeductionDialog from '@/components/financial/ClassDeductionDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Edit, Trash2, CheckCircle, XCircle, MapPin, Clock, Users, RefreshCw, MessageSquare, CalendarClock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import AgendaEventDialog from './AgendaEventDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  event: CalendarEvent;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export default function AgendaEventDetailSheet({ event, open, onClose, onRefresh }: Props) {
  const [showEdit, setShowEdit] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showDeleteChoice, setShowDeleteChoice] = useState(false);
  const [futureCount, setFutureCount] = useState<number>(1);
  const [deductionTarget, setDeductionTarget] = useState<{ studentId: string; studentName: string; pkg: ClassPackage | null; allPackages?: ClassPackage[] } | null>(null);
  const { user } = useAuth();

  // Defaults para reagendamento: mesmo horário no dia seguinte
  const origStart = new Date(event.start_datetime);
  const origEnd = new Date(event.end_datetime);
  const durationMs = origEnd.getTime() - origStart.getTime();
  const tomorrow = new Date(origStart.getTime() + 24 * 60 * 60 * 1000);
  const toLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [newStart, setNewStart] = useState<string>(toLocalInput(tomorrow));

  /**
   * Marca a aula como realizada (concluído) e abre o diálogo para
   * descontar 1 crédito do pacote do aluno.
   */
  const handleRealizada = async () => {
    try {
      await updateCalendarEvent(event.id, { status: 'concluido' as any });
      toast.success('Aula marcada como realizada');
      await openDeductionForFirstStudent();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  /**
   * Marca como falta sem aviso e abre o diálogo de desconto de crédito.
   * Falta com aviso e cancelamento NÃO descontam crédito.
   */
  const handleFaltaSemAviso = async () => {
    try {
      await updateCalendarEvent(event.id, { status: 'falta' as any });
      toast.success('Marcado como falta sem aviso');
      await openDeductionForFirstStudent();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const openDeductionForFirstStudent = async () => {
      // Check if any student has active package to offer deduction
      if (event.students && event.students.length > 0) {
        for (const s of event.students) {
          const { data: pkgs } = await supabase
            .from('class_packages')
            .select('*')
            .eq('student_id', s.student_id)
            .eq('status', 'ativo')
            .order('created_at', { ascending: false });
          const activePkgs = (pkgs || []) as ClassPackage[];
          setDeductionTarget({
            studentId: s.student_id,
            studentName: s.student_name || 'Aluno',
            pkg: activePkgs[0] || null,
            allPackages: activePkgs,
          });
          return;
        }
      }
      onRefresh();
      onClose();
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateCalendarEvent(event.id, { status: newStatus as any });
      toast.success(`Status atualizado para ${EVENT_STATUS_LABELS[newStatus]}`);
      onRefresh();
      onClose();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  /**
   * Reagendamento: o evento original NÃO consome crédito.
   * Ele recebe status "reagendado" e referenciamos o novo evento nas
   * observações. Em seguida criamos um novo evento na data/hora escolhida
   * com os mesmos alunos. O crédito só será descontado quando o novo
   * evento for marcado como realizado.
   */
  const handleReschedule = async () => {
    if (!newStart) { toast.error('Escolha a nova data/horário'); return; }
    try {
      const startDt = new Date(newStart);
      const endDt = new Date(startDt.getTime() + (durationMs > 0 ? durationMs : 60 * 60 * 1000));

      // Cria novo evento
      const { data: created, error: cErr } = await supabase
        .from('calendar_events')
        .insert({
          admin_id: event.admin_id || user?.id,
          title: event.title || 'Treino (reagendado)',
          event_type: event.event_type as any,
          start_datetime: startDt.toISOString(),
          end_datetime: endDt.toISOString(),
          location: event.location || '',
          status: 'confirmado',
          notes: `Reagendado de ${format(origStart, "dd/MM 'às' HH:mm", { locale: ptBR })}.${event.notes ? `\n${event.notes}` : ''}`,
        } as any)
        .select('id')
        .single();
      if (cErr || !created) throw cErr || new Error('Falha ao criar novo evento');

      // Replica alunos
      if (event.students && event.students.length > 0) {
        await supabase.from('calendar_event_students').insert(
          event.students.map(s => ({
            event_id: created.id,
            student_id: s.student_id,
            attendance_status: 'pendente',
          })) as any
        );
      }

      // Marca original como reagendado (sem desconto de crédito)
      const reNote = `Reagendado para ${format(startDt, "dd/MM 'às' HH:mm", { locale: ptBR })}.`;
      await updateCalendarEvent(event.id, {
        status: 'reagendado' as any,
        notes: event.notes ? `${event.notes}\n${reNote}` : reNote,
      });

      toast.success('Aula reagendada — nenhum crédito foi descontado');
      setShowReschedule(false);
      onRefresh();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao reagendar');
    }
  };

  const handleDeleteClick = async () => {
    // Se faz parte de uma série recorrente, oferece escolha
    if (event.recurrence_group_id) {
      try {
        const count = await countFutureSeriesEvents(event.id);
        if (count > 1) {
          setFutureCount(count);
          setShowDeleteChoice(true);
          return;
        }
      } catch {
        // ignora e cai para confirmação simples
      }
    }
    if (!window.confirm('Excluir este evento?')) return;
    await doDeleteSingle();
  };

  const doDeleteSingle = async () => {
    try {
      await deleteCalendarEvent(event.id);
      toast.success('Evento excluído');
      setShowDeleteChoice(false);
      onRefresh();
      onClose();
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const doDeleteSeries = async () => {
    try {
      const n = await deleteCalendarEventSeries(event.id);
      toast.success(`${n} evento(s) da série excluído(s)`);
      setShowDeleteChoice(false);
      onRefresh();
      onClose();
    } catch {
      toast.error('Erro ao excluir a série');
    }
  };

  const whatsAppMessage = (studentName: string) => {
    const dt = format(new Date(event.start_datetime), "EEEE 'às' HH:mm", { locale: ptBR });
    return encodeURIComponent(`Olá ${studentName}, passando para confirmar o teu treino de ${dt}.`);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {format(new Date(event.start_datetime), 'HH:mm')} — {format(new Date(event.end_datetime), 'HH:mm')}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4">
            {/* Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_COLORS[event.status] || ''}>
                  {EVENT_STATUS_LABELS[event.status]}
                </Badge>
                {event.is_recurring && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <RefreshCw className="h-3 w-3" /> Semanal
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground">{EVENT_TYPE_LABELS[event.event_type]}</p>

              {event.location && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {event.location}
                </p>
              )}

              <p className="text-sm text-muted-foreground">
                {format(new Date(event.start_datetime), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </p>
            </div>

            {/* Students */}
            {event.students && event.students.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Alunos ({event.students.length})
                </p>
                <div className="space-y-2">
                  {event.students.map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-secondary/50 rounded-lg p-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.student_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{s.attendance_status}</p>
                      </div>
                      <a
                        href={`https://wa.me/?text=${whatsAppMessage(s.student_name || '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-green-400 hover:text-green-300"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {event.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Observações</p>
                <p className="text-sm text-foreground">{event.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} className="gap-1">
                <Edit className="h-3.5 w-3.5" /> Editar
              </Button>
              <Button variant="outline" size="sm" onClick={handleRealizada} className="gap-1 text-green-400 border-green-500/30">
                <CheckCircle className="h-3.5 w-3.5" /> Realizada
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowReschedule(true)} className="gap-1 text-blue-400 border-blue-500/30">
                <CalendarClock className="h-3.5 w-3.5" /> Reagendar
              </Button>
              <Button variant="outline" size="sm" onClick={handleFaltaSemAviso} className="gap-1 text-red-400 border-red-500/30">
                <XCircle className="h-3.5 w-3.5" /> Falta s/ aviso
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('falta_justificada')} className="gap-1 text-orange-400 border-orange-500/30">
                <AlertCircle className="h-3.5 w-3.5" /> Falta c/ aviso
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('cancelado')} className="gap-1 text-muted-foreground col-span-2">
                <XCircle className="h-3.5 w-3.5" /> Cancelar (sem desconto)
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug">
              💡 Crédito do pacote é descontado apenas em <b>Realizada</b> ou <b>Falta sem aviso</b>.
              <br />Reagendar, Cancelar e Falta com aviso <b>não</b> consomem aula.
            </p>

            <Button variant="destructive" size="sm" onClick={handleDeleteClick} className="w-full gap-1">
              <Trash2 className="h-3.5 w-3.5" /> Excluir Evento
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {showEdit && (
        <AgendaEventDialog
          open={showEdit}
          onClose={() => setShowEdit(false)}
          onSaved={() => { onRefresh(); onClose(); }}
          editEvent={event}
        />
      )}

      <Dialog open={showReschedule} onOpenChange={setShowReschedule}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-blue-400" /> Reagendar aula
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Original: {format(origStart, "EEEE, dd/MM 'às' HH:mm", { locale: ptBR })}.
              <br />A aula original ficará marcada como <b>reagendada</b> e não consumirá crédito.
              O crédito só será descontado quando a nova aula for marcada como realizada.
            </p>
            <div className="space-y-1">
              <Label htmlFor="new-start" className="text-xs">Nova data e horário</Label>
              <Input
                id="new-start"
                type="datetime-local"
                value={newStart}
                onChange={e => setNewStart(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReschedule(false)}>Cancelar</Button>
            <Button onClick={handleReschedule} className="gap-1">
              <CalendarClock className="h-4 w-4" /> Confirmar reagendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deductionTarget && (
        <ClassDeductionDialog
          open={!!deductionTarget}
          onOpenChange={v => { if (!v) setDeductionTarget(null); }}
          onSuccess={() => { onRefresh(); onClose(); }}
          studentId={deductionTarget.studentId}
          studentName={deductionTarget.studentName}
          pkg={deductionTarget.pkg}
          allPackages={deductionTarget.allPackages}
          calendarEventId={event.id}
        />
      )}

      <Dialog open={showDeleteChoice} onOpenChange={setShowDeleteChoice}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-400" /> Excluir evento recorrente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Este evento faz parte de uma série semanal com{' '}
              <b className="text-foreground">{futureCount}</b> ocorrência(s) a partir desta data.
              Como deseja excluir?
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button variant="outline" onClick={doDeleteSingle} className="w-full gap-1">
              <Trash2 className="h-4 w-4" /> Apenas este evento
            </Button>
            <Button variant="destructive" onClick={doDeleteSeries} className="w-full gap-1">
              <Trash2 className="h-4 w-4" /> Este e todos os futuros ({futureCount})
            </Button>
            <Button variant="ghost" onClick={() => setShowDeleteChoice(false)} className="w-full">
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}