import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createCalendarEvent, generateRecurringEvents, checkConflicts, updateCalendarEvent, EVENT_TYPE_LABELS, CalendarEvent } from '@/hooks/useCalendarEvents';
import { getStudentActivePackage, ClassPackage } from '@/hooks/useFinancial';
import { toast } from 'sonner';
import { format } from 'date-fns';

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const addOneHour = (hhmm: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = (parseInt(m[1], 10) + 1) % 24;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

const EVENT_TYPES = Object.entries(EVENT_TYPE_LABELS);
const STATUS_OPTIONS = [
  ['confirmado', 'Confirmado'],
  ['pendente', 'Pendente'],
];

const DAY_OPTIONS = [
  { label: 'Seg', value: 'MO' },
  { label: 'Ter', value: 'TU' },
  { label: 'Qua', value: 'WE' },
  { label: 'Qui', value: 'TH' },
  { label: 'Sex', value: 'FR' },
  { label: 'Sáb', value: 'SA' },
  { label: 'Dom', value: 'SU' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editEvent?: CalendarEvent;
  initialStartTime?: Date;
}

export default function AgendaEventDialog({ open, onClose, onSaved, editEvent, initialStartTime }: Props) {
  const { user } = useAuth();
  const [students, setStudents] = useState<{ user_id: string; nome: string }[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [eventType, setEventType] = useState('personal_presencial');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('confirmado');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [packageAlerts, setPackageAlerts] = useState<Record<string, ClassPackage | null>>({});
  const [recentLocations, setRecentLocations] = useState<string[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('user_id, nome')
      .then(({ data }) => {
        // Filter to only students
        supabase.from('user_roles').select('user_id').eq('role', 'aluno')
          .then(({ data: roles }) => {
            const studentUserIds = new Set(roles?.map(r => r.user_id) || []);
            setStudents((data || []).filter(p => studentUserIds.has(p.user_id)));
          });
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    supabase
      .from('calendar_events')
      .select('location')
      .not('location', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const seen = new Set<string>();
        const uniq: string[] = [];
        (data || []).forEach((r: any) => {
          const v = (r.location || '').trim();
          if (v && !seen.has(v.toLowerCase())) {
            seen.add(v.toLowerCase());
            uniq.push(v);
          }
        });
        setRecentLocations(uniq.slice(0, 10));
      });
  }, [open]);

  useEffect(() => {
    if (editEvent) {
      const start = new Date(editEvent.start_datetime);
      setEventType(editEvent.event_type);
      setDate(format(start, 'yyyy-MM-dd'));
      setStartTime(format(start, 'HH:mm'));
      setEndTime(format(new Date(editEvent.end_datetime), 'HH:mm'));
      setLocation(editEvent.location || '');
      setNotes(editEvent.notes || '');
      setStatus(editEvent.status);
      setIsRecurring(editEvent.is_recurring);
      setSelectedStudentIds(editEvent.students?.map(s => s.student_id) || []);
    } else if (initialStartTime) {
      setDate(format(initialStartTime, 'yyyy-MM-dd'));
      setStartTime(format(initialStartTime, 'HH:mm'));
      const end = new Date(initialStartTime);
      end.setHours(end.getHours() + 1);
      setEndTime(format(end, 'HH:mm'));
    }
  }, [editEvent, initialStartTime]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  // Check packages for selected students (presencial types)
  useEffect(() => {
    const presencialTypes = ['personal_presencial', 'aula_fixa_semanal', 'aula_avulsa', 'atendimento_ginasio'];
    if (!presencialTypes.includes(eventType)) return;
    selectedStudentIds.forEach(async (sid) => {
      if (packageAlerts[sid] !== undefined) return;
      const pkg = await getStudentActivePackage(sid);
      setPackageAlerts(prev => ({ ...prev, [sid]: pkg }));
    });
  }, [selectedStudentIds, eventType]);

  const toggleDay = (d: string) => {
    setRecurringDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const startDt = new Date(`${date}T${startTime}:00`).toISOString();
      const endDt = new Date(`${date}T${endTime}:00`).toISOString();

      // Check conflicts
      const { hasConflict, conflicts: c } = await checkConflicts(startDt, endDt, selectedStudentIds, editEvent?.id);
      if (hasConflict) {
        setConflicts(c);
        const proceed = window.confirm(`⚠️ ${c.join('\n')}\n\nDeseja salvar mesmo assim?`);
        if (!proceed) { setSaving(false); return; }
      }

      const studentNames = selectedStudentIds.map(id => students.find(s => s.user_id === id)?.nome || '').filter(Boolean);
      const title = studentNames.length > 0 ? studentNames.join(' + ') : EVENT_TYPE_LABELS[eventType] || '';

      const eventData = {
        admin_id: user.id,
        title,
        event_type: eventType as any,
        start_datetime: startDt,
        end_datetime: endDt,
        location,
        notes,
        status: status as any,
      };

      if (editEvent) {
        await updateCalendarEvent(editEvent.id, eventData, selectedStudentIds);
        toast.success('Evento atualizado');
      } else if (isRecurring && recurringDays.length > 0) {
        const rule = `FREQ=WEEKLY;BYDAY=${recurringDays.join(',')}`;
        await generateRecurringEvents({ ...eventData, recurrence_rule: rule }, selectedStudentIds);
        toast.success('Aulas recorrentes criadas (12 semanas)');
      } else {
        await createCalendarEvent(eventData, selectedStudentIds);
        toast.success('Evento criado');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter(s =>
    stripAccents(s.nome).includes(stripAccents(searchTerm))
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editEvent ? 'Editar Evento' : 'Novo Agendamento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Students */}
          <div>
            <Label className="text-xs text-muted-foreground">Alunos</Label>
            <Input
              placeholder="Buscar aluno..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="mt-1 mb-2"
            />
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedStudentIds.map(id => {
                const s = students.find(st => st.user_id === id);
                return (
                  <Badge key={id} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleStudent(id)}>
                    {s?.nome} <X className="h-3 w-3" />
                  </Badge>
                );
              })}
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-border p-2">
              {filteredStudents.map(s => (
                <button
                  key={s.user_id}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                    selectedStudentIds.includes(s.user_id) ? 'bg-primary/20 text-primary' : 'hover:bg-secondary text-foreground'
                  }`}
                  onClick={() => toggleStudent(s.user_id)}
                >
                  {s.nome}
                </button>
              ))}
            </div>
          </div>

          {/* Package alerts for presencial events */}
          {['personal_presencial', 'aula_fixa_semanal', 'aula_avulsa', 'atendimento_ginasio'].includes(eventType) && selectedStudentIds.length > 0 && (
            <div className="space-y-1">
              {selectedStudentIds.map(sid => {
                const pkg = packageAlerts[sid];
                const name = students.find(s => s.user_id === sid)?.nome || 'Aluno';
                if (pkg === undefined) return null;
                if (pkg) {
                  return (
                    <div key={sid} className="text-xs bg-green-500/10 text-green-400 rounded-md p-2">
                      ✅ {name}: Saldo disponível — {pkg.remaining_classes} aulas
                    </div>
                  );
                }
                return (
                  <div key={sid} className="text-xs bg-yellow-500/10 text-yellow-400 rounded-md p-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {name}: Sem pacote ativo ou sem saldo de aulas
                  </div>
                );
              })}
            </div>
          )}

          {/* Event type */}
          <div>
            <Label className="text-xs text-muted-foreground">Tipo de Evento</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Início</Label>
              <Input
                type="time"
                value={startTime}
                onChange={e => {
                  const v = e.target.value;
                  setStartTime(v);
                  if (v) setEndTime(addOneHour(v));
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Fim</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Location */}
          <div>
            <Label className="text-xs text-muted-foreground">Local</Label>
            <div className="relative">
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                onFocus={() => setShowLocationSuggestions(true)}
                onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 150)}
                placeholder="Ginásio, sala, online..."
                className="mt-1"
              />
              {showLocationSuggestions && recentLocations.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                  {recentLocations
                    .filter(l => !location || stripAccents(l).includes(stripAccents(location)))
                    .map(l => (
                      <button
                        key={l}
                        type="button"
                        className="w-full text-left text-sm px-3 py-2 hover:bg-secondary text-foreground"
                        onMouseDown={e => { e.preventDefault(); setLocation(l); setShowLocationSuggestions(false); }}
                      >
                        {l}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>

          {/* Recurring */}
          {!editEvent && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                <Label className="text-sm">Repetir semanalmente</Label>
              </div>
              {isRecurring && (
                <div className="flex flex-wrap gap-2">
                  {DAY_OPTIONS.map(d => (
                    <Button
                      key={d.value}
                      size="sm"
                      variant={recurringDays.includes(d.value) ? 'default' : 'outline'}
                      onClick={() => toggleDay(d.value)}
                      className="text-xs h-8"
                    >
                      {d.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
              <div className="text-xs text-yellow-300">
                {conflicts.map((c, i) => <p key={i}>{c}</p>)}
              </div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Salvando...' : editEvent ? 'Atualizar' : 'Criar Agendamento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}