CREATE POLICY "character photos readable by signed in"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'character-photos');

CREATE POLICY "character photos insert own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'character-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "character photos update own folder"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'character-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'character-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "character photos delete own folder"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'character-photos' AND (storage.foldername(name))[1] = auth.uid()::text);