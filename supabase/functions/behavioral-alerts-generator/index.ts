import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertSpec {
  student_id: string;
  alert_key: string;
  priority: 'alta' | 'media' | 'baixa';
  title: string;
  description: string;
}

const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const today = todayStr();
    const fiveDaysAgo = daysAgo(5).toISOString();
    const threeDaysAgo = daysAgo(3).toISOString();
    const twoDaysAgo = daysAgo(2).toISOString();
    const eightDaysAgo = daysAgo(8).toISOString();

    // Janela do "mesmo dia da semana passada" (7 dias atrás, dia inteiro)
    const lastWeekSameDayStart = new Date();
    lastWeekSameDayStart.setDate(lastWeekSameDayStart.getDate() - 7);
    lastWeekSameDayStart.setHours(0, 0, 0, 0);
    const lastWeekSameDayEnd = new Date(lastWeekSameDayStart);
    lastWeekSameDayEnd.setHours(23, 59, 59, 999);

    // 1. Carregar alunos ativos
    const { data: alunoRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'aluno');

    const allStudentIds = (alunoRoles ?? []).map((r) => r.user_id);

    // Filtrar somente alunos com students_profile.ativo = true
    const { data: activeProfiles } = await supabase
      .from('students_profile')
      .select('user_id')
      .eq('ativo', true)
      .in('user_id', allStudentIds);

    const studentIds = (activeProfiles ?? []).map((p) => p.user_id);
    if (!studentIds.length) {
      return new Response(JSON.stringify({ generated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Carregar dados em massa
    const [eventsRes, sessionsRes, trackingRes, setLogsRes] = await Promise.all([
      supabase
        .from('student_events')
        .select('student_id, event_type, created_at')
        .in('student_id', studentIds)
        .gte('created_at', fiveDaysAgo),
      supabase
        .from('workout_sessions')
        .select('id, student_id, day_name, phase, avg_rpe, total_volume_kg, total_sets, completed_at')
        .in('student_id', studentIds)
        .gte('completed_at', eightDaysAgo),
      supabase
        .from('daily_tracking')
        .select('student_id, date, water_glasses, meals_completed, workout_completed')
        .in('student_id', studentIds)
        .gte('date', daysAgo(5).toISOString().slice(0, 10)),
      supabase
        .from('exercise_set_logs')
        .select('student_id, performed_at, session_id, day_name, muscle_group, exercise_name, weight_kg, reps, rpe')
        .in('student_id', studentIds)
        .gte('performed_at', eightDaysAgo),
    ]);

    const events = eventsRes.data ?? [];
    const sessions = sessionsRes.data ?? [];
    const tracking = trackingRes.data ?? [];
    const setLogs = setLogsRes.data ?? [];

    const alerts: AlertSpec[] = [];
    const activeKeysByStudent: Record<string, Set<string>> = {};

    for (const studentId of studentIds) {
      activeKeysByStudent[studentId] = new Set();
      const studentEvents = events.filter((e) => e.student_id === studentId);
      const studentSessions = sessions.filter((s) => s.student_id === studentId);
      const studentTracking = tracking.filter((t) => t.student_id === studentId);
      const studentLogs = setLogs.filter((l) => l.student_id === studentId);

      // ALTA: 5+ dias sem app_opened
      const lastOpen = studentEvents
        .filter((e) => e.event_type === 'app_opened')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!lastOpen || new Date(lastOpen.created_at) < daysAgo(5)) {
        const key = 'inactive_5d';
        activeKeysByStudent[studentId].add(key);
        alerts.push({
          student_id: studentId,
          alert_key: key,
          priority: 'alta',
          title: 'Inativo há 5+ dias',
          description: 'Aluno não acessa o app há mais de 5 dias — risco de abandono.',
        });
      }

      // ALTA: sem treino concluído nos últimos 3 dias
      const recentSessions = studentSessions.filter(
        (s) => new Date(s.completed_at) >= daysAgo(3)
      );
      if (!recentSessions.length) {
        const key = 'no_workout_3d';
        activeKeysByStudent[studentId].add(key);
        alerts.push({
          student_id: studentId,
          alert_key: key,
          priority: 'alta',
          title: 'Sem treino há 3+ dias',
          description: 'Nenhum treino concluído nos últimos 3 dias.',
        });
      }

      // ALTA: descuido combinado (sem treino + sem dieta + sem água) por 2 dias
      const last2DaysTracking = studentTracking.filter((t) => t.date >= daysAgo(2).toISOString().slice(0, 10));
      const allNeglected = last2DaysTracking.length === 0 || last2DaysTracking.every(
        (t) =>
          !t.workout_completed &&
          (Array.isArray(t.meals_completed) ? t.meals_completed.length === 0 : true) &&
          (t.water_glasses ?? 0) === 0
      );
      if (allNeglected && last2DaysTracking.length > 0) {
        const key = 'combined_neglect_2d';
        activeKeysByStudent[studentId].add(key);
        alerts.push({
          student_id: studentId,
          alert_key: key,
          priority: 'alta',
          title: 'Descuido total por 2+ dias',
          description: 'Sem treino, sem refeições e sem água registrados.',
        });
      }

      // MÉDIA: treino sem registro de cargas
      const todayWorkout = studentSessions.find((s) => s.completed_at.slice(0, 10) === today);
      const todayLogs = studentLogs.filter((l) => l.performed_at.slice(0, 10) === today);
      if (todayWorkout && todayLogs.length === 0) {
        const key = `workout_no_loads_${today}`;
        activeKeysByStudent[studentId].add(key);
        alerts.push({
          student_id: studentId,
          alert_key: key,
          priority: 'media',
          title: 'Treinou hoje sem registrar cargas',
          description: 'Concluiu o treino mas não registrou pesos/repetições.',
        });
      }

      // BAIXA: treino abandonado (started sem completed) hoje
      const startedToday = studentEvents.find(
        (e) => e.event_type === 'workout_started' && e.created_at.slice(0, 10) === today
      );
      const completedToday = studentEvents.find(
        (e) => e.event_type === 'workout_completed' && e.created_at.slice(0, 10) === today
      );
      if (startedToday && !completedToday && todayWorkout === undefined) {
        const key = `workout_abandoned_${today}`;
        activeKeysByStudent[studentId].add(key);
        alerts.push({
          student_id: studentId,
          alert_key: key,
          priority: 'baixa',
          title: 'Treino iniciado e não concluído',
          description: 'Aluno iniciou o treino hoje mas não finalizou.',
        });
      }

      // MÉDIA: água abaixo da meta nos últimos 3 dias (meta=8)
      const waterDaysOk = studentTracking.filter(
        (t) => t.date >= daysAgo(3).toISOString().slice(0, 10) && (t.water_glasses ?? 0) >= 8
      );
      if (studentTracking.length >= 3 && waterDaysOk.length === 0) {
        const key = 'water_below_3d';
        activeKeysByStudent[studentId].add(key);
        alerts.push({
          student_id: studentId,
          alert_key: key,
          priority: 'media',
          title: 'Água abaixo da meta há 3 dias',
          description: 'Não bateu meta de hidratação (8 copos) nos últimos 3 dias.',
        });
      }

      // MÉDIA: sugestão de progressão para o treino de hoje
      // Gera para TODO aluno que ainda não treinou hoje. Se tiver histórico do
      // mesmo dia da semana passada, personaliza pelo RPE; senão, dica genérica.
      const alreadyTrainedToday = studentSessions.some(
        (s) => s.completed_at?.slice(0, 10) === today
      );

      if (!alreadyTrainedToday) {
        const lastWeekSession = studentSessions.find((s) => {
          if (!s.completed_at) return false;
          const t = new Date(s.completed_at).getTime();
          return t >= lastWeekSameDayStart.getTime() && t <= lastWeekSameDayEnd.getTime();
        });

        const lastWeekDateStr = lastWeekSameDayStart.toISOString().slice(0, 10);
        const lastWeekLogs = lastWeekSession
          ? studentLogs.filter((l) => {
              if (l.session_id && lastWeekSession.id && l.session_id === lastWeekSession.id) return true;
              return l.performed_at?.slice(0, 10) === lastWeekDateStr;
            })
          : [];

        const rpes = lastWeekLogs.map((l) => Number(l.rpe)).filter((r) => Number.isFinite(r) && r > 0);
        const avgRpe = rpes.length > 0
          ? rpes.reduce((a, b) => a + b, 0) / rpes.length
          : (lastWeekSession?.avg_rpe ? Number(lastWeekSession.avg_rpe) : null);

        const muscleCounts: Record<string, number> = {};
        for (const l of lastWeekLogs) {
          const m = (l.muscle_group || '').trim();
          if (m) muscleCounts[m] = (muscleCounts[m] || 0) + 1;
        }
        const topMuscles = Object.entries(muscleCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([m]) => m);
        const muscleLabel = topMuscles.length > 0
          ? topMuscles.join(' / ')
          : (lastWeekSession?.day_name || 'treino de hoje');

        let priority: 'alta' | 'media' | 'baixa' = 'baixa';
        let title = '';
        let description = '';

        if (avgRpe === null) {
          priority = 'baixa';
          title = `Preparo pro treino de hoje: ${muscleLabel}`;
          description = `Sem histórico do mesmo dia da semana passada. Sugerir foco em ativação: aquecimento específico (1–2 séries leves), técnica caprichada e tentar +1 rep ou pequena progressão de carga vs. última vez.`;
        } else if (avgRpe <= 7) {
          priority = 'media';
          title = `Progressão sugerida: ${muscleLabel}`;
          description = `Semana passada o aluno fez este treino com RPE médio ${avgRpe.toFixed(1)} (folga). Sugerir +2,5 a 5 kg ou +1–2 reps nos principais exercícios para mais ativação.`;
        } else if (avgRpe >= 9) {
          priority = 'media';
          title = `Atenção à fadiga: ${muscleLabel}`;
          description = `RPE médio ${avgRpe.toFixed(1)} na semana passada (muito alto). Manter cargas e focar em técnica/recuperação antes de progredir.`;
        } else {
          priority = 'baixa';
          title = `Manter estímulo: ${muscleLabel}`;
          description = `RPE médio ${avgRpe.toFixed(1)} na semana passada (zona ideal). Manter cargas ou pequena progressão de +1 rep.`;
        }

        // Chave estável por dia — auto-resolve quando o aluno treinar hoje
        const dow = new Date().getDay();
        const key = `progression_dow_${dow}_${today}`;
        activeKeysByStudent[studentId].add(key);
        alerts.push({
          student_id: studentId,
          alert_key: key,
          priority,
          title,
          description,
        });
      }
    }

    // 3. UPSERT alertas ativos
    if (alerts.length > 0) {
      const { error: upsertError } = await supabase
        .from('behavioral_alerts')
        .upsert(alerts, { onConflict: 'student_id,alert_key', ignoreDuplicates: false });
      if (upsertError) throw upsertError;
    }

    // 4. Auto-resolver alertas que não estão mais ativos (inclui alertas de alunos desativados)
    const { data: existing } = await supabase
      .from('behavioral_alerts')
      .select('id, student_id, alert_key, status')
      .neq('status', 'resolvido');

    const activeStudentSet = new Set(studentIds);
    const toResolve = (existing ?? []).filter(
      (a) => !activeStudentSet.has(a.student_id) || !activeKeysByStudent[a.student_id]?.has(a.alert_key)
    );

    if (toResolve.length > 0) {
      await supabase
        .from('behavioral_alerts')
        .update({ status: 'resolvido', resolved_at: new Date().toISOString() })
        .in(
          'id',
          toResolve.map((a) => a.id)
        );
    }

    return new Response(
      JSON.stringify({ generated: alerts.length, resolved: toResolve.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('behavioral-alerts-generator error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
