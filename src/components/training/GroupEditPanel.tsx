import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Ungroup } from 'lucide-react';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import { ExerciseStructureEditor } from './ExerciseStructureEditor';

/**
 * Painel "Editar grupo" do card de Bi-set/Superset no Modo Treino admin:
 * tipo, pausa A→B, descanso do par, desagrupar e o editor completo de cada
 * exercício (A e B). Só é usado no modal admin; a tela do aluno não o renderiza.
 */
export function GroupEditPanel({ exercises, indices, planOf, onPatch, onUngroup }: {
  exercises: ParsedExercise[];
  indices: number[];
  planOf: (exIdx: number) => { kind: 'recon' | 'work'; targetReps: string }[];
  onPatch: (exIdx: number, patch: Partial<ParsedExercise>) => void;
  onUngroup: () => void;
}) {
  const aIdx = indices[0];
  const bIdx = indices[1] ?? indices[0];
  const a = exercises[aIdx];
  const b = exercises[bIdx];
  const [openMember, setOpenMember] = useState<number | null>(null);
  if (!a) return null;
  const tipo = a.tipo_grupo ?? 'biset';
  const patchBoth = (patch: Partial<ParsedExercise>) => {
    onPatch(aIdx, patch);
    if (bIdx !== aIdx) onPatch(bIdx, patch);
  };
  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-secondary/30 p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[9px] uppercase text-muted-foreground font-semibold">Tipo de grupo</label>
          <Select value={tipo} onValueChange={(v) => patchBoth({ tipo_grupo: v as 'superset' | 'biset' })}>
            <SelectTrigger aria-label="Tipo de grupo" className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="biset" className="text-xs">Bi-set</SelectItem>
              <SelectItem value="superset" className="text-xs">Superset</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] uppercase text-muted-foreground font-semibold">Pausa A → B (0–10 s)</label>
          <Input
            aria-label="Pausa A → B (segundos)"
            type="number"
            min={0}
            max={10}
            key={`${a.grupo_id}-${a.pausa_grupo_s ?? 0}`}
            defaultValue={a.pausa_grupo_s ?? 0}
            onBlur={(e) => {
              const n = Math.min(10, Math.max(0, Math.round(Number(e.target.value) || 0)));
              patchBoth({ pausa_grupo_s: n });
            }}
            className="h-7 text-xs"
          />
        </div>
      </div>
      {b && bIdx !== aIdx && (
        <div className="space-y-1">
          <label className="text-[9px] uppercase text-muted-foreground font-semibold">Descanso do par (após B)</label>
          <Input
            key={`pause-${bIdx}-${b.pause || ''}`}
            defaultValue={b.pause || ''}
            onBlur={(e) => onPatch(bIdx, { pause: e.target.value })}
            className="h-7 text-xs"
            placeholder="90s ou 1:30"
          />
        </div>
      )}
      {indices.map((idx, pos) => {
        const member = exercises[idx];
        if (!member) return null;
        const open = openMember === idx;
        return (
          <div key={idx} className="rounded-md border border-border/40">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-semibold"
              onClick={() => setOpenMember(open ? null : idx)}
              aria-expanded={open}
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="text-primary">{member.ordem_grupo ?? (pos === 0 ? 'A' : 'B')}</span>
              <span className="truncate">{member.exercise || 'Sem nome'}</span>
            </button>
            {open && (
              <div className="border-t border-border/40 p-2">
                <ExerciseStructureEditor ex={member} plan={planOf(idx)} onUpdateMeta={(patch) => onPatch(idx, patch)} />
              </div>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 w-full gap-1.5 text-[10px] border-destructive/40 text-destructive hover:bg-destructive/10"
        onClick={onUngroup}
      >
        <Ungroup className="h-3 w-3" /> Desagrupar
      </Button>
    </div>
  );
}
