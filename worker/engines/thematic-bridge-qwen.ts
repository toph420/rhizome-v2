/**
 * Thematic Bridge Engine - Qwen Local Implementation
 * AI-powered cross-domain connection detection using local Qwen model
 *
 * Strategy:
 * - Same filtering as Gemini version (importance >0.6, domain differences)
 * - Batch AI analysis for efficiency (~5 pairs per call)
 * - Target ~200 chunk pairs per document (~40 AI calls)
 * - Uses Ollama with structured JSON output
 */

import { createClient } from '@supabase/supabase-js';
import { OllamaClient, OOMError } from '../lib/local/ollama-client.js';
import { ChunkConnection } from './semantic-similarity.js';
import type { ThematicBridgeConfig } from './thematic-bridge.js';

/**
 * Process a document for thematic bridges using Qwen
 *
 * @param documentId - Document to process
 * @param config - Configuration options
 * @returns Array of chunk connections ready to save
 */
export async function runThematicBridgeQwen(
  documentId: string,
  config: ThematicBridgeConfig = {}
): Promise<ChunkConnection[]> {
  const {
    minImportance = 0.6,
    minStrength = 0.6,
    maxSourceChunks = 50,
    maxCandidatesPerSource = 10,
    batchSize = 5
  } = config;

  console.log(`[ThematicBridge:Qwen] Processing document ${documentId}`);
  console.log(`[ThematicBridge:Qwen] AI filtering: importance>${minImportance}, strength>${minStrength}`);

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get high-importance chunks from source document
  const { data: sourceChunks, error } = await supabase
    .from('chunks')
    .select(`
      id,
      document_id,
      content,
      summary,
      domain_metadata,
      importance_score
    `)
    .eq('document_id', documentId)
    .gte('importance_score', minImportance)
    .not('domain_metadata', 'is', null)
    .order('importance_score', { ascending: false })
    .limit(maxSourceChunks);

  if (error || !sourceChunks?.length) {
    console.log('[ThematicBridge:Qwen] No high-importance chunks with domain metadata');
    return [];
  }

  console.log(`[ThematicBridge:Qwen] Analyzing ${sourceChunks.length} high-importance chunks`);

  const ollama = new OllamaClient();
  const connections: ChunkConnection[] = [];
  let aiCallCount = 0;
  let oomFallbackCount = 0;

  for (const chunk of sourceChunks) {
    const sourceDomain = chunk.domain_metadata?.primaryDomain;
    if (!sourceDomain) continue;

    // Get candidates from different domains with document titles
    const { data: candidates } = await supabase
      .from('chunks')
      .select(`
        id,
        document_id,
        content,
        summary,
        domain_metadata,
        importance_score,
        documents!inner(title)
      `)
      .neq('document_id', chunk.document_id)
      .gte('importance_score', minImportance)
      .not('domain_metadata', 'is', null)
      .neq('domain_metadata->>primaryDomain', sourceDomain)
      .order('importance_score', { ascending: false })
      .limit(maxCandidatesPerSource);

    if (!candidates?.length) continue;

    // Debug: Check for duplicate candidates from query
    const candidateIds = candidates.map(c => c.id);
    const uniqueIds = new Set(candidateIds);
    if (candidateIds.length !== uniqueIds.size) {
      console.log(`[ThematicBridge:Qwen] ⚠️  Query returned ${candidateIds.length - uniqueIds.size} duplicate chunks for source ${chunk.id}`);
    }

    // Batch analyze with Qwen
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      aiCallCount++;

      const prompt = buildQwenPrompt(chunk, batch, sourceDomain, minStrength);

      try {
        // Use structured JSON output for reliability
        const parsed = await ollama.generateStructured(prompt);

        // Validate structure
        if (!parsed || !Array.isArray(parsed.bridges)) {
          console.error(`[ThematicBridge:Qwen] Invalid response structure, expected { bridges: [...] }`);
          console.error(`[ThematicBridge:Qwen] Got:`, JSON.stringify(parsed).substring(0, 200));
          continue;
        }

        for (const bridge of parsed.bridges) {
          if (bridge.strength < minStrength) continue;

          const targetChunk = batch[bridge.targetIndex];
          if (!targetChunk) continue;

          connections.push({
            source_chunk_id: chunk.id,
            target_chunk_id: targetChunk.id,
            connection_type: 'thematic_bridge',
            strength: bridge.strength,
            auto_detected: true,
            discovered_at: new Date().toISOString(),
            metadata: {
              bridge_type: bridge.bridgeType,
              explanation: bridge.explanation,
              bridge_concepts: bridge.bridgeConcepts,
              source_domain: sourceDomain,
              target_domain: targetChunk.domain_metadata?.primaryDomain,
              engine_version: 'v2-qwen',
              target_document_title: (targetChunk.documents as any)?.title || 'Unknown Document',
              target_snippet: targetChunk.content?.slice(0, 200) || targetChunk.summary?.slice(0, 200) || 'No preview available'
            }
          });
        }
      } catch (error) {
        if (error instanceof OOMError) {
          console.error(`[ThematicBridge:Qwen] Out of memory error - consider using smaller model`);
          oomFallbackCount++;
          continue;
        }
        console.error(`[ThematicBridge:Qwen] AI analysis failed for batch:`, error);
        continue;
      }
    }
  }

  console.log(`[ThematicBridge:Qwen] Found ${connections.length} bridges using ${aiCallCount} AI calls`);
  if (oomFallbackCount > 0) {
    console.log(`[ThematicBridge:Qwen] ⚠️  ${oomFallbackCount} batches skipped due to OOM errors`);
  }

  return connections;
}

