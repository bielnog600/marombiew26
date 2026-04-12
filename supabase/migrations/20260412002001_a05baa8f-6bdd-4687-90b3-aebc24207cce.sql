CREATE TABLE public.exercises (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  grupo_muscular TEXT NOT NULL,
  imagem_url TEXT,
  video_embed TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_exercises_nome ON public.exercises USING btree (nome);
CREATE INDEX idx_exercises_grupo ON public.exercises USING btree (grupo_muscular);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view exercises"
ON public.exercises FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert exercises"
ON public.exercises FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update exercises"
ON public.exercises FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete exercises"
ON public.exercises FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));