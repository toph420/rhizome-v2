-- Enable Realtime for document processing status updates
-- This allows the ProcessingDock to receive live updates

-- Enable publication for documents table
ALTER PUBLICATION supabase_realtime ADD TABLE documents;

-- Grant REALTIME access to authenticated users
-- This is separate from RLS - controls Realtime subscriptions
GRANT SELECT ON documents TO authenticated;

-- Note: RLS policies (from 001_initial_schema.sql) still apply
-- Users can only receive Realtime updates for their own documents