/**
 * Build the Qwen prompt for thematic bridge analysis
 * Optimized for Qwen's instruction-following capabilities
 */
function buildQwenPrompt(
  chunk: any,
  batch: any[],
  sourceDomain: string,
  minStrength: number
): string {
  return `You are an expert at identifying thematic bridges between ideas from different domains.

TASK: Analyze if these chunk pairs have meaningful thematic bridges that reveal deeper patterns.

A thematic bridge exists when:
1. Both chunks address similar concepts from DIFFERENT domains
2. The shared concept reveals a deeper pattern or connection
3. The bridge provides insight someone reading one wouldn't automatically see

NOT a bridge:
- Same domain (both literature, both technology)
- Surface similarity without deeper connection
- Common concepts everyone knows connect

SOURCE CHUNK (${sourceDomain}):
Title/Summary: ${chunk.summary || 'Untitled chunk'}
Content: ${chunk.content.substring(0, 400)}

CANDIDATE CHUNKS:
${batch.map((c, idx) => `[${idx}] (${c.domain_metadata?.primaryDomain})
Title/Summary: ${c.summary || 'Untitled chunk'}
Content: ${c.content.substring(0, 400)}`).join('\n\n')}

CRITICAL INSTRUCTIONS:
1. Only include bridges with strength > ${minStrength}
2. Be selective - quality over quantity
3. In explanations, reference chunks by their summary as if they are titles
   Example: "In 'Foucault's disciplinary power analysis', the author explores..."
   NOT: "This chunk discusses..." or "The source chunk explores..."

OUTPUT FORMAT (JSON only):
{
  "bridges": [
    {
      "targetIndex": 0,
      "bridgeType": "conceptual" | "causal" | "temporal" | "argumentative" | "metaphorical" | "contextual",
      "strength": 0.7,
      "explanation": "Brief explanation referencing chunk summaries",
      "bridgeConcepts": ["concept1", "concept2"]
    }
  ]
}

Respond with ONLY valid JSON. No markdown, no additional text.`;
}

/**
 * Analyze a single pair of chunks for thematic bridges
 * Useful for testing and comparison
 */
export async function analyzeBridgePairQwen(
  source: any,
  target: any
): Promise<{
  connected: boolean;
  strength: number;
  bridgeType?: string;
  explanation?: string;
  sharedConcept?: string;
}> {
  const ollama = new OllamaClient();

  const prompt = `Analyze if these two chunks from different documents have a meaningful thematic bridge.

SOURCE CHUNK (${source.domain_metadata?.primaryDomain || 'unknown'}):
Title/Summary: ${source.summary || 'Untitled'}
Content: ${source.content.substring(0, 400)}
Concepts: ${source.domain_metadata?.concepts?.map((c: any) => c.text).join(', ') || 'none'}
Themes: ${source.domain_metadata?.themes?.join(', ') || 'none'}

TARGET CHUNK (${target.domain_metadata?.primaryDomain || 'unknown'}):
Title/Summary: ${target.summary || 'Untitled'}
Content: ${target.content.substring(0, 400)}
Concepts: ${target.domain_metadata?.concepts?.map((c: any) => c.text).join(', ') || 'none'}
Themes: ${target.domain_metadata?.themes?.join(', ') || 'none'}

A thematic bridge exists when:
1. Both chunks address similar concepts from DIFFERENT domains
2. The shared concept reveals a deeper pattern or connection
3. The bridge provides insight someone reading one wouldn't automatically see

NOT a bridge:
- Same domain (both literature, both technology)
- Surface similarity without deeper connection
- Common concepts everyone knows connect

Respond with ONLY this JSON structure:
{
  "connected": true or false,
  "strength": 0.0-1.0,
  "bridgeType": "cross_domain" | "none",
  "sharedConcept": "the specific concept that bridges them",
  "explanation": "why this connection matters (2 sentences max)"
}`;

  try {
    const result = await ollama.generateStructured(prompt);
    return result;
  } catch (error) {
    console.error('[ThematicBridge:Qwen] Single pair analysis failed:', error);
    return {
      connected: false,
      strength: 0,
      explanation: 'Analysis failed'
    };
  }
}
