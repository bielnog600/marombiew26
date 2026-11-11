CREATE POLICY "Signed-in users read coach voice audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'coach-voice');