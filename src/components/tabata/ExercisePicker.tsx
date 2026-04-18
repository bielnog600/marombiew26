import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ExerciseOption {
  id: string;
  nome: string;
  grupo_muscular: string;
}

interface Props {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
}

let cache: ExerciseOption[] | null = null;

export const ExercisePicker: React.FC<Props> = ({ value, onChange, placeholder = 'Selecionar exercício', className }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ExerciseOption[]>(cache || []);

  useEffect(() => {
    if (cache) return;
    (async () => {
      const { data } = await supabase
        .from('exercises')
        .select('id, nome, grupo_muscular')
        .order('grupo_muscular', { ascending: true })
        .order('nome', { ascending: true });
      if (data) {
        cache = data as ExerciseOption[];
        setItems(cache);
      }
    })();
  }, []);

  const grouped = items.reduce<Record<string, ExerciseOption[]>>((acc, ex) => {
    const g = ex.grupo_muscular || 'Outros';
    (acc[g] ||= []).push(ex);
    return acc;
  }, {});

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover z-50" align="start">
        <Command>
          <CommandInput placeholder="Buscar exercício..." />
          <CommandList>
            <CommandEmpty>Nenhum exercício encontrado.</CommandEmpty>
            {Object.entries(grouped).map(([group, list]) => (
              <CommandGroup key={group} heading={group}>
                {list.map(ex => (
                  <CommandItem
                    key={ex.id}
                    value={ex.nome}
                    onSelect={() => {
                      onChange(ex.nome);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === ex.nome ? 'opacity-100' : 'opacity-0')} />
                    {ex.nome}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
