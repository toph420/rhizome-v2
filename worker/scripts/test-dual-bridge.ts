#!/usr/bin/env tsx
/**
 * Dual-Engine Thematic Bridge Comparison
 *
 * Compares Gemini vs Qwen on the same document to evaluate:
 * - Agreement rate on which chunks connect
 * - Strength score correlation
 * - Quality of unique connections each finds
 *
 * Usage:
 *   npx tsx worker/scripts/test-dual-bridge.ts <document_id>
 *
 * Prerequisites:
 *   - Ollama server running (ollama serve)
 *   - Qwen model pulled (ollama pull qwen2.5:32b-instruct-q4_K_M)
 *   - Document already processed with chunks and metadata
 */

import { createClient } from '@supabase/supabase-js';
import { runThematicBridge } from '../engines/thematic-bridge.js';
import { runThematicBridgeQwen } from '../engines/thematic-bridge-qwen.js';
import type { ChunkConnection } from '../engines/semantic-similarity.js';

interface ComparisonResult {
  gemini: ChunkConnection[];
  qwen: ChunkConnection[];
  stats: {
    totalCandidates: number;
    bothDetected: number;
    geminiOnly: number;
    qwenOnly: number;
    neitherDetected: number;
    agreementRate: number;
    avgStrengthDiff: number;
    strengthCorrelation: Array<{
      gemini: number;
      qwen: number;
      diff: number;
      sourceId: string;
      targetId: string;
    }>;
  };
  geminiOnlyConnections: Array<{
    connection: ChunkConnection;
    sourceChunk: any;
    targetChunk: any;
  }>;
  qwenOnlyConnections: Array<{
    connection: ChunkConnection;
    sourceChunk: any;
    targetChunk: any;
  }>;
  recommendation: 'proceed' | 'borderline' | 'keep-gemini';
}

async function testDualBridge(documentId: string): Promise<ComparisonResult> {
  console.log('🔬 Dual-Engine Thematic Bridge Comparison\n');
  console.log(`Document ID: ${documentId}\n`);

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify document exists
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, title')
    .eq('id', documentId)
    .single();

  if (docError || !doc) {
    throw new Error(`Document not found: ${documentId}`);
  }

  console.log(`Document: ${doc.title || 'Untitled'}\n`);

  // Run both engines in parallel
  console.log('⚡ Running both engines in parallel...\n');
  const startTime = Date.now();

  const [geminiConnections, qwenConnections] = await Promise.all([
    runThematicBridge(documentId),
    runThematicBridgeQwen(documentId)
  ]);

  const duration = Date.now() - startTime;
  console.log(`✓ Both engines completed in ${(duration / 1000).toFixed(1)}s\n`);

  console.log(`Gemini found: ${geminiConnections.length} connections`);
  console.log(`Qwen found: ${qwenConnections.length} connections\n`);

  // Build connection maps for comparison
  const geminiMap = new Map<string, ChunkConnection>();
  const qwenMap = new Map<string, ChunkConnection>();

  for (const conn of geminiConnections) {
    const key = `${conn.source_chunk_id}:${conn.target_chunk_id}`;
    geminiMap.set(key, conn);
  }

  for (const conn of qwenConnections) {
    const key = `${conn.source_chunk_id}:${conn.target_chunk_id}`;
    qwenMap.set(key, conn);
  }

  // Calculate statistics
  const allPairs = new Set([...geminiMap.keys(), ...qwenMap.keys()]);
  const stats = {
    totalCandidates: allPairs.size,
    bothDetected: 0,
    geminiOnly: 0,
    qwenOnly: 0,
    neitherDetected: 0,
    agreementRate: 0,
    avgStrengthDiff: 0,
    strengthCorrelation: [] as Array<{
      gemini: number;
      qwen: number;
      diff: number;
      sourceId: string;
      targetId: string;
    }>
  };

  for (const pairKey of allPairs) {
    const geminiConn = geminiMap.get(pairKey);
    const qwenConn = qwenMap.get(pairKey);

    if (geminiConn && qwenConn) {
      stats.bothDetected++;
      const [sourceId, targetId] = pairKey.split(':');
      stats.strengthCorrelation.push({
        gemini: geminiConn.strength,
        qwen: qwenConn.strength,
        diff: Math.abs(geminiConn.strength - qwenConn.strength),
        sourceId,
        targetId
      });
    } else if (geminiConn && !qwenConn) {
      stats.geminiOnly++;
    } else if (!geminiConn && qwenConn) {
      stats.qwenOnly++;
    }
  }

  stats.agreementRate = stats.bothDetected / stats.totalCandidates;
  stats.avgStrengthDiff = stats.strengthCorrelation.length > 0
    ? stats.strengthCorrelation.reduce((sum, r) => sum + r.diff, 0) / stats.strengthCorrelation.length
    : 0;

  // Fetch chunk details for disagreements
  const geminiOnlyKeys = [...allPairs].filter(key => geminiMap.has(key) && !qwenMap.has(key));
  const qwenOnlyKeys = [...allPairs].filter(key => !geminiMap.has(key) && qwenMap.has(key));

  const geminiOnlyConnections = await fetchConnectionDetails(supabase, geminiOnlyKeys, geminiMap);
  const qwenOnlyConnections = await fetchConnectionDetails(supabase, qwenOnlyKeys, qwenMap);

  // Generate recommendation
  let recommendation: 'proceed' | 'borderline' | 'keep-gemini';
  if (stats.agreementRate >= 0.80 && stats.avgStrengthDiff <= 0.15 && stats.qwenOnly <= stats.bothDetected * 0.2) {
    recommendation = 'proceed';
  } else if (stats.agreementRate >= 0.70) {
    recommendation = 'borderline';
  } else {
    recommendation = 'keep-gemini';
  }

  return {
    gemini: geminiConnections,
    qwen: qwenConnections,
    stats,
    geminiOnlyConnections,
    qwenOnlyConnections,
    recommendation
  };
}

