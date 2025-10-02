# Code Examples & User Flows

## Table of Contents
1. [Document Upload Flow](#document-upload-flow)
2. [Document Processing](#document-processing)
3. [Collision Detection](#collision-detection)
4. [ECS Operations](#ecs-operations)
5. [User Preferences](#user-preferences)
6. [Common Patterns](#common-patterns)

## Document Upload Flow

### Complete User Flow: PDF Upload
```typescript
// 1. User selects file in UI (components/upload/UploadZone.tsx)
const handleDrop = async (files: FileList) => {
  const file = files[0]
  
  // 2. Detect source type
  const sourceType = detectSourceType(file.name) // 'pdf'
  
  // 3. Create FormData
  const formData = new FormData()
  formData.append('file', file)
  formData.append('source_type', sourceType)
  
  // 4. Call Server Action
  const result = await uploadDocument(formData)
  
  // 5. Show processing dock
  setProcessingJobs([result.jobId])
}

// Server Action (app/actions/documents.ts)
'use server'
export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File
  const sourceType = formData.get('source_type') as SourceType
  const userId = 'dev-user-123' // MVP hardcode
  const documentId = crypto.randomUUID()
  
  // Upload to storage
  const storagePath = `${userId}/${documentId}`
  const { error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(`${storagePath}/source.pdf`, file)
  
  if (uploadError) throw uploadError
  
  // Create document record
  const { error: dbError } = await supabaseAdmin
    .from('documents')
    .insert({
      id: documentId,
      user_id: userId,
      title: file.name.replace(/\.[^/.]+$/, ''),
      storage_path: storagePath,
      source_type: sourceType,
      processing_status: 'pending',
      created_at: new Date().toISOString()
    })
  
  if (dbError) throw dbError
  
  // Queue processing job
  const { data: job, error: jobError } = await supabaseAdmin
    .from('background_jobs')
    .insert({
      job_type: 'process-document',
      status: 'pending',
      input_data: {
        document_id: documentId,
        source_type: sourceType,
        user_id: userId
      },
      created_at: new Date().toISOString()
    })
    .select()
    .single()
  
  if (jobError) throw jobError
  
  revalidatePath('/')
  return { success: true, documentId, jobId: job.id }
}
```

## Document Processing

### Large Document Processing (500+ pages)

```typescript
// worker/processors/pdf-processor.ts
export class PDFProcessor extends SourceProcessor {
  async process(): Promise<ProcessResult> {
    const storagePath = this.getStoragePath();
    
    // Download and upload to Gemini
    await this.updateProgress(10, 'download', 'fetching', 'Retrieving PDF');
    const { fileUri, totalPages } = await this.uploadPDFToGemini();
    
    // Decide: single pass or batched extraction?
    const useBatched = totalPages > 200;
    
    let markdown: string;
    let chunks: ProcessedChunk[];
    
    if (useBatched) {
      await this.updateProgress(15, 'extract', 'batched', `Large book: ${totalPages} pages`);
      
      // Stage 1: Batched extraction
      markdown = await extractLargePDF(this.ai, fileUri, totalPages);
      await this.updateProgress(60, 'extract', 'complete', `Extracted ${Math.round(markdown.length / 1024)}kb`);
      
      // Stage 2: Batched chunking + metadata
      chunks = await batchChunkAndExtractMetadata(this.ai, markdown);
      await this.updateProgress(85, 'finalize', 'complete', `Created ${chunks.length} chunks`);
      
    } else {
      // Single pass for smaller docs
      await this.updateProgress(25, 'extract', 'analyzing', 'Processing with AI');
      const result = await this.extractSinglePass(fileUri);
      markdown = result.markdown;
      chunks = result.chunks;
      await this.updateProgress(85, 'finalize', 'complete', `Created ${chunks.length} chunks`);
    }
    
    return {
      markdown,
      chunks,
      metadata: { sourceUrl: this.job.metadata?.source_url },
      wordCount: markdown.split(/\s+/).length,
      outline: this.extractOutline(markdown)
    };
  }
}
```

### Batched PDF Extraction

```typescript
// worker/processors/pdf-processor.ts

interface ExtractionBatch {
  markdown: string;
  startPage: number;
  endPage: number;
  overlapStart: number;
}

async function extractLargePDF(
  ai: GoogleGenAI,
  fileUri: string,
  totalPages: number
): Promise<string> {
  const BATCH_SIZE = 100;
  const OVERLAP_PAGES = 10;
  const batches: ExtractionBatch[] = [];
  
  console.log(`📚 Extracting ${totalPages} pages in batches of ${BATCH_SIZE}`);
  
  for (let start = 0; start < totalPages; start += BATCH_SIZE - OVERLAP_PAGES) {
    const end = Math.min(start + BATCH_SIZE, totalPages);
    const batchNum = Math.floor(start / (BATCH_SIZE - OVERLAP_PAGES)) + 1;
    const totalBatches = Math.ceil(totalPages / (BATCH_SIZE - OVERLAP_PAGES));
    
    console.log(`📄 Extracting pages ${start + 1}-${end} (batch ${batchNum}/${totalBatches})`);
    
    const prompt = `Extract pages ${start + 1} through ${end} from this PDF as clean markdown.

IMPORTANT INSTRUCTIONS:
- Return ALL text from these pages verbatim as markdown
- Preserve headings (# ## ###), lists, paragraphs, emphasis
- Do NOT summarize or skip content
- If starting mid-chapter, begin with the actual content (no introduction)
${start > 0 ? '- This continues from previous pages, start immediately with the content' : '- This is the beginning of the document'}

Return ONLY the markdown text, no JSON, no code blocks.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{
        parts: [
          { fileData: { fileUri, mimeType: 'application/pdf' } },
          { text: prompt }
        ]
      }],
      config: { 
        maxOutputTokens: 65536,
        temperature: 0.1
      }
    });
    
    if (!result.text) {
      throw new Error(`Extraction failed for pages ${start + 1}-${end}`);
    }
    
    batches.push({
      markdown: result.text.trim(),
      startPage: start,
      endPage: end,
      overlapStart: 0
    });
  }
  
  console.log(`✅ Extracted ${batches.length} batches, stitching...`);
  return stitchMarkdownBatches(batches);
}

function stitchMarkdownBatches(batches: ExtractionBatch[]): string {
  if (batches.length === 1) return batches[0].markdown;
  
  let stitched = batches[0].markdown;
  
  for (let i = 1; i < batches.length; i++) {
    const prevBatch = batches[i - 1].markdown;
    const currBatch = batches[i].markdown;
    
    // Take last 2000 chars of previous, first 3000 of current for overlap search
    const searchInPrev = prevBatch.slice(-2000);
    const searchInCurr = currBatch.slice(0, 3000);
    
    // Find overlap by searching for progressively smaller substrings
    const overlapPoint = findBestOverlap(searchInPrev, searchInCurr);
    
    if (overlapPoint > 0) {
      console.log(`🔗 Found overlap at position ${overlapPoint} for batch ${i}`);
      stitched += currBatch.slice(overlapPoint);
    } else {
      console.warn(`⚠️  No overlap found for batch ${i}, using paragraph boundary`);
      const paraStart = currBatch.indexOf('\n\n');
      if (paraStart > 0) {
        stitched += currBatch.slice(paraStart);
      } else {
        stitched += '\n\n' + currBatch;
      }
    }
  }
  
  return stitched;
}

function findBestOverlap(prevEnd: string, currStart: string): number {
  // Try matching with progressively smaller windows
  for (let windowSize = 800; windowSize >= 100; windowSize -= 50) {
    const needle = prevEnd.slice(-windowSize).trim();
    
    // Search for this substring in the current batch
    const idx = currStart.indexOf(needle);
    if (idx !== -1) {
      return idx + needle.length;
    }
    
    // Also try with normalized whitespace
    const normalizedNeedle = needle.replace(/\s+/g, ' ');
    const normalizedHaystack = currStart.replace(/\s+/g, ' ');
    const normalizedIdx = normalizedHaystack.indexOf(normalizedNeedle);
    
    if (normalizedIdx !== -1) {
      const ratio = currStart.length / normalizedHaystack.length;
      return Math.floor((normalizedIdx + normalizedNeedle.length) * ratio);
    }
  }
  
  return 0; // No overlap found
}
```

### Batched Metadata Extraction

```typescript
// worker/lib/ai-chunking-batch.ts

export interface ChunkWithRichMetadata {
  content: string;
  themes: string[];
  concepts: Array<{ text: string; importance: number }>;
  emotional_tone: {
    polarity: number;
    primaryEmotion: string;
  };
  importance_score: number;
  start_offset: number;
  end_offset: number;
  chunk_index: number;
  word_count: number;
}

export async function batchChunkAndExtractMetadata(
  ai: GoogleGenAI,
  markdown: string
): Promise<ChunkWithRichMetadata[]> {
  const allChunks: ChunkWithRichMetadata[] = [];
  const WINDOW_SIZE = 100000; // ~25k tokens
  let position = 0;
  let chunkIndex = 0;
  
  while (position < markdown.length) {
    const section = markdown.slice(position, position + WINDOW_SIZE);
    const remaining = markdown.length - position;
    const progress = Math.round((position / markdown.length) * 100);
    
    console.log(`🔍 Chunking: ${progress}% (${Math.round(remaining / 1000)}k chars remaining)`);
    
    const prompt = `You are chunking a document. Process this section starting at character ${position}.

Create semantic chunks (200-500 words each) with complete thoughts.
For each chunk extract:
- content: the actual text
- themes: 2-3 key topics as array of strings
- concepts: 5-10 important concepts as [{text: string, importance: 0-1}]
- emotional_tone: {polarity: -1 to 1, primaryEmotion: string}
- importance_score: 0-1 based on content centrality
- start_offset: character position in full document
- end_offset: character position where chunk ends

Return JSON:
{
  "chunks": [...],
  "lastProcessedOffset": absolute_character_position_in_full_doc
}

CRITICAL: start_offset and end_offset must be absolute positions in the original document.
The first chunk should start at or near position ${position}.

Markdown section:
${section}`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        temperature: 0.1
      }
    });
    
    const response = JSON.parse(result.text);
    
    // Validate chunks have required fields
    for (const chunk of response.chunks) {
      if (!chunk.content || !chunk.start_offset) {
        console.warn('Skipping invalid chunk:', chunk);
        continue;
      }
      
      allChunks.push({
        ...chunk,
        chunk_index: chunkIndex++,
        word_count: chunk.content.split(/\s+/).length
      });
    }
    
    // Move to where we left off
    if (response.lastProcessedOffset > position) {
      position = response.lastProcessedOffset;
    } else {
      console.warn('AI did not advance, forcing +50k chars');
      position += 50000;
    }
  }
  
  console.log(`✅ Created ${allChunks.length} chunks`);
  return allChunks;
}
```

## Collision Detection

### The 3-Engine System

```typescript
// worker/handlers/detect-connections.ts

