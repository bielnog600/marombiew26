
CREATE TABLE public.dismissed_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notification_key TEXT NOT NULL,
  dismissed_month TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_dismissed_unique ON public.dismissed_notifications (user_id, notification_key, dismissed_month);

ALTER TABLE public.dismissed_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage dismissed_notifications"
ON public.dismissed_notifications
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
