import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ArrowUp, ArrowDown, Minus, Repeat, Video, CircleDot, MoreVertical, Target } from 'lucide-react';
import {
  ACTION_LABEL, STATUS_CLASS, STATUS_LABEL,
  type CoachingActionType, type CoachingStatus, type FocusItem,
} from '@/lib/weeklyCoachingFocus';

const ICON: Record<FocusItem['actionType'], React.ElementType> = {
  increase_load: ArrowUp,
  increase_reps: Repeat,
  maintain: Minus,
  reduce_load: ArrowDown,
  technique: CircleDot,
  amplitude: CircleDot,
  request_video: Video,
  review: Target,
};

const ICON_CLASS: Record<FocusItem['actionType'], string> = {
  increase_load: 'text-emerald-500',
  increase_reps: 'text-sky-500',
  maintain: 'text-muted-foreground',
  reduce_load: 'text-destructive',
  technique: 'text-amber-500',
  amplitude: 'text-amber-500',
  request_video: 'text-violet-500',
  review: 'text-muted-foreground',
};

const MANUAL_ACTIONS: CoachingActionType[] = [
  'increase_load', 'increase_reps', 'maintain', 'amplitude', 'technique', 'request_video', 'reduce_load',
];

const STATUSES: CoachingStatus[] = ['pending', 'sent', 'waiting', 'completed'];

interface Props {
  items: FocusItem[];
  maxVisible?: number;
  onSetAction?: (exerciseName: string, action: CoachingActionType) => void;
  onSetStatus?: (exerciseName: string, status: CoachingStatus, fallback: CoachingActionType) => void;
}

const WeeklyFocusList: React.FC<Props> = ({ items, maxVisible = 4, onSetAction, onSetStatus }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, maxVisible);
  const hidden = items.length - visible.length;

  if (items.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground italic">
        Sem orientações de treino nesta semana.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {visible.map((item) => {
        const Icon = ICON[item.actionType];
        return (
          <div
            key={item.exerciseName}
            className="flex items-start gap-2 rounded-md bg-secondary/30 px-2 py-1.5"
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${ICON_CLASS[item.actionType]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium leading-tight truncate">{item.exerciseName}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{item.detail}</p>
              {item.videoNote && (
                <p className="text-[10px] italic text-violet-400 leading-tight truncate">“{item.videoNote}”</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {item.status !== 'pending' && (
                <Badge variant="outline" className={`text-[9px] ${STATUS_CLASS[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50 w-48">
                  <DropdownMenuLabel className="text-[10px]">Orientação</DropdownMenuLabel>
                  {MANUAL_ACTIONS.map((a) => (
                    <DropdownMenuItem
                      key={a}
                      className="text-xs"
                      onClick={() => onSetAction?.(item.exerciseName, a)}
                    >
                      {ACTION_LABEL[a as FocusItem['actionType']]}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px]">Status</DropdownMenuLabel>
                  {STATUSES.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      className="text-xs"
                      onClick={() => onSetStatus?.(item.exerciseName, s, item.actionType)}
                    >
                      {STATUS_LABEL[s]}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs text-destructive focus:text-destructive"
                    onClick={() => onSetAction?.(item.exerciseName, 'dismissed')}
                  >
                    Remover orientação
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[11px] text-primary hover:underline"
        >
          +{hidden} orientaç{hidden === 1 ? 'ão' : 'ões'}
        </button>
      )}
      {expanded && items.length > maxVisible && (
        <button
          onClick={() => setExpanded(false)}
          className="text-[11px] text-muted-foreground hover:underline"
        >
          Mostrar menos
        </button>
      )}
    </div>
  );
};

export default WeeklyFocusList;
