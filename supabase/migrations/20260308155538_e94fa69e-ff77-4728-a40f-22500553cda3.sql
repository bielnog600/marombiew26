INSERT INTO storage.buckets (id, name, public)
VALUES ('assessment-photos', 'assessment-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload assessment photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'assessment-photos');

CREATE POLICY "Public read assessment photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'assessment-photos');

CREATE POLICY "Authenticated users can delete assessment photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'assessment-photos');