import { SemanticSimilarityEngine } from '../engines/semantic-similarity';
import { ContradictionDetectionEngine } from '../engines/contradiction-detection';
import { ThematicBridgeEngine } from '../engines/thematic-bridge';

function initializeOrchestrator(weights?: WeightConfig): CollisionOrchestrator {
  if (!orchestrator) {
    console.log('[DetectConnections] Initializing orchestrator with 3 engines');
    
    orchestrator = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: 3,
      globalTimeout: 10000,  // 10 seconds (AI takes longer)
      weights: weights || {
        weights: {
          [EngineType.SEMANTIC_SIMILARITY]: 0.25,
          [EngineType.CONTRADICTION_DETECTION]: 0.40,  // Highest priority
          [EngineType.THEMATIC_BRIDGE]: 0.35,
        },
        normalizationMethod: 'linear',
        combineMethod: 'sum',
      },
      cache: {
        enabled: true,
        ttl: 300000,
        maxSize: 1000,
      },
    });
    
    // Register only 3 engines
    const apiKey = process.env.GOOGLE_AI_API_KEY!;
    const engines = [
      new SemanticSimilarityEngine(),
      new ContradictionDetectionEngine(),
      new ThematicBridgeEngine(apiKey),
    ];
    
    orchestrator.registerEngines(engines);
    
    console.log('[DetectConnections] Orchestrator initialized with 3 engines');
  } else if (weights) {
    orchestrator.updateWeights(weights);
  }
  
  return orchestrator;
}
```

### Engine 1: Semantic Similarity (Fast Baseline)

```typescript
// worker/engines/semantic-similarity.ts

