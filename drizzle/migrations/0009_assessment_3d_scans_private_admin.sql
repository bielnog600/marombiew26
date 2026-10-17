CREATE TABLE public.assessment_3d_scans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL,
 assessment_id uuid REFERENCES public.assessments(id) ON DELETE SET NULL,
 storage_path text NOT NULL UNIQUE,
 file_name text NOT NULL,
 format text NOT NULL CHECK (format IN ('obj','ply','glb')),
 file_bytes bigint NOT NULL CHECK (file_bytes > 0 AND file_bytes <= 52428800),
 imported_by uuid NOT NULL DEFAULT auth.uid(),
 consent_given boolean NOT NULL CHECK (consent_given = true),
 consent_by uuid NOT NULL DEFAULT auth.uid(),
 consent_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 measurements jsonb NOT NULL DEFAULT '{}'::jsonb,
 settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 height_cm numeric,
 original_height_cm numeric,
 CHECK (storage_path = student_id::text || '/' || id::text || '/model.' || format)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_3d_scans TO authenticated;
GRANT ALL ON public.assessment_3d_scans TO service_role;
ALTER TABLE public.assessment_3d_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrators manage assessment 3d scans" ON public.assessment_3d_scans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX assessment_3d_scans_student_created ON public.assessment_3d_scans(student_id, created_at DESC);
CREATE FUNCTION public.stamp_assessment_3d_scan_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  NEW.imported_by := auth.uid(); NEW.consent_by := auth.uid(); NEW.consent_at := now(); NEW.created_at := now();
 ELSE
  NEW.id := OLD.id; NEW.student_id := OLD.student_id; NEW.storage_path := OLD.storage_path;
  NEW.imported_by := OLD.imported_by; NEW.consent_by := OLD.consent_by; NEW.consent_at := OLD.consent_at;
  NEW.consent_given := OLD.consent_given; NEW.created_at := OLD.created_at;
  NEW.file_name := OLD.file_name; NEW.format := OLD.format; NEW.file_bytes := OLD.file_bytes;
 END IF;
 IF NEW.assessment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.assessments WHERE id = NEW.assessment_id AND student_id = NEW.student_id) THEN
  RAISE EXCEPTION 'A avaliação deve pertencer ao mesmo aluno';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER stamp_assessment_3d_scan BEFORE INSERT OR UPDATE ON public.assessment_3d_scans FOR EACH ROW EXECUTE FUNCTION public.stamp_assessment_3d_scan_provenance();
CREATE POLICY "Admin read 3d scan files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avaliacoes-3d' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin import consented 3d scan files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avaliacoes-3d' AND public.has_role(auth.uid(), 'admin') AND EXISTS (SELECT 1 FROM public.assessment_3d_scans s WHERE s.storage_path = name AND s.consent_given));
CREATE POLICY "Admin delete 3d scan files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avaliacoes-3d' AND public.has_role(auth.uid(), 'admin'));