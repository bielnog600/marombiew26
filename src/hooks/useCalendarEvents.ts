import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, addWeeks, format } from 'date-fns';

export type CalendarEvent = {
  id: string;
  admin_id: string;
  title: string;
  event_type: string;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  location: string;
  notes: string;
  status: string;
  is_recurring: boolean;
  recurrence_rule: string | null;
  recurrence_group_id: string | null;
  created_at: string;
  updated_at: string;
  students?: EventStudent[];
};

export type EventStudent = {
  id: string;
  event_id: string;
  student_id: string;
  attendance_status: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  student_name?: string;
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  personal_presencial: 'Personal Presencial',
  aula_fixa_semanal: 'Aula Fixa Semanal',
  aula_avulsa: 'Aula Avulsa',
  atendimento_ginasio: 'Atendimento Ginásio',
  avaliacao_fisica: 'Avaliação Física',
  checkin: 'Check-in',
  consultoria_online: 'Consultoria Online',
  aula_grupo: 'Aula de Grupo',
  outro: 'Outro',
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  confirmado: 'Confirmado',
  pendente: 'Pendente',
  cancelado: 'Cancelado',
  reagendado: 'Reagendado',
  concluido: 'Concluído',
  falta: 'Falta',
  falta_justificada: 'Falta Justificada',
};

export const STATUS_COLORS: Record<string, string> = {
  confirmado: 'bg-green-500/20 text-green-400 border-green-500/30',
  pendente: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  cancelado: 'bg-red-500/20 text-red-400 border-red-500/30',
  reagendado: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  concluido: 'bg-green-500/20 text-green-300 border-green-500/30',
  falta: 'bg-red-500/20 text-red-300 border-red-500/30',
  falta_justificada: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

export function useCalendarEvents(rangeStart: Date, rangeEnd: Date) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('start_datetime', rangeStart.toISOString())
        .lte('start_datetime', rangeEnd.toISOString())
        .order('start_datetime', { ascending: true });

      if (error) throw error;

      // Fetch students for each event
      const eventIds = (data || []).map(e => e.id);
      let studentsMap: Record<string, EventStudent[]> = {};

      if (eventIds.length > 0) {
        const { data: cesData } = await supabase
          .from('calendar_event_students')
          .select('*')
          .in('event_id', eventIds);

        if (cesData) {
          // Get student names
          const studentIds = [...new Set(cesData.map(s => s.student_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, nome')
            .in('user_id', studentIds);

          const nameMap: Record<string, string> = {};
          profiles?.forEach(p => { nameMap[p.user_id] = p.nome; });

          cesData.forEach(s => {
            if (!studentsMap[s.event_id]) studentsMap[s.event_id] = [];
            studentsMap[s.event_id].push({
              ...s,
              student_name: nameMap[s.student_id] || 'Aluno',
            });
          });
        }
      }

      setEvents((data || []).map(e => ({
        ...e,
        students: studentsMap[e.id] || [],
      })));
    } catch (err) {
      console.error('Error fetching calendar events:', err);
    } finally {
      setLoading(false);
    }
  }, [user, rangeStart.toISOString(), rangeEnd.toISOString()]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

   // Realtime subscription disabled to prevent flashing during drag & drop updates
   // useEffect(() => {
   //   const channel = supabase
   //     .channel('calendar-events-changes')
   //     .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => fetchEvents())
   //     .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_event_students' }, () => fetchEvents())
   //     .subscribe();
   //   return () => { supabase.removeChannel(channel); };
   // }, [fetchEvents]);

  return { events, loading, refetch: fetchEvents };
}

export async function createCalendarEvent(
  eventData: {
    admin_id: string;
    title: string;
    event_type: string;
    start_datetime: string;
    end_datetime: string;
    location?: string;
    notes?: string;
    status?: string;
    is_recurring?: boolean;
    recurrence_rule?: string;
    recurrence_group_id?: string;
  },
  studentIds: string[]
) {
  const { data: event, error } = await supabase
    .from('calendar_events')
    .insert(eventData as any)
    .select()
    .single();

  if (error) throw error;

  if (studentIds.length > 0) {
    const studentRows = studentIds.map(sid => ({
      event_id: event.id,
      student_id: sid,
    }));
    const { error: sErr } = await supabase
      .from('calendar_event_students')
      .insert(studentRows as any);
    if (sErr) throw sErr;
  }

  return event;
}

export async function generateRecurringEvents(
  baseEvent: {
    admin_id: string;
    title: string;
    event_type: string;
    start_datetime: string;
    end_datetime: string;
    location?: string;
    notes?: string;
    status?: string;
    recurrence_rule: string;
  },
  studentIds: string[],
  weekCount: number = 12
) {
  const groupId = crypto.randomUUID();
  const startDate = new Date(baseEvent.start_datetime);
  const endDate = new Date(baseEvent.end_datetime);
  const durationMs = endDate.getTime() - startDate.getTime();

  // Parse days from RRULE like FREQ=WEEKLY;BYDAY=MO,TH
  const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const byDayMatch = baseEvent.recurrence_rule.match(/BYDAY=([A-Z,]+)/);
  const days = byDayMatch ? byDayMatch[1].split(',').map(d => dayMap[d] ?? 0) : [startDate.getDay()];

  const events: any[] = [];
  for (let w = 0; w < weekCount; w++) {
    for (const dayNum of days) {
      const weekStart = addWeeks(startOfWeek(startDate, { weekStartsOn: 1 }), w);
      const eventDay = new Date(weekStart);
      eventDay.setDate(weekStart.getDate() + ((dayNum - 1 + 7) % 7));
      eventDay.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

      if (eventDay < startDate) continue;

      const evStart = eventDay.toISOString();
      const evEnd = new Date(eventDay.getTime() + durationMs).toISOString();

      events.push({
        ...baseEvent,
        start_datetime: evStart,
        end_datetime: evEnd,
        is_recurring: true,
        recurrence_group_id: groupId,
      });
    }
  }

  // Insert all events
  const { data: created, error } = await supabase
    .from('calendar_events')
    .insert(events)
    .select();

  if (error) throw error;

  // Insert students for all events
  if (studentIds.length > 0 && created) {
    const studentRows = created.flatMap(ev =>
      studentIds.map(sid => ({ event_id: ev.id, student_id: sid }))
    );
    await supabase.from('calendar_event_students').insert(studentRows as any);
  }

  return created;
}

export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<CalendarEvent>,
  studentIds?: string[]
) {
  const { students, ...cleanUpdates } = updates as any;
  const { error } = await supabase
    .from('calendar_events')
    .update(cleanUpdates)
    .eq('id', eventId);
  if (error) throw error;

  if (studentIds !== undefined) {
    await supabase.from('calendar_event_students').delete().eq('event_id', eventId);
    if (studentIds.length > 0) {
      await supabase.from('calendar_event_students').insert(
        studentIds.map(sid => ({ event_id: eventId, student_id: sid })) as any
      );
    }
  }
}

