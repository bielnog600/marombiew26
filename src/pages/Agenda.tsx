import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useCalendarEvents, EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, STATUS_COLORS, CalendarEvent } from '@/hooks/useCalendarEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
 import { Plus, CalendarDays, ChevronLeft, ChevronRight, Settings, RefreshCw, Users, MapPin, Clock, GripVertical, Info } from 'lucide-react';
 import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, addDays, addWeeks, addMonths, subWeeks, subMonths, isSameDay, isToday, eachDayOfInterval, addMinutes, differenceInMinutes } from 'date-fns';
 import { toast } from 'sonner';
 import {
   DndContext,
   closestCenter,
   KeyboardSensor,
   PointerSensor,
   TouchSensor,
   useSensor,
   useSensors,
   DragEndEvent,
   DragOverlay,
   DragStartEvent,
   defaultDropAnimationSideEffects,
 } from '@dnd-kit/core';
 import {
   arrayMove,
   SortableContext,
   sortableKeyboardCoordinates,
   verticalListSortingStrategy,
   useSortable,
 } from '@dnd-kit/sortable';
 import { useDroppable } from '@dnd-kit/core';
 import { CSS } from '@dnd-kit/utilities';
 import { updateCalendarEvent } from '@/hooks/useCalendarEvents';
import { ptBR } from 'date-fns/locale';
import AgendaEventDialog from '@/components/agenda/AgendaEventDialog';
import AgendaEventDetailSheet from '@/components/agenda/AgendaEventDetailSheet';
import AgendaNotificationSettings from '@/components/agenda/AgendaNotificationSettings';
import { AgendaHeader } from '@/components/agenda/AgendaHeader';
import { AgendaStats } from '@/components/agenda/AgendaStats';
import { AgendaNavigation } from '@/components/agenda/AgendaNavigation';

