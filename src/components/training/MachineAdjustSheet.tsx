import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';

interface MachineAdjustSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseId: string;
  exerciseName: string;
  studentId: string;
  fields: string[];
}

export const MachineAdjustSheet: React.FC<MachineAdjustSheetProps> = ({
  open,
  onOpenChange,
  exerciseId,
  exerciseName,
  studentId,
  fields,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !exerciseId || !studentId) return;
    setLoading(true);
    supabase
      .from('student_exercise_adjustments')
      .select('valores')
      .eq('student_id', studentId)
      .eq('exercise_id', exerciseId)
      .maybeSingle()
      .then(({ data }) => {
        const stored = (data?.valores as Record<string, string> | null) ?? {};
        const init: Record<string, string> = {};
        fields.forEach((f) => { init[f] = stored[f] ?? ''; });
        setValues(init);
        setLoading(false);
      });
  }, [open, exerciseId, studentId, fields]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('student_exercise_adjustments')
      .upsert(
        { student_id: studentId, exercise_id: exerciseId, valores: values },
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl border-t border-border bg-background/95 backdrop-blur-xl">
        <SheetHeader className="text-left">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            <Settings2 className="h-3 w-3" />
            Ajuste da máquina
          </span>
          <SheetTitle className="text-base text-foreground line-clamp-2">{exerciseName}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
          ) : (
            fields.map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`adj-${field}`} className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  {field}
                </Label>
                <Input
                  id={`adj-${field}`}
                  value={values[field] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
                  placeholder="Ex: 4"
                  className="bg-secondary/50"
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
