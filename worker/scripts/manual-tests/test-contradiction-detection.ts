/**
 * Test script for contradiction detection engine
 * Usage: npx tsx worker/test-contradiction-detection.ts <document_id>
 */

import { runContradictionDetection } from './engines/contradiction-detection';
import { saveChunkConnections } from './engines/semantic-similarity';
import { createClient } from '@supabase/supabase-js';

async function test() {
  const documentId = process.argv[2];

  if (!documentId) {
    console.error('Usage: npx tsx worker/test-contradiction-detection.ts <document_id>');
    console.error('\nTo get a document ID, run:');
    console.error('  psql $DATABASE_URL -c "SELECT id, title FROM documents LIMIT 5;"');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Testing Contradiction Detection Engine V2');
  console.log('='.repeat(60));
  console.log(`Document ID: ${documentId}\n`);

  try {
    // Step 1: Run contradiction detection
    console.log('[1/3] Running contradiction detection...');
    const connections = await runContradictionDetection(documentId, {
      minConceptOverlap: 0.5,
      polarityThreshold: 0.3,
      maxResultsPerChunk: 20,
      crossDocumentOnly: true
    });

    console.log(`\n[Result] Found ${connections.length} contradictions\n`);

    if (connections.length > 0) {
      console.log('[Sample] First contradiction:');
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

    const { data: stats, error } = await supabase
      .from('connections')
      .select('connection_type, strength')
      .eq('connection_type', 'contradiction_detection');

    if (error) {
      console.error('Failed to verify connections:', error);
    } else {
      console.log(`✅ Verified: ${stats?.length || 0} contradiction connections in database`);
      if (stats && stats.length > 0) {
        const avgStrength = stats.reduce((sum, s) => sum + s.strength, 0) / stats.length;
        console.log(`   Average strength: ${avgStrength.toFixed(3)}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Check database: psql $DATABASE_URL -c "SELECT connection_type, COUNT(*), AVG(strength) FROM connections WHERE connection_type = \'contradiction_detection\' GROUP BY connection_type;"');
    console.log('2. Implement ThematicBridge engine');
    console.log('3. Create orchestrator to run all 3 engines');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

test();
