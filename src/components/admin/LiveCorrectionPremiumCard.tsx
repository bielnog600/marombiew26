import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScanEye, Mic } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { defaultVoiceName, spokenName } from '@/lib/liveCorrection/voice/motivation';
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
  studentProfile: {
    premium_camera?: boolean | null; camera_depth_level?: string | null;
    voice_name?: string | null; voice_motivation_enabled?: boolean | null;
  } | null;
  /** Nome do perfil (o primeiro nome é o padrão de "Como falar o nome"). */
  studentName?: string | null;
  onVoiceChanged?: (patch: { voice_name?: string | null; voice_motivation_enabled?: boolean }) => void;
  onChanged?: (value: boolean) => void;
  onDepthLevelChanged?: (value: DepthLevel) => void;
}

const errorLabel = (key: string) => ALL_ERROR_MESSAGES[key] ?? key;

const LiveCorrectionPremiumCard: React.FC<Props> = ({ studentId, studentProfile, studentName, onChanged, onDepthLevelChanged, onVoiceChanged }) => {
  const [motivation, setMotivation] = useState(studentProfile?.voice_motivation_enabled !== false);
  const [voiceName, setVoiceName] = useState(spokenName(studentProfile?.voice_name, studentName));
  useEffect(() => { setMotivation(studentProfile?.voice_motivation_enabled !== false); }, [studentProfile?.voice_motivation_enabled]);
  useEffect(() => { setVoiceName(spokenName(studentProfile?.voice_name, studentName)); }, [studentProfile?.voice_name, studentName]);

  const toggleMotivation = async (value: boolean) => {
    setMotivation(value);
    const { error } = await supabase.from('students_profile').update({ voice_motivation_enabled: value }).eq('user_id', studentId);
    if (error) { setMotivation(!value); toast.error('Não foi possível alterar: ' + error.message); return; }
    toast.success(value ? 'Falas de motivação ligadas' : 'Falas de motivação desligadas');
    onVoiceChanged?.({ voice_motivation_enabled: value });
  };

  const saveVoiceName = async () => {
    const clean = voiceName.trim();
    const stored = clean && clean !== defaultVoiceName(studentName) ? clean : null;
    if (stored === (studentProfile?.voice_name ?? null)) return;
    const { error } = await supabase.from('students_profile').update({ voice_name: stored }).eq('user_id', studentId);
    if (error) { toast.error('Não foi possível salvar o nome: ' + error.message); return; }
    toast.success('Nome salvo. Gere as falas com nome de novo na tela de voz.');
    onVoiceChanged?.({ voice_name: stored });
  };

  // Chave geral "Falas com nome do aluno" (desligada por padrão; fica em coach_voice_config).
  const [namesEnabled, setNamesEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.from('coach_voice_config').select('name_phrases_enabled').eq('id', true).maybeSingle()
      .then(({ data, error }) => { if (!cancelled) setNamesEnabled(error ? false : data?.name_phrases_enabled === true); });
    return () => { cancelled = true; };
  }, []);
  const toggleNames = async (value: boolean) => {
    setNamesEnabled(value);
    const { error } = await supabase.from('coach_voice_config').upsert({ id: true, name_phrases_enabled: value });
    if (error) { setNamesEnabled(!value); toast.error('Não foi possível alterar: ' + error.message); return; }
    toast.success(value ? 'Falas com nome ligadas' : 'Falas com nome desligadas');
  };

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
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="voice-motivation-toggle" className="font-semibold">Falas de motivação</Label>
            <p className="text-xs text-muted-foreground">{namesEnabled ? '"Bora!", "Boa!" e as falas com o nome dele durante a série.' : '"Bora!", "Boa!" durante a série.'}</p>
          </div>
          <Switch
            id="voice-motivation-toggle"
            checked={motivation}
            disabled={!studentProfile}
            onCheckedChange={toggleMotivation}
          />
        </div>
        {namesEnabled === false && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-3" data-testid="voice-names-disabled">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Falas com nome desativadas</p>
              <p className="text-xs text-muted-foreground">Vale para todos os alunos. Nada foi apagado.</p>
            </div>
            <Switch checked={false} onCheckedChange={toggleNames} aria-label="Religar falas com nome do aluno" />
          </div>
        )}
        {namesEnabled === true && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold shrink-0">Como falar o nome</span>
            <Input
              aria-label="Como falar o nome"
              value={voiceName}
              maxLength={60}
              placeholder={defaultVoiceName(studentName)}
              disabled={!studentProfile}
              onChange={(e) => setVoiceName(e.target.value)}
              onBlur={saveVoiceName}
              className="h-9 w-[160px]"
            />
          </label>
          <Link
            to={`/voz-correcao-ao-vivo#nome-${studentId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            data-testid="voice-name-shortcut"
          >
            <Mic className="h-3.5 w-3.5" /> Falas com nome
          </Link>
        </div>
        )}
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
