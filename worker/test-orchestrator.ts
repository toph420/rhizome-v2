/**
 * Test script for engine orchestrator
 * Usage: npx tsx worker/test-orchestrator.ts <document_id>
 */

import { processDocument } from './engines/orchestrator';
import { createClient } from '@supabase/supabase-js';

async function test() {
  const documentId = process.argv[2];

  if (!documentId) {
    console.error('Usage: npx tsx worker/test-orchestrator.ts <document_id>');
    console.error('\nTo get a document ID, run:');
    console.error('  psql $DATABASE_URL -c "SELECT id, title FROM documents LIMIT 5;"');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Testing Engine Orchestrator V2');
  console.log('='.repeat(60));
  console.log(`Document ID: ${documentId}\n`);

  try {
    // Run orchestrator with all 3 engines
    console.log('[1/2] Running orchestrator with all 3 engines...');
    console.log('This will execute:');
    console.log('  1. SemanticSimilarity (embedding-based)');
    console.log('  2. ContradictionDetection (metadata-based)');
    console.log('  3. ThematicBridge (AI-powered)\n');

    const result = await processDocument(documentId, {
      enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
      semanticSimilarity: {
        threshold: 0.7,
        maxResultsPerChunk: 50,
        crossDocumentOnly: true
      },
      contradictionDetection: {
        minConceptOverlap: 0.5,
        polarityThreshold: 0.3,
        maxResultsPerChunk: 20,
        crossDocumentOnly: true
      },
      thematicBridge: {
        minImportance: 0.6,
        minStrength: 0.6,
        maxSourceChunks: 50,
        maxCandidatesPerSource: 10,
        batchSize: 5
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('ORCHESTRATOR RESULTS');
    console.log('='.repeat(60));
    console.log(`Total connections: ${result.totalConnections}`);
    console.log(`Execution time: ${(result.executionTime / 1000).toFixed(1)}s`);
    console.log('\nConnections by engine:');
    Object.entries(result.byEngine).forEach(([engine, count]) => {
      console.log(`  ${engine}: ${count}`);
    });

    // Verify in database
    console.log('\n[2/2] Verifying all connections in database...');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: stats, error } = await supabase
      .from('connections')
      .select('connection_type, strength');

    if (error) {
      console.error('Failed to verify connections:', error);
    } else {
      console.log('\nDatabase verification:');

      // Group by connection type
      const grouped: Record<string, { count: number; avgStrength: number }> = {};
      stats?.forEach(s => {
        if (!grouped[s.connection_type]) {
          grouped[s.connection_type] = { count: 0, avgStrength: 0 };
        }
        grouped[s.connection_type].count++;
        grouped[s.connection_type].avgStrength += s.strength;
      });

      // Calculate averages and display
      Object.entries(grouped).forEach(([type, data]) => {
        const avg = (data.avgStrength / data.count).toFixed(3);
        console.log(`  ${type}: ${data.count} connections (avg strength: ${avg})`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Orchestrator test completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Query database: psql $DATABASE_URL -c "SELECT connection_type, COUNT(*), ROUND(AVG(strength)::numeric, 3) as avg_strength FROM connections GROUP BY connection_type ORDER BY connection_type;"');
    console.log('2. Integrate orchestrator with document processing pipeline');
    console.log('3. Test with multiple documents to verify cross-document connections');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

test();
