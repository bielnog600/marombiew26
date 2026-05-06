import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useCalendarEvents, EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, STATUS_COLORS, CalendarEvent } from '@/hooks/useCalendarEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, CalendarDays, ChevronLeft, ChevronRight, Settings, RefreshCw, Users, MapPin, Clock } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, addDays, addWeeks, addMonths, subWeeks, subMonths, isSameDay, isToday, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AgendaEventDialog from '@/components/agenda/AgendaEventDialog';
import AgendaEventDetailSheet from '@/components/agenda/AgendaEventDetailSheet';
import AgendaNotificationSettings from '@/components/agenda/AgendaNotificationSettings';

type ViewMode = 'week' | 'day' | 'month';

const Agenda: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const rangeStart = useMemo(() => {
    if (viewMode === 'day') return startOfDay(currentDate);
    if (viewMode === 'week') return startOfWeek(currentDate, { weekStartsOn: 1 });
    return startOfMonth(currentDate);
  }, [viewMode, currentDate]);

  const rangeEnd = useMemo(() => {
    if (viewMode === 'day') return endOfDay(currentDate);
    if (viewMode === 'week') return endOfWeek(currentDate, { weekStartsOn: 1 });
    return endOfMonth(currentDate);
  }, [viewMode, currentDate]);

  const { events, loading, refetch } = useCalendarEvents(rangeStart, rangeEnd);

  const navigate = (dir: number) => {
    if (viewMode === 'day') setCurrentDate(prev => addDays(prev, dir));
    else if (viewMode === 'week') setCurrentDate(prev => dir > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1));
    else setCurrentDate(prev => dir > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  // Dashboard stats
  const todayEvents = events.filter(e => isSameDay(new Date(e.start_datetime), new Date()));
  const tomorrowEvents = events.filter(e => isSameDay(new Date(e.start_datetime), addDays(new Date(), 1)));
  const nextEvent = events.find(e => new Date(e.start_datetime) >= new Date() && e.status !== 'cancelado');
  const cancelledCount = events.filter(e => e.status === 'cancelado').length;

  return (
    <AppLayout>
      <div className="p-4 pb-24 space-y-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Agenda
          </h1>
          <div className="flex gap-2">
            <Button size="icon" variant="ghost" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1">
              <Plus className="h-4 w-4" /> Agendar
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-primary">{todayEvents.length}</p>
              <p className="text-xs text-muted-foreground">Hoje</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{tomorrowEvents.length}</p>
              <p className="text-xs text-muted-foreground">Amanhã</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-sm font-semibold text-foreground">
                {nextEvent ? format(new Date(nextEvent.start_datetime), 'HH:mm') : '—'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {nextEvent?.students?.[0]?.student_name || 'Próximo'}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{cancelledCount}</p>
              <p className="text-xs text-muted-foreground">Cancelados</p>
            </CardContent>
          </Card>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(['day', 'week', 'month'] as ViewMode[]).map(m => (
              <Button
                key={m}
                size="sm"
                variant={viewMode === m ? 'default' : 'ghost'}
                onClick={() => setViewMode(m)}
                className="text-xs capitalize"
              >
                {m === 'day' ? 'Dia' : m === 'week' ? 'Semana' : 'Mês'}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground min-w-[120px] text-center">
              {viewMode === 'day'
                ? format(currentDate, "dd 'de' MMMM", { locale: ptBR })
                : viewMode === 'week'
                ? `${format(rangeStart, 'dd/MM')} - ${format(rangeEnd, 'dd/MM')}`
                : format(currentDate, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button size="icon" variant="ghost" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setCurrentDate(new Date())}>
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : viewMode === 'day' ? (
          <DayView events={events} date={currentDate} onEventClick={setSelectedEvent} />
        ) : viewMode === 'week' ? (
          <WeekView events={events} rangeStart={rangeStart} onEventClick={setSelectedEvent} />
        ) : (
          <MonthView events={events} currentDate={currentDate} onEventClick={setSelectedEvent} onDayClick={(d) => { setCurrentDate(d); setViewMode('day'); }} />
        )}
      </div>

      {showCreateDialog && (
        <AgendaEventDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onSaved={refetch}
        />
      )}

      {selectedEvent && (
        <AgendaEventDetailSheet
          event={selectedEvent}
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onRefresh={refetch}
        />
      )}

      {showSettings && (
        <AgendaNotificationSettings
          open={showSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </AppLayout>
  );
};

// ── Day View ──
function DayView({ events, date, onEventClick }: { events: CalendarEvent[]; date: Date; onEventClick: (e: CalendarEvent) => void }) {
  const dayEvents = events.filter(e => isSameDay(new Date(e.start_datetime), date));
  if (dayEvents.length === 0) return <p className="text-center text-muted-foreground py-8">Nenhum evento neste dia</p>;
  return (
    <div className="space-y-2">
      {dayEvents.map(ev => <EventCard key={ev.id} event={ev} onClick={() => onEventClick(ev)} />)}
    </div>
  );
}

// ── Week View ──
function WeekView({ events, rangeStart, onEventClick }: { events: CalendarEvent[]; rangeStart: Date; onEventClick: (e: CalendarEvent) => void }) {
  const days = eachDayOfInterval({ start: rangeStart, end: addDays(rangeStart, 6) });
  return (
    <div className="space-y-4">
      {days.map(day => {
        const dayEvents = events.filter(e => isSameDay(new Date(e.start_datetime), day));
        return (
          <div key={day.toISOString()}>
            <p className={`text-sm font-semibold mb-2 ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
              {format(day, "EEEE, dd/MM", { locale: ptBR })}
              {isToday(day) && <span className="ml-2 text-xs text-primary">(hoje)</span>}
            </p>
            {dayEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-2">Sem eventos</p>
            ) : (
              <div className="space-y-2">
                {dayEvents.map(ev => <EventCard key={ev.id} event={ev} onClick={() => onEventClick(ev)} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Month View ──
function MonthView({ events, currentDate, onEventClick, onDayClick }: { events: CalendarEvent[]; currentDate: Date; onEventClick: (e: CalendarEvent) => void; onDayClick: (d: Date) => void }) {
  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start, end });
  return (
    <div className="grid grid-cols-7 gap-1">
      {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => (
        <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
      ))}
      {/* Offset for first day */}
      {Array.from({ length: (start.getDay() + 6) % 7 }).map((_, i) => <div key={`empty-${i}`} />)}
      {days.map(day => {
        const dayEvents = events.filter(e => isSameDay(new Date(e.start_datetime), day));
        return (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={`p-1 rounded-lg text-center min-h-[48px] transition-colors ${
              isToday(day) ? 'bg-primary/20 border border-primary/50' : 'hover:bg-secondary'
            }`}
          >
            <span className={`text-xs ${isToday(day) ? 'text-primary font-bold' : 'text-foreground'}`}>
              {format(day, 'd')}
            </span>
            {dayEvents.length > 0 && (
              <div className="flex justify-center gap-0.5 mt-1">
                {dayEvents.slice(0, 3).map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary" />
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Event Card ──
function EventCard({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const studentNames = event.students?.map(s => s.student_name).filter(Boolean) || [];
  const displayName = studentNames.length <= 2
    ? studentNames.join(' + ')
    : `${studentNames.length} alunos — ${studentNames.slice(0, 2).join(', ')}...`;

  return (
    <Card
      className="bg-card border-border/50 cursor-pointer hover:border-primary/40 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-3 flex gap-3">
        <div className="text-center min-w-[48px]">
          <p className="text-lg font-bold text-primary leading-none">
            {format(new Date(event.start_datetime), 'HH:mm')}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {format(new Date(event.end_datetime), 'HH:mm')}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-foreground truncate">{displayName || event.title || 'Evento'}</p>
            {event.is_recurring && <RefreshCw className="h-3 w-3 text-muted-foreground shrink-0" />}
          </div>
          <div className="flex flex-wrap gap-1 items-center text-xs text-muted-foreground">
            <span>{EVENT_TYPE_LABELS[event.event_type] || event.event_type}</span>
            {event.location && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{event.location}</span>
              </>
            )}
          </div>
        </div>
        <Badge className={`shrink-0 text-[10px] h-5 ${STATUS_COLORS[event.status] || ''}`}>
          {EVENT_STATUS_LABELS[event.status] || event.status}
        </Badge>
      </CardContent>
    </Card>
  );
}

export default Agenda;