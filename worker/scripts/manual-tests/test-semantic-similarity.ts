/**
 * Test script for semantic similarity engine
 * Usage: npx tsx worker/test-semantic-similarity.ts <document_id>
 */

import { runSemanticSimilarity, saveChunkConnections } from './engines/semantic-similarity';
import { createClient } from '@supabase/supabase-js';

async function test() {
  const documentId = process.argv[2];

  if (!documentId) {
    console.error('Usage: npx tsx worker/test-semantic-similarity.ts <document_id>');
    console.error('\nTo get a document ID, run:');
    console.error('  psql $DATABASE_URL -c "SELECT id, title FROM documents LIMIT 5;"');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Testing Semantic Similarity Engine V2');
  console.log('='.repeat(60));
  console.log(`Document ID: ${documentId}\n`);

  try {
    // Step 1: Run semantic similarity
    console.log('[1/3] Running semantic similarity detection...');
    const connections = await runSemanticSimilarity(documentId, {
      threshold: 0.7,
      maxResultsPerChunk: 50,
      crossDocumentOnly: true
    });

    console.log(`\n[Result] Found ${connections.length} connections\n`);

    if (connections.length > 0) {
      console.log('[Sample] First connection:');
      console.log(JSON.stringify(connections[0], null, 2));
      console.log();
    }

    // Step 2: Save to database
    console.log('[2/3] Saving connections to database...');
    await saveChunkConnections(connections);
    console.log();

    // Step 3: Verify in database
    console.log('[3/3] Verifying connections in database...');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: stats, error } = await supabase.rpc('get_connection_stats', {
      doc_id: documentId
    });

    if (error) {
      // Fallback: Direct query if RPC doesn't exist
      const { data: directStats, error: directError } = await supabase
        .from('connections')
        .select('connection_type, strength')
        .or(`source_chunk_id.in.(select id from chunks where document_id = '${documentId}'),target_chunk_id.in.(select id from chunks where document_id = '${documentId}')`);

      if (directError) {
        console.error('Failed to verify connections:', directError);
      } else {
        console.log(`✅ Verified: ${directStats?.length || 0} connections in database`);
      }
    } else {
      console.log('Connection statistics:', stats);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Check database: psql $DATABASE_URL -c "SELECT connection_type, COUNT(*), AVG(strength) FROM connections WHERE connection_type = \'semantic_similarity\' GROUP BY connection_type;"');
    console.log('2. Implement ContradictionDetection engine');
    console.log('3. Implement ThematicBridge engine');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

test();
