-- Allow authenticated students to upload their own posture photos to scan-photos bucket
-- File path convention: {student_id}/{timestamp}_{position}.jpg

CREATE POLICY "Students upload own scan photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scan-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Students update own scan photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scan-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Students delete own scan photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'scan-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);