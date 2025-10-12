#!/usr/bin/env tsx
/**
 * List documents that are ready for thematic bridge testing
 *
 * Shows documents with:
 * - Completed processing
 * - High-importance chunks (>0.6)
 * - Domain metadata present
 *
 * Usage:
 *   npx tsx worker/scripts/list-testable-documents.ts
 */

import { createClient } from '@supabase/supabase-js';

async function listTestableDocuments() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('📚 Finding testable documents...\n');

  // Get documents with high-importance chunks and metadata
  const { data: documents, error } = await supabase
    .from('documents')
    .select(`
      id,
      title,
      source_type,
      processing_status,
      created_at
    `)
    .eq('processing_status', 'completed')
    .order('created_at', { ascending: false });

  if (error || !documents?.length) {
    console.log('No completed documents found.');
    return;
  }

  console.log(`Found ${documents.length} completed documents. Analyzing chunks...\n`);

  const testable = [];

  for (const doc of documents) {
    // Count high-importance chunks with metadata
    const { data: chunks, count } = await supabase
      .from('chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', doc.id)
      .gte('importance_score', 0.6)
      .not('domain_metadata', 'is', null);

    if (count && count > 0) {
      testable.push({
        ...doc,
        highImportanceChunks: count
      });
    }
  }

  if (testable.length === 0) {
    console.log('No documents with high-importance chunks and metadata found.');
    console.log('Process some documents first with the full pipeline.\n');
    return;
  }

  console.log('='.repeat(80));
  console.log('TESTABLE DOCUMENTS');
  console.log('='.repeat(80) + '\n');

  testable.forEach((doc, i) => {
    console.log(`[${i + 1}] ${doc.title || 'Untitled'}`);
    console.log(`    ID: ${doc.id}`);
    console.log(`    Type: ${doc.source_type}`);
    console.log(`    High-importance chunks: ${doc.highImportanceChunks}`);
    console.log(`    Created: ${new Date(doc.created_at).toLocaleDateString()}\n`);
  });

  console.log('='.repeat(80));
  console.log('TEST COMMANDS');
  console.log('='.repeat(80) + '\n');

  console.log('To test a document, run:');
  console.log('  npm run test:dual-bridge <document_id>\n');

  console.log('Example:');
  console.log(`  npm run test:dual-bridge ${testable[0].id}\n`);

  console.log('Recommended: Test on 2-3 diverse documents:');
  console.log('  1. Literary work (fiction, philosophy)');
  console.log('  2. Technical book (technology, science)');
  console.log('  3. Mixed domain (where bridges are most valuable)\n');
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  listTestableDocuments()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

export { listTestableDocuments };
