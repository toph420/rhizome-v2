#!/usr/bin/env tsx
/**
 * Safe document reprocessing script
 *
 * Usage: npx tsx scripts/reprocess-document.ts <document-id>
 *
 * This script:
 * 1. Cancels all pending jobs for the document
 * 2. Deletes orphaned connections (if any)
 * 3. Deletes existing chunks
 * 4. Clears job cache
 * 5. Creates fresh process_document job
 * 6. Monitors progress
 */

import { createClient } from '@supabase/supabase-js';

const DOCUMENT_ID = process.argv[2];

if (!DOCUMENT_ID) {
  console.error('❌ Usage: npx tsx scripts/reprocess-document.ts <document-id>');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🧹 Starting safe document reprocessing...');
  console.log(`📄 Document ID: ${DOCUMENT_ID}\n`);

  // Step 1: Cancel all pending/processing jobs
  console.log('1️⃣  Cancelling pending jobs...');
  const { data: cancelledJobs, error: cancelError } = await supabase
    .from('background_jobs')
    .update({
      status: 'cancelled',
      error_message: 'Superseded by manual reprocessing',
      completed_at: new Date().toISOString()
    })
    .eq('entity_id', DOCUMENT_ID)
    .in('status', ['pending', 'processing'])
    .select('job_type');

  if (cancelError) {
    console.error('❌ Failed to cancel jobs:', cancelError);
  } else {
    console.log(`   ✅ Cancelled ${cancelledJobs?.length || 0} jobs:`,
      cancelledJobs?.map(j => j.job_type).join(', ') || 'none');
  }

  // Step 2: Delete any orphaned connections
  console.log('\n2️⃣  Cleaning orphaned connections...');
  const { count: deletedConnections, error: connError } = await supabase
    .from('connections')
    .delete({ count: 'exact' })
    .or(`source_chunk_id.in.(select id from chunks where document_id = '${DOCUMENT_ID}'),target_chunk_id.in.(select id from chunks where document_id = '${DOCUMENT_ID}')`);

  if (connError) {
    console.error('❌ Failed to delete connections:', connError);
  } else {
    console.log(`   ✅ Deleted ${deletedConnections || 0} connections`);
  }

  // Step 3: Delete existing chunks
  console.log('\n3️⃣  Deleting existing chunks...');
  const { count: deletedChunks, error: chunkError } = await supabase
    .from('chunks')
    .delete({ count: 'exact' })
    .eq('document_id', DOCUMENT_ID);

  if (chunkError) {
    console.error('❌ Failed to delete chunks:', chunkError);
  } else {
    console.log(`   ✅ Deleted ${deletedChunks || 0} chunks`);
  }

  // Step 4: Clear job cache (force fresh processing)
  console.log('\n4️⃣  Clearing cached processing results...');
  const { error: clearCacheError } = await supabase
    .from('background_jobs')
    .update({
      metadata: {}
    })
    .eq('entity_id', DOCUMENT_ID)
    .eq('job_type', 'process_document');

  if (clearCacheError) {
    console.error('❌ Failed to clear cache:', clearCacheError);
  } else {
    console.log('   ✅ Cleared cached results');
  }

  // Step 5: Get document info
  console.log('\n5️⃣  Fetching document info...');
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, title, source_type, user_id')
    .eq('id', DOCUMENT_ID)
    .single();

  if (docError || !doc) {
    console.error('❌ Failed to fetch document:', docError);
    process.exit(1);
  }

  console.log(`   📚 Title: ${doc.title}`);
  console.log(`   📎 Type: ${doc.source_type}`);

  // Step 6: Get storage path from document
  const { data: docWithPath } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', DOCUMENT_ID)
    .single();

  // Step 7: Create fresh processing job
  console.log('\n6️⃣  Creating fresh processing job...');
  const { data: newJob, error: jobError } = await supabase
    .from('background_jobs')
    .insert({
      user_id: doc.user_id,
      job_type: 'process_document',
      entity_type: 'document',
      entity_id: DOCUMENT_ID,
      status: 'pending',
      input_data: {
        document_id: DOCUMENT_ID,
        source_type: doc.source_type,
        storage_path: docWithPath?.storage_path
      },
      metadata: {} // Force fresh processing, no cache
    })
    .select('id')
    .single();

  if (jobError || !newJob) {
    console.error('❌ Failed to create job:', jobError);
    process.exit(1);
  }

  console.log(`   ✅ Created job: ${newJob.id}`);
  console.log('\n✅ Cleanup complete! Worker will pick up the job shortly.');
  console.log('\n📊 Monitor progress:');
  console.log(`   - Worker logs: Check your worker terminal`);
  console.log(`   - Database: SELECT status, progress FROM background_jobs WHERE id = '${newJob.id}'`);
  console.log(`   - Preview: http://localhost:3000/documents/${DOCUMENT_ID}/preview`);
}

main().catch(console.error);