export class SemanticSimilarityEngine extends BaseEngine {
  readonly type = EngineType.SEMANTIC_SIMILARITY;
  
  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    const { sourceChunk } = input;
    
    if (!sourceChunk.embedding) {
      return [];
    }
    
    // Use pgvector for efficient similarity search
    const matches = await this.supabase.rpc('match_chunks', {
      query_embedding: sourceChunk.embedding,
      threshold: 0.7,
      exclude_document: sourceChunk.document_id,
      limit: 50
    });
    
    return matches.data?.map(m => ({
      sourceChunkId: sourceChunk.id,
      targetChunkId: m.id,
      engineType: this.type,
      score: m.similarity,
      confidence: m.similarity > 0.85 ? 'high' : 'medium',
      explanation: `Semantic similarity: ${(m.similarity * 100).toFixed(1)}%`,
      metadata: { similarity_score: m.similarity }
    })) || [];
  }
  
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    return !!chunk.embedding;
  }
}
```

### Engine 2: Contradiction Detection (Metadata-Enhanced)

```typescript
// worker/engines/contradiction-detection.ts

export class ContradictionDetectionEngine extends BaseEngine {
  readonly type = EngineType.CONTRADICTION_DETECTION;
  
  private readonly MIN_CONCEPT_OVERLAP = 0.3;
  private readonly MIN_POLARITY_DIFFERENCE = 0.6;
  
  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    
    for (const targetChunk of input.targetChunks) {
      if (targetChunk.id === input.sourceChunk.id) continue;
      
      // Strategy 1: Metadata-based conceptual tension
      const conceptualTension = this.detectConceptualTension(
        input.sourceChunk,
        targetChunk
      );
      
      if (conceptualTension) {
        results.push(conceptualTension);
        continue;
      }
      
      // Strategy 2: Syntax-based contradiction (fallback)
      const syntaxContradiction = this.detectSyntaxContradiction(
        input.sourceChunk,
        targetChunk
      );
      
      if (syntaxContradiction) {
        results.push(syntaxContradiction);
      }
    }
    
