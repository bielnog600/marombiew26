import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Weight } from 'lucide-react';
import { normalizeExerciseKey, validateIncrementInput } from '@/lib/loadIncrement';
import { fetchStudentLoadIncrements, saveStudentLoadIncrement } from '@/lib/loadIncrementRepo';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  /** Exercícios do treino do aluno (nomes como aparecem no plano). */
  exerciseNames: string[];
}

/**
 * Configuração OPCIONAL do treinador: menor incremento de carga disponível
 * para cada exercício deste aluno (o mesmo exercício pode ter passos
 * diferentes em ginásios/máquinas diferentes). Campo vazio = usar histórico
 * e, na falta dele, orientação qualitativa.
 */
export const LoadIncrementsDialog: React.FC<Props> = ({ open, onOpenChange, studentId, exerciseNames }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const uniqueExercises = useMemo(() => {
    const seen = new Map<string, string>();
    exerciseNames.forEach((n) => {
      const key = normalizeExerciseKey(n);
      if (key && !seen.has(key)) seen.set(key, n.trim());
    });
    return Array.from(seen.entries()).map(([key, name]) => ({ key, name }));
  }, [exerciseNames]);

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    fetchStudentLoadIncrements(studentId)
      .then((map) => {
        const init: Record<string, string> = {};
        uniqueExercises.forEach(({ key }) => {
          init[key] = map[key] != null ? String(map[key]).replace('.', ',') : '';
        });
        setValues(init);
        setErrors({});
      })
      .finally(() => setLoading(false));
  }, [open, studentId, uniqueExercises]);

  const handleChange = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    const res = validateIncrementInput(v);
    setErrors((prev) => ({ ...prev, [key]: res.valid ? '' : (res.error ?? '') }));
  };

  const handleSave = async () => {
    const invalid = Object.values(errors).some(Boolean);
    if (invalid) {
      toast.error('Corrija os incrementos inválidos antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      for (const { key, name } of uniqueExercises) {
        const res = await saveStudentLoadIncrement(studentId, name, values[key] ?? '');
        if (!res.ok) {
          toast.error(`${name}: ${res.error}`);
          setSaving(false);
          return;
        }
      }
      toast.success('Incrementos de carga salvos.');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Weight className="h-4 w-4 text-primary" /> Incremento de carga
          </DialogTitle>
          <DialogDescription>
            Menor incremento disponível (kg) para este aluno em cada exercício. Opcional — se ficar
            vazio, o sistema usa o histórico e, na falta dele, apenas orientação qualitativa.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>}

        {!loading && uniqueExercises.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum exercício encontrado neste treino.
          </p>
        )}

        {!loading && uniqueExercises.length > 0 && (
          <div className="space-y-2">
            {uniqueExercises.map(({ key, name }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs flex-1 min-w-0 truncate" title={name}>{name}</span>
                <div className="w-24 shrink-0">
                  <Input
                    inputMode="decimal"
                    placeholder="ex.: 2,5"
                    className="h-8 text-xs text-right"
                    value={values[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-6">kg</span>
              </div>
            ))}
            {Object.entries(errors)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <p key={k} className="text-[11px] text-destructive">{v}</p>
              ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoadIncrementsDialog;
