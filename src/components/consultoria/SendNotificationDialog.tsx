import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  studentId: string;
  studentName?: string;
  trigger?: React.ReactNode;
  onSent?: () => void;
}

const PRIORITIES = [
  { value: 'normal', label: 'Normal', desc: 'Aviso comum (azul)' },
  { value: 'alta', label: 'Importante', desc: 'Destaque laranja' },
  { value: 'urgente', label: 'Urgente', desc: 'Vermelho, máximo destaque' },
] as const;

const QUICK_TEMPLATES = [
  { label: 'Reavaliação', title: 'Hora da reavaliação', message: 'Olá! Já se passaram algumas semanas. Vamos agendar sua nova avaliação? Entre em contato para marcarmos.' },
  { label: 'Treino novo', title: 'Treino atualizado!', message: 'Seu treino foi atualizado. Confira a nova fase e bons treinos! 💪' },
  { label: 'Dieta nova', title: 'Dieta atualizada', message: 'Sua dieta foi ajustada com base nos seus feedbacks. Confira na aba Dieta! 🥗' },
  { label: 'Cobrança suave', title: 'Sentindo sua falta', message: 'Notei que você não treina há alguns dias. Tudo bem? Vamos retomar a rotina!' },
  { label: 'Cargas & Reps', title: 'Registre suas cargas e reps', message: 'Lembre-se de registrar as cargas e repetições de cada série no app durante o treino. Esses dados são essenciais para acompanharmos sua progressão e ajustarmos seu plano! 📊💪' },
  { label: 'Refeição & Água', title: 'Registre refeições e água', message: 'Não esqueça de marcar suas refeições concluídas e o consumo de água no app. A consistência nesses registros faz toda diferença no resultado! 🥗💧' },
];

const SendNotificationDialog: React.FC<Props> = ({ studentId, studentName, trigger, onSent }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'normal' | 'alta' | 'urgente'>('normal');
  const [sending, setSending] = useState(false);

  const reset = () => { setTitle(''); setMessage(''); setPriority('normal'); };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error('Preencha título e mensagem');
      return;
    }
    if (!user) return;
    setSending(true);

    // Desativa notificações anteriores não vistas, evita acúmulo
    await supabase
      .from('admin_notifications')
      .update({ active: false })
      .eq('student_id', studentId)
      .eq('active', true)
      .is('viewed_at', null);

    const { error } = await supabase.from('admin_notifications').insert({
      student_id: studentId,
      sender_id: user.id,
      title: title.trim(),
      message: message.trim(),
      priority,
    });
    setSending(false);
    if (error) {
      toast.error('Erro ao enviar: ' + error.message);
      return;
    }

    // Dispara push para o aluno e informa quando ele ainda não ativou no aparelho
    const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push-notification', {
      body: {
        user_ids: [studentId],
        title: title.trim(),
        message: message.trim(),
        data: { type: 'admin_notification', priority },
      },
    });

    if (pushError) {
      console.warn('push falhou:', pushError);
      toast.warning('Aviso salvo no app, mas o push falhou no envio.');
    } else if (pushResult?.reason === 'no_subscribers' || pushResult?.delivered === 0) {
      toast.warning('Aviso salvo no app, mas este aluno ainda não ativou push neste aparelho.');
    } else {
      toast.success('Notificação push enviada!');
    }

    reset();
    setOpen(false);
    onSent?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Send className="h-3.5 w-3.5 mr-1.5" /> Notificar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar notificação</DialogTitle>
          <DialogDescription>
            {studentName ? `Para ${studentName}. ` : ''}Aparecerá em destaque ao abrir o app, uma única vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Modelos rápidos</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {QUICK_TEMPLATES.map((t) => (
                <Button
                  key={t.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => { setTitle(t.title); setMessage(t.message); }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-title">Título</Label>
            <Input
              id="notif-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Treino atualizado"
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-msg">Mensagem</Label>
            <Textarea
              id="notif-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escreva sua mensagem..."
              rows={4}
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground text-right">{message.length}/500</p>
          </div>

          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <div className="grid grid-cols-3 gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`rounded-lg border p-2 text-center transition-colors ${
                    priority === p.value
                      ? p.value === 'urgente'
                        ? 'bg-destructive/15 border-destructive text-destructive'
                        : p.value === 'alta'
                          ? 'bg-orange-500/15 border-orange-500 text-orange-500'
                          : 'bg-primary/15 border-primary text-primary'
                      : 'bg-secondary/40 border-border text-muted-foreground'
                  }`}
                >
                  <p className="text-xs font-semibold">{p.label}</p>
                  <p className="text-[9px] opacity-70 leading-tight">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendNotificationDialog;