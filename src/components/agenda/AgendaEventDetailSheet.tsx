import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarEvent, EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, STATUS_COLORS, updateCalendarEvent, deleteCalendarEvent } from '@/hooks/useCalendarEvents';
import { ClassPackage } from '@/hooks/useFinancial';
import { supabase } from '@/integrations/supabase/client';
import ClassDeductionDialog from '@/components/financial/ClassDeductionDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Edit, Trash2, CheckCircle, XCircle, UserCheck, MapPin, Clock, Users, RefreshCw, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import AgendaEventDialog from './AgendaEventDialog';

interface Props {
  event: CalendarEvent;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export default function AgendaEventDetailSheet({ event, open, onClose, onRefresh }: Props) {
  const [showEdit, setShowEdit] = useState(false);
  const [deductionTarget, setDeductionTarget] = useState<{ studentId: string; studentName: string; pkg: ClassPackage | null; allPackages?: ClassPackage[] } | null>(null);

  const handleConcluido = async () => {
    try {
      await updateCalendarEvent(event.id, { status: 'concluido' as any });
      toast.success('Marcado como concluído');
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
    } catch {
      toast.error('Erro ao atualizar status');
    }
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

  const handleDelete = async () => {
    if (!window.confirm('Excluir este evento?')) return;
    try {
      await deleteCalendarEvent(event.id);
      toast.success('Evento excluído');
      onRefresh();
      onClose();
    } catch {
      toast.error('Erro ao excluir');
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
              <Button variant="outline" size="sm" onClick={handleConcluido} className="gap-1 text-green-400 border-green-500/30">
                <CheckCircle className="h-3.5 w-3.5" /> Concluído
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('falta')} className="gap-1 text-red-400 border-red-500/30">
                <XCircle className="h-3.5 w-3.5" /> Falta
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('cancelado')} className="gap-1 text-orange-400 border-orange-500/30">
                <XCircle className="h-3.5 w-3.5" /> Cancelar
              </Button>
            </div>

            <Button variant="destructive" size="sm" onClick={handleDelete} className="w-full gap-1">
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
    </>
  );
}