import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LockKeyhole, MessageCircle, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildReactivationWhatsAppUrl,
  formatInactiveDays,
  getInactiveDays,
  type SuspensionReason,
} from '@/lib/accessControl';

interface Props {
  reason: SuspensionReason | null;
  lastActiveAt?: string | null;
}

const SuspendedAccessPage: React.FC<Props> = ({ reason, lastActiveAt }) => {
  const { user, signOut } = useAuth();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('nome')
        .eq('user_id', user.id)
        .maybeSingle();
      if (active) setName(data?.nome ?? null);
    })();
    return () => { active = false; };
  }, [user]);

  const inactiveDays = getInactiveDays(lastActiveAt ?? null);
  const inactiveLabel = formatInactiveDays(inactiveDays);
  const dayWord = inactiveDays === 1 ? 'dia' : 'dias';

  const body = reason === 'inactivity'
    ? inactiveDays !== null
      ? [
          `Notamos que sua conta está há ${inactiveDays} ${dayWord} sem acesso.`,
          'Seu acesso ao MAROMBIEW foi temporariamente suspenso devido ao período de inatividade.',
          'Solicite a reativação para voltar a acessar seus treinos, dieta e acompanhamento.',
        ]
      : [
          'Seu acesso foi temporariamente suspenso.',
          'Solicite a reativação para voltar a acessar o MAROMBIEW.',
        ]
    : inactiveDays !== null
      ? [
          'Seu acesso ao MAROMBIEW está temporariamente suspenso.',
          `Seu último acesso ao aplicativo foi há ${inactiveDays} ${dayWord}.`,
          'Entre em contato com seu treinador para solicitar a reativação da sua conta.',
        ]
      : [
          'Seu acesso ao MAROMBIEW está temporariamente suspenso.',
          'Entre em contato com seu treinador para solicitar a reativação da sua conta.',
        ];

  return (
    <main
      className="min-h-screen w-full flex items-center justify-center bg-background px-5"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <Card className="glass-card w-full max-w-sm">
        <CardContent className="p-6 flex flex-col items-center text-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-primary/15 flex items-center justify-center">
            <LockKeyhole className="h-8 w-8 text-primary" />
          </div>

          <h1 className="text-xl font-bold text-foreground">
            Acesso temporariamente suspenso
          </h1>

          {inactiveLabel && (
            <div className="w-full rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
              <p className="text-sm font-bold tracking-wide text-primary uppercase">{inactiveLabel}</p>
            </div>
          )}

          <div className="space-y-3">
            {body.map((p) => (
              <p key={p} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
            ))}
          </div>

          <div className="w-full space-y-2 pt-1">
            <Button
              className="w-full h-11 rounded-xl gap-2"
              onClick={() => window.open(buildReactivationWhatsAppUrl(name), '_blank', 'noopener,noreferrer')}
            >
              <MessageCircle className="h-4 w-4" />
              Solicitar reativação
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl gap-2"
              onClick={() => { void signOut(); }}
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default SuspendedAccessPage;
