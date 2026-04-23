import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, AlertTriangle, Megaphone } from 'lucide-react';

interface AdminNotif {
  id: string;
  title: string;
  message: string;
  priority: 'normal' | 'alta' | 'urgente';
}

const priorityConfig = {
  normal: { icon: Bell, color: 'text-primary', bg: 'bg-primary/15', label: 'Aviso' },
  alta: { icon: Megaphone, color: 'text-orange-500', bg: 'bg-orange-500/15', label: 'Importante' },
  urgente: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/15', label: 'Urgente' },
};

const AdminNotificationModal: React.FC = () => {
  const { user, role } = useAuth();
  const [notif, setNotif] = useState<AdminNotif | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!user || role !== 'aluno') return;
    (async () => {
      const { data } = await supabase
        .from('admin_notifications')
        .select('id, title, message, priority')
        .eq('student_id', user.id)
        .eq('active', true)
        .is('viewed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setNotif(data as AdminNotif);
    })();
  }, [user, role]);

  const handleClose = async () => {
    if (!notif || marking) return;
    setMarking(true);
    await supabase
      .from('admin_notifications')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', notif.id);
    setNotif(null);
    setMarking(false);
  };

  if (!notif) return null;

  const cfg = priorityConfig[notif.priority] || priorityConfig.normal;
  const Icon = cfg.icon;

  return (
    <Dialog open={!!notif} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className={`h-14 w-14 rounded-2xl ${cfg.bg} ${cfg.color} flex items-center justify-center mb-2`}>
            <Icon className="h-7 w-7" />
          </div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</p>
          <DialogTitle className="text-xl">{notif.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm leading-relaxed pt-1 text-foreground/80">
            {notif.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleClose} disabled={marking} className="w-full font-semibold">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminNotificationModal;