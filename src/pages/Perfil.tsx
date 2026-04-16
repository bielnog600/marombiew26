import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, Mail, Phone, User, Calendar, Ruler, Target, TrendingUp } from 'lucide-react';

const Perfil = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);

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

        {/* Evolution */}
        <Button
          className="w-full gradient-primary text-primary-foreground font-semibold"
          onClick={() => navigate('/evolucao')}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Minha Evolução
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