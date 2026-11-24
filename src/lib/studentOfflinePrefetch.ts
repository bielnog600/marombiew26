import { supabase } from '@/integrations/supabase/client';
import { offlineReadyKey, requestPersistentStorage, setCache } from '@/lib/offlineCache';
import { getWeekRange, localDateKey } from '@/lib/localTrackingWeek';

const PLAN_COLUMNS = 'id, student_id, tipo, titulo, conteudo, conteudo_json, migration_status, fase, fase_inicio_data, periodization_model, periodization_reason, block_type, block_number, block_total, next_block_type, periodization_snapshot, protocols, version, content_revision, is_draft, created_at, published_at, pending_checkin';
const EXERCISE_COLUMNS = 'id, nome, imagem_url, video_embed, grupo_muscular, ajustes';
const HISTORY_DAYS = 180;

let inFlight: Promise<boolean> | null = null;
let lastRun: Record<string, number> = {};

const newestPublished = (rows: any[], tipo: string) => rows
  .filter(row => row.tipo === tipo && row.is_draft === false)
  .sort((a, b) => {
    const published = new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime();
    return published || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0] ?? null;

/**
 * Pré-download completo, em segundo plano. Usa exatamente as chaves consumidas
 * pelas telas, para o aluno não precisar visitar cada página antes de ficar offline.
 */
export async function prefetchStudentOfflineData(userId: string): Promise<boolean> {
  if (!userId || !navigator.onLine) return false;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let coreReady = false;
    try {
      void requestPersistentStorage();
      const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const [plansRes, exercisesRes, profileRes, studentRes] = await Promise.all([
        supabase.from('ai_plans').select(PLAN_COLUMNS).eq('student_id', userId).order('created_at', { ascending: false }),
        supabase.from('exercises').select(EXERCISE_COLUMNS),
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('students_profile').select('*').eq('user_id', userId).maybeSingle(),
      ]);
      if (plansRes.error || exercisesRes.error) throw plansRes.error ?? exercisesRes.error;

      const plans = (plansRes.data ?? []) as any[];
      const exercises = exercisesRes.data ?? [];
      const workouts = plans.filter(row => row.tipo === 'treino');
      const latestWorkout = workouts[0] ?? null;
      const diet = newestPublished(plans, 'dieta');
      const cardio = newestPublished(plans, 'cardio') ?? plans.find(row => row.tipo === 'cardio') ?? null;
      const tabata = newestPublished(plans, 'tabata') ?? plans.find(row => row.tipo === 'tabata') ?? null;

      await Promise.all([
        setCache(`plans:treino:all:${userId}`, workouts),
        setCache(`plan:treino:structured-v1:${userId}`, latestWorkout),
        setCache(`plan:treino:${userId}`, latestWorkout ? { conteudo: latestWorkout.conteudo } : null),
        setCache(`plan:dieta:structured-v1:${userId}`, diet),
        setCache(`plan:dieta:full:structured-v1:${userId}`, diet),
        setCache(`plan:cardio:${userId}`, cardio ? { id: cardio.id, conteudo: cardio.conteudo } : null),
        setCache(`plan:tabata:${userId}`, tabata ? { id: tabata.id, conteudo: tabata.conteudo } : null),
        setCache('exercises:all', exercises),
        setCache(`profile:${userId}`, profileRes.data ? { nome: profileRes.data.nome } : null),
        setCache(`profile:full:${userId}`, profileRes.data),
        setCache(`student_profile:${userId}`, studentRes.data),
      ]);
      coreReady = true;

      const [logsRes, sessionsRes, incrementsRes, recentRes, activeRes, cardioDoneRes] = await Promise.all([
        supabase.from('exercise_set_logs').select('exercise_name, weight_kg, reps, rir, rpe, set_type, set_number, performed_at, session_id, phase, sub_records')
          .eq('student_id', userId).gte('performed_at', since).order('performed_at', { ascending: false }).order('set_number', { ascending: true }).limit(6000),
        supabase.from('workout_sessions').select('id, plan_id, phase, started_at, completed_at, avg_rpe')
          .eq('student_id', userId).gte('started_at', since).order('started_at', { ascending: false }).limit(400),
        supabase.from('student_load_increments').select('exercise_key, increment_kg').eq('student_id', userId),
        supabase.from('workout_sessions').select('id, duration_minutes, exercises_completed, total_exercises, completed_at, day_name, phase')
          .eq('student_id', userId).order('completed_at', { ascending: false }).limit(5),
        supabase.from('workout_sessions').select('id, student_id, plan_id, day_name, phase, started_at, created_at, last_active_at, session_state, status')
          .eq('student_id', userId).eq('status', 'in_progress').order('started_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('cardio_sessions').select('id, completed_at, duration_seconds, rpe, plan_id, protocol_index, protocol_name')
          .eq('student_id', userId).eq('status', 'completed').not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(60),
      ]);
      if (logsRes.error || sessionsRes.error || incrementsRes.error) throw logsRes.error ?? sessionsRes.error ?? incrementsRes.error;

      const increments: Record<string, number> = {};
      (incrementsRes.data ?? []).forEach(row => {
        const value = Number(row.increment_kg);
        if (Number.isFinite(value) && value > 0) increments[row.exercise_key] = value;
      });
      await Promise.all([
        setCache(`progression:logs:${userId}`, logsRes.data ?? []),
        setCache(`progression:sessions:${userId}`, sessionsRes.data ?? []),
        setCache(`progression:increments:${userId}`, increments),
        setCache(`sessions:recent:${userId}`, recentRes.data ?? []),
        setCache(`workout:active:${userId}`, activeRes.data ?? null),
        setCache(`workout:pending-checkin:${userId}`, workouts.find(row => row.pending_checkin) ?? null),
        setCache(`cardio:done:${userId}`, cardioDoneRes.data ?? []),
      ]);

      if (activeRes.data) {
        try { localStorage.setItem('mw_active_workout_session', JSON.stringify(activeRes.data)); } catch { /* noop */ }
      }

      const today = localDateKey();
      const week = getWeekRange(new Date(`${today}T12:00:00`));
      const { data: tracking } = await supabase.from('daily_tracking')
        .select('id,date,water_glasses,water_ml,meals_completed,workout_completed')
        .eq('student_id', userId).gte('date', week.start).lte('date', week.end);
      await setCache(`tracking-week:${userId}:${week.start}`, tracking ?? []);

      // Aquece as fotos sem bloquear a interface; o SW guarda as respostas.
      const images = [...new Set(exercises.map(row => row.imagem_url).filter(Boolean))].slice(0, 120) as string[];
      images.forEach(src => {
        const image = new Image();
        image.decoding = 'async';
        image.src = src;
      });

      const updatedAt = new Date().toISOString();
      await setCache(offlineReadyKey(userId), { userId, updatedAt, complete: coreReady });
      lastRun[userId] = Date.now();
      window.dispatchEvent(new Event('mw-offline-ready-changed'));
      return true;
    } catch (error) {
      console.warn('[offline] pré-download incompleto', error);
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function shouldPrefetchStudent(userId: string): boolean {
  return !lastRun[userId] || Date.now() - lastRun[userId] > 5 * 60 * 1000;
}
