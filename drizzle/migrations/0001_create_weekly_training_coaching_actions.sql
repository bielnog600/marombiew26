CREATE TABLE public.weekly_training_coaching_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  plan_id uuid,
  week_start date NOT NULL,
  exercise_name text NOT NULL,
  action_type text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT weekly_training_coaching_actions_action_type_check CHECK (action_type IN ('increase_load','increase_reps','maintain','reduce_load','technique','amplitude','request_video','review','dismissed')),
  CONSTRAINT weekly_training_coaching_actions_status_check CHECK (status IN ('pending','sent','waiting','completed'))
);

CREATE UNIQUE INDEX weekly_training_coaching_actions_unique_idx
  ON public.weekly_training_coaching_actions (admin_id, student_id, week_start, lower(exercise_name));

CREATE INDEX weekly_training_coaching_actions_week_idx
  ON public.weekly_training_coaching_actions (admin_id, week_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_training_coaching_actions TO authenticated;
GRANT ALL ON public.weekly_training_coaching_actions TO service_role;

ALTER TABLE public.weekly_training_coaching_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage coaching actions"
  ON public.weekly_training_coaching_actions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students read own coaching actions"
  ON public.weekly_training_coaching_actions
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());