# Brainstorming Session: Personal Connection Synthesis Engine

**Date:** 2025-01-28  
**Participants:** User (Topher), Claude (AI Assistant)  
**Session Type:** Connection System Architecture Design  
**Duration:** ~120 minutes  
**Status:** ✅ Complete - Ready for Implementation

---

## Executive Summary

This brainstorming session established the complete architecture for Rhizome V2's **7-engine connection detection system** with validation learning, configurable synthesis, and bidirectional Obsidian sync. The system is designed as a **personal cognitive prosthetic** optimized for aggressive connection discovery and serendipitous insights.

**Core Philosophy**: This is a personal thinking tool, not a product. Store everything, surface intelligently, learn from validation patterns. Maximum intelligence, minimum friction.

**Key Innovations**:
1. **7 parallel detection engines** - Semantic, thematic, structural, contradiction, emotional, methodological, temporal
2. **3-phase learning system** - Explicit tracking → Auto-tuning → Personal model
3. **Configurable synthesis** - Real-time weight adjustment, engine ordering, connection limits
4. **Obsidian companion section** - Bidirectional sync with wikilinks for graph integration

---

## Table of Contents

1. [Vision & Philosophy](#vision--philosophy)
2. [7-Engine Connection System](#7-engine-connection-system)
3. [Complete Upload-to-Connection Flow](#complete-upload-to-connection-flow)
4. [Validation Learning System](#validation-learning-system)
5. [Synthesis Configuration Panel](#synthesis-configuration-panel)
6. [Obsidian Bidirectional Sync](#obsidian-bidirectional-sync)
7. [Database Schema](#database-schema)
8. [Implementation Timeline](#implementation-timeline)
9. [Success Criteria](#success-criteria)

---

## Vision & Philosophy

### Core Principles (from `docs/APP_VISION.md`)

**This is a personal tool.** Every feature built for how you actually work, not imagined users.

**Architecture Principles**:
1. **Maximum Intelligence, Minimum Friction** - All features available immediately, no progressive disclosure
2. **Aggressive Connection Detection** - Surface everything, filter later based on context
3. **Personal Tuning** - Every algorithm weight adjustable in real-time
4. **File-Over-App** - Obsidian vault as first-class citizen, version control on everything

### Connection Philosophy

**Store Everything**:
- No strength thresholds at storage time
- Cap at 50 connections/chunk (configurable)
- All 7 engines run in parallel
- Ranking happens at display time with user weights

**Learn From Validation**:
- Track every interaction (click, validate, reject, star, ignore)
- Auto-tune weights based on validation patterns
- Context-aware weights (writing vs reading, time of day)
- Personal model trained nightly on last 30 days

**Chaos Mode**:
- Random high-strength connection every hour as notification
- Forced serendipity
- Configurable interval and strength threshold

---

## 7-Engine Connection System

### Engine Overview

**All engines run in parallel on every upload.** User controls:
- **Order** (priority when storing limited connections)
- **Weights** (scoring at display time)
- **Enable/disable** (turn engines on/off)

### Default Configuration

```typescript
interface SynthesisConfig {
  engineWeights: {
    semantic: 0.3,          // Standard embedding distance
    thematic: 0.9,          // Cross-domain concept matching (HIGH)
    structural: 0.7,        // Pattern recognition
    contradiction: 1.0,     // Productive disagreements (MAX)
    emotional: 0.4,         // Mood/tone matching
    methodological: 0.8,    // Similar analytical approaches
    temporal: 0.2           // Narrative pattern matching
  },
  
  engineOrder: [
    'contradiction',   // Priority 1 (most important to you)
    'thematic',        // Priority 2
    'methodological',  // Priority 3
    'structural',      // Priority 4
    'semantic',        // Priority 5
    'emotional',       // Priority 6
    'temporal'         // Priority 7
  ],
  
  connectionLimits: {
    perChunk: 50,      // Store top 50 connections per chunk
    perEngine: 10      // Store top 10 from each engine
  }
}
```

---

### Engine 1: Semantic Similarity

**Purpose**: Standard vector similarity search (baseline)

**Detection Method**:
```typescript
async function findSemanticMatches(chunk: Chunk) {
  const matches = await supabase.rpc('match_chunks', {
    query_embedding: chunk.embedding,
    match_threshold: 0.3,  // NO FILTERING - store weak connections
    exclude_document: chunk.document_id,
    limit: 20
  })
  
  return matches.map(match => ({
    source_chunk_id: chunk.id,
    target_chunk_id: match.id,
    source_version_id: chunk.version_id,
    target_version_id: match.version_id,
    engine: 'semantic',
    connection_type: 'similar',
    raw_strength: match.similarity,  // Unweighted
    metadata: {
      detection_method: 'embedding_similarity',
      embedding_distance: 1 - match.similarity
    }
  }))
}
```

**Example**:
```
"Deleuze Anti-Oedipus Notes" (chunk 12)
    ↓ semantic: 0.87
"Foucault Discipline & Punish" (chunk 23)

→ Both discuss critique of psychoanalytic subject
```

---

### Engine 2: Thematic Bridges

**Purpose**: Cross-domain concept matching (same concept in radically different contexts)

**Detection Method**:
```typescript
async function findThematicBridges(chunk: Chunk) {
  const chunkThemes = chunk.themes as string[]
  
  // Find chunks with overlapping themes but DIFFERENT domains
  const { data: candidates } = await supabase
    .from('chunks')
    .select('id, document_id, version_id, themes, metadata')
    .neq('document_id', chunk.document_id)
    .filter('themes', 'ov', chunkThemes)  // Array overlap
  
  const bridges = []
  
  for (const candidate of candidates) {
    const candidateThemes = candidate.themes as string[]
    
    // Measure theme overlap
    const themeOverlap = calculateJaccardSimilarity(
      new Set(chunkThemes),
      new Set(candidateThemes)
    )
    
    // Measure domain distance (structural patterns)
    const domainDifference = calculateDomainDistance(
      chunk.metadata.structural_patterns,
      candidate.metadata.structural_patterns
    )
    
    // Bridge = high theme overlap + high domain difference
    if (themeOverlap >= 0.5 && domainDifference >= 0.6) {
      bridges.push({
        source_chunk_id: chunk.id,
        target_chunk_id: candidate.id,
        engine: 'thematic',
        connection_type: 'cross_domain_bridge',
        raw_strength: themeOverlap,
        metadata: {
          detection_method: 'thematic_bridge',
          shared_themes: chunkThemes.filter(t => candidateThemes.includes(t)),
          domain_distance: domainDifference
        }
      })
    }
  }
  
  return bridges
}
```

**Example**:
```
"Deleuze Anti-Oedipus Notes" (philosophy)
    themes: ["desire", "capitalism", "deterritorialization"]
    ↓ cross-domain bridge: 0.92
"Biology of Ecosystems" (biology)
    themes: ["deterritorialization", "assemblages", "emergence"]

→ Same concept ("deterritorialization") in philosophy vs biology!
```

---

### Engine 3: Structural Isomorphisms

**Purpose**: Similar patterns across different domains

**Detection Method**:
```typescript
async function findStructuralIsomorphisms(chunk: Chunk) {
  const chunkPatterns = chunk.metadata.structural_patterns as string[]
  
  const { data: candidates } = await supabase
    .from('chunks')
    .select('*')
    .neq('document_id', chunk.document_id)
    .filter('metadata->structural_patterns', 'cs', `{${chunkPatterns.join(',')}}`)
  
  return candidates
    .map(candidate => {
      const candidatePatterns = candidate.metadata.structural_patterns
      const patternSimilarity = calculateJaccardSimilarity(
        new Set(chunkPatterns),
        new Set(candidatePatterns)
      )
      
      if (patternSimilarity < 0.6) return null
      
      return {
        source_chunk_id: chunk.id,
        target_chunk_id: candidate.id,
        engine: 'structural',
        connection_type: 'structural_isomorphism',
        raw_strength: patternSimilarity,
        metadata: {
          detection_method: 'structural_pattern',
          shared_patterns: chunkPatterns.filter(p => candidatePatterns.includes(p))
        }
      }
    })
    .filter(Boolean)
}
```

**Example**:
```
"Deleuze Anti-Oedipus Notes"
    patterns: ["critique", "deconstruction", "genealogical"]
    ↓ structural isomorphism: 0.85
"Derrida Of Grammatology"
    patterns: ["critique", "deconstruction", "trace-structure"]

→ Both use deconstructive methodology
```

---

### Engine 4: Contradiction Tensions

**Purpose**: Opposing ideas that create productive friction (YOUR MAX WEIGHT: 1.0)

**Detection Method**:
```typescript
async function findContradictions(chunk: Chunk) {
  const chunkTone = chunk.metadata.emotional_tone as string[]
  const chunkConcepts = chunk.metadata.key_concepts.primary
  
  // Find chunks with OPPOSITE tones
  const opposingTones = getOpposingTones(chunkTone)
  
  const { data: candidates } = await supabase
    .from('chunks')
    .select('*')
    .neq('document_id', chunk.document_id)
    .filter('metadata->emotional_tone', 'cs', `{${opposingTones.join(',')}}`)
  
  return candidates
    .map(candidate => {
      // Check if discussing SAME concept but with opposing stance
      const conceptSimilarity = calculateConceptSimilarity(
        chunkConcepts,
        candidate.metadata.key_concepts.primary
      )
      
      if (conceptSimilarity < 0.7) return null
      
      return {
        source_chunk_id: chunk.id,
        target_chunk_id: candidate.id,
        engine: 'contradiction',
        connection_type: 'contradiction',
        raw_strength: conceptSimilarity,
        metadata: {
          detection_method: 'contradiction_tension',
          tension_type: determineTensionType(chunk, candidate)
        }
      }
    })
    .filter(Boolean)
}

function getOpposingTones(tones: string[]): string[] {
  const oppositions = {
    'critical': ['affirmative', 'celebratory'],
    'skeptical': ['confident', 'assertive'],
    'deconstructive': ['constructive', 'systematic']
  }
  return tones.flatMap(tone => oppositions[tone] || [])
}
```

**Example**:
```
"Deleuze Anti-Oedipus Notes"
    concept: "desire as productive force"
    tone: ["critical", "anti-systematic"]
    ↓ contradiction: 0.88
"Lacan Seminar XI"
    concept: "desire as lack"
    tone: ["systematic", "structural"]

→ Opposing views on nature of desire - productive friction!
```

---

### Engine 5: Emotional Resonance

**Purpose**: Mood/tone matching across documents

**Detection Method**:
```typescript
async function findEmotionalResonance(chunk: Chunk) {
  const chunkTone = chunk.metadata.emotional_tone as string[]
  
  const { data: candidates } = await supabase
    .from('chunks')
    .select('id, document_id, version_id, metadata')
    .neq('document_id', chunk.document_id)
    .filter('metadata->emotional_tone', 'cs', `{${chunkTone.join(',')}}`)
  
  return candidates.map(candidate => {
    const candidateTone = candidate.metadata.emotional_tone as string[]
    const toneOverlap = calculateJaccardSimilarity(
      new Set(chunkTone),
      new Set(candidateTone)
    )
    
    return {
      source_chunk_id: chunk.id,
      target_chunk_id: candidate.id,
      engine: 'emotional',
      connection_type: 'emotional_resonance',
      raw_strength: toneOverlap,
      metadata: {
        detection_method: 'emotional_resonance',
        shared_tones: chunkTone.filter(t => candidateTone.includes(t))
      }
    }
  })
}
```

**Example**:
```
"Deleuze Anti-Oedipus Notes"
    tone: ["critical", "polemical", "provocative"]
    ↓ emotional resonance: 0.82
"Nietzsche Genealogy of Morals"
    tone: ["critical", "polemical", "subversive"]

→ Both share aggressive critical stance
```

---

### Engine 6: Methodological Echoes

**Purpose**: Similar analytical approaches (YOUR HIGH WEIGHT: 0.8)

**Detection Method**:
```typescript
async function findMethodologicalEchoes(chunk: Chunk) {
  const methodSignatures = extractMethodSignatures(chunk)
  
  const { data: candidates } = await supabase
    .from('chunks')
    .select('*')
    .neq('document_id', chunk.document_id)
  
  return candidates
    .map(candidate => {
      const candidateMethods = extractMethodSignatures(candidate)
      const methodologySimilarity = compareMethodologies(
        methodSignatures,
        candidateMethods
      )
      
      if (methodologySimilarity < 0.3) return null
      
      return {
        source_chunk_id: chunk.id,
        target_chunk_id: candidate.id,
        engine: 'methodological',
        connection_type: 'methodological_echo',
        raw_strength: methodologySimilarity,
        metadata: {
          detection_method: 'methodological_echo',
          shared_methods: methodSignatures.filter(m => candidateMethods.includes(m))
        }
      }
    })
    .filter(Boolean)
}

function extractMethodSignatures(chunk: Chunk): string[] {
  const signatures = []
  const metadata = chunk.metadata
  
  if (metadata.structural_patterns?.includes('dialectical')) {
    signatures.push('dialectical_method')
  }
  if (metadata.structural_patterns?.includes('genealogical')) {
    signatures.push('genealogical_method')
  }
  if (metadata.key_concepts?.methodology) {
    signatures.push(metadata.key_concepts.methodology)
  }
  
  return signatures
}
```

**Example**:
```
"Deleuze Anti-Oedipus Notes"
    methods: ["genealogical_method", "schizoanalysis"]
    ↓ methodological echo: 0.85
"Foucault History of Sexuality"
    methods: ["genealogical_method", "discourse_analysis"]

→ Both use genealogical critique, different domains
```

---

### Engine 7: Temporal Rhythms

**Purpose**: Narrative pattern matching (YOUR LOW WEIGHT: 0.2)

**Detection Method**:
```typescript
async function findTemporalRhythms(chunk: Chunk) {
  const rhythm = analyzeNarrativeRhythm(chunk)
  
  const { data: candidates } = await supabase
    .from('chunks')
    .select('*')
    .neq('document_id', chunk.document_id)
  
  return candidates
    .map(candidate => {
      const candidateRhythm = analyzeNarrativeRhythm(candidate)
      const rhythmSimilarity = compareRhythms(rhythm, candidateRhythm)
      
      if (rhythmSimilarity < 0.3) return null
      
      return {
        source_chunk_id: chunk.id,
        target_chunk_id: candidate.id,
        engine: 'temporal',
        connection_type: 'temporal_rhythm',
        raw_strength: rhythmSimilarity,
        metadata: {
          detection_method: 'temporal_rhythm',
          rhythm_type: rhythm.type
        }
      }
    })
    .filter(Boolean)
}

function analyzeNarrativeRhythm(chunk: Chunk): NarrativeRhythm {
  const content = chunk.content
  const sentences = content.split(/[.!?]+/)
  
  const density = chunk.themes.length / sentences.length
  
  let type: 'buildup' | 'reveal' | 'reflection' | 'argument' | 'example'
  if (content.includes('therefore') || content.includes('thus')) {
    type = 'argument'
  } else if (content.includes('for example')) {
    type = 'example'
  } else {
    type = 'reflection'
  }
  
  return { type, density, momentum: 'steady' }
}
```

**Example**:
```
"Deleuze Anti-Oedipus Notes" (chunk 23)
    rhythm: { type: 'buildup', density: 0.8, momentum: 'accelerating' }
    ↓ temporal rhythm: 0.73
"Bennett Vibrant Matter" (chunk 15)
    rhythm: { type: 'buildup', density: 0.75, momentum: 'accelerating' }

→ Both build toward theoretical climax with similar pacing
```

---

## Complete Upload-to-Connection Flow

### "Deleuze Anti-Oedipus Notes.md" - End to End

#### **Stage 1: Upload & Version Creation**

```typescript
// User uploads markdown
const file = document.querySelector('input[type="file"]').files[0]

// Server Action
async function uploadDocument(file: File, userId: string) {
  const docId = generateUUID()
  const storagePath = `${userId}/${docId}/`
  
  // 1. Create document record
  await supabase.from('documents').insert({
    id: docId,
    user_id: userId,
    title: 'Deleuze Anti-Oedipus Notes',
    source_type: 'markdown_clean'
  })
  
  // 2. Upload original
  await supabase.storage
    .from('documents')
    .upload(`${storagePath}source.md`, file)
  
  // 3. Create version v1 IMMEDIATELY
  const contentHash = await hashContent(await file.text())
  const version = await supabase.from('document_versions').insert({
    document_id: docId,
    version_number: 1,
    content_hash: contentHash,
    storage_path: `${storagePath}content-v1.md`
  }).select().single()
  
  // 4. Update document
  await supabase.from('documents').update({
    current_version_id: version.data.id,
    version_count: 1
  }).eq('id', docId)
  
  // 5. Create background job
  await supabase.from('background_jobs').insert({
    job_type: 'process_document',
    payload: { document_id: docId, version_id: version.data.id }
  })
}
```

---

#### **Stage 2: AI Thematic Fingerprinting**

```typescript
// Worker: worker/handlers/process-document.ts

async function processMarkdownWithAI(supabase, documentId, versionId, storagePath) {
  // Load markdown
  const markdown = await downloadFromStorage(`${storagePath}source.md`)
  
  // AI SEMANTIC CHUNKING with THEMATIC ANALYSIS
  const chunks = await semanticChunkingWithThemes(ai, markdown)
  
  // Example chunk output:
  {
    content: "The Oedipus complex is not universal but a specific configuration of desire produced by capitalism...",
    
    // THEMATIC FINGERPRINT:
    themes: ["oedipus-complex", "desire", "capitalism", "psychoanalysis-critique"],
    emotional_tone: ["critical", "polemical", "theoretical"],
    structural_patterns: ["critique", "deconstruction", "genealogical"],
    
    key_concepts: {
      primary: "anti-oedipal desire",
      secondary: ["capitalist coding", "psychoanalytic reductionism"],
      methodology: "schizoanalysis"
    },
    
    importance: 0.92,
    summary: "Core critique of Oedipus as historically contingent..."
  }
  
  // Result: 47 chunks with complete thematic fingerprints
}
```

---

#### **Stage 3: Embedding Generation**

```typescript
// Vercel AI SDK
import { embedMany } from 'ai'
import { google } from '@ai-sdk/google'

const { embeddings } = await embedMany({
  model: google.textEmbeddingModel('gemini-embedding-001', {
    outputDimensionality: 768
  }),
  values: chunks.map(c => c.content)
})

// Store chunks with embeddings
for (let i = 0; i < chunks.length; i++) {
  await supabase.from('chunks').insert({
    document_id: documentId,
    version_id: versionId,
    chunk_index: i,
    content: chunks[i].content,
    embedding: embeddings[i],
    themes: chunks[i].themes,
    metadata: {
      emotional_tone: chunks[i].emotional_tone,
      structural_patterns: chunks[i].structural_patterns,
      key_concepts: chunks[i].key_concepts,
      importance: chunks[i].importance,
      summary: chunks[i].summary
    }
  })
}
```

---

#### **Stage 4: 7-Engine Collision Detection**

```typescript
async function detectConnectionsForDocument(supabase, documentId, versionId) {
  const config = await getUserSynthesisConfig(userId)
  const chunks = await getChunksForVersion(documentId, versionId)
  
  const allConnections = []
  
  for (const chunk of chunks) {
    // RUN ALL 7 ENGINES IN PARALLEL
    const [
      semantic,
      thematic,
      structural,
      contradiction,
      emotional,
      methodological,
      temporal
    ] = await Promise.all([
      findSemanticMatches(chunk),
      findThematicBridges(chunk),
      findStructuralIsomorphisms(chunk),
      findContradictions(chunk),
      findEmotionalResonance(chunk),
      findMethodologicalEchoes(chunk),
      findTemporalRhythms(chunk)
    ])
    
    // Tag each connection with engine
    allConnections.push(
      ...semantic.map(c => ({ ...c, engine: 'semantic' })),
      ...thematic.map(c => ({ ...c, engine: 'thematic' })),
      ...structural.map(c => ({ ...c, engine: 'structural' })),
      ...contradiction.map(c => ({ ...c, engine: 'contradiction' })),
      ...emotional.map(c => ({ ...c, engine: 'emotional' })),
      ...methodological.map(c => ({ ...c, engine: 'methodological' })),
      ...temporal.map(c => ({ ...c, engine: 'temporal' }))
    )
  }
  
  // Store with limits (50/chunk, 10/engine)
  await storeConnectionsWithLimits(supabase, allConnections, config)
}
```

---

#### **Stage 5: Connection Storage with Limits**

```typescript
async function storeConnectionsWithLimits(
  supabase,
  connections: Connection[],
  config: SynthesisConfig
) {
  // Group by chunk
  const byChunk = groupBy(connections, 'source_chunk_id')
  
  for (const [chunkId, chunkConnections] of Object.entries(byChunk)) {
    // Apply weighted scoring (user preferences)
    const scored = chunkConnections.map(c => ({
      ...c,
      weighted_score: c.raw_strength * config.engineWeights[c.engine]
    }))
    
    // Sort by engine priority order
    const prioritized = sortByEnginePriority(scored, config.engineOrder)
    
    // Take top 50 (configurable)
    const toStore = prioritized.slice(0, config.connectionLimits.perChunk)
    
    // Insert
    await supabase.from('connections').insert(
      toStore.map(conn => ({
        user_id: config.user_id,
        source_chunk_id: conn.source_chunk_id,
        target_chunk_id: conn.target_chunk_id,
        source_version_id: conn.source_version_id,
        target_version_id: conn.target_version_id,
        source_document_id: conn.source_document_id,
        target_document_id: conn.target_document_id,
        engine: conn.engine,
        connection_type: conn.connection_type,
        raw_strength: conn.raw_strength,
        auto_detected: true,
        metadata: conn.metadata,
        created_at: new Date().toISOString()
      }))
    )
  }
  
  console.log(`✅ Stored connections for ${Object.keys(byChunk).length} chunks`)
}
```

---

#### **Stage 6: User Views Results**

**ProcessingDock** (real-time updates):
```tsx
<ProcessingDock>
  <StatusIndicator status="completed" />
  <div>
    <Label>Deleuze Anti-Oedipus Notes processed successfully</Label>
    <Stats>
      • 47 chunks created
      • 23 connections discovered across 7 engines:
        - 2 contradiction tensions (⚡ priority)
        - 5 cross-domain bridges (🌉 thematic)
        - 4 methodological echoes (🔧)
        - 4 structural isomorphisms (🏗️)
        - 6 semantic similarities (🔗)
        - 2 emotional resonances (💭)
        - 0 temporal rhythms (⏱️)
    </Stats>
  </div>
  <Button onClick={viewConnections}>View Connections →</Button>
</ProcessingDock>
```

**Right Panel** (connection display):
```tsx
<RightPanel>
  <Tabs value="connections">
    <TabsContent value="connections">
      
      {/* Contradiction Tensions (MAX PRIORITY) */}
      <Section>
        <SectionHeader>
          ⚡ Contradiction Tensions (2) - Weight: 1.0
        </SectionHeader>
        
        <ConnectionCard>
          <Badge variant="destructive">opposing views</Badge>
          <div>
            <strong>"Lacan Seminar XI"</strong>
            <p className="text-sm">
              Deleuze: desire as productive force<br/>
              Lacan: desire as lack<br/>
              → Productive philosophical friction
            </p>
            <Badge variant="outline">0.88 strength</Badge>
          </div>
          
          {/* SINGLE-KEY VALIDATION */}
          <div className="flex gap-2 mt-2">
            <kbd>v</kbd> Validate
            <kbd>r</kbd> Reject
            <kbd>s</kbd> Star
          </div>
        </ConnectionCard>
      </Section>
      
      {/* Thematic Bridges */}
      <Section>
        <SectionHeader>
          🌉 Cross-Domain Bridges (5) - Weight: 0.9
        </SectionHeader>
        
        <ConnectionCard>
          <Badge>deterritorialization</Badge>
          <div>
            <strong>"Biology of Ecosystems"</strong>
            <p className="text-sm">
              Same concept of deterritorialization in 
              biological network theory - unexpected parallel!
            </p>
            <Badge variant="outline">0.92 strength</Badge>
          </div>
        </ConnectionCard>
      </Section>
      
      {/* More sections... */}
      
    </TabsContent>
  </Tabs>
</RightPanel>
```

---

## Validation Learning System

### Phase 1: Explicit Tracking (Ship Week 6)

**Database Schema**:
```sql
CREATE TABLE connection_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES connections NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- User action
  action TEXT NOT NULL,  -- 'validated', 'rejected', 'ignored', 'starred', 'clicked'
  
  -- Rich context
  context JSONB,  -- {
                  --   reading_document_id,
                  --   time_of_day,
                  --   day_of_week,
                  --   current_mode: 'reading' | 'writing' | 'research',
                  --   time_spent_ms,
                  --   sparked,
                  --   annotated
                  -- }
  
  -- Optional "why" note
  note TEXT,
  
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

**UI Integration** (frictionless validation):
```typescript
// Keyboard handler for instant validation
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'v') recordFeedback(currentConnection, 'validated')
    if (e.key === 'r') recordFeedback(currentConnection, 'rejected')
    if (e.key === 's') recordFeedback(currentConnection, 'starred')
  }
  
  window.addEventListener('keydown', handleKeyPress)
  return () => window.removeEventListener('keydown', handleKeyPress)
}, [currentConnection])

async function recordFeedback(connection: Connection, action: string) {
  await supabase.from('connection_feedback').insert({
    connection_id: connection.id,
    user_id: userId,
    action: action,
    context: {
      reading_document_id: currentDocumentId,
      time_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
      current_mode: getCurrentMode(),  // reading/writing/research
      time_spent_ms: getTimeOnScreen(connection.id)
    }
  })
  
  // Immediate visual feedback
  toast.success(`Connection ${action}`)
}
```

**Quick Note Feature**:
```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button size="sm" variant="ghost">
      <MessageSquare className="h-3 w-3" />
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <Textarea
      placeholder="Why was this connection useful/useless?"
      onBlur={(e) => saveFeedbackNote(connection.id, e.target.value)}
    />
  </PopoverContent>
</Popover>
```

---

### Phase 2: Weight Auto-Tuning (Ship Week 8)

**Nightly Background Job**:
```typescript
async function autoTuneWeights(userId: string) {
  // Get last 30 days of feedback
  const feedback = await getRecentFeedback(userId, 30)
  
  // Calculate adjustments per engine
  const adjustments = {}
  
  for (const engine of ALL_ENGINES) {
    const engineFeedback = feedback.filter(f => f.connection.engine === engine)
    
    const validated = engineFeedback.filter(f => f.action === 'validated').length
    const rejected = engineFeedback.filter(f => f.action === 'rejected').length
    const starred = engineFeedback.filter(f => f.action === 'starred').length
    
    // Simple scoring
    const score = (validated * 1) + (starred * 2) - (rejected * 1)
    
    // Adjust weight (±0.1 per cycle)
    const currentWeight = await getUserWeight(userId, engine)
    const newWeight = Math.max(0.1, Math.min(1.0, 
      currentWeight + (score > 0 ? 0.1 : -0.1)
    ))
    
    adjustments[engine] = newWeight
  }
  
  await updateUserWeights(userId, adjustments)
  console.log(`Auto-tuned weights:`, adjustments)
}

// Cron job (nightly at 3am)
cron.schedule('0 3 * * *', () => autoTuneWeights(userId))
```

**Time-Contextual Weights**:
```sql
CREATE TABLE weight_contexts (
  user_id UUID REFERENCES auth.users,
  context TEXT NOT NULL,  -- 'writing_criticism', 'technical_research', 'morning', etc.
  engine TEXT NOT NULL,
  weight_multiplier FLOAT DEFAULT 1.0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, context, engine)
);
```

```typescript
async function getActiveWeights(userId: string) {
  const baseWeights = await getUserWeights(userId)
  const currentContext = detectContext()  // 'writing_criticism', etc.
  
  const { data: modifiers } = await supabase
    .from('weight_contexts')
    .select('*')
    .eq('user_id', userId)
    .eq('context', currentContext)
  
  // Apply multipliers
  const activeWeights = { ...baseWeights }
  for (const modifier of modifiers) {
    activeWeights[modifier.engine] *= modifier.weight_multiplier
  }
  
  return activeWeights
}
```

**Starred Behavior** (temporary boost):
```typescript
async function handleStarConnection(connection: Connection) {
  // Temporarily DOUBLE engine weight
  await supabase.from('weight_contexts').upsert({
    user_id: userId,
    context: 'starred_boost',
    engine: connection.engine,
    weight_multiplier: 2.0
  })
  
  // Expires after 24 hours
  setTimeout(() => {
    removeWeightContext(userId, 'starred_boost', connection.engine)
  }, 24 * 60 * 60 * 1000)
}
```

---

### Phase 3: Personal Model (When Bored)

**Nightly Overfitting**:
```typescript
async function trainPersonalModel(userId: string) {
  // Get last 30 days of behavior
  const trainingData = await getTrainingData(userId, 30)
  
  // Features
  const features = trainingData.map(sample => ({
    // Connection features
    engine: sample.connection.engine,
    raw_strength: sample.connection.raw_strength,
    
    // Contextual features
    time_of_day: sample.context.time_of_day,
    day_of_week: sample.context.day_of_week,
    current_mode: sample.context.current_mode,
    
    // Recent behavior
    recent_starred: getRecentStarredCount(userId, sample.timestamp),
    recent_rejected: getRecentRejectedCount(userId, sample.timestamp)
  }))
  
  // Labels (binary: useful or not)
  const labels = trainingData.map(sample => 
    sample.action === 'validated' || sample.action === 'starred' ? 1 : 0
  )
  
  // Train simple classifier
  const model = await trainClassifier(features, labels)
  
  // Save
  await saveUserModel(userId, model)
  
  console.log(`Personal model trained on ${trainingData.length} samples`)
  console.log(`Accuracy: ${calculateAccuracy(model, features, labels)}`)
}

// Cron job (nightly)
cron.schedule('0 3 * * *', () => trainPersonalModel(userId))
```

**Apply Model**:
```typescript
async function rankConnectionsWithModel(connections: Connection[], userId: string) {
  const model = await loadUserModel(userId)
  if (!model) return rankByWeights(connections, userId)
  
  const scored = await Promise.all(
    connections.map(async conn => {
      const features = extractFeatures(conn, userId)
      const modelScore = await model.predict(features)
      const weightedScore = calculateWeightedScore(conn, await getUserWeights(userId))
      
      return {
        ...conn,
        model_score: modelScore,
        weighted_score: weightedScore,
        final_score: 0.7 * modelScore + 0.3 * weightedScore  // Blend
      }
    })
  )
  
  return scored.sort((a, b) => b.final_score - a.final_score)
}
```

---

## Synthesis Configuration Panel

**Complete UI Implementation**:

```tsx
<SynthesisConfigPanel>
  <Tabs defaultValue="engines">
    
    {/* ENGINE CONFIGURATION */}
    <TabsContent value="engines">
      
      {/* Engine Order (Drag & Drop) */}
      <div>
        <Label>Detection Engine Order</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Engines run in this order. Higher priority = more connections stored.
        </p>
        
        <DragDropContext onDragEnd={handleReorder}>
          <Droppable droppableId="engines">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {engineOrder.map((engine, index) => (
                  <Draggable key={engine} draggableId={engine} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-2"
                      >
                        <GripVertical className="h-4 w-4" />
                        
                        <div className="flex-1">
                          <div className="font-medium">{ENGINE_NAMES[engine]}</div>
                          <div className="text-xs text-muted-foreground">
                            {ENGINE_DESCRIPTIONS[engine]}
                          </div>
                        </div>
                        
                        <Badge variant="outline">
                          Weight: {weights[engine].toFixed(1)}
                        </Badge>
                        
                        <Switch
                          checked={enabledEngines.includes(engine)}
                          onCheckedChange={(enabled) => toggleEngine(engine, enabled)}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
      
      {/* Engine Weights (Live Tuning) */}
      <div>
        <Label>Engine Weights (Live Tuning)</Label>
        {engineOrder.map(engine => (
          <WeightSlider
            key={engine}
            engine={engine}
            value={weights[engine]}
            onChange={(value) => updateWeight(engine, value)}
            livePreview={true}
          />
        ))}
      </div>
      
      {/* Quick Presets */}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => loadPreset('max-friction')}>
          Max Friction
        </Button>
        <Button size="sm" onClick={() => loadPreset('thematic-focus')}>
          Thematic Focus
        </Button>
        <Button size="sm" onClick={() => loadPreset('chaos')}>
          Chaos Mode
        </Button>
      </div>
      
    </TabsContent>
    
    {/* CONNECTION LIMITS */}
    <TabsContent value="limits">
      <div>
        <Label>Max Connections Per Chunk</Label>
        <Slider
          value={[limits.perChunk]}
          onValueChange={([value]) => updateLimit('perChunk', value)}
          min={10}
          max={200}
          step={10}
        />
        <p className="text-xs text-muted-foreground">
          Current: {limits.perChunk} (default: 50)
        </p>
      </div>
    </TabsContent>
    
    {/* CHAOS MODE */}
    <TabsContent value="chaos">
      <div className="flex items-center justify-between">
        <Label>Enable Chaos Mode</Label>
        <Switch
          checked={chaosMode.enabled}
          onCheckedChange={(enabled) => updateChaosMode({ ...chaosMode, enabled })}
        />
      </div>
      
      {chaosMode.enabled && (
        <>
          <div>
            <Label>Notification Interval (minutes)</Label>
            <Slider
              value={[chaosMode.intervalMinutes]}
              onValueChange={([value]) => 
                updateChaosMode({ ...chaosMode, intervalMinutes: value })
              }
              min={15}
              max={240}
              step={15}
            />
          </div>
          
          <div>
            <Label>Minimum Connection Strength</Label>
            <Slider
              value={[chaosMode.minStrength]}
              onValueChange={([value]) => 
                updateChaosMode({ ...chaosMode, minStrength: value })
              }
              min={0.5}
              max={1.0}
              step={0.05}
            />
          </div>
        </>
      )}
    </TabsContent>
    
    {/* LEARNING STATS */}
    <TabsContent value="learning">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Validated</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {learningStats.validated}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader><CardTitle>Rejected</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {learningStats.rejected}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Weight adjustments */}
      <div>
        <Label>Auto-Tuned Weights (Last 30 Days)</Label>
        {Object.entries(weightAdjustments).map(([engine, adjustment]) => (
          <div key={engine} className="flex justify-between text-sm py-1">
            <span>{ENGINE_NAMES[engine]}</span>
            <span className={adjustment > 0 ? "text-green-600" : "text-red-600"}>
              {adjustment > 0 ? '+' : ''}{adjustment.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      
      {/* Personal model status */}
      {personalModel && (
        <Alert>
          <Brain className="h-4 w-4" />
          <AlertTitle>Personal Model Active</AlertTitle>
          <AlertDescription>
            Trained on {personalModel.trainingSamples} samples<br/>
            Accuracy: {(personalModel.accuracy * 100).toFixed(1)}%
          </AlertDescription>
        </Alert>
      )}
      
      <Button onClick={retrainModel} className="w-full">
        Retrain Model Now
      </Button>
    </TabsContent>
    
  </Tabs>
</SynthesisConfigPanel>
```

---

## Obsidian Bidirectional Sync

### Companion Section Pattern

**Sync Function**:
```typescript
async function syncToObsidian(documentId: string) {
  const markdown = await downloadFromStorage(`${storagePath}/content.md`)
  const connections = await getStrongConnections(documentId, { minStrength: 0.8 })
  const threads = await getDocumentThreads(documentId)
  
  // Build companion section
  const companionSection = `
---
## Rhizome Connections
<!-- AUTO-GENERATED - DO NOT EDIT BELOW THIS LINE -->

### Strong Connections (${connections.length})
${connections.map(conn => {
  const targetDoc = conn.target_document
  const strength = conn.strength.toFixed(2)
  const icon = CONNECTION_ICONS[conn.connection_type]
  
  return `- [[${targetDoc.title}]] - (${strength}) ${icon} ${formatConnectionType(conn.connection_type)}`
}).join('\n')}

### Active Threads (${threads.length})
${threads.map(thread => `- [[Thread - ${thread.name}]]`).join('\n')}

### Metadata
- **Rhizome ID**: \`${documentId}\`
- **Connections**: ${connections.length}
- **Importance**: ${document.importance_score?.toFixed(2) || 'N/A'}
- **Last Synced**: ${new Date().toISOString()}
`
  
  const finalMarkdown = mergeCompanionSection(markdown, companionSection)
  await writeToObsidian(document.title, finalMarkdown)
}

const CONNECTION_ICONS = {
  'contradiction': '⚡',
  'cross_domain_bridge': '🌉',
  'structural_isomorphism': '🏗️',
  'similar': '🔗',
  'emotional_resonance': '💭',
  'methodological_echo': '🔧',
  'temporal_rhythm': '⏱️'
}
```

**Example Output**:
```markdown
---
title: Deleuze Anti-Oedipus Notes
---

# Deleuze & Guattari - Anti-Oedipus

[Your actual notes...]

---
## Rhizome Connections
<!-- AUTO-GENERATED - DO NOT EDIT BELOW THIS LINE -->

### Strong Connections (5)
- [[Biology of Ecosystems]] - (0.92) 🌉 Cross-domain bridge: Rhizomatic structures
- [[Lacan Seminar XI]] - (0.88) ⚡ CONTRADICTION: Desire as productive vs lack
- [[Guattari Chaosmosis]] - (0.85) 🔧 Methodological echo: Schizoanalytic method
- [[Actor-Network Theory]] - (0.82) 🌉 Cross-domain bridge: Heterogeneous assemblages
- [[Foucault Discipline & Punish]] - (0.79) 🔗 Similar: Critique of psychoanalytic subject

### Active Threads (2)
- [[Thread - Assemblage Theory Exploration]]
- [[Thread - Critique of Psychoanalysis]]

### Metadata
- **Rhizome ID**: `a1b2c3d4-...`
- **Connections**: 47
- **Importance**: 0.87
- **Last Synced**: 2025-01-28T15:30:00Z
```

**Benefits**:
- **Obsidian Graph View**: Wikilinks create visual graph
- **Click-through**: Navigate to connected docs
- **Searchable**: Connection metadata searchable in Obsidian
- **No Breaking**: Doesn't interfere with Obsidian parser

---

## Database Schema

### Core Tables

```sql
-- User synthesis configuration
CREATE TABLE user_synthesis_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  
  engine_weights JSONB NOT NULL DEFAULT '{
    "semantic": 0.3,
    "thematic": 0.9,
    "structural": 0.7,
    "contradiction": 1.0,
    "emotional": 0.4,
    "methodological": 0.8,
    "temporal": 0.2
  }',
  
  engine_order JSONB NOT NULL DEFAULT '["contradiction", "thematic", "methodological", "structural", "semantic", "emotional", "temporal"]',
  
  enabled_engines JSONB NOT NULL DEFAULT '["semantic", "thematic", "structural", "contradiction", "emotional", "methodological", "temporal"]',
  
  connection_limits JSONB NOT NULL DEFAULT '{
    "perChunk": 50,
    "perDocument": null,
    "perEngine": 10
  }',
  
  chaos_mode JSONB NOT NULL DEFAULT '{
    "enabled": false,
    "intervalMinutes": 60,
    "minStrength": 0.8
  }',
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connections (complete schema from annotation brainstorm)
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Hybrid referencing
  source_chunk_id UUID REFERENCES chunks,
  target_chunk_id UUID REFERENCES chunks,
  source_entity_id UUID REFERENCES entities,
  target_entity_id UUID REFERENCES entities,
  
  -- Version tracking
  source_version_id UUID REFERENCES document_versions,
  target_version_id UUID REFERENCES document_versions,
  source_document_id UUID REFERENCES documents,
  target_document_id UUID REFERENCES documents,
  
  -- NEW: Engine identification
  engine TEXT NOT NULL,  -- Which engine detected this
  connection_type TEXT NOT NULL,
  raw_strength FLOAT NOT NULL,  -- Unweighted strength
  
  -- Categorization
  auto_detected BOOLEAN DEFAULT TRUE,
  user_validated BOOLEAN,  -- NULL = not reviewed
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_created BOOLEAN DEFAULT FALSE,
  is_historical BOOLEAN DEFAULT FALSE,
  
  -- Migration tracking
  migrated_from_version INTEGER,
  migration_confidence FLOAT,
  superseded_by_version UUID REFERENCES document_versions,
  
  -- Thread support
  thread_id UUID REFERENCES entities,
  thread_order INTEGER,
  
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connection feedback (learning system)
CREATE TABLE connection_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES connections NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  
  action TEXT NOT NULL,  -- 'validated', 'rejected', 'ignored', 'starred', 'clicked'
  context JSONB,  -- Rich context
  note TEXT,
  
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Weight contexts (time/mode-specific)
CREATE TABLE weight_contexts (
  user_id UUID REFERENCES auth.users,
  context TEXT NOT NULL,
  engine TEXT NOT NULL,
  weight_multiplier FLOAT DEFAULT 1.0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, context, engine)
);

-- Personal models
CREATE TABLE user_models (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  model_data JSONB NOT NULL,
  training_samples INTEGER,
  accuracy FLOAT,
  trained_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1
);
```

### Indexes

```sql
-- Connection indexes
CREATE INDEX idx_connections_engine ON connections(engine);
CREATE INDEX idx_connections_type ON connections(connection_type);
CREATE INDEX idx_connections_strength ON connections(raw_strength);
CREATE INDEX idx_connections_validated ON connections(user_validated);
CREATE INDEX idx_connections_source_chunk ON connections(source_chunk_id);
CREATE INDEX idx_connections_target_chunk ON connections(target_chunk_id);
CREATE INDEX idx_connections_source_entity ON connections(source_entity_id);
CREATE INDEX idx_connections_target_entity ON connections(target_entity_id);
CREATE INDEX idx_connections_historical ON connections(is_historical) WHERE is_historical = false;
CREATE INDEX idx_connections_user_active ON connections(user_id, is_historical) WHERE is_historical = false;
CREATE INDEX idx_connections_engine_strength ON connections(engine, raw_strength);

-- Feedback indexes
CREATE INDEX idx_feedback_connection ON connection_feedback(connection_id);
CREATE INDEX idx_feedback_user_action ON connection_feedback(user_id, action);
CREATE INDEX idx_feedback_timestamp ON connection_feedback(timestamp DESC);

-- Context indexes
CREATE INDEX idx_weight_contexts_user ON weight_contexts(user_id, context);
```

---

## Implementation Timeline

### **Week 5: Connection System - Phase 1**
**Duration**: 7 days

**Day 1-2**: 7-Engine Implementation
- [ ] Implement all 7 detection engines
- [ ] Parallel execution pipeline
- [ ] Connection storage with limits

**Day 3-4**: Synthesis Config Panel
- [ ] Engine order drag-and-drop
- [ ] Live weight tuning with preview
- [ ] Connection limit configuration
- [ ] Chaos mode setup

**Day 5-6**: Right Panel Display
- [ ] Connection categorization by engine
- [ ] Weighted scoring display
- [ ] Single-key validation (v/r/s)
- [ ] Connection card UI

**Day 7**: Testing & Polish
- [ ] Test all 7 engines
- [ ] Validate connection storage
- [ ] UI polish

**Deliverables**:
- ✅ 7 engines detecting connections
- ✅ Configurable synthesis panel
- ✅ Connection display in right panel
- ✅ Single-key validation

---

### **Week 6: Learning System - Phase 1**
**Duration**: 7 days

**Day 1-2**: Explicit Tracking
- [ ] connection_feedback table
- [ ] Keyboard validation handlers
- [ ] Rich context capture
- [ ] Quick note feature

**Day 3-4**: Validation Dashboard
- [ ] Stats display (validated/rejected/starred)
- [ ] Feedback history
- [ ] Context analysis

**Day 5-7**: Testing
- [ ] Validate feedback capture
- [ ] Test context gathering
- [ ] UI polish

**Deliverables**:
- ✅ Frictionless validation (v/r/s keys)
- ✅ Rich context capture
- ✅ Validation dashboard

---

### **Week 7: Obsidian Bidirectional Sync**
**Duration**: 7 days

**Day 1-2**: Companion Section
- [ ] Sync function implementation
- [ ] Wikilink generation
- [ ] Connection formatting
- [ ] Thread inclusion

**Day 3-4**: Sync Service
- [ ] File watching (Obsidian vault)
- [ ] Conflict resolution
- [ ] Incremental sync

**Day 5-7**: Testing
- [ ] Test with real Obsidian vault
- [ ] Validate graph integration
- [ ] UI polish

**Deliverables**:
- ✅ Companion section in Obsidian files
- ✅ Wikilinks for graph view
- ✅ Bidirectional sync

---

### **Week 8: Learning System - Phase 2**
**Duration**: 7 days

**Day 1-3**: Weight Auto-Tuning
- [ ] Nightly tuning job
- [ ] Context-specific weights
- [ ] Starred boost behavior

**Day 4-5**: Tuning Dashboard
- [ ] Show weight adjustments
- [ ] Context management
- [ ] Manual override

**Day 6-7**: Testing
- [ ] Validate auto-tuning
- [ ] Test context detection

**Deliverables**:
- ✅ Nightly weight auto-tuning
- ✅ Context-specific weights
- ✅ Tuning dashboard

---

### **Phase 3 (When Bored): Personal Model**
**Duration**: Variable

- [ ] Training pipeline
- [ ] Feature extraction
- [ ] Model storage
- [ ] Blend with weighted scoring

**Deliverable**:
- ✅ Personal model trained nightly

---

## Success Criteria

### Connection Detection

**Coverage**:
- ✅ All 7 engines implemented
- ✅ Parallel execution (<5s per document)
- ✅ Store 50 connections/chunk (configurable)
- ✅ Cross-domain bridges detected (thematic engine)
- ✅ Contradictions detected (contradiction engine)

**Quality**:
- ✅ Weighted scoring with user preferences
- ✅ Engine ordering configurable
- ✅ Real-time weight adjustment

---

### Validation Learning

**Phase 1**:
- ✅ Single-key validation (v/r/s)
- ✅ Rich context capture (time, mode, document)
- ✅ Quick note feature

**Phase 2**:
- ✅ Nightly auto-tuning
- ✅ Context-specific weights
- ✅ Starred boost (24h)

**Phase 3**:
- ✅ Personal model trained nightly
- ✅ 70/30 blend (model/weights)
- ✅ Accuracy tracking

---

### Obsidian Integration

**Sync**:
- ✅ Companion section generated
- ✅ Wikilinks for graph view
- ✅ Connection icons and types
- ✅ Thread inclusion

**Quality**:
- ✅ No breaking Obsidian parser
- ✅ Searchable metadata
- ✅ Click-through navigation

---

### User Experience

**Frictionless Validation**:
- ✅ Single keypress (v/r/s)
- ✅ <100ms response time
- ✅ Immediate visual feedback

**Configuration**:
- ✅ Real-time weight adjustment
- ✅ Live preview of impact
- ✅ Preset configurations

**Discovery**:
- ✅ Cross-domain bridges surfaced
- ✅ Contradictions prioritized
- ✅ Chaos mode notifications

---

## Key Takeaways

1. **7-engine system is the core innovation** - Semantic + 6 specialized detectors
2. **Store everything, surface intelligently** - 50/chunk cap, weighted display-time scoring
3. **Learning system is 3-phase** - Explicit → Auto-tune → Personal model
4. **Obsidian companion section** - Wikilinks enable graph integration
5. **Chaos mode for serendipity** - Random connections as notifications
6. **Configurable everything** - Engine order, weights, limits all adjustable
7. **Personal tool philosophy** - No compromises, no product thinking

---

## Action Items

### Immediate (Week 5)
1. [ ] Begin 7-engine implementation
2. [ ] Build synthesis config panel
3. [ ] Test connection detection pipeline

### Week 6
1. [ ] Implement validation tracking
2. [ ] Build validation dashboard
3. [ ] Test feedback capture

### Week 7
1. [ ] Build Obsidian sync service
2. [ ] Test companion section
3. [ ] Validate graph integration

### Week 8
1. [ ] Implement auto-tuning
2. [ ] Build tuning dashboard
3. [ ] Test context detection

---

**Session Completed**: 2025-01-28  
**Status**: ✅ Ready for Implementation  
**Next Step**: Begin 7-Engine Implementation (Week 5)

---

*This comprehensive brainstorming session established the complete architecture for a personal connection synthesis engine with 7 parallel detection engines, 3-phase validation learning, configurable synthesis, and bidirectional Obsidian sync. The system is designed as a cognitive prosthetic optimized for aggressive connection discovery and serendipitous insights.*