import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AgendaNotificationSettings({ open, onClose }: Props) {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    enable_schedule_notifications: true,
    enable_day_before_student: true,
    day_before_time: '20:00',
    enable_15min_before_student: true,
    enable_day_before_admin: true,
    enable_15min_before_admin: true,
    notify_on_student_confirm: true,
    notify_on_student_cancel: true,
    custom_student_day_before_message: '',
    custom_student_15min_message: '',
    custom_admin_day_before_message: '',
    custom_admin_15min_message: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('calendar_notification_settings')
      .select('*')
      .eq('admin_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            enable_schedule_notifications: data.enable_schedule_notifications,
            enable_day_before_student: data.enable_day_before_student,
            day_before_time: data.day_before_time || '20:00',
            enable_15min_before_student: data.enable_15min_before_student,
            enable_day_before_admin: data.enable_day_before_admin,
            enable_15min_before_admin: data.enable_15min_before_admin,
            notify_on_student_confirm: data.notify_on_student_confirm,
            notify_on_student_cancel: data.notify_on_student_cancel,
            custom_student_day_before_message: data.custom_student_day_before_message || '',
            custom_student_15min_message: data.custom_student_15min_message || '',
            custom_admin_day_before_message: data.custom_admin_day_before_message || '',
            custom_admin_15min_message: data.custom_admin_15min_message || '',
          });
        }
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = { ...settings, admin_id: user.id } as any;
      const { data: existing } = await supabase
        .from('calendar_notification_settings')
        .select('id')
        .eq('admin_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('calendar_notification_settings').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('calendar_notification_settings').insert(payload);
      }
      toast.success('Configurações salvas');
      onClose();
    } catch {
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Configurações de Notificações
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <Label>Ativar notificações da agenda</Label>
            <Switch checked={settings.enable_schedule_notifications} onCheckedChange={() => toggle('enable_schedule_notifications')} />
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Aluno</p>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Lembrete dia anterior</Label>
              <Switch checked={settings.enable_day_before_student} onCheckedChange={() => toggle('enable_day_before_student')} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm shrink-0">Horário:</Label>
              <Input
                type="time"
                value={settings.day_before_time}
                onChange={e => setSettings(prev => ({ ...prev, day_before_time: e.target.value }))}
                className="w-28"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Lembrete 15 min antes</Label>
              <Switch checked={settings.enable_15min_before_student} onCheckedChange={() => toggle('enable_15min_before_student')} />
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Admin</p>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Resumo dia anterior</Label>
              <Switch checked={settings.enable_day_before_admin} onCheckedChange={() => toggle('enable_day_before_admin')} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Alerta 15 min antes</Label>
              <Switch checked={settings.enable_15min_before_admin} onCheckedChange={() => toggle('enable_15min_before_admin')} />
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Ações do Aluno</p>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Notificar ao confirmar presença</Label>
              <Switch checked={settings.notify_on_student_confirm} onCheckedChange={() => toggle('notify_on_student_confirm')} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Notificar ao cancelar</Label>
              <Switch checked={settings.notify_on_student_cancel} onCheckedChange={() => toggle('notify_on_student_cancel')} />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}