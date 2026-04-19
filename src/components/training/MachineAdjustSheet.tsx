import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Settings2, Pencil } from 'lucide-react';

const STANDARD_FIELDS = [
  'Banco',
  'Encosto',
  'Apoio dos pés',
  'Rolo',
  'Abertura',
  'Altura',
  'Pegada',
  'Observação',
] as const;

const FIELDS_KEY = '__fields';

interface MachineAdjustSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseId: string;
  exerciseName: string;
  studentId: string;
  /** Template global definido pelo admin em exercises.ajustes (prioridade). */
  fields: string[];
}

type Mode = 'loading' | 'select' | 'edit';

export const MachineAdjustSheet: React.FC<MachineAdjustSheetProps> = ({
  open,
  onOpenChange,
  exerciseId,
  exerciseName,
  studentId,
  fields: templateFields,
}) => {
  const hasGlobalTemplate = (templateFields?.length ?? 0) > 0;

  const [mode, setMode] = useState<Mode>('loading');
  const [activeFields, setActiveFields] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !exerciseId || !studentId) return;
    setMode('loading');
    supabase
      .from('student_exercise_adjustments')
      .select('valores')
      .eq('student_id', studentId)
      .eq('exercise_id', exerciseId)
      .maybeSingle()
      .then(({ data }) => {
        const stored = (data?.valores as Record<string, string> | null) ?? {};
        const storedFieldsRaw = stored[FIELDS_KEY];
        const storedFields = storedFieldsRaw ? (JSON.parse(storedFieldsRaw) as string[]) : [];

        // Prioridade: template global > config salva do aluno > seleção
        const resolvedFields = hasGlobalTemplate
          ? templateFields
          : storedFields.length > 0
            ? storedFields
            : [];

        const init: Record<string, string> = {};
        resolvedFields.forEach((f) => { init[f] = stored[f] ?? ''; });
        setValues(init);
        setActiveFields(resolvedFields);
        setSelected(resolvedFields);
        setMode(resolvedFields.length === 0 ? 'select' : 'edit');
      });
  }, [open, exerciseId, studentId, hasGlobalTemplate, templateFields]);

  const toggleSelected = (field: string) => {
    setSelected((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const confirmSelection = () => {
    if (selected.length === 0) {
      toast.error('Selecione ao menos um tipo de ajuste.');
      return;
    }
    const ordered = STANDARD_FIELDS.filter((f) => selected.includes(f));
    const init: Record<string, string> = {};
    ordered.forEach((f) => { init[f] = values[f] ?? ''; });
    setValues(init);
    setActiveFields(ordered);
    setMode('edit');
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, string> = { ...values };
    if (!hasGlobalTemplate) {
      payload[FIELDS_KEY] = JSON.stringify(activeFields);
    }
    const { error } = await supabase
      .from('student_exercise_adjustments')
      .upsert(
        { student_id: studentId, exercise_id: exerciseId, valores: payload },
        { onConflict: 'student_id,exercise_id' }
      );
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar ajustes.');
      return;
    }
    toast.success('Ajustes salvos.');
    onOpenChange(false);
  };

  const title = useMemo(() => exerciseName, [exerciseName]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl border-t border-border bg-background/95 backdrop-blur-xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            <Settings2 className="h-3 w-3" />
            Ajuste da máquina
          </span>
          <SheetTitle className="text-base text-foreground line-clamp-2">{title}</SheetTitle>
        </SheetHeader>

        {mode === 'loading' && (
          <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>
        )}

        {mode === 'select' && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Selecione os tipos de ajuste que você deseja registrar para este exercício.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {STANDARD_FIELDS.map((field) => {
                const checked = selected.includes(field);
                return (
                  <button
                    key={field}
                    type="button"
                    onClick={() => toggleSelected(field)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      checked
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-secondary/40 text-muted-foreground'
                    }`}
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <span className="font-medium">{field}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={confirmSelection}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <>
            <div className="mt-4 space-y-3">
              {activeFields.map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={`adj-${field}`} className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    {field}
                  </Label>
                  {field === 'Observação' ? (
                    <Textarea
                      id={`adj-${field}`}
                      value={values[field] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
                      placeholder="Anote algo sobre o ajuste..."
                      className="bg-secondary/50 min-h-[72px]"
                    />
                  ) : (
                    <Input
                      id={`adj-${field}`}
                      value={values[field] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
                      placeholder="Ex: 4"
                      className="bg-secondary/50"
                    />
                  )}
                </div>
              ))}

              {!hasGlobalTemplate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode('select')}
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3 mr-1.5" />
                  Editar tipos de ajuste
                </Button>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
