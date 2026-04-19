import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Activity, UserCheck, UserX, Dumbbell, Utensils, GlassWater, AlertOctagon } from 'lucide-react';

interface Stats {
  openedToday: number;
  notOpened: number;
  workoutToday: number;
  noWorkout: number;
  mealsToday: number;
  waterToday: number;
  riskAbandon: number;
  totalStudents: number;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const EngagementOverviewCards: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const ids = (roles ?? []).map((r) => r.user_id);
      const total = ids.length;

      const today = todayStr();
      const startOfDay = `${today}T00:00:00.000Z`;
      const fiveDaysAgo = daysAgoIso(5);

      const [openedRes, workoutRes, trackingRes, eventsLastRes] = await Promise.all([
        supabase
          .from('student_events')
          .select('student_id')
          .eq('event_type', 'app_opened')
          .gte('created_at', startOfDay)
          .in('student_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']),
        supabase
          .from('workout_sessions')
          .select('student_id')
          .gte('completed_at', startOfDay)
          .in('student_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']),
        supabase
          .from('daily_tracking')
          .select('student_id, water_glasses, meals_completed')
          .eq('date', today)
          .in('student_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']),
        supabase
          .from('student_events')
          .select('student_id, created_at')
          .eq('event_type', 'app_opened')
          .gte('created_at', fiveDaysAgo)
          .in('student_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']),
      ]);

      const openedSet = new Set((openedRes.data ?? []).map((e) => e.student_id));
      const workoutSet = new Set((workoutRes.data ?? []).map((w) => w.student_id));
      const tracking = trackingRes.data ?? [];
      const mealsCount = tracking.filter((t) => Array.isArray(t.meals_completed) && t.meals_completed.length > 0).length;
      const waterCount = tracking.filter((t) => (t.water_glasses ?? 0) > 0).length;

      const recentOpenedSet = new Set((eventsLastRes.data ?? []).map((e) => e.student_id));
      const riskAbandon = ids.filter((id) => !recentOpenedSet.has(id)).length;

      setStats({
        openedToday: openedSet.size,
        notOpened: total - openedSet.size,
        workoutToday: workoutSet.size,
        noWorkout: total - workoutSet.size,
        mealsToday: mealsCount,
        waterToday: waterCount,
        riskAbandon,
        totalStudents: total,
      });
    })();
  }, []);

  const cards = [
    { label: 'Acessaram hoje', value: stats?.openedToday, icon: UserCheck, color: 'text-emerald-500' },
    { label: 'Não acessaram', value: stats?.notOpened, icon: UserX, color: 'text-orange-500' },
    { label: 'Treinaram hoje', value: stats?.workoutToday, icon: Dumbbell, color: 'text-primary' },
    { label: 'Sem treino hoje', value: stats?.noWorkout, icon: Activity, color: 'text-amber-500' },
    { label: 'Refeições hoje', value: stats?.mealsToday, icon: Utensils, color: 'text-emerald-500' },
    { label: 'Água hoje', value: stats?.waterToday, icon: GlassWater, color: 'text-blue-500' },
    { label: 'Risco abandono', value: stats?.riskAbandon, icon: AlertOctagon, color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {cards.map((c) => (
        <Card key={c.label} className="glass-card">
          <CardContent className="p-2.5 flex items-center gap-2">
            <div className={`rounded-lg p-1.5 bg-secondary ${c.color}`}>
              <c.icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] text-muted-foreground leading-tight uppercase truncate">{c.label}</p>
              <p className="text-lg font-bold leading-tight">{stats ? c.value : '…'}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default EngagementOverviewCards;
