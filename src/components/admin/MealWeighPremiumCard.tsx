import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Scale } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  studentId: string;
  /** students_profile do aluno; null = sem perfil de aluno. */
  studentProfile: { premium_scale?: boolean | null } | null;
  onChanged?: (value: boolean) => void;
}

/** Interruptor "Pesar refeição (Premium)" — só o admin altera (RLS + guard_premium_scale). */
const MealWeighPremiumCard: React.FC<Props> = ({ studentId, studentProfile, onChanged }) => {
  const [enabled, setEnabled] = useState(!!studentProfile?.premium_scale);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEnabled(!!studentProfile?.premium_scale); }, [studentProfile?.premium_scale]);

  const toggle = async (value: boolean) => {
    setSaving(true);
    setEnabled(value);
    const { error } = await supabase.from('students_profile').update({ premium_scale: value }).eq('user_id', studentId);
    setSaving(false);
    if (error) {
      setEnabled(!value);
      toast.error('Não foi possível alterar: ' + error.message);
      return;
    }
    toast.success(value ? 'Pesar refeição ativado' : 'Pesar refeição desativado');
    onChanged?.(value);
  };

  return (
    <Card className="glass-card border-primary/30 mt-4" data-testid="meal-weigh-premium-card">
      <CardContent className="p-5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
              <Scale className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <Label htmlFor="premium-scale-toggle" className="font-semibold">Pesar refeição (Premium)</Label>
              <p className="text-xs text-muted-foreground">O aluno fotografa a balança e a IA identifica o alimento e lê o peso, item por item.</p>
            </div>
          </div>
          <Switch id="premium-scale-toggle" checked={enabled} disabled={saving || !studentProfile} onCheckedChange={toggle} />
        </div>
        {!studentProfile && (
          <p className="text-xs text-muted-foreground">Este aluno ainda não tem perfil detalhado, então o recurso não pode ser ativado.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default MealWeighPremiumCard;
