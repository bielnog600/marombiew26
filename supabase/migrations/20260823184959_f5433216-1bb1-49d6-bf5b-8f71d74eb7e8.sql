-- 1) CHECK-INS ------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can insert checkins" ON public.diet_checkins;
DROP POLICY IF EXISTS "Users can update their own checkins" ON public.diet_checkins;
DROP POLICY IF EXISTS "Users can view their own checkins" ON public.diet_checkins;
DROP POLICY IF EXISTS "Anyone can insert workout checkins" ON public.workout_checkins;
DROP POLICY IF EXISTS "Users can update their own workout checkins" ON public.workout_checkins;
DROP POLICY IF EXISTS "Users can view their own workout checkins" ON public.workout_checkins;

ALTER TABLE public.diet_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_checkins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.diet_checkins FROM anon;
REVOKE ALL ON public.workout_checkins FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diet_checkins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_checkins TO authenticated;
GRANT ALL ON public.diet_checkins TO service_role;
GRANT ALL ON public.workout_checkins TO service_role;

DROP POLICY IF EXISTS "diet_checkins_admin_all" ON public.diet_checkins;
CREATE POLICY "diet_checkins_admin_all" ON public.diet_checkins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "diet_checkins_student_select_own" ON public.diet_checkins;
CREATE POLICY "diet_checkins_student_select_own" ON public.diet_checkins
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "workout_checkins_admin_all" ON public.workout_checkins;
CREATE POLICY "workout_checkins_admin_all" ON public.workout_checkins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "workout_checkins_student_select_own" ON public.workout_checkins;
CREATE POLICY "workout_checkins_student_select_own" ON public.workout_checkins
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "workout_checkins_student_insert_own" ON public.workout_checkins;
CREATE POLICY "workout_checkins_student_insert_own" ON public.workout_checkins
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- 2) STORAGE OBJECTS -------------------------------------------------------
DROP POLICY IF EXISTS "Public read assessment photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read scan photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload assessment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete assessment photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin manage scan photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload scan photos" ON storage.objects;

DROP POLICY IF EXISTS "scan_photos_admin_all" ON storage.objects;
CREATE POLICY "scan_photos_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'scan-photos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'scan-photos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "scan_photos_owner_select" ON storage.objects;
CREATE POLICY "scan_photos_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'scan-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "assessment_photos_admin_all" ON storage.objects;
CREATE POLICY "assessment_photos_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'assessment-photos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'assessment-photos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "assessment_photos_owner_select" ON storage.objects;
CREATE POLICY "assessment_photos_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'assessment-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "assessment_photos_owner_insert" ON storage.objects;
CREATE POLICY "assessment_photos_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assessment-photos' AND (storage.foldername(name))[1] = auth.uid()::text);