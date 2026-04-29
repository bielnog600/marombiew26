import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, Mail, Phone, User, Calendar, Ruler, Target, TrendingUp, BarChart3, Bell, BellOff, BellRing, CheckCircle2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

const Perfil = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const { status, enableNotifications, isIOS, isStandalone } = usePushNotifications();
  const [enabling, setEnabling] = useState(false);

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
    const [profRes, studentRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user!.id).maybeSingle(),
      supabase.from('students_profile').select('*').eq('user_id', user!.id).maybeSingle(),
    ]);
    setProfile(profRes.data);
    setStudentProfile(studentRes.data);
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
    </AppLayout>
  );
};

export default Perfil;