async function fetchConnectionDetails(
  supabase: any,
  pairKeys: string[],
  connectionMap: Map<string, ChunkConnection>
): Promise<Array<{ connection: ChunkConnection; sourceChunk: any; targetChunk: any }>> {
  const results = [];

  for (const key of pairKeys.slice(0, 10)) { // Limit to first 10 for detailed display
    const [sourceId, targetId] = key.split(':');
    const connection = connectionMap.get(key)!;

    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, summary, domain_metadata')
      .in('id', [sourceId, targetId]);

    if (!chunks || chunks.length !== 2) continue;

    const sourceChunk = chunks.find((c: any) => c.id === sourceId);
    const targetChunk = chunks.find((c: any) => c.id === targetId);

    results.push({ connection, sourceChunk, targetChunk });
  }

  return results;
}

function printReport(result: ComparisonResult): void {
  const { stats, geminiOnlyConnections, qwenOnlyConnections, recommendation } = result;

  console.log('='.repeat(70));
  console.log('📊 COMPARISON RESULTS');
  console.log('='.repeat(70) + '\n');

  console.log(`Agreement Rate: ${(stats.agreementRate * 100).toFixed(1)}%`);
  console.log(`Avg Strength Difference: ${stats.avgStrengthDiff.toFixed(3)}\n`);

  console.log('Detection Breakdown:');
  console.log(`  Both detected: ${stats.bothDetected} (${((stats.bothDetected / stats.totalCandidates) * 100).toFixed(1)}%)`);
  console.log(`  Gemini only: ${stats.geminiOnly} (${((stats.geminiOnly / stats.totalCandidates) * 100).toFixed(1)}%)`);
  console.log(`  Qwen only: ${stats.qwenOnly} (${((stats.qwenOnly / stats.totalCandidates) * 100).toFixed(1)}%)\n`);

  // Strength correlation analysis
  if (stats.strengthCorrelation.length > 0) {
    console.log('Strength Correlation (both detected):');
    const sortedByDiff = [...stats.strengthCorrelation].sort((a, b) => b.diff - a.diff);
    console.log(`  Max difference: ${sortedByDiff[0].diff.toFixed(3)}`);
    console.log(`  Min difference: ${sortedByDiff[sortedByDiff.length - 1].diff.toFixed(3)}`);
    console.log(`  Median difference: ${sortedByDiff[Math.floor(sortedByDiff.length / 2)].diff.toFixed(3)}\n`);
  }

  // Show disagreements
  if (geminiOnlyConnections.length > 0) {
    console.log('-'.repeat(70));
    console.log('🔍 GEMINI-ONLY CONNECTIONS (potential misses by Qwen)');
    console.log('-'.repeat(70) + '\n');

    geminiOnlyConnections.slice(0, 5).forEach(({ connection, sourceChunk, targetChunk }, i) => {
      console.log(`[${i + 1}] Strength: ${connection.strength.toFixed(2)}`);
      console.log(`Source (${sourceChunk?.domain_metadata?.primaryDomain || 'unknown'}): ${sourceChunk?.summary || 'Untitled'}`);
      console.log(`  ${sourceChunk?.content.slice(0, 100)}...`);
      console.log(`Target (${targetChunk?.domain_metadata?.primaryDomain || 'unknown'}): ${targetChunk?.summary || 'Untitled'}`);
      console.log(`  ${targetChunk?.content.slice(0, 100)}...`);
      console.log(`Explanation: ${connection.metadata?.explanation || 'N/A'}\n`);
    });
  }

  if (qwenOnlyConnections.length > 0) {
    console.log('-'.repeat(70));
    console.log('🔍 QWEN-ONLY CONNECTIONS (potential false positives or Gemini misses)');
    console.log('-'.repeat(70) + '\n');

    qwenOnlyConnections.slice(0, 5).forEach(({ connection, sourceChunk, targetChunk }, i) => {
      console.log(`[${i + 1}] Strength: ${connection.strength.toFixed(2)}`);
      console.log(`Source (${sourceChunk?.domain_metadata?.primaryDomain || 'unknown'}): ${sourceChunk?.summary || 'Untitled'}`);
      console.log(`  ${sourceChunk?.content.slice(0, 100)}...`);
      console.log(`Target (${targetChunk?.domain_metadata?.primaryDomain || 'unknown'}): ${targetChunk?.summary || 'Untitled'}`);
      console.log(`  ${targetChunk?.content.slice(0, 100)}...`);
      console.log(`Explanation: ${connection.metadata?.explanation || 'N/A'}\n`);
    });
  }

  // Recommendation
  console.log('='.repeat(70));
  console.log('🎯 RECOMMENDATION');
  console.log('='.repeat(70) + '\n');

  if (recommendation === 'proceed') {
    console.log('✅ PROCEED with Qwen - quality is sufficient');
    console.log('   Benefits: $0.20/book savings, privacy, speed, no rate limits');
    console.log('   Next steps: Test on 1-2 more diverse documents to confirm\n');
  } else if (recommendation === 'borderline') {
    console.log('⚠️  BORDERLINE - manual review recommended');
    console.log('   Action: Review disagreements above carefully');
    console.log('   Consider: Hybrid approach (Qwen for high confidence, Gemini for borderline)\n');
  } else {
    console.log('❌ KEEP Gemini - quality gap too large');
    console.log('   Reason: Qwen missing too many connections or adding noise');
    console.log('   Consider: Try tuning Qwen prompts or using smaller strength threshold\n');
  }

  // Cost analysis
  console.log('-'.repeat(70));
  console.log('💰 COST ANALYSIS');
  console.log('-'.repeat(70) + '\n');
  console.log('Gemini cost per book (500 pages): ~$0.20');
  console.log('Qwen cost per book: $0.00 (local)');
  console.log('Annual savings (100 books): $20.00');
  console.log('Annual savings (1000 books): $200.00\n');
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const documentId = process.argv[2];

  if (!documentId) {
    console.error('Usage: npx tsx worker/scripts/test-dual-bridge.ts <document_id>');
    process.exit(1);
  }

  testDualBridge(documentId)
    .then(result => {
      printReport(result);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

export { testDualBridge, type ComparisonResult };