export async function deleteCalendarEvent(eventId: string) {
  const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
  if (error) throw error;
}

export async function checkConflicts(
  startDt: string,
  endDt: string,
  studentIds: string[],
  excludeEventId?: string
): Promise<{ hasConflict: boolean; conflicts: string[] }> {
  const conflicts: string[] = [];

  // Check admin time conflicts
  let query = supabase
    .from('calendar_events')
    .select('id, title, start_datetime, end_datetime')
    .lt('start_datetime', endDt)
    .gt('end_datetime', startDt)
    .not('status', 'eq', 'cancelado');

  if (excludeEventId) query = query.neq('id', excludeEventId);

  const { data: overlapping } = await query;
  if (overlapping && overlapping.length > 0) {
    conflicts.push(`${overlapping.length} evento(s) se sobrepõem neste horário`);
  }

  // Check student conflicts
  if (studentIds.length > 0) {
    const { data: studentEvents } = await supabase
      .from('calendar_event_students')
      .select('event_id, student_id')
      .in('student_id', studentIds);

    if (studentEvents && studentEvents.length > 0) {
      const eventIds = studentEvents.map(se => se.event_id);
      let studentQuery = supabase
        .from('calendar_events')
        .select('id, title')
        .in('id', eventIds)
        .lt('start_datetime', endDt)
        .gt('end_datetime', startDt)
        .not('status', 'eq', 'cancelado');
      if (excludeEventId) studentQuery = studentQuery.neq('id', excludeEventId);
      const { data: sConflicts } = await studentQuery;
      if (sConflicts && sConflicts.length > 0) {
        conflicts.push(`Aluno(s) já tem ${sConflicts.length} evento(s) neste horário`);
      }
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}