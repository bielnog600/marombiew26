
-- Create enums
CREATE TYPE public.calendar_event_type AS ENUM (
  'personal_presencial','aula_fixa_semanal','aula_avulsa','atendimento_ginasio',
  'avaliacao_fisica','checkin','consultoria_online','aula_grupo','outro'
);
CREATE TYPE public.calendar_event_status AS ENUM (
  'confirmado','pendente','cancelado','reagendado','concluido','falta','falta_justificada'
);
CREATE TYPE public.calendar_attendance_status AS ENUM (
  'pendente','confirmado','cancelado','falta','falta_justificada','presente','atrasado'
);
CREATE TYPE public.calendar_notification_type AS ENUM (
  'student_day_before','student_15min_before','admin_day_before','admin_15min_before',
  'student_confirmed','student_cancelled','student_late'
);

-- TABLE: calendar_events
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  event_type public.calendar_event_type NOT NULL DEFAULT 'personal_presencial',
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  location text DEFAULT '',
  notes text DEFAULT '',
  status public.calendar_event_status NOT NULL DEFAULT 'confirmado',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text DEFAULT NULL,
  recurrence_group_id uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage calendar_events" ON public.calendar_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX idx_calendar_events_start ON public.calendar_events (start_datetime);
CREATE INDEX idx_calendar_events_recurrence_group ON public.calendar_events (recurrence_group_id) WHERE recurrence_group_id IS NOT NULL;

-- TABLE: calendar_event_students
CREATE TABLE public.calendar_event_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  attendance_status public.calendar_attendance_status NOT NULL DEFAULT 'pendente',
  confirmed_at timestamptz DEFAULT NULL,
  cancelled_at timestamptz DEFAULT NULL,
  cancellation_reason text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, student_id)
);
ALTER TABLE public.calendar_event_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage calendar_event_students" ON public.calendar_event_students FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students read own calendar_event_students" ON public.calendar_event_students FOR SELECT
  USING (auth.uid() = student_id);
CREATE POLICY "Students update own attendance" ON public.calendar_event_students FOR UPDATE
  USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
CREATE INDEX idx_calendar_event_students_student ON public.calendar_event_students (student_id);
CREATE INDEX idx_calendar_event_students_event ON public.calendar_event_students (event_id);

-- Now add student read policy on calendar_events (cross-ref is safe now)
CREATE POLICY "Students read linked calendar_events" ON public.calendar_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.calendar_event_students ces
    WHERE ces.event_id = calendar_events.id AND ces.student_id = auth.uid()
  ));

-- TABLE: calendar_notification_settings
CREATE TABLE public.calendar_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL UNIQUE,
  enable_schedule_notifications boolean NOT NULL DEFAULT true,
  enable_day_before_student boolean NOT NULL DEFAULT true,
  day_before_time time NOT NULL DEFAULT '20:00',
  enable_15min_before_student boolean NOT NULL DEFAULT true,
  enable_day_before_admin boolean NOT NULL DEFAULT true,
  enable_15min_before_admin boolean NOT NULL DEFAULT true,
  custom_student_day_before_message text DEFAULT NULL,
  custom_student_15min_message text DEFAULT NULL,
  custom_admin_day_before_message text DEFAULT NULL,
  custom_admin_15min_message text DEFAULT NULL,
  notify_on_student_confirm boolean NOT NULL DEFAULT true,
  notify_on_student_cancel boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage calendar_notification_settings" ON public.calendar_notification_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_calendar_notification_settings_updated_at
  BEFORE UPDATE ON public.calendar_notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- TABLE: scheduled_notifications
CREATE TABLE public.scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL,
  recipient_type text NOT NULL DEFAULT 'student',
  notification_type public.calendar_notification_type NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz DEFAULT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage scheduled_notifications" ON public.scheduled_notifications FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students read own scheduled_notifications" ON public.scheduled_notifications FOR SELECT
  USING (auth.uid() = recipient_user_id);
CREATE INDEX idx_scheduled_notifications_event ON public.scheduled_notifications (event_id);
CREATE INDEX idx_scheduled_notifications_pending ON public.scheduled_notifications (scheduled_for) WHERE status = 'pending';

-- Enable realtime for calendar_events and calendar_event_students
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_event_students;
