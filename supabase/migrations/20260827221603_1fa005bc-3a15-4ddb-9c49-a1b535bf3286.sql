CREATE TABLE public.social_media_posts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('reel','carousel')),
  title text,
  student_id uuid,
  file_paths text[] not null default '{}',
  cover_path text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_media_posts TO authenticated;
GRANT ALL ON public.social_media_posts TO service_role;
ALTER TABLE public.social_media_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social posts" ON public.social_media_posts
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read social media files" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'social-media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins upload social media files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'social-media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete social media files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'social-media' AND public.has_role(auth.uid(), 'admin'));