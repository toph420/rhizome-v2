-- Allow service role (Edge Functions) to access all documents in storage
-- This is needed for the process-document Edge Function to fetch PDFs

-- Service role can read all documents
CREATE POLICY "Service role can read all documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' AND
    auth.jwt()->>'role' = 'service_role'
  );

-- Service role can insert/update all documents
CREATE POLICY "Service role can write all documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND
    auth.jwt()->>'role' = 'service_role'
  );

CREATE POLICY "Service role can update all documents" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'documents' AND
    auth.jwt()->>'role' = 'service_role'
  );

-- Service role can delete all documents
CREATE POLICY "Service role can delete all documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents' AND
    auth.jwt()->>'role' = 'service_role'
  );
