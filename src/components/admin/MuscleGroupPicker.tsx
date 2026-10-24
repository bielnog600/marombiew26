import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const EXTRA_KEY = 'exercise-extra-muscle-groups';

const readExtras = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(EXTRA_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const writeExtras = (list: string[]) => localStorage.setItem(EXTRA_KEY, JSON.stringify(list));

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Contagem de exercícios por grupo (grupos existentes no banco). */
  counts: Record<string, number>;
  onGroupsChanged: () => void;
}

export const MuscleGroupPicker: React.FC<Props> = ({ value, onChange, counts, onGroupsChanged }) => {
  const [open, setOpen] = useState(false);
  const [extras, setExtras] = useState<string[]>(readExtras);
  const [newName, setNewName] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const set = new Set<string>([...Object.keys(counts), ...extras]);
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [counts, extras]);

  const setExtrasPersist = (list: string[]) => {
    setExtras(list);
    writeExtras(list);
  };

  const exists = (name: string, except?: string) =>
    groups.some((g) => g.toLowerCase() === name.toLowerCase() && g !== except);

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (exists(name)) {
      toast.error('Esse grupo já existe.');
      return;
    }
    setExtrasPersist([...extras, name]);
    setNewName('');
    onChange(name);
    setOpen(false);
  };

  const rename = async (oldName: string) => {
    const name = editValue.trim();
    if (!name || name === oldName) {
      setEditingName(null);
      return;
    }
    if (exists(name, oldName)) {
      toast.error('Já existe um grupo com esse nome.');
      return;
    }
    setBusy(true);
    try {
      if (counts[oldName]) {
        const { error } = await supabase
          .from('exercises')
          .update({ grupo_muscular: name })
          .eq('grupo_muscular', oldName);
        if (error) throw error;
      }
      setExtrasPersist(extras.map((g) => (g === oldName ? name : g)));
      if (value === oldName) onChange(name);
      onGroupsChanged();
      toast.success('Grupo renomeado.');
      setEditingName(null);
    } catch (e) {
      toast.error('Erro ao renomear: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (name: string) => {
    const n = counts[name] || 0;
    if (n > 0) {
      toast.error(`Não dá para remover: ${n} exercício(s) usam "${name}". Mude o grupo deles antes.`);
      return;
    }
    setExtrasPersist(extras.filter((g) => g !== name));
    if (value === name) onChange('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{value || 'Selecionar grupo'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[260px] p-2 bg-popover z-50 flex flex-col max-h-[min(70dvh,520px)]"
        align="start"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y space-y-0.5"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground px-2 py-3">Nenhum grupo cadastrado.</p>
          )}
          {groups.map((g) =>
            editingName === g ? (
              <div key={g} className="flex items-center gap-1 p-1">
                <Input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && rename(g)}
                  className="h-9"
                />
                <Button size="icon" variant="ghost" className="h-9 w-9" disabled={busy} onClick={() => rename(g)}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingName(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div key={g} className="flex items-center gap-1 rounded-md hover:bg-accent/50">
                <button
                  type="button"
                  className="flex-1 flex items-center gap-2 text-left text-sm px-2 py-2"
                  onClick={() => {
                    onChange(g);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('h-4 w-4', value === g ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{g}</span>
                  {counts[g] ? <span className="text-xs text-muted-foreground">({counts[g]})</span> : null}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={`Editar ${g}`}
                  onClick={() => {
                    setEditingName(g);
                    setEditValue(g);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  aria-label={`Remover ${g}`}
                  onClick={() => remove(g)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1 border-t mt-2 pt-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Novo grupo"
            className="h-9"
          />
          <Button size="sm" className="h-9" onClick={add}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MuscleGroupPicker;
