-- Allow admins to manage scan photos for any student
CREATE POLICY "Admins manage all scan photos"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'scan-photos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'scan-photos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);