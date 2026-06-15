import React, { useEffect, useRef, useState } from 'react';
import { Video, Upload, Check, Loader2, AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const MAX_DURATION = 30; // seconds
const MAX_SIZE_BYTES = 80 * 1024 * 1024; // 80MB safety cap

interface Props {
  studentId: string;
  sessionId: string | null;
  planId?: string | null;
  exerciseName: string;
  exerciseId?: string | null;
}

type Existing = {
  id: string;
  status: string;
  playback_url: string;
  thumbnail_url: string | null;
  admin_note: string | null;
} | null;

const readDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.src = URL.createObjectURL(file);
      v.onloadedmetadata = () => {
        const d = v.duration;
        URL.revokeObjectURL(v.src);
        resolve(Number.isFinite(d) ? d : 0);
      };
      v.onerror = () => {
        URL.revokeObjectURL(v.src);
        resolve(0);
      };
    } catch {
      resolve(0);
    }
  });

const ExerciseVideoCapture: React.FC<Props> = ({
  studentId,
  sessionId,
  planId,
  exerciseName,
  exerciseId,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [existing, setExisting] = useState<Existing>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnlineStatus();

  useEffect(() => {
    let cancelled = false;
    setLoadingExisting(true);
    (async () => {
      if (!sessionId || !studentId || !exerciseName) {
        setExisting(null);
        setLoadingExisting(false);
        return;
      }
      const { data } = await supabase
        .from('exercise_execution_videos')
        .select('id, status, playback_url, thumbnail_url, admin_note')
        .eq('student_id', studentId)
        .eq('workout_session_id', sessionId)
        .eq('exercise_name', exerciseName)
        .maybeSingle();
      if (!cancelled) {
        setExisting(data as Existing);
        setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, studentId, exerciseName]);

  const handleFile = async (file: File | null | undefined) => {
    setError(null);
    if (!file) return;
    if (!sessionId) {
      toast.error('Aguarde a sessão iniciar para enviar o vídeo.');
      return;
    }
    if (!online) {
      toast.error('Sem conexão. Envie o vídeo quando voltar online.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Vídeo muito grande (máx. 80MB). Grave um clipe mais curto.');
      return;
    }

    const duration = await readDuration(file);
    if (duration && duration > MAX_DURATION + 1) {
      setError(`Vídeo de ${Math.round(duration)}s. Máx. ${MAX_DURATION}s — grave novamente mais curto.`);
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // 1) Direct upload URL do Cloudflare
      const { data: cf, error: cfErr } = await supabase.functions.invoke('student-video-upload', {
        body: { maxDurationSeconds: MAX_DURATION, name: `${exerciseName}-${Date.now()}` },
      });
      if (cfErr || !cf?.uploadURL || !cf?.uid) {
        throw new Error(cfErr?.message || 'Falha ao iniciar upload');
      }

      // 2) Upload direto para Cloudflare (multipart) com progresso
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', cf.uploadURL);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload falhou (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Erro de rede no upload'));
        const fd = new FormData();
        fd.append('file', file);
        xhr.send(fd);
      });

      // 3) Persiste linha
      const payload = {
        student_id: studentId,
        workout_session_id: sessionId,
        plan_id: planId ?? null,
        exercise_id: exerciseId ?? null,
        exercise_name: exerciseName,
        cf_uid: cf.uid as string,
        playback_url: cf.playbackUrl as string,
        thumbnail_url: cf.thumbnailUrl as string,
        duration_seconds: duration ? Math.round(duration) : null,
        status: 'pending_review',
      };

      const { data: row, error: upErr } = await supabase
        .from('exercise_execution_videos')
        .upsert(payload, { onConflict: 'student_id,workout_session_id,exercise_name' })
        .select('id, status, playback_url, thumbnail_url, admin_note')
        .single();

      if (upErr) throw upErr;

      setExisting(row as Existing);
      toast.success('Vídeo enviado!');
    } catch (e: any) {
      console.error('upload video error', e);
      setError(e?.message || 'Erro ao enviar vídeo.');
    } finally {
      setUploading(false);
      setProgress(0);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (!confirm('Remover vídeo enviado?')) return;
    const { error: delErr } = await supabase
      .from('exercise_execution_videos')
      .delete()
      .eq('id', existing.id);
    if (delErr) {
      toast.error('Não foi possível remover.');
      return;
    }
    setExisting(null);
    toast.success('Vídeo removido.');
  };

  if (loadingExisting) return null;

  return (
    <div className="space-y-2">
      <input
        ref={cameraInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {uploading ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="font-medium">Enviando vídeo… {progress}%</span>
        </div>
      ) : existing ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
            <Check className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium flex-1">
              Vídeo enviado
              {existing.status === 'reviewed' && ' · revisado ✓'}
              {existing.status === 'needs_redo' && ' · pediram novo vídeo'}
            </span>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="text-[10px] uppercase tracking-wider text-primary hover:underline font-semibold"
            >
              <RotateCcw className="inline h-3 w-3 mr-0.5" />Substituir
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remover"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {existing.admin_note && (
            <p className="text-[11px] text-muted-foreground italic px-1">
              Nota do treinador: {existing.admin_note}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 flex-1 gap-1.5 text-[11px] border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => cameraInputRef.current?.click()}
            disabled={!sessionId}
          >
            <Video className="h-3.5 w-3.5" />
            Gravar execução
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-[10px] text-muted-foreground hover:text-primary"
            onClick={() => galleryInputRef.current?.click()}
            disabled={!sessionId}
          >
            <Upload className="h-3.5 w-3.5" />
            Galeria
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => cameraInputRef.current?.click()}
          >
            Reenviar
          </button>
        </div>
      )}
    </div>
  );
};

export default ExerciseVideoCapture;