    return results;
  }
  
  private detectConceptualTension(
    sourceChunk: ChunkWithMetadata,
    targetChunk: ChunkWithMetadata
  ): CollisionResult | null {
    const sourceConcepts = sourceChunk.metadata?.concepts?.concepts;
    const targetConcepts = targetChunk.metadata?.concepts?.concepts;
    const sourceEmotion = sourceChunk.metadata?.emotional_tone;
    const targetEmotion = targetChunk.metadata?.emotional_tone;
    
    if (!sourceConcepts || !targetConcepts || !sourceEmotion || !targetEmotion) {
      return null;
    }
    
    // Check for concept overlap (same topic?)
    const { overlap, sharedConcepts } = this.calculateConceptOverlapDetailed(
      sourceConcepts,
      targetConcepts
    );
    
    if (overlap < this.MIN_CONCEPT_OVERLAP) {
      return null;
    }
    
    // Check for opposing emotional stances
    const polarityDiff = Math.abs(
      (sourceEmotion.polarity || 0) - (targetEmotion.polarity || 0)
    );
    
    if (polarityDiff < this.MIN_POLARITY_DIFFERENCE) {
      return null;
    }
    
    const score = this.calculateTensionScore(overlap, polarityDiff, sharedConcepts.length);
    
    if (score < 0.4) return null;
    
    return {
      sourceChunkId: sourceChunk.id,
      targetChunkId: targetChunk.id,
      engineType: this.type,
      score,
      confidence: score > 0.7 ? 'high' : 'medium',
      explanation: `Conceptual tension: Both discuss ${sharedConcepts.slice(0,3).join(', ')}, but with opposing viewpoints`,
      metadata: {
        contradictionType: 'conceptual_tension',
        sharedConcepts,
        polarityDifference: polarityDiff,
      },
    };
  }
  
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    return !!(
      chunk.content && chunk.content.length > 50 ||
      (chunk.metadata?.concepts && chunk.metadata?.emotional_tone)
    );
  }
}
```

### Engine 3: Thematic Bridge (AI-Powered, Filtered)

```typescript
// worker/engines/thematic-bridge.ts

