import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScanEye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DEPTH_LEVELS, DEPTH_LEVEL_ORDER, normalizeDepthLevel, isDepthLevel, type DepthLevel,
} from '@/lib/liveCorrection/squatAnalysis';
import { ALL_ERROR_MESSAGES, EXERCISE_RULE_ORDER, getExerciseRule } from '@/lib/liveCorrection/exercises';
import { toast } from 'sonner';

interface CameraSession {
  id: string;
  exercise_name: string;
  started_at: string;
  duration_seconds: number;
  total_reps: number;
  complete_reps: number;
  incomplete_reps: number;
  errors: Record<string, number> | null;
  tempo_medio_descida: number | null;
  reps_descida_rapida: number | null;
  depth_level: string | null;
  exercise_rule: string | null;
}

interface Props {
  studentId: string;
  /** students_profile do aluno; null = sem perfil de aluno. */
  studentProfile: { premium_camera?: boolean | null; camera_depth_level?: string | null } | null;
  onChanged?: (value: boolean) => void;
  onDepthLevelChanged?: (value: DepthLevel) => void;
}

const errorLabel = (key: string) => ALL_ERROR_MESSAGES[key] ?? key;

const LiveCorrectionPremiumCard: React.FC<Props> = ({ studentId, studentProfile, onChanged, onDepthLevelChanged }) => {
  const [enabled, setEnabled] = useState(!!studentProfile?.premium_camera);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<CameraSession[] | null>(null);

  const [depthLevel, setDepthLevel] = useState<DepthLevel>(normalizeDepthLevel(studentProfile?.camera_depth_level));
  const [savingDepth, setSavingDepth] = useState(false);

  useEffect(() => { setEnabled(!!studentProfile?.premium_camera); }, [studentProfile?.premium_camera]);
  useEffect(() => { setDepthLevel(normalizeDepthLevel(studentProfile?.camera_depth_level)); }, [studentProfile?.camera_depth_level]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('camera_sessions')
      .select('id, exercise_name, started_at, duration_seconds, total_reps, complete_reps, incomplete_reps, errors, tempo_medio_descida, reps_descida_rapida, depth_level, exercise_rule')
      .eq('student_id', studentId)
      .order('started_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { if (!cancelled) setSessions((data as CameraSession[] | null) ?? []); });
    return () => { cancelled = true; };
  }, [studentId]);

  const toggle = async (value: boolean) => {
    setSaving(true);
    setEnabled(value);
    const { error } = await supabase.from('students_profile').update({ premium_camera: value }).eq('user_id', studentId);
    setSaving(false);
    if (error) {
      setEnabled(!value);
      toast.error('Não foi possível alterar: ' + error.message);
      return;
    }
    toast.success(value ? 'Correção ao vivo ativada' : 'Correção ao vivo desativada');
    onChanged?.(value);
  };

  const changeDepth = async (raw: string) => {
    if (!isDepthLevel(raw)) return;
    const previous = depthLevel;
    setSavingDepth(true);
    setDepthLevel(raw);
    const { error } = await supabase.from('students_profile').update({ camera_depth_level: raw }).eq('user_id', studentId);
    setSavingDepth(false);
    if (error) {
      setDepthLevel(previous);
      toast.error('Não foi possível alterar: ' + error.message);
      return;
    }
    toast.success(`Nível: ${DEPTH_LEVELS[raw].label}`);
    onDepthLevelChanged?.(raw);
  };

  return (
    <Card className="glass-card border-primary/30 mt-4" data-testid="live-correction-premium-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
              <ScanEye className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <Label htmlFor="premium-camera-toggle" className="font-semibold">Correção ao vivo (Premium)</Label>
              <p className="text-xs text-muted-foreground">Câmera corrige agachamento, stiff e búlgaro/afundo durante o treino.</p>
            </div>
          </div>
          <Switch
            id="premium-camera-toggle"
            checked={enabled}
            disabled={saving || !studentProfile}
            onCheckedChange={toggle}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="camera-depth-level" className="font-semibold">Profundidade exigida</Label>
            <p className="text-xs text-muted-foreground">Vale para todos os exercícios com câmera:</p>
            <ul className="mt-0.5 text-xs text-muted-foreground" data-testid="camera-depth-level-hints">
              {EXERCISE_RULE_ORDER.map((id) => {
                const r = getExerciseRule(id);
                return <li key={id}>{r.label}: {r.levelHints[depthLevel]}</li>;
              })}
            </ul>
          </div>
          <Select value={depthLevel} onValueChange={changeDepth} disabled={savingDepth || !studentProfile}>
            <SelectTrigger id="camera-depth-level" className="w-[190px] shrink-0" data-testid="camera-depth-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPTH_LEVEL_ORDER.map((lvl) => (
                <SelectItem key={lvl} value={lvl}>{DEPTH_LEVELS[lvl].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!studentProfile && (
          <p className="text-xs text-muted-foreground">Este aluno ainda não tem perfil detalhado, então o recurso não pode ser ativado.</p>
        )}

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Sessões com câmera</p>
          {sessions === null ? (
            <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sessão registrada.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => {
                const errs = Object.entries(s.errors ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
                return (
                  <li key={s.id} className="rounded-xl border border-border bg-secondary/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{s.exercise_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {s.duration_seconds > 0 && ` · ${Math.max(1, Math.round(s.duration_seconds / 60))} min`}
                          {s.depth_level && ` · Nível: ${DEPTH_LEVELS[normalizeDepthLevel(s.depth_level)].label}`}
                        </p>
                      </div>
                      {getExerciseRule(s.exercise_rule).timed && s.exercise_rule ? (
                        // Prancha: total_reps = segundos na posição, complete_reps = segundos em boa posição.
                        <div className="text-right shrink-0 text-xs tabular-nums" data-testid="camera-session-timed">
                          <p><span className="font-bold text-primary">{s.complete_reps} s</span> em boa posição</p>
                          <p className="text-muted-foreground">de {s.total_reps} s{s.total_reps > 0 ? ` · ${Math.round((s.complete_reps / s.total_reps) * 100)}%` : ''}</p>
                        </div>
                      ) : (
                        <div className="text-right shrink-0 text-xs tabular-nums">
                          <p><span className="font-bold">{s.total_reps}</span> reps</p>
                          <p><span className="text-primary font-semibold">{s.complete_reps}</span> · <span className="text-destructive font-semibold">{s.incomplete_reps}</span></p>
                        </div>
                      )}
                    </div>
                    {s.tempo_medio_descida != null && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Descida média {Number(s.tempo_medio_descida).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s
                        {(s.reps_descida_rapida ?? 0) > 0 && ` · ${s.reps_descida_rapida} rápida${s.reps_descida_rapida === 1 ? '' : 's'} demais`}
                      </p>
                    )}
                    {errs.length > 0 && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {errs.map(([k, n]) => `${errorLabel(k)} ${n}×`).join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveCorrectionPremiumCard;