type ViewMode = 'week' | 'day' | 'month';

  const Agenda: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [initialDialogTime, setInitialDialogTime] = useState<Date | null>(null);
    const [dragNewEventStart, setDragNewEventStart] = useState<Date | null>(null);
    const [dragNewEventEnd, setDragNewEventEnd] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [optimisticEvents, setOptimisticEvents] = useState<CalendarEvent[] | null>(null);
 
   const sensors = useSensors(
     useSensor(PointerSensor, {
       activationConstraint: {
         distance: 8,
       },
     }),
     useSensor(TouchSensor, {
       activationConstraint: {
         delay: 250,
         tolerance: 5,
       },
     }),
     useSensor(KeyboardSensor, {
       coordinateGetter: sortableKeyboardCoordinates,
     })
   );
 
   const handleDragStart = (event: DragStartEvent) => {
     setActiveDragId(event.active.id as string);
   };
 
    const handleDragEnd = async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
  
      if (over) {
        const activeEvent = events.find(e => e.id === active.id);
        const overId = over.id as string;
  
        if (activeEvent && (overId.startsWith('slot-') || overId !== active.id)) {
          let newStartTime: string;
          let newEndTime: string;

          if (overId.startsWith('slot-')) {
            const [_, hour, minute] = overId.split('-');
            const newStart = new Date(currentDate);
            newStart.setHours(parseInt(hour), parseInt(minute), 0, 0);
            const duration = differenceInMinutes(
              new Date(activeEvent.end_datetime),
              new Date(activeEvent.start_datetime)
            );
            const newEnd = addMinutes(newStart, duration);
            newStartTime = newStart.toISOString();
            newEndTime = newEnd.toISOString();
          } else {
            const overEvent = events.find(e => e.id === overId);
            if (!overEvent) return;
            newStartTime = overEvent.start_datetime;
            const duration = differenceInMinutes(
              new Date(activeEvent.end_datetime),
              new Date(activeEvent.start_datetime)
            );
            newEndTime = addMinutes(new Date(newStartTime), duration).toISOString();
          }

          // Apply optimistic update immediately
          const updatedEvents = events.map(e => 
            e.id === activeEvent.id 
              ? { ...e, start_datetime: newStartTime, end_datetime: newEndTime } 
              : e
          );
          setOptimisticEvents(updatedEvents);

          try {
            await updateCalendarEvent(activeEvent.id, {
              start_datetime: newStartTime,
              end_datetime: newEndTime,
            });
            toast.success('Horário atualizado com sucesso');
            refetch();
          } catch (error) {
            setOptimisticEvents(null);
            toast.error('Erro ao atualizar horário');
          }
        }
      }
    };
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

   const { events: serverEvents, loading, refetch } = useCalendarEvents(rangeStart, rangeEnd);

   // Use optimistic events if available, otherwise server events
   const events = useMemo(() => optimisticEvents || serverEvents, [optimisticEvents, serverEvents]);

   // Reset optimistic events when server events change
   React.useEffect(() => {
     setOptimisticEvents(null);
   }, [serverEvents]);

  const navigate = (dir: number) => {
    if (viewMode === 'day') setCurrentDate(prev => addDays(prev, dir));
    else if (viewMode === 'week') setCurrentDate(prev => addDays(prev, dir * 7));
    else setCurrentDate(prev => addMonths(prev, dir));
  };

  // Dashboard stats
  const todayEvents = events.filter(e => isSameDay(new Date(e.start_datetime), new Date()));
  const tomorrowEvents = events.filter(e => isSameDay(new Date(e.start_datetime), addDays(new Date(), 1)));
  const nextEvent = events.find(e => new Date(e.start_datetime) >= new Date() && e.status !== 'cancelado');
  const cancelledCount = events.filter(e => e.status === 'cancelado').length;

  const pendingCount = events.filter(e => e.status === 'pendente').length;

  return (
    <AppLayout>
      <div className="p-4 pb-24 space-y-4 max-w-5xl mx-auto">
        <AgendaHeader 
          onSettingsClick={() => setShowSettings(true)}
          onAgendarClick={() => setShowCreateDialog(true)}
        />

        <AgendaStats 
          todayCount={todayEvents.length}
          nextEvent={nextEvent ? format(new Date(nextEvent.start_datetime), 'HH:mm') : '—'}
          nextStudent={nextEvent?.students?.[0]?.student_name || 'Próximo'}
          pendingCount={pendingCount}
          cancelledCount={cancelledCount}
        />

        <AgendaNavigation 
          viewMode={viewMode}
          currentDate={currentDate}
          onViewModeChange={setViewMode}
          onNavigate={navigate}
          onGoToToday={() => setCurrentDate(new Date())}
        />

        {/* Content */}
         <DndContext
           sensors={sensors}
           collisionDetection={closestCenter}
           onDragStart={handleDragStart}
           onDragEnd={handleDragEnd}
         >
            {loading && !optimisticEvents ? (
             <div className="space-y-3">
               {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
             </div>
           ) : viewMode === 'day' ? (
             <DayView 
               events={events} 
               date={currentDate} 
               onEventClick={setSelectedEvent} 
               onSlotClick={(time) => {
                 setInitialDialogTime(time);
                 setShowCreateDialog(true);
               }}
               dragNewEventStart={dragNewEventStart}
               dragNewEventEnd={dragNewEventEnd}
               setDragNewEventStart={setDragNewEventStart}
               setDragNewEventEnd={setDragNewEventEnd}
               onDragCreateComplete={(start, end) => {
                 setInitialDialogTime(start);
                 setShowCreateDialog(true);
               }}
               onDateChange={setCurrentDate}
               allEvents={events}
             />
           ) : viewMode === 'week' ? (
             <WeekView events={events} rangeStart={rangeStart} onEventClick={setSelectedEvent} />
           ) : (
             <MonthView events={events} currentDate={currentDate} onEventClick={setSelectedEvent} onDayClick={(d) => { setCurrentDate(d); setViewMode('day'); }} />
           )}
 
           <DragOverlay>
             {activeDragId ? (
               <EventCard 
                 event={events.find(e => e.id === activeDragId)!} 
                 onClick={() => {}} 
                 isOverlay 
               />
             ) : null}
           </DragOverlay>
         </DndContext>
      </div>

      {showCreateDialog && (
        <AgendaEventDialog
          open={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            setInitialDialogTime(null);
          }}
          onSaved={refetch}
          initialStartTime={initialDialogTime || undefined}
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

function WeekDayStrip({ selectedDate, onSelect, events }: { selectedDate: Date; onSelect: (d: Date) => void; events: CalendarEvent[] }) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  return (
    <div className="grid grid-cols-7 gap-0 border-b border-border/50 bg-secondary/10 shrink-0">
      {days.map(day => {
        const today = isToday(day);
        const selected = isSameDay(day, selectedDate);
        const count = events.filter(e => isSameDay(new Date(e.start_datetime), day)).length;
        return (
          <button
            key={day.toISOString()}
            onClick={() => onSelect(day)}
            className={`flex flex-col items-center justify-center py-1.5 border-r border-border/20 last:border-r-0 transition-colors ${
              selected
                ? 'bg-primary/20 ring-1 ring-inset ring-primary/60'
                : today
                  ? 'bg-primary/5 hover:bg-primary/10'
                  : 'hover:bg-primary/5'
            }`}
          >
            <span className={`text-[9px] font-black uppercase tracking-wider leading-none ${
              selected ? 'text-primary' : today ? 'text-primary/80' : 'text-muted-foreground'
            }`}>
              {format(day, 'EEE', { locale: ptBR }).replace('.', '')}
            </span>
            <span className={`text-sm font-bold tabular-nums leading-tight mt-0.5 ${
              selected ? 'text-primary' : today ? 'text-primary/90' : 'text-foreground'
            }`}>
              {format(day, 'dd')}
            </span>
            {count > 0 && (
              <span className={`text-[8px] font-bold leading-none mt-0.5 ${
                selected ? 'text-primary/80' : 'text-muted-foreground/70'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

 // ── Day View Component ──
 function DayView({ 
  events, 
  date, 
  onEventClick, 
  onSlotClick,
  dragNewEventStart,
  dragNewEventEnd,
  setDragNewEventStart,
  setDragNewEventEnd,
  onDragCreateComplete,
  onDateChange,
  allEvents,
}: { 
  events: CalendarEvent[]; 
  date: Date; 
  onEventClick: (e: CalendarEvent) => void; 
  onSlotClick: (d: Date) => void;
  dragNewEventStart: Date | null;
  dragNewEventEnd: Date | null;
  setDragNewEventStart: (d: Date | null) => void;
  setDragNewEventEnd: (d: Date | null) => void;
  onDragCreateComplete: (start: Date, end: Date) => void;
  onDateChange: (d: Date) => void;
  allEvents: CalendarEvent[];
}) {
   const dayEvents = useMemo(() => 
     events.filter(e => isSameDay(new Date(e.start_datetime), date)),
     [events, date]
   );
 
   const timeSlots = useMemo(() => {
     const slots = [];
     for (let hour = 0; hour <= 23; hour++) {
       slots.push({ hour, minute: 0 });
       slots.push({ hour, minute: 30 });
     }
     return slots;
   }, []);
 
   const [now, setNow] = React.useState(new Date());
   const containerRef = React.useRef<HTMLDivElement>(null);
 
    React.useEffect(() => {
      const timer = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(timer);
    }, []);
 
   // Scroll to current time on mount
   React.useEffect(() => {
     if (isToday(date) && containerRef.current) {
       const currentHour = now.getHours();
       // Slots start at 0:00. Each slot is 56px. 2 slots per hour.
       const slotHeight = 56;
       const hoursFromStart = currentHour;
       if (hoursFromStart >= 0) {
         const scrollPos = hoursFromStart * 2 * slotHeight;
         containerRef.current.scrollTop = scrollPos - 120; // Center it a bit
       }
     }
   }, [date]);
 
   const currentTimePosition = useMemo(() => {
     if (!isToday(date)) return null;
      const hour = now.getHours();
      const minute = now.getMinutes();
     
     const minutesFromStart = hour * 60 + minute;
     const pixelsPerMinute = 56 / 30; // 56px per 30 min (height set in TimeSlot)
     return minutesFromStart * pixelsPerMinute;
   }, [now, date]);
 
   const handleGlobalMouseUp = React.useCallback(() => {
     if (dragNewEventStart && dragNewEventEnd) {
       const start = dragNewEventStart < dragNewEventEnd ? dragNewEventStart : dragNewEventEnd;
       const end = dragNewEventStart < dragNewEventEnd ? dragNewEventEnd : dragNewEventStart;
       // Add 30 mins to end to cover the full slot
       const finalEnd = new Date(end);
       finalEnd.setMinutes(finalEnd.getMinutes() + 30);
       onDragCreateComplete(start, finalEnd);
     }
     setDragNewEventStart(null);
     setDragNewEventEnd(null);
   }, [dragNewEventStart, dragNewEventEnd, onDragCreateComplete, setDragNewEventStart, setDragNewEventEnd]);

   React.useEffect(() => {
     window.addEventListener('mouseup', handleGlobalMouseUp);
     window.addEventListener('touchend', handleGlobalMouseUp);
     return () => {
       window.removeEventListener('mouseup', handleGlobalMouseUp);
       window.removeEventListener('touchend', handleGlobalMouseUp);
     };
   }, [handleGlobalMouseUp]);

   const selectionStyles = useMemo(() => {
     if (!dragNewEventStart || !dragNewEventEnd) return null;
     
     const start = dragNewEventStart < dragNewEventEnd ? dragNewEventStart : dragNewEventEnd;
     const end = dragNewEventStart < dragNewEventEnd ? dragNewEventEnd : dragNewEventStart;
     
     const startMinutes = start.getHours() * 60 + start.getMinutes();
     const endMinutes = end.getHours() * 60 + end.getMinutes() + 30;
     
     const top = (startMinutes / 30) * 56;
     const height = ((endMinutes - startMinutes) / 30) * 56;
     
     return { top, height };
   }, [dragNewEventStart, dragNewEventEnd]);

  return (
    <div className="space-y-0 relative border border-border/50 rounded-xl bg-card/30 flex flex-col h-[calc(100vh-260px)] min-h-[500px] overflow-hidden shadow-sm select-none">
      <WeekDayStrip selectedDate={date} onSelect={onDateChange} events={allEvents} />
      <div className="px-3 py-1.5 bg-secondary/20 flex items-center justify-between border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-black uppercase tracking-wider ${isToday(date) ? 'text-primary' : 'text-foreground'}`}>
            {format(date, 'EEE', { locale: ptBR })}
          </span>
          <span className="text-sm font-bold text-foreground tabular-nums">
            {format(date, 'dd/MM')}
          </span>
          <span className="text-[10px] text-muted-foreground">· {dayEvents.length} aulas</span>
        </div>
        <div className="text-[10px] text-muted-foreground/60 italic">
          Segure para agendar
        </div>
      </div>
      <div 
        ref={containerRef} 
        className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth custom-scrollbar touch-pan-y"
      >
        {selectionStyles && (
          <div 
            className="absolute left-14 right-0 z-10 bg-primary/20 border-2 border-primary rounded-md pointer-events-none flex items-center justify-center"
            style={{ 
              top: `${selectionStyles.top}px`, 
              height: `${selectionStyles.height}px`,
              transition: 'all 0.05s ease-out'
            }}
          >
            <div className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
              Novo Agendamento
            </div>
          </div>
        )}
        {currentTimePosition !== null && (
          <div 
            className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
            style={{ top: `${currentTimePosition}px` }}
          >
            <div className="w-14 flex justify-end pr-1.5">
              <span className="text-[10px] font-black text-white bg-red-600 px-1.5 py-0.5 rounded shadow-lg border border-red-500 whitespace-nowrap">
                {format(now, 'HH:mm')}
              </span>
            </div>
            <div className="flex-1 h-[2px] bg-red-600 relative opacity-80">
              <div className="absolute left-0 -top-[3px] w-2.5 h-2.5 rounded-full bg-red-600 shadow-md ring-2 ring-background" />
            </div>
          </div>
        )}
        <SortableContext items={dayEvents.map(e => e.id)} strategy={verticalListSortingStrategy}>
          {timeSlots.map(({ hour, minute }) => {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            const slotId = `slot-${hour}-${minute}`;
            const eventsInSlot = dayEvents.filter(e => {
              const d = new Date(e.start_datetime);
              if (d.getHours() !== hour) return false;
              const m = d.getMinutes();
              return minute === 0 ? m < 30 : m >= 30;
            });

            return (
              <TimeSlot 
                key={slotId} 
                id={slotId} 
                time={timeStr}
                isHalfHour={minute === 30}
                onPress={() => {
                  const slotTime = new Date(date);
                  slotTime.setHours(hour, minute, 0, 0);
                  onSlotClick(slotTime);
                }}
                isDraggingNew={(() => {
                  if (!dragNewEventStart || !dragNewEventEnd) return false;
                  const slotTime = new Date(date);
                  slotTime.setHours(hour, minute, 0, 0);
                  const start = dragNewEventStart < dragNewEventEnd ? dragNewEventStart : dragNewEventEnd;
                  const end = dragNewEventStart < dragNewEventEnd ? dragNewEventEnd : dragNewEventStart;
                  return slotTime >= start && slotTime <= end;
                })()}
                onDragStart={() => {
                  const slotTime = new Date(date);
                  slotTime.setHours(hour, minute, 0, 0);
                  setDragNewEventStart(slotTime);
                  setDragNewEventEnd(slotTime);
                }}
                onDragEnter={() => {
                  if (dragNewEventStart) {
                    const slotTime = new Date(date);
                    slotTime.setHours(hour, minute, 0, 0);
                    setDragNewEventEnd(slotTime);
                  }
                }}
              >
                {eventsInSlot.map(ev => (
                  <SortableEventCard key={ev.id} event={ev} onEventClick={onEventClick} />
                ))}
              </TimeSlot>
            );
          })}
        </SortableContext>
      </div>
    </div>
  );
}

 function TimeSlot({ 
  id, 
  time, 
  children, 
  isHalfHour, 
  onPress,
  isDraggingNew,
  onDragStart,
  onDragEnter
}: { 
  id: string; 
  time: string; 
  children?: React.ReactNode; 
  isHalfHour: boolean; 
  onPress: () => void;
  isDraggingNew?: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [isPressing, setIsPressing] = React.useState(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.event-card-container')) return;
    
    // Set a timer to detect long press
    timerRef.current = setTimeout(() => {
      onDragStart?.();
      // On mobile, providing haptic feedback if possible
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 1500); // 1.5s hold to prevent accidental triggers while scrolling
  };

  const handleEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  const handleMouseEnter = () => {
    onDragEnter?.();
  };

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id === id) {
        onDragEnter?.();
      }
    };
    window.addEventListener('agenda-slot-enter', handler);
    return () => window.removeEventListener('agenda-slot-enter', handler);
  }, [id, onDragEnter]);

  const handleTouchMove = (e: React.TouchEvent) => {
    // If user moves finger before long-press fires, cancel creation (allow scrolling)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // After long-press fired, extend selection by detecting slot under the finger
    const touch = e.touches[0];
    if (!touch) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const slotEl = el?.closest('[data-slot-id]') as HTMLElement | null;
    if (slotEl) {
      const ev = new CustomEvent('agenda-slot-enter', { detail: { id: slotEl.dataset.slotId } });
      window.dispatchEvent(ev);
    }
  };

  return (
    <div 
      ref={setNodeRef}
      data-slot-id={id}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchMove={handleTouchMove}
      onMouseEnter={handleMouseEnter}
      className={`flex min-h-[56px] border-b ${isHalfHour ? 'border-border/10' : 'border-border/30'} last:border-0 transition-colors w-full overflow-hidden ${
        isOver ? 'bg-primary/5' : ''
      } relative`}
    >
      <div className={`w-14 flex items-start justify-center pt-3 border-r border-border/20 shrink-0 ${isHalfHour ? 'bg-transparent' : 'bg-secondary/5'}`}>
        <span className={`text-[10px] font-bold ${isHalfHour ? 'text-muted-foreground/30' : 'text-muted-foreground/60'}`}>
          {time}
        </span>
      </div>
      <div className="flex-1 p-1 space-y-1 min-w-0 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
 
 function SortableEventCard({ event, onEventClick }: { event: CalendarEvent; onEventClick: (e: CalendarEvent) => void }) {
   const {
     attributes,
     listeners,
     setNodeRef,
     isDragging,
   } = useSortable({ 
     id: event.id,
     animateLayoutChanges: () => false // Desabilita animação de reordenamento automático para evitar o "pulo"
   });
 
   const style = {
     opacity: isDragging ? 0.3 : 1,
   };
 
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="event-card-container">
       <EventCard 
         event={event} 
         onClick={() => onEventClick(event)} 
         dragHandleProps={listeners} 
       />
     </div>
   );
 }

 // ── Week View ──
 function WeekView({ events, rangeStart, onEventClick }: { events: CalendarEvent[]; rangeStart: Date; onEventClick: (e: CalendarEvent) => void }) {
   const days = eachDayOfInterval({ start: rangeStart, end: addDays(rangeStart, 6) });
   const dayRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

   const scrollToDay = (day: Date) => {
     const el = dayRefs.current[day.toISOString()];
     if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
   };

   return (
     <div className="flex flex-col h-[calc(100vh-260px)] min-h-[500px] border border-border/50 rounded-xl bg-card/30 overflow-hidden shadow-sm">
       {/* Header com dias da semana */}
       <div className="grid grid-cols-7 gap-0 border-b border-border/50 bg-secondary/20 shrink-0">
         {days.map(day => {
           const dayEvents = events.filter(e => isSameDay(new Date(e.start_datetime), day));
           const today = isToday(day);
           return (
             <button
               key={day.toISOString()}
               onClick={() => scrollToDay(day)}
               className={`flex flex-col items-center justify-center py-2 border-r border-border/30 last:border-r-0 transition-colors ${
                 today ? 'bg-primary/15' : 'hover:bg-primary/5'
               }`}
             >
               <span className={`text-[10px] font-black uppercase tracking-wider ${today ? 'text-primary' : 'text-muted-foreground'}`}>
                 {format(day, 'EEE', { locale: ptBR }).replace('.', '')}
               </span>
               <span className={`text-base font-bold leading-tight tabular-nums ${today ? 'text-primary' : 'text-foreground'}`}>
                 {format(day, 'dd')}
               </span>
               {dayEvents.length > 0 && (
                 <span className={`text-[9px] font-bold leading-none mt-0.5 ${today ? 'text-primary/80' : 'text-muted-foreground/70'}`}>
                   {dayEvents.length}
                 </span>
               )}
             </button>
           );
         })}
       </div>

       {/* Conteúdo rolável por dia */}
       <div className="flex-1 overflow-y-auto p-3 space-y-4">
         {days.map(day => {
           const dayEvents = events.filter(e => isSameDay(new Date(e.start_datetime), day));
           return (
             <div
               key={day.toISOString()}
               ref={el => { dayRefs.current[day.toISOString()] = el; }}
             >
               <p className={`text-xs font-bold mb-2 sticky top-0 bg-card/95 backdrop-blur-sm py-1 ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                 {format(day, "EEEE, dd/MM", { locale: ptBR })}
                 {isToday(day) && <span className="ml-2 text-[10px] text-primary">(hoje)</span>}
               </p>
               {dayEvents.length === 0 ? (
                 <p className="text-[11px] text-muted-foreground/60 pl-2 italic">Sem eventos</p>
               ) : (
                 <SortableContext items={dayEvents.map(e => e.id)} strategy={verticalListSortingStrategy}>
                   <div className="space-y-2">
                     {dayEvents.map(ev => (
                       <SortableEventCard key={ev.id} event={ev} onEventClick={onEventClick} />
                     ))}
                   </div>
                 </SortableContext>
               )}
             </div>
           );
         })}
       </div>
     </div>
   );
 }

// ── Month View ──
function MonthView({ events, currentDate, onEventClick, onDayClick }: { events: CalendarEvent[]; currentDate: Date; onEventClick: (e: CalendarEvent) => void; onDayClick: (d: Date) => void }) {
  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start, end });
    return (
      <div className="grid grid-cols-7 gap-1 bg-secondary/10 p-2 rounded-xl border border-border/40 shadow-inner">
        {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => (
          <div key={d} className="text-center text-[10px] text-muted-foreground/60 font-black py-2 uppercase tracking-widest">{d}</div>
        ))}
        {Array.from({ length: (start.getDay() + 6) % 7 }).map((_, i) => <div key={`empty-${i}`} />)}
        {days.map(day => {
          const dayEvents = events.filter(e => isSameDay(new Date(e.start_datetime), day));
          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`p-1.5 rounded-lg text-center min-h-[56px] transition-all relative flex flex-col items-center justify-start gap-1 group overflow-hidden ${
                isToday(day) ? 'bg-primary/20 ring-1 ring-primary/50' : 'hover:bg-primary/5 active:scale-95'
              }`}
            >
              <span className={`text-xs font-black z-10 ${isToday(day) ? 'text-primary' : 'text-foreground/80 group-hover:text-primary transition-colors'}`}>
                {format(day, 'd')}
              </span>
              {dayEvents.length > 0 && (
                <div className="flex flex-wrap justify-center gap-0.5 mt-auto pb-1 max-w-full">
                  {dayEvents.slice(0, 4).map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/80 shadow-sm" />
                  ))}
                  {dayEvents.length > 4 && <span className="text-[7px] text-primary/70 font-bold">+{dayEvents.length - 4}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

 // ── Event Card ──
 function EventCard({ 
   event, 
   onClick, 
   dragHandleProps,
   isOverlay
 }: { 
   event: CalendarEvent; 
   onClick: () => void;
   dragHandleProps?: any;
   isOverlay?: boolean;
 }) {
   const studentNames = event.students?.map(s => s.student_name).filter(Boolean) || [];
   const displayName = studentNames.length <= 2
     ? studentNames.join(' + ')
     : `${studentNames.length} alunos — ${studentNames.slice(0, 2).join(', ')}...`;
 
  return (
    <Card
      className={`bg-card/80 backdrop-blur-sm border-l-4 border-y-border/40 border-r-border/40 cursor-pointer hover:shadow-md transition-all duration-200 group ${isOverlay ? 'shadow-2xl border-primary/50 ring-2 ring-primary/20 scale-105' : ''}`}
      style={{ borderLeftColor: getStatusColor(event.status) }}
      onClick={onClick}
    >
      <CardContent className="p-2.5 flex items-center gap-3 overflow-hidden">
        <div 
          {...dragHandleProps} 
          className="cursor-grab active:cursor-grabbing p-1.5 -ml-1 hover:bg-secondary/50 rounded-md transition-colors touch-none shrink-0"
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/70" />
        </div>
        
        <div className="flex flex-col min-w-[45px] shrink-0 border-r border-border/30 pr-3">
          <span className="text-[12px] font-black text-foreground tabular-nums leading-none">
            {format(new Date(event.start_datetime), 'HH:mm')}
          </span>
          <span className="text-[10px] text-muted-foreground/60 mt-1 font-medium tabular-nums leading-none">
            {format(new Date(event.end_datetime), 'HH:mm')}
          </span>
        </div>

        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-[13px] font-bold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
              {displayName || event.title || 'Atendimento'}
            </h4>
            {event.is_recurring && (
              <div className="bg-secondary/40 p-0.5 rounded shadow-sm shrink-0">
                <RefreshCw className="h-2.5 w-2.5 text-primary/80" />
              </div>
            )}
            {studentNames.length > 1 && (
              <div className="bg-primary/10 px-1 rounded flex items-center shrink-0">
                <Users className="h-2.5 w-2.5 text-primary" />
                <span className="text-[8px] font-bold ml-0.5 text-primary">{studentNames.length}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80 truncate font-medium">
            <span className="bg-secondary/30 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold">
              {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 truncate opacity-70">
                <MapPin className="h-3 w-3 shrink-0" />
                {event.location}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-1">
          <Badge className={`text-[9px] px-2 py-0 h-4 leading-none font-bold shadow-sm uppercase tracking-tighter ${STATUS_COLORS[event.status] || ''}`}>
            {EVENT_STATUS_LABELS[event.status] || event.status}
          </Badge>
          {event.notes && <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" title="Tem observações" />}
        </div>
      </CardContent>
    </Card>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'confirmado': return '#22c55e'; // green-500
    case 'pendente': return '#f59e0b'; // amber-500
    case 'reagendado': return '#3b82f6'; // blue-500
    case 'cancelado': return '#ef4444'; // red-500
    case 'concluido': return '#10b981'; // emerald-500
    default: return '#fbbf24'; // primary
  }
}

export default Agenda;