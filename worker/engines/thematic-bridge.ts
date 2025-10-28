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
import { jsonrepair } from 'jsonrepair';

export interface ThematicBridgeConfig {
  minImportance?: number;          // Default: 0.6
  minStrength?: number;            // Default: 0.6
  maxSourceChunks?: number;        // Default: 50
  maxCandidatesPerSource?: number; // Default: 10
  batchSize?: number;              // Default: 5 (pairs per AI call)
  sourceChunkIds?: string[];       // NEW: Filter to specific source chunks
  targetDocumentIds?: string[];    // Filter to specific target documents (for Add New mode)
  reprocessingBatch?: string;      // Batch ID for connection reprocessing
}

/**
 * Process a document for thematic bridges
 *
 * @param documentId - Document to process
 * @param config - Configuration options
 * @param onProgress - Optional progress callback
 * @returns Array of chunk connections ready to save
 */
export async function runThematicBridge(
  documentId: string,
  config: ThematicBridgeConfig = {},
  onProgress?: (percent: number, stage: string, details?: string) => Promise<void>
): Promise<ChunkConnection[]> {
  const {
    minImportance = 0.6,
    minStrength = 0.6,
    maxSourceChunks = 50,
    maxCandidatesPerSource = 10,
    batchSize = 5,
    sourceChunkIds,  // NEW
    targetDocumentIds
  } = config;

  console.log(`[ThematicBridge] Processing document ${documentId}`);
  console.log(`[ThematicBridge] AI filtering: importance>${minImportance}, strength>${minStrength}`);
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    console.log(`[ThematicBridge] Per-chunk mode: ${sourceChunkIds.length} source chunks (skipping importance filter)`);
  }
  if (targetDocumentIds && targetDocumentIds.length > 0) {
    console.log(`[ThematicBridge] Filtering to ${targetDocumentIds.length} target document(s) (reduces AI calls)`);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get high-importance chunks from source document
  // During reprocessing: query by reprocessing_batch
  // During normal processing: query by is_current: true
  // Phase 2A: Include content_layer and content_label for noise filtering
  let sourceQuery = supabase
    .from('chunks')
    .select(`
      id,
      document_id,
      content,
      summary,
      domain_metadata,
      importance_score,
      content_layer,
      content_label
    `)
    .eq('document_id', documentId)
    .not('domain_metadata', 'is', null)

  // NEW: Filter to specific source chunks if provided
  if (sourceChunkIds && sourceChunkIds.length > 0) {
    sourceQuery = sourceQuery.in('id', sourceChunkIds)
    // Don't apply importance filter or limit when specific chunks requested
  } else {
    // Original filtering for document-level detection
    sourceQuery = sourceQuery
      .gte('importance_score', minImportance)
      .order('importance_score', { ascending: false })
      .limit(maxSourceChunks)
  }

  if (config.reprocessingBatch) {
    sourceQuery = sourceQuery.eq('reprocessing_batch', config.reprocessingBatch);
  } else {
    sourceQuery = sourceQuery.eq('is_current', true);
  }

  const { data: rawSourceChunks, error } = await sourceQuery;

  if (error || !rawSourceChunks?.length) {
    console.log('[ThematicBridge] No high-importance chunks with domain metadata');
    return [];
  }

  // Phase 2A: Filter out noisy chunks (headers, footers, furniture)
  const sourceChunks = rawSourceChunks.filter(chunk => {
    // Only use BODY content (skip headers/footers/watermarks)
    if (chunk.content_layer && chunk.content_layer !== 'BODY') {
      return false;
    }

    // Skip non-semantic content
    const noisyLabels = ['PAGE_HEADER', 'PAGE_FOOTER', 'FOOTNOTE', 'REFERENCE'];
    if (chunk.content_label && noisyLabels.includes(chunk.content_label)) {
      return false;
    }

    return true;
  });

  const filteredCount = rawSourceChunks.length - sourceChunks.length;
  if (filteredCount > 0) {
    console.log(`[ThematicBridge] Filtered ${filteredCount} noisy chunks (headers/footers/furniture)`);
  }

  if (!sourceChunks.length) {
    console.log('[ThematicBridge] No clean chunks remaining after filtering');
    return [];
  }

  console.log(`[ThematicBridge] Analyzing ${sourceChunks.length} high-importance clean chunks`);

  const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

  const connections: ChunkConnection[] = [];
  let aiCallCount = 0;
  let processedSources = 0;

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
      .eq('is_current', true)  // ✅ Only search current chunks from other documents
      .neq('document_id', chunk.document_id)
      .gte('importance_score', minImportance)
      .not('domain_metadata', 'is', null)
      .neq('domain_metadata->>primaryDomain', sourceDomain)
      .order('importance_score', { ascending: false })
      .limit(maxCandidatesPerSource);

    if (!candidates?.length) continue;

    // Filter by targetDocumentIds if specified (CRITICAL: reduces AI calls significantly!)
    let filteredCandidates = candidates;
    if (targetDocumentIds && targetDocumentIds.length > 0) {
      const targetSet = new Set(targetDocumentIds);
      filteredCandidates = candidates.filter(c => targetSet.has(c.document_id));
    }

    if (!filteredCandidates.length) continue;

    // Debug: Check for duplicate candidates from query
    const candidateIds = filteredCandidates.map(c => c.id);
    const uniqueIds = new Set(candidateIds);
    if (candidateIds.length !== uniqueIds.size) {
      console.log(`[ThematicBridge] ⚠️  Query returned ${candidateIds.length - uniqueIds.size} duplicate chunks for source ${chunk.id}`);
      console.log(`[ThematicBridge] Candidate IDs:`, candidateIds.slice(0, 10)); // Show first 10
    }

    // Batch analyze with AI
    for (let i = 0; i < filteredCandidates.length; i += batchSize) {
      const batch = filteredCandidates.slice(i, i + batchSize);
      aiCallCount++;

      // Report progress (batch-level granularity)
      const overallPercent = Math.floor((processedSources / sourceChunks.length) * 100);
      await onProgress?.(
        overallPercent,
        'thematic_bridge',
        `Source ${processedSources + 1}/${sourceChunks.length}, batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filteredCandidates.length / batchSize)} (${aiCallCount} AI calls)`
      );

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

CRITICAL INSTRUCTION: In your explanation, reference chunks by their summary as if they are titles.
Instead of "This chunk discusses..." or "The source chunk explores...", use natural references like:
- "In 'Foucault's disciplinary power analysis', the author explores..."
- "The concept of surveillance in 'Panopticon as social control' connects to..."

SOURCE CHUNK (${sourceDomain}):
Title/Summary: ${chunk.summary || 'Untitled chunk'}
Content preview: ${chunk.content.substring(0, 200)}

CANDIDATES:
${batch.map((c, idx) => `[${idx}] (${c.domain_metadata?.primaryDomain})
Title/Summary: ${c.summary || 'Untitled chunk'}
Content preview: ${c.content.substring(0, 200)}`).join('\n\n')}

Only include bridges with strength > ${minStrength}. Be selective.
Remember: Reference chunks by their summary/title in explanations.`;

      try {
        const result = await genAI.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt
        });
        const rawText = result.text;

        // Clean JSON response (strip markdown code fences)
        let cleanedText = rawText
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        // Try to parse, using jsonrepair if needed
        let parsed;
        try {
          parsed = JSON.parse(cleanedText);
        } catch (parseError) {
          // JSON parsing failed - try jsonrepair
          console.log(`[ThematicBridge] Initial parse failed, attempting repair...`);

          try {
            const repaired = jsonrepair(cleanedText);
            parsed = JSON.parse(repaired);
            console.log(`[ThematicBridge] ✓ Successfully repaired malformed JSON`);
          } catch (repairError) {
            // Repair failed - log for debugging
            console.error(`[ThematicBridge] JSON repair failed:`, repairError);
            console.error(`[ThematicBridge] Raw response (first 500 chars):`, rawText.substring(0, 500));
            console.error(`[ThematicBridge] Raw response (last 500 chars):`, rawText.substring(rawText.length - 500));
            console.error(`[ThematicBridge] Skipping this batch`);
            continue;
          }
        }

        // Validate structure
        if (!parsed || !Array.isArray(parsed.bridges)) {
          console.error(`[ThematicBridge] Invalid response structure, expected { bridges: [...] }`);
          console.error(`[ThematicBridge] Got:`, JSON.stringify(parsed).substring(0, 200));
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

    // Increment processed sources counter
    processedSources++;
  }

  console.log(`[ThematicBridge] Found ${connections.length} bridges using ${aiCallCount} AI calls`);
  return connections;
}
