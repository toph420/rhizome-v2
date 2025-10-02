/**
 * Thematic Bridge Engine V2
 * AI-powered cross-domain connection detection with aggressive filtering
 *
 * Strategy:
 * - Pre-filter by importance (>0.6) and domain differences
 * - Batch AI analysis for efficiency (~5 pairs per call)
 * - Target ~200 chunk pairs per document (~40 AI calls)
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { ChunkConnection } from './semantic-similarity';
import { GEMINI_MODEL } from '../lib/model-config.js';

export interface ThematicBridgeConfig {
  minImportance?: number;          // Default: 0.6
  minStrength?: number;            // Default: 0.6
  maxSourceChunks?: number;        // Default: 50
  maxCandidatesPerSource?: number; // Default: 10
  batchSize?: number;              // Default: 5 (pairs per AI call)
}

/**
 * Process a document for thematic bridges
 *
 * @param documentId - Document to process
 * @param config - Configuration options
 * @returns Array of chunk connections ready to save
 */
export async function runThematicBridge(
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

  console.log(`[ThematicBridge] Processing document ${documentId}`);
  console.log(`[ThematicBridge] AI filtering: importance>${minImportance}, strength>${minStrength}`);

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
    console.log('[ThematicBridge] No high-importance chunks with domain metadata');
    return [];
  }

  console.log(`[ThematicBridge] Analyzing ${sourceChunks.length} high-importance chunks`);

  const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

  const connections: ChunkConnection[] = [];
  let aiCallCount = 0;

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

    // Batch analyze with AI
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      aiCallCount++;

      const prompt = `Analyze thematic bridges between these chunk pairs. Return JSON array with:
{
  "bridges": [
    {
      "targetIndex": 0,  // Index in candidates array
      "bridgeType": "conceptual" | "causal" | "temporal" | "argumentative" | "metaphorical" | "contextual",
      "strength": 0.0-1.0,
      "explanation": "Brief explanation of the bridge",
      "bridgeConcepts": ["concept1", "concept2"]
    }
  ]
}

SOURCE CHUNK (${sourceDomain}):
${chunk.summary || chunk.content.substring(0, 500)}

CANDIDATES:
${batch.map((c, idx) => `[${idx}] (${c.domain_metadata?.primaryDomain}): ${c.summary || c.content.substring(0, 300)}`).join('\n\n')}

Only include bridges with strength > ${minStrength}. Be selective.`;

      try {
        const result = await genAI.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt
        });
        const text = result.text;
        const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, ''));

        for (const bridge of parsed.bridges || []) {
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
              engine_version: 'v2',
              // NEW: UI metadata
              target_document_title: (targetChunk.documents as any)?.title || 'Unknown Document',
              target_snippet: targetChunk.content?.slice(0, 200) || targetChunk.summary?.slice(0, 200) || 'No preview available'
            }
          });
        }
      } catch (error) {
        console.error(`[ThematicBridge] AI analysis failed for batch:`, error);
        continue;
      }
    }
  }

  console.log(`[ThematicBridge] Found ${connections.length} bridges using ${aiCallCount} AI calls`);
  return connections;
}
