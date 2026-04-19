-- Create storage bucket for exercise images
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-images', 'exercise-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Public read exercise images"
ON storage.objects FOR SELECT
USING (bucket_id = 'exercise-images');

-- Admins can upload
CREATE POLICY "Admins upload exercise images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exercise-images' AND has_role(auth.uid(), 'admin'::app_role));

-- Admins can update
CREATE POLICY "Admins update exercise images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'exercise-images' AND has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete
CREATE POLICY "Admins delete exercise images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'exercise-images' AND has_role(auth.uid(), 'admin'::app_role));