export class ThematicBridgeEngine extends BaseEngine {
  readonly type = EngineType.THEMATIC_BRIDGE;
  
  private ai: GoogleGenAI;
  private readonly IMPORTANCE_THRESHOLD = 0.6;
  private readonly MAX_CANDIDATES = 15;
  private readonly MIN_CONCEPT_OVERLAP = 0.2;
  private readonly MAX_CONCEPT_OVERLAP = 0.7;
  private readonly MIN_BRIDGE_STRENGTH = 0.6;
  
  constructor(apiKey: string) {
    super();
    this.ai = new GoogleGenAI({ apiKey });
  }
  
  protected async detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    
    // FILTER 1: Source chunk must be important
    if ((input.sourceChunk.importance_score || 0) < this.IMPORTANCE_THRESHOLD) {
      return [];
    }
    
    // FILTER 2: Get promising candidates
    const candidates = this.filterCandidates(input.sourceChunk, input.targetChunks);
    
    if (candidates.length === 0) {
      return [];
    }
    
    console.log(
      `[ThematicBridge] Analyzing ${candidates.length} candidates for chunk ${input.sourceChunk.id}`
    );
    
    // ANALYZE: Use AI for each candidate (batched for efficiency)
    const analyses = await this.batchAnalyzeBridges(input.sourceChunk, candidates);
    
    for (let i = 0; i < analyses.length; i++) {
      const analysis = analyses[i];
      const candidate = candidates[i];
      
      if (analysis.connected && analysis.strength >= this.MIN_BRIDGE_STRENGTH) {
        results.push({
          sourceChunkId: input.sourceChunk.id,
          targetChunkId: candidate.id,
          engineType: this.type,
          score: analysis.strength,
          confidence: analysis.strength > 0.8 ? 'high' : 'medium',
          explanation: analysis.explanation,
          metadata: {
            bridgeType: analysis.bridgeType,
            sharedConcept: analysis.sharedConcept,
            sourceDomain: this.inferDomain(input.sourceChunk),
            targetDomain: this.inferDomain(candidate),
          },
        });
      }
    }
    
    console.log(
      `[ThematicBridge] Found ${results.length} bridges from ${analyses.length} analyses`
    );
    
