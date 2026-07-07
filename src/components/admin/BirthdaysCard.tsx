import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cake, PartyPopper } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Birthday {
  id: string;
  name: string;
  telefone?: string | null;
  day: number;
  month: number;
  daysUntil: number; // 0 = hoje, 1 = amanhã, ...
  age?: number;
}

const WA_MESSAGES = [
  '🎉 Feliz aniversário, {name}! Que este novo ciclo venha cheio de saúde, força e conquistas nos treinos. Bora fazer desse ano o melhor! 💪🎂',
  '🥳 Parabéns, {name}! Desejo muita saúde, disposição e resultados incríveis. Aproveite muito o seu dia! 🎁💪',
  '🎂 Feliz aniversário, {name}! Que Deus te abençoe com saúde e energia pra continuar evoluindo cada dia mais. Bora celebrar! 🎉',
  '✨ Muitos parabéns, {name}! Que este novo ano seja de superações, treinos consistentes e muitas alegrias. Um grande abraço! 🎈💪',
  '🎊 Feliz aniversário, {name}! Que a vida te dê tudo aquilo que os treinos ensinam: força, disciplina e conquistas. Aproveite muito! 🎂',
];

const TOMORROW_MESSAGES = [
  '🎂 Oi, {name}! Passando pra lembrar que amanhã é seu dia especial! Já te desejando um aniversário maravilhoso, cheio de saúde e alegria. 🎉',
  '✨ {name}, amanhã é o SEU dia! Preparado(a) pra comemorar? Já mando aquele abraço antecipado, com muita saúde e boas energias! 🥳',
];

const randomMessage = (list: string[], name: string) => {
  const msg = list[Math.floor(Math.random() * list.length)];
  return msg.replace('{name}', name.split(' ')[0]);
};

const cleanPhone = (raw?: string | null) => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
};

const BirthdaysCard: React.FC = () => {
  const [items, setItems] = useState<Birthday[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'aluno');
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, nome, telefone, data_nascimento')
        .in('user_id', ids);

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const today = new Date(currentYear, now.getMonth(), now.getDate());

      const list: Birthday[] = [];
      for (const p of profiles ?? []) {
        if (!p.data_nascimento) continue;
        const [y, m, d] = p.data_nascimento.split('T')[0].split('-').map(Number);
        if (!m || !d) continue;
        if (m !== currentMonth) continue;

        const thisYearBday = new Date(currentYear, m - 1, d);
        const diff = Math.round(
          (thisYearBday.getTime() - today.getTime()) / 86400000,
        );
        list.push({
          id: p.user_id,
          name: p.nome || 'Sem nome',
          telefone: p.telefone,
          day: d,
          month: m,
          daysUntil: diff,
          age: y ? currentYear - y : undefined,
        });
      }

      list.sort((a, b) => a.day - b.day);
      setItems(list);
    })();
  }, []);

  const today = useMemo(() => items.filter((b) => b.daysUntil === 0), [items]);
  const tomorrow = useMemo(() => items.filter((b) => b.daysUntil === 1), [items]);

  const openWhatsApp = (b: Birthday, tomorrowMode = false) => {
    const phone = cleanPhone(b.telefone);
    const msg = randomMessage(tomorrowMode ? TOMORROW_MESSAGES : WA_MESSAGES, b.name);
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  return (
    <>
      <Card
        className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setOpen(true)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cake className="h-5 w-5 text-pink-500" />
            Aniversariantes de {monthName}
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              {items.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum aniversariante este mês.</p>
          )}
          {today.length > 0 && (
            <div className="rounded-lg bg-pink-500/10 border border-pink-500/30 p-2 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-pink-400 font-semibold flex items-center gap-1">
                <PartyPopper className="h-3 w-3" /> Hoje é o dia!
              </p>
              {today.map((b) => (
                <div key={b.id} className="flex items-center gap-2">
                  <span className="text-sm font-medium flex-1 truncate">
                    {b.name}
                    {b.age ? ` · ${b.age} anos` : ''}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    onClick={(e) => {
                      e.stopPropagation();
                      openWhatsApp(b);
                    }}
                  >
                    WhatsApp
                  </Button>
                </div>
              ))}
            </div>
          )}
          {tomorrow.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">
                Amanhã
              </p>
              {tomorrow.map((b) => (
                <div key={b.id} className="flex items-center gap-2">
                  <span className="text-sm font-medium flex-1 truncate">
                    {b.name}
                    {b.age ? ` · fará ${b.age}` : ''}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    onClick={(e) => {
                      e.stopPropagation();
                      openWhatsApp(b, true);
                    }}
                  >
                    Avisar
                  </Button>
                </div>
              ))}
            </div>
          )}
          {items.length > 0 && today.length === 0 && tomorrow.length === 0 && (
            <div className="space-y-1">
              {items.slice(0, 4).map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-sm">
                  <span className="text-xs w-8 text-muted-foreground shrink-0">
                    {String(b.day).padStart(2, '0')}/{String(b.month).padStart(2, '0')}
                  </span>
                  <span className="truncate flex-1">{b.name}</span>
                  {b.age && (
                    <span className="text-xs text-muted-foreground shrink-0">{b.age}a</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cake className="h-5 w-5 text-pink-500" />
              Aniversariantes de {monthName} ({items.length})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum aniversariante este mês.
              </p>
            ) : (
              <div className="space-y-1.5">
                {items.map((b) => {
                  const highlight =
                    b.daysUntil === 0
                      ? 'bg-pink-500/10 border-pink-500/30'
                      : b.daysUntil === 1
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-secondary/40 border-transparent';
                  const canMessage = b.daysUntil <= 1 && b.daysUntil >= 0;
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border ${highlight}`}
                    >
                      <span className="text-xs w-10 text-muted-foreground shrink-0">
                        {String(b.day).padStart(2, '0')}/{String(b.month).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {b.daysUntil === 0
                            ? 'Hoje!'
                            : b.daysUntil === 1
                              ? 'Amanhã'
                              : `em ${b.daysUntil} dias`}
                          {b.age ? ` · ${b.age} anos` : ''}
                        </p>
                      </div>
                      {canMessage && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            openWhatsApp(b, b.daysUntil === 1);
                          }}
                        >
                          WhatsApp
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BirthdaysCard;