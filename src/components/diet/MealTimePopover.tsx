import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Clock } from 'lucide-react';
import { normalizeTime, shiftTime } from '@/lib/dietMealTime';

interface Props {
  time?: string | null;
  mealName?: string;
  onApply: (time: string | undefined, onlyThisDay: boolean) => void;
}

const MealTimePopover: React.FC<Props> = ({ time, mealName, onApply }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(normalizeTime(time) ?? '');
  const [onlyThisDay, setOnlyThisDay] = useState(false);

  useEffect(() => {
    if (open) { setValue(normalizeTime(time) ?? ''); setOnlyThisDay(false); }
  }, [open, time]);

  const apply = (t: string | undefined) => { onApply(t, onlyThisDay); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Editar horário${mealName ? ` de ${mealName}` : ''}`}
          className="inline-flex min-h-[28px] items-center gap-1 rounded px-1.5 text-xs font-normal text-muted-foreground hover:bg-primary/10 hover:text-primary"
        >
          <Clock className="h-3 w-3" /> {normalizeTime(time) ?? '+ horário'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3 p-3" align="start">
        <p className="text-xs font-semibold">Horário{mealName ? ` · ${mealName}` : ''}</p>
        <Input
          type="time"
          step={900}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setValue(shiftTime(value, -30))}>−30 min</Button>
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setValue(shiftTime(value, 30))}>+30 min</Button>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={onlyThisDay} onCheckedChange={(v) => setOnlyThisDay(v === true)} />
          Só neste dia
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => apply(undefined)}>Limpar</Button>
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={() => apply(normalizeTime(value))} disabled={!normalizeTime(value)}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MealTimePopover;
