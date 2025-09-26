-- Fix service role INSERT policy for storage
-- The WITH CHECK clause was checking auth.jwt() in the inserted row,
-- which doesn't exist. WITH CHECK should only validate the row data itself.
--
-- PostgreSQL INSERT policies can ONLY have WITH CHECK (no USING clause).
-- The fix: Use TO service_role to restrict WHO can use this policy.

-- Drop the broken policy
DROP POLICY IF EXISTS "Service role can write all documents" ON storage.objects;

-- Recreate with correct logic:
-- TO service_role: Only service role can use this policy
-- WITH CHECK: Validate the inserted row's bucket_id
CREATE POLICY "Service role can write all documents" ON storage.objects
  FOR INSERT 
  TO service_role                         -- Only service role can use this policy
  WITH CHECK (bucket_id = 'documents');   -- Validate inserted row's bucket