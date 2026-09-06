import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { tokenMatchScore } from '@/lib/fuzzyMatch';

interface StudentOption {
  user_id: string;
  nome: string;
}

interface Props {
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const StudentPicker: React.FC<Props> = ({ value, onChange, disabled, placeholder = 'Selecionar aluno', className }) => {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('user_id, nome')
      .order('nome')
      .then(({ data }) => setStudents((data || []) as StudentOption[]));
  }, []);

  const selected = students.find(s => s.user_id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected?.nome || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover z-[100]" align="start">
        <Command filter={tokenMatchScore}>
          <CommandInput placeholder="Buscar aluno..." />
          <CommandList className="max-h-[50vh] overflow-y-auto overscroll-contain">
            <CommandEmpty>Nenhum aluno encontrado.</CommandEmpty>
            <CommandGroup>
              {students.map(s => (
                <CommandItem
                  key={s.user_id}
                  value={s.nome}
                  onSelect={() => {
                    onChange(s.user_id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === s.user_id ? 'opacity-100' : 'opacity-0')} />
                  {s.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default StudentPicker;