    return results;
  }
  
  private filterCandidates(
    sourceChunk: ChunkWithMetadata,
    targetChunks: ChunkWithMetadata[]
  ): ChunkWithMetadata[] {
    const sourceConcepts = sourceChunk.metadata?.concepts?.concepts;
    const sourceDomain = this.inferDomain(sourceChunk);
    
    if (!sourceConcepts || sourceConcepts.length === 0) {
      return [];
    }
    
    const candidates = targetChunks
      .filter(target => {
        // Must be cross-document
        if (target.document_id === sourceChunk.document_id) return false;
        
        // Must be important enough
        if ((target.importance_score || 0) < this.IMPORTANCE_THRESHOLD) return false;
        
        // Must have concept metadata
        const targetConcepts = target.metadata?.concepts?.concepts;
        if (!targetConcepts || targetConcepts.length === 0) return false;
        
        // Check concept overlap (sweet spot: some but not too much)
        const overlap = this.calculateConceptOverlap(sourceConcepts, targetConcepts);
        if (overlap < this.MIN_CONCEPT_OVERLAP || overlap > this.MAX_CONCEPT_OVERLAP) {
          return false;
        }
        
        // Prefer different domains
        const targetDomain = this.inferDomain(target);
        const crossDomain = sourceDomain !== targetDomain && 
                           sourceDomain !== 'general' && 
                           targetDomain !== 'general';
        
        return crossDomain;
      })
      .sort((a, b) => {
        return (b.importance_score || 0) - (a.importance_score || 0);
      })
      .slice(0, this.MAX_CANDIDATES);
    
    return candidates;
  }
  
  private async analyzeBridge(
    sourceChunk: ChunkWithMetadata,
    targetChunk: ChunkWithMetadata
  ): Promise<BridgeAnalysis> {
    const sourceConcepts = sourceChunk.metadata?.concepts?.concepts?.slice(0, 5).map(c => c.text) || [];
    const targetConcepts = targetChunk.metadata?.concepts?.concepts?.slice(0, 5).map(c => c.text) || [];
    const sourceDomain = this.inferDomain(sourceChunk);
    const targetDomain = this.inferDomain(targetChunk);
    
    const prompt = `You are analyzing whether two text chunks from different domains explore the same underlying concept.

CHUNK 1 (${sourceDomain} domain):
Concepts: ${sourceConcepts.join(', ')}
Excerpt: "${sourceChunk.content.slice(0, 300).replace(/\n/g, ' ')}..."

CHUNK 2 (${targetDomain} domain):
Concepts: ${targetConcepts.join(', ')}
Excerpt: "${targetChunk.content.slice(0, 300).replace(/\n/g, ' ')}..."

Question: Do these explore the same underlying idea from different perspectives?

Look for:
- Cross-domain concept mapping (e.g., "paranoia" in literature ↔ "surveillance" in tech)
- Framework shifts (same problem, different analytical approach)
- Methodological parallels (similar reasoning patterns)
- Causal parallels (similar cause-effect structures)

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "connected": true or false,
  "bridgeType": "cross_domain" | "framework_shift" | "methodological" | "causal_parallel" | null,
  "sharedConcept": "the core concept linking them (one phrase)",
  "explanation": "brief explanation of the connection (max 100 chars)",
  "strength": 0.0-1.0
}`;

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          temperature: 0.3,
          maxOutputTokens: 200,
        },
      });
      
      let responseText = result.text.trim();
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      const analysis: BridgeAnalysis = JSON.parse(responseText);
      
      if (typeof analysis.connected !== 'boolean' || 
          typeof analysis.strength !== 'number' ||
          analysis.strength < 0 || analysis.strength > 1) {
        throw new Error('Invalid analysis structure');
      }
      
      return analysis;
      
    } catch (error) {
      console.warn(`[ThematicBridge] Analysis failed:`, error);
      return {
        connected: false,
        bridgeType: null,
        sharedConcept: '',
        explanation: '',
        strength: 0,
      };
    }
  }
  
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    return !!(
      chunk.metadata?.concepts?.concepts &&
      chunk.metadata.concepts.concepts.length > 0 &&
      chunk.importance_score !== undefined
    );
  }
}
```

## User Preferences

### Configuring Engine Weights

```typescript
// app/actions/preferences.ts
'use server'

