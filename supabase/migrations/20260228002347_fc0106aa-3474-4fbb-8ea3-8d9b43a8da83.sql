
-- Posture scans table
CREATE TABLE public.posture_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_has_lidar BOOLEAN DEFAULT false,
  mode TEXT DEFAULT '2d',
  height_cm NUMERIC,
  sex TEXT,

  front_photo_url TEXT,
  side_photo_url TEXT,
  back_photo_url TEXT,

  front_depth_url TEXT,
  side_depth_url TEXT,
  back_depth_url TEXT,

  pose_keypoints_json JSONB DEFAULT '{}'::jsonb,
  angles_json JSONB DEFAULT '{}'::jsonb,
  shoulder_tests_json JSONB DEFAULT '{}'::jsonb,
  region_scores_json JSONB DEFAULT '{}'::jsonb,

  notes TEXT
);

ALTER TABLE public.posture_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage posture_scans"
  ON public.posture_scans FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own posture_scans"
  ON public.posture_scans FOR SELECT
  USING (auth.uid() = student_id);

-- Storage bucket for scan photos
INSERT INTO storage.buckets (id, name, public) VALUES ('scan-photos', 'scan-photos', true);

CREATE POLICY "Admin upload scan photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'scan-photos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin manage scan photos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'scan-photos' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'scan-photos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public read scan photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'scan-photos');
