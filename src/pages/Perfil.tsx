import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, Mail, Phone, User, Calendar, Ruler, Target, TrendingUp, BarChart3, Bell, BellOff, BellRing, CheckCircle2, Share2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import { WorkoutSummaryShare } from '@/components/training/WorkoutSummaryShare';
import type { TrainingPhase } from '@/lib/trainingPhase';
import { fetchWithCache } from '@/lib/offlineCache';

interface RecentSession {
  id: string;
  duration_minutes: number;
  exercises_completed: number;
  total_exercises: number;
  completed_at: string;
  day_name: string | null;
  phase: string | null;
}

const Perfil = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const { status, enableNotifications, isIOS, isStandalone } = usePushNotifications();
  const [enabling, setEnabling] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [shareSession, setShareSession] = useState<RecentSession | null>(null);

  const handleEnableNotifications = async () => {
    // iOS: precisa estar no PWA instalado para o prompt aparecer
    if (isIOS && !isStandalone) {
      toast.error('No iPhone, instale o app primeiro', {
        description: 'Abra no Safari → botão Compartilhar → "Adicionar à Tela de Início". Depois abra pelo ícone instalado.',
        duration: 8000,
      });
      return;
    }

    if (status === 'blocked') {
      toast.error('Notificações bloqueadas', {
        description: isIOS
          ? 'Vá em Ajustes do iPhone → Notificações → Marombiew e ative.'
          : 'Permita notificações nas configurações do navegador para este site.',
        duration: 8000,
      });
      return;
    }

    if (status === 'unsupported') {
      toast.error('Dispositivo não suportado', {
        description: 'Atualize seu sistema (iOS 16.4+) ou use outro navegador.',
      });
      return;
    }

    setEnabling(true);
    try {
      const ok = await enableNotifications();
      if (ok) {
        toast.success('Notificações ativadas!', {
          description: 'Você receberá avisos do seu personal aqui no aparelho.',
        });
      } else {
        toast.warning('Não foi possível ativar', {
          description: 'Tente novamente. Se aparecer um popup, clique em "Permitir".',
        });
      }
    } finally {
      setEnabling(false);
    }
  };

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data: profData } = await fetchWithCache(`profile:full:${user!.id}`, async () => {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user!.id).maybeSingle();
      return data;
    });
    setProfile(profData);

    const { data: studentData } = await fetchWithCache(`student_profile:${user!.id}`, async () => {
      const { data } = await supabase.from('students_profile').select('*').eq('user_id', user!.id).maybeSingle();
      return data;
    });
    setStudentProfile(studentData);

    const { data: sessions } = await fetchWithCache(`sessions:recent:${user!.id}`, async () => {
      const { data } = await supabase.from('workout_sessions').select('id, duration_minutes, exercises_completed, total_exercises, completed_at, day_name, phase').eq('student_id', user!.id).order('completed_at', { ascending: false }).limit(5);
      return data;
    });
    setRecentSessions((sessions ?? []) as RecentSession[]);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const firstName = profile?.nome?.split(' ')[0] || '';
  const initials = profile?.nome
    ? profile.nome
        .split(' ')
        .slice(0, 2)
        .map((w: string) => w[0]?.toUpperCase())
        .join('')
    : '?';

  const age = studentProfile?.data_nascimento
    ? Math.floor((Date.now() - new Date(studentProfile.data_nascimento).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const infoItems = [
    { icon: Mail, label: 'Email', value: profile?.email },
    { icon: Phone, label: 'Telefone', value: profile?.telefone },
    { icon: Calendar, label: 'Idade', value: age ? `${age} anos` : null },
    { icon: Ruler, label: 'Altura', value: studentProfile?.altura ? `${studentProfile.altura} cm` : null },
    { icon: Target, label: 'Objetivo', value: studentProfile?.objetivo },
  ].filter((item) => item.value);

  return (
    <AppLayout title="Meu Perfil">
      <div className="space-y-5 animate-fade-in max-w-lg mx-auto">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold text-2xl">{initials}</span>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold text-foreground">{profile?.nome || 'Aluno'}</h1>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </div>
        </div>

        {/* Info Card */}
        {infoItems.length > 0 && (
          <Card className="glass-card">
            <CardContent className="p-4 space-y-3">
              {infoItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                    <p className="text-sm text-foreground truncate">{item.value}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Observations */}
        {studentProfile?.observacoes && (
          <Card className="glass-card">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Observações</p>
              <p className="text-sm text-foreground">{studentProfile.observacoes}</p>
            </CardContent>
          </Card>
        )}

        {/* Notificações */}
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              {status === 'enabled' ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : status === 'blocked' ? (
                <BellOff className="h-5 w-5 text-destructive shrink-0" />
              ) : (
                <BellRing className="h-5 w-5 text-primary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Notificações push</p>
                <p className="text-xs text-muted-foreground">
                  {status === 'enabled'
                    ? 'Ativadas neste aparelho ✓'
                    : status === 'blocked'
                    ? 'Bloqueadas — ative nos ajustes do sistema'
                    : isIOS && !isStandalone
                    ? 'Instale o app na tela de início para ativar'
                    : 'Receba avisos do seu personal'}
                </p>
              </div>
            </div>
            {status !== 'enabled' && (
              <Button
                onClick={handleEnableNotifications}
                disabled={enabling || status === 'initializing'}
                className="w-full gradient-primary text-primary-foreground font-semibold"
              >
                <Bell className="h-4 w-4 mr-2" />
                {enabling || status === 'initializing' ? 'Ativando...' : 'Ativar notificações'}
              </Button>
            )}
            {isIOS && !isStandalone && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong>iPhone:</strong> abra no Safari, toque no botão Compartilhar e em "Adicionar à Tela de Início". Depois abra o app pelo ícone instalado e volte aqui.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Evolution */}
        <Button
          className="w-full gradient-primary text-primary-foreground font-semibold"
          onClick={() => navigate('/evolucao')}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Minha Evolução
        </Button>

        {/* Progress */}
        <Button
          variant="outline"
          className="w-full border-primary/40 text-primary hover:bg-primary/10 font-semibold"
          onClick={() => navigate('/meu-progresso')}
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Meu Progresso
        </Button>

        {/* Compartilhar treinos recentes */}
        {recentSessions.length > 0 && (
          <Card className="glass-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Compartilhar treino</p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Esqueceu de postar? Escolha um treino abaixo e compartilhe nos stories.
              </p>
              <div className="space-y-1.5">
                {recentSessions.map((s) => {
                  const d = new Date(s.completed_at);
                  const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setShareSession(s)}
                      className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg bg-background/40 hover:bg-background/70 border border-border/40 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {s.day_name || 'Treino'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {dateLabel} · {s.duration_minutes || 0} min · {s.exercises_completed}/{s.total_exercises} exerc.
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-primary text-[10px] font-bold uppercase tracking-wider shrink-0">
                        <Share2 className="h-3.5 w-3.5" />
                        Postar
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sign Out */}
        <Button
          variant="outline"
          className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair da conta
        </Button>
      </div>

      {shareSession && (
        <WorkoutSummaryShare
          dayName={shareSession.day_name || 'Treino'}
          durationSeconds={(shareSession.duration_minutes || 0) * 60}
          exercisesCompleted={shareSession.exercises_completed || 0}
          totalExercises={shareSession.total_exercises || 0}
          phase={(shareSession.phase as TrainingPhase | null) ?? null}
          onClose={() => setShareSession(null)}
        />
      )}
    </AppLayout>
  );
};

export default Perfil;