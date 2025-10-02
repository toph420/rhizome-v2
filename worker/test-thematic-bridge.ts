/**
 * Test script for thematic bridge engine
 * Usage: npx tsx worker/test-thematic-bridge.ts <document_id>
 */

import { runThematicBridge } from './engines/thematic-bridge';
import { saveChunkConnections } from './engines/semantic-similarity';
import { createClient } from '@supabase/supabase-js';

async function test() {
  const documentId = process.argv[2];

  if (!documentId) {
    console.error('Usage: npx tsx worker/test-thematic-bridge.ts <document_id>');
    console.error('\nTo get a document ID, run:');
    console.error('  psql $DATABASE_URL -c "SELECT id, title FROM documents LIMIT 5;"');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Testing Thematic Bridge Engine V2');
  console.log('='.repeat(60));
  console.log(`Document ID: ${documentId}\n`);

  try {
    // Step 1: Run thematic bridge detection
    console.log('[1/3] Running thematic bridge detection (AI-powered)...');
    console.log('Note: This will make AI calls to Gemini. Expected ~40 calls.\n');

    const startTime = Date.now();
    const connections = await runThematicBridge(documentId, {
      minImportance: 0.6,
      minStrength: 0.6,
      maxSourceChunks: 50,
      maxCandidatesPerSource: 10,
      batchSize: 5
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n[Result] Found ${connections.length} thematic bridges in ${elapsed}s\n`);

    if (connections.length > 0) {
      console.log('[Sample] First thematic bridge:');
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
      .select('connection_type, strength, metadata')
      .eq('connection_type', 'thematic_bridge');

    if (error) {
      console.error('Failed to verify connections:', error);
    } else {
      console.log(`✅ Verified: ${stats?.length || 0} thematic bridge connections in database`);
      if (stats && stats.length > 0) {
        const avgStrength = stats.reduce((sum, s) => sum + s.strength, 0) / stats.length;
        console.log(`   Average strength: ${avgStrength.toFixed(3)}`);

        // Show bridge type distribution
        const bridgeTypes: Record<string, number> = {};
        stats.forEach(s => {
          const type = s.metadata?.bridge_type || 'unknown';
          bridgeTypes[type] = (bridgeTypes[type] || 0) + 1;
        });
        console.log('   Bridge types:', bridgeTypes);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Check database: psql $DATABASE_URL -c "SELECT connection_type, COUNT(*), AVG(strength) FROM connections WHERE connection_type = \'thematic_bridge\' GROUP BY connection_type;"');
    console.log('2. Create orchestrator to run all 3 engines together');
    console.log('3. Integrate with document processing pipeline');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

test();
