import React, { useMemo, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
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

/**
 * Seleção múltipla: tocar adiciona/remove. A ordem da lista define o grupo
 * principal — o primeiro selecionado é o principal; se ele for removido, o
 * próximo assumir.
 */
export function toggleGroupSelection(selected: string[], group: string): string[] {
  if (selected.includes(group)) return selected.filter((g) => g !== group);
  return [...selected, group];
}

interface Props {
  /** Grupos selecionados na ordem em que foram escolhidos (o primeiro é o principal). */
  values: string[];
  onChange: (values: string[]) => void;
  /** Contagem de exercícios por grupo (contando grupo principal e adicionais). */
  counts: Record<string, number>;
  onGroupsChanged: () => void;
}

export const MuscleGroupPicker: React.FC<Props> = ({ values, onChange, counts, onGroupsChanged }) => {
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
    onChange([...values, name]);
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
      // Renomeia onde o grupo é principal e onde aparece como grupo adicional.
      const [primaryRes, extraRes] = await Promise.all([
        supabase.from('exercises').select('id, grupo_muscular, grupos_musculares').eq('grupo_muscular', oldName),
        supabase.from('exercises').select('id, grupo_muscular, grupos_musculares').contains('grupos_musculares', [oldName]),
      ]);
      if (primaryRes.error) throw primaryRes.error;
      if (extraRes.error) throw extraRes.error;
      const byId = new Map<string, { id: string; grupo_muscular: string; grupos_musculares: string[] }>();
      for (const row of [...(primaryRes.data ?? []), ...(extraRes.data ?? [])]) {
        byId.set(row.id, row);
      }
      for (const row of byId.values()) {
        const primary = row.grupo_muscular === oldName ? name : row.grupo_muscular;
        const arr = (row.grupos_musculares ?? []).map((g) => (g === oldName ? name : g));
        const { error } = await supabase
          .from('exercises')
          .update({ grupo_muscular: primary, grupos_musculares: arr })
          .eq('id', row.id);
        if (error) throw error;
      }
      setExtrasPersist(extras.map((g) => (g === oldName ? name : g)));
      if (values.includes(oldName)) onChange(values.map((g) => (g === oldName ? name : g)));
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
    if (values.includes(name)) onChange(toggleGroupSelection(values, name));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn('w-full justify-between font-normal', values.length === 0 && 'text-muted-foreground')}
        >
          <span className="truncate">
            {values.length === 0
              ? 'Selecionar grupos'
              : values.length === 1
                ? values[0]
                : `${values[0]} +${values.length - 1}`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/*
        Sem Portal de propósito: o painel "Adicionar exercício" trava o rolar
        de tudo que está fora dele (no iPhone isso bloqueia o arrastar). Renderizar
        o balão dentro do painel libera a rolagem por toque da lista.
      */}
      <PopoverPrimitive.Content
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="z-50 w-[--radix-popover-trigger-width] min-w-[260px] rounded-md border bg-popover p-2 text-popover-foreground shadow-md outline-none flex flex-col"
        style={{
          maxHeight: 'min(var(--radix-popover-content-available-height, 70dvh), 60dvh, 520px)',
          WebkitOverflowScrolling: 'touch',
        }}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
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
                  onClick={() => onChange(toggleGroupSelection(values, g))}
                >
                  <Check className={cn('h-4 w-4', values.includes(g) ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{g}</span>
                  {counts[g] ? <span className="text-xs text-muted-foreground">({counts[g]})</span> : null}
                  {values[0] === g && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">principal</span>
                  )}
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
      </PopoverPrimitive.Content>
    </Popover>
  );
};

export default MuscleGroupPicker;