export async function updateEngineWeights(
  weights: Partial<EngineWeights>
) {
  const userId = 'dev-user-123'
  
  // Validate weights sum to 1.0
  const sum = Object.values(weights).reduce(
    (acc, val) => acc + val, 
    0
  )
  
  if (Math.abs(sum - 1.0) > 0.01) {
    throw new Error('Weights must sum to 1.0')
  }
  
  // Update configuration
  const { data, error } = await supabaseAdmin
    .from('user_preferences')
    .upsert({
      user_id: userId,
      engine_weights: weights,
      updated_at: new Date().toISOString()
    })
  
  if (error) throw error
  
  revalidatePath('/settings')
  return { success: true, weights }
}
```

### Weight Presets

```typescript
// Only 3 engines now
const WEIGHT_PRESETS = {
  balanced: {
    'semantic_similarity': 0.25,
    'contradiction_detection': 0.40,
    'thematic_bridge': 0.35
  },
  
  tension_focused: {
    'semantic_similarity': 0.15,
    'contradiction_detection': 0.60,  // Maximum friction
    'thematic_bridge': 0.25
  },
  
  discovery_focused: {
    'semantic_similarity': 0.20,
    'contradiction_detection': 0.30,
    'thematic_bridge': 0.50  // Maximum cross-domain discovery
  }
}

// Apply preset
export async function applyWeightPreset(
  presetName: keyof typeof WEIGHT_PRESETS
) {
  const weights = WEIGHT_PRESETS[presetName]
  return updateEngineWeights(weights)
}
```

## Common Patterns

### Cost Tracking

```typescript
// Track API costs during processing
class CostTracker {
  private costs = {
    extraction: 0,
    metadata: 0,
    connections: 0
  };
  
  trackExtraction(pages: number) {
    const batches = Math.ceil(pages / 100);
    this.costs.extraction = batches * 0.02;
  }
  
  trackMetadata(chunks: number) {
    const batches = Math.ceil(chunks / 100);
    this.costs.metadata = batches * 0.02;
  }
  
  trackThematicBridge(aiCalls: number) {
    this.costs.connections = aiCalls * 0.001;
  }
  
  getTotal() {
    return Object.values(this.costs).reduce((a, b) => a + b, 0);
  }
  
  log() {
    console.log('Cost breakdown:', {
      ...this.costs,
      total: this.getTotal()
    });
  }
}

// Usage in processor
const costTracker = new CostTracker();
costTracker.trackExtraction(totalPages);
// ... processing
costTracker.log(); // Shows ~$0.54 for 500-page book
```

### Debugging Tips

```sql
-- Check connection distribution by engine
SELECT 
  type,
  COUNT(*) as count,
  AVG(strength) as avg_strength,
  MAX(strength) as max_strength
FROM connections
GROUP BY type
ORDER BY count DESC;

-- Find high-quality thematic bridges
SELECT 
  c.id,
  c.strength,
  c.metadata->>'bridgeType' as bridge_type,
  c.metadata->>'sharedConcept' as concept,
  s.content as source_preview,
  t.content as target_preview
FROM connections c
JOIN chunks s ON s.id = c.source_chunk_id
JOIN chunks t ON t.id = c.target_chunk_id
WHERE c.type = 'thematic_bridge'
  AND c.strength > 0.8
ORDER BY c.strength DESC
LIMIT 10;
```

### Performance Monitoring

```typescript
// Monitor engine performance
async function benchmarkEngines() {
  const engines = [
    new SemanticSimilarityEngine(),
    new ContradictionDetectionEngine(), 
    new ThematicBridgeEngine(apiKey)
  ];
  
  for (const engine of engines) {
    const start = performance.now();
    await engine.detect(testInput);
    const duration = performance.now() - start;
    
    console.log(`${engine.type}: ${duration.toFixed(2)}ms`);
  }
}

// Expected results:
// semantic_similarity: ~50ms (fast, no AI)
// contradiction_detection: ~100ms (metadata processing)
// thematic_bridge: ~2000ms (AI calls)
```