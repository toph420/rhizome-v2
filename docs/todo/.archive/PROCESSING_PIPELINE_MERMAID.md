# Rhizome V2 Processing Pipeline (Visual Guide)

**Last Updated:** 2025-10-05

A visual guide to how documents flow through the Rhizome system, from upload to connection detection.

---

## Table of Contents
1. [Complete Pipeline Overview](#complete-pipeline-overview)
2. [Stage 1: Document Ingestion](#stage-1-document-ingestion)
3. [Stage 2: Content Extraction](#stage-2-content-extraction)
4. [Stage 2.5: Obsidian Integration](#stage-25-obsidian-integration)
5. [Stage 3: Semantic Chunking](#stage-3-semantic-chunking)
6. [Stage 4: Embedding Generation](#stage-4-embedding-generation)
7. [Stage 5: Connection Detection](#stage-5-connection-detection)
8. [Reader Experience](#reader-experience)
9. [Error Handling & Fallbacks](#error-handling--fallbacks)

---

## Complete Pipeline Overview

```mermaid
flowchart TD
    Start([Document Upload]) --> Input{Input Type}

    Input -->|PDF| PDF[PDFProcessor]
    Input -->|YouTube| YT[YouTubeProcessor]
    Input -->|Web URL| Web[WebProcessor]
    Input -->|Markdown| MD[MarkdownProcessor]
    Input -->|Text/Paste| Text[TextProcessor]

    PDF --> Extract[Content Extraction]
    YT --> Extract
    Web --> Extract
    MD --> Extract
    Text --> Extract

    Extract --> Review{Review Before<br/>Chunking?}

    Review -->|No| Chunk[Semantic Chunking<br/>AI-Powered]
    Review -->|Yes| Export[Export to Obsidian<br/>Simple Placeholder Chunks]

    Export --> Edit[User Edits in Obsidian<br/>Fix Formatting]
    Edit --> Continue[Continue Processing<br/>Sync + AI Chunking]
    Continue --> Chunk

    Chunk --> Size{Chunk Size<br/>Valid?}
    Size -->|> 10K chars| Split[Auto-Split<br/>at Paragraphs]
    Split --> Fuzzy
    Size -->|≤ 10K chars| Fuzzy[Offset Correction<br/>Fuzzy Matching]

    Fuzzy --> Dedup[Deduplication]
    Dedup --> Embed[Embedding Generation<br/>768d vectors]

    Embed --> Connect[Connection Detection<br/>3-Engine System]

    Connect --> Engine1[Engine 1:<br/>Semantic Similarity]
    Connect --> Engine2[Engine 2:<br/>Contradiction Detection]
    Connect --> Engine3[Engine 3:<br/>Thematic Bridge]

    Engine1 --> Orch[Orchestrator<br/>Score Aggregation]
    Engine2 --> Orch
    Engine3 --> Orch

    Orch --> Store[(Store Connections<br/>PostgreSQL)]
    Store --> Reader[Reader Experience<br/>Viewport Tracking]

    style Start fill:#e1f5e1
    style Reader fill:#e1f5e1
    style Chunk fill:#fff4e6
    style Connect fill:#e3f2fd
    style Orch fill:#f3e5f5
```

---

## Stage 1: Document Ingestion

### Input Methods

```mermaid
graph LR
    A[Document Upload] --> B{Source Type}

    B -->|PDF File| C[PDFProcessor]
    B -->|YouTube URL| D[YouTubeProcessor]
    B -->|Web URL| E[WebProcessor]
    B -->|Markdown File| F[MarkdownProcessor]
    B -->|Plain Text| G[TextProcessor]
    B -->|Paste Content| H[TextProcessor]

    C --> I[Gemini Files API]
    D --> J[YouTube Transcript API]
    E --> K[Jina Reader API]
    F --> L{Clean or As-Is?}
    G --> M[Direct Storage]
    H --> M

    I --> N[Clean Markdown]
    J --> O[Enhanced Markdown<br/>+ Timestamps]
    K --> P[Article Markdown]
    L -->|Clean| Q[AI Cleaning]
    L -->|As-Is| R[Direct Storage]

    N --> S[(Supabase Storage)]
    O --> S
    P --> S
    Q --> S
    R --> S
    M --> S

    style A fill:#e1f5e1
    style S fill:#bbdefb
```

### Storage Strategy

```mermaid
erDiagram
    SUPABASE_STORAGE ||--o{ DOCUMENTS : contains
    DOCUMENTS ||--|| METADATA : has

    SUPABASE_STORAGE {
        string path "user_id/document_id/source.ext"
        string content_path "user_id/document_id/content.md"
    }

    DOCUMENTS {
        uuid id PK
        uuid user_id FK
        string title
        string source_type
        string source_url
        string storage_path
    }

    METADATA {
        uuid document_id FK
        string processing_stage
        jsonb metadata
        timestamp created_at
    }
```

---

## Stage 2: Content Extraction

```mermaid
sequenceDiagram
    participant Doc as Document
    participant Proc as Processor
    participant API as External API
    participant AI as Gemini AI
    participant Store as Storage

    Doc->>Proc: Upload document

    alt PDF Processing
        Proc->>API: Upload to Gemini Files API
        API->>AI: Extract structure
        AI->>Proc: Clean markdown
    else YouTube Processing
        Proc->>API: Fetch transcript
        API->>Proc: Raw transcript
        Proc->>AI: Enhance structure
        AI->>Proc: Markdown + timestamps
    else Web Processing
        Proc->>API: Jina Reader API
        API->>Proc: Clean article markdown
    else Markdown/Text
        Proc->>Proc: Optional AI cleaning
    end

    Proc->>Store: Save markdown
    Store-->>Proc: Storage URL
```

---

## Stage 2.5: Obsidian Integration

### Pre-Chunking Review Workflow

```mermaid
flowchart TD
    Start[Upload Document] --> Check{Review Before<br/>Chunking?}

    Check -->|No ✗| Direct[Direct to AI Chunking<br/>Cost: ~$0.20]
    Check -->|Yes ✓| Extract[PDF/EPUB Extraction<br/>Generate Clean Markdown]

    Extract --> Simple[Simple Heading-Based Chunking<br/>FREE - No AI Cost]
    Simple --> Export[Export to Obsidian Vault<br/>Open in Obsidian via URI]

    Export --> Status[Document Status:<br/>awaiting_manual_review]

    Status --> UserEdit[User Edits Markdown<br/>Fix formatting, headers, tables]

    UserEdit --> Continue[Click "Continue Processing"]
    Continue --> Sync[Sync Edited Markdown<br/>from Obsidian]

    Sync --> AIChunk[AI Chunking on<br/>EDITED Markdown<br/>Cost: ~$0.20]

    Direct --> Embeddings[Embeddings + Connections]
    AIChunk --> Embeddings

    style Check fill:#fff4e6
    style Simple fill:#c8e6c9
    style AIChunk fill:#fff4e6
    style UserEdit fill:#e3f2fd

    Note1[Cost Savings:<br/>❌ Old: AI chunk → discard → AI chunk = $0.40<br/>✅ New: Simple chunk → AI chunk edited = $0.20]
    style Note1 fill:#c8e6c9
```

### Post-Completion Obsidian Sync

```mermaid
sequenceDiagram
    participant User
    participant Doc as Document Reader
    participant Obs as Obsidian
    participant Worker as Worker Process
    participant DB as Database

    User->>Doc: Click "Sync from Obsidian"
    Doc->>Worker: Trigger obsidian-sync job

    Worker->>Obs: Read edited markdown from vault
    Worker->>Worker: Compare with stored version

    alt No Changes
        Worker->>DB: Update status (no reprocessing)
        Worker->>User: "No changes detected"
    else Changes Detected
        Worker->>DB: Upload edited markdown to storage
        Worker->>Worker: Mark old chunks is_current=false
        Worker->>Worker: Create new chunks (AI)
        Worker->>Worker: Recover annotations (fuzzy matching)
        Worker->>Worker: Remap connections to new chunks
        Worker->>DB: Commit changes, delete old chunks
        Worker->>User: Recovery stats (success/review/lost)
    end

    Note over Worker,DB: Annotation Recovery:<br/>90-100% for minor edits<br/>70-90% for moderate edits<br/>50-70% for major rewrites
```

### Obsidian Export Flow

```mermaid
flowchart LR
    Doc[Document] --> Export{Export Type}

    Export -->|Markdown Only| MD[Write .md to vault]
    Export -->|With Annotations| Both[Write .md + .annotations.json]

    MD --> URI1[Generate obsidian:// URI<br/>vault + filepath]
    Both --> URI2[Generate obsidian:// URI<br/>vault + filepath]

    URI1 --> Open1[Open in Obsidian<br/>via iframe protocol]
    URI2 --> Open2[Open in Obsidian<br/>via iframe protocol]

    Open1 --> Save1[Update obsidian_path in DB]
    Open2 --> Save2[Update obsidian_path in DB]

    style MD fill:#e3f2fd
    style Both fill:#fff4e6
    style Open2 fill:#c8e6c9
```

### Why Use Obsidian Integration?

```mermaid
mindmap
  root((Obsidian<br/>Integration))
    Pre-Chunking Review
      Fix extraction errors early
      Clean markdown before AI
      No annotation recovery needed
      Save $0.20 per document
    Post-Completion Sync
      Edit content after reading
      Annotation recovery 70-100%
      Connection remapping automatic
      Bidirectional sync
    Export Features
      Markdown export
      Optional annotations .json
      Direct vault integration
      Advanced URI protocol
    Cost Benefits
      Avoid double AI chunking
      Fix issues before embeddings
      Higher quality chunks
      Better connection detection
```

---

## Stage 3: Semantic Chunking

### Complete Chunking Flow

```mermaid
flowchart TD
    Start[Markdown Content] --> Batch[Create Batches<br/>~100K chars each<br/>2K overlap]

    Batch --> AI[AI Chunking<br/>Gemini 2.5 Flash]

    AI --> Schema{Valid<br/>Schema?}
    Schema -->|Invalid| Error1[Error: Invalid structure]
    Schema -->|Valid| Size{Chunk<br/>Size?}

    Size -->|> 10K chars| Auto[Auto-Split Oversized<br/>at Paragraph Boundaries]
    Size -->|≤ 10K chars| Valid[Structurally Valid Chunks]

    Auto --> Split[Split into 2-4 parts<br/>Preserve metadata<br/>Use -1 placeholder offsets]
    Split --> Fuzzy
    Valid --> Fuzzy[Fuzzy Offset Correction<br/>3-Tier Strategy]

    Fuzzy --> Tier1{Exact<br/>Match?}
    Tier1 -->|Yes| Exact[Confidence: 1.0]
    Tier1 -->|No| Tier2{Trigram<br/>≥75%?}

    Tier2 -->|Yes| Fuzz[Fuzzy Match<br/>Confidence: 0.75-0.99]
    Tier2 -->|No| Approx[Approximate Position<br/>Confidence: 0.3]

    Exact --> Validate
    Fuzz --> Validate
    Approx --> Validate

    Validate{Post-Correction<br/>Valid?}
    Validate -->|>20% failed| Error2[Reject Batch<br/>Trigger Retry]
    Validate -->|≤20% failed| Dedup[Deduplication<br/>Remove Overlaps]

    Error1 --> Retry{Retry<br/>Count?}
    Error2 --> Retry
    Retry -->|< 3| AI
    Retry -->|≥ 3| Fallback[Regex Fallback<br/>~1500 char chunks]

    Dedup --> Done[Chunks Complete<br/>Accurate Offsets + Metadata]
    Fallback --> Done

    style Start fill:#e1f5e1
    style Done fill:#e1f5e1
    style AI fill:#fff4e6
    style Auto fill:#ffebee
    style Fuzzy fill:#e3f2fd
    style Fallback fill:#ffccbc
```

### Fuzzy Matching Strategies

```mermaid
flowchart LR
    Input[Chunk Content] --> Strategy1[Strategy 1:<br/>Exact Match]

    Strategy1 --> Check1{Found?}
    Check1 -->|Yes| Result1[Offset: exact position<br/>Confidence: 1.0]
    Check1 -->|No| Strategy2[Strategy 2:<br/>Trigram Fuzzy]

    Strategy2 --> Trigram[Generate 3-char windows<br/>Calculate Jaccard similarity]
    Trigram --> Check2{Similarity<br/>≥ 75%?}
    Check2 -->|Yes| Result2[Offset: fuzzy position<br/>Confidence: 0.75-0.99]
    Check2 -->|No| Strategy3[Strategy 3:<br/>Approximate Position]

    Strategy3 --> Calc[Use chunk index<br/>Chunk 5/10 → 50% through doc]
    Calc --> Result3[Offset: estimated position<br/>Confidence: 0.3]

    Result1 --> Output[Corrected Chunk]
    Result2 --> Output
    Result3 --> Output

    style Strategy1 fill:#c8e6c9
    style Strategy2 fill:#fff9c4
    style Strategy3 fill:#ffccbc
    style Output fill:#e1f5e1
```

### Chunk Metadata Structure

```mermaid
classDiagram
    class ChunkWithOffsets {
        +string content
        +number start_offset
        +number end_offset
        +AIChunkMetadata metadata
    }

    class AIChunkMetadata {
        +string[] themes
        +Concept[] concepts
        +number importance
        +string summary
        +string domain
        +Emotional emotional
    }

    class Concept {
        +string text
        +number importance
    }

    class Emotional {
        +number polarity
        +string primaryEmotion
        +number intensity
    }

    ChunkWithOffsets --> AIChunkMetadata
    AIChunkMetadata --> Concept
    AIChunkMetadata --> Emotional
```

---

## Stage 4: Embedding Generation

```mermaid
flowchart TD
    Chunks[Chunks from Stage 3] --> Batch[Batch Processing<br/>100 chunks/batch]

    Batch --> Model[Google AI<br/>text-embedding-004<br/>768 dimensions]

    Model --> Embed[Generate Embeddings]

    Embed --> Store[(PostgreSQL + pgvector<br/>CREATE EXTENSION vector)]

    Store --> Index[Create HNSW Index<br/>Fast Similarity Search]

    Index --> Done[Embeddings Complete]

    style Chunks fill:#e3f2fd
    style Model fill:#fff4e6
    style Store fill:#bbdefb
    style Done fill:#e1f5e1
```

---

## Stage 5: Connection Detection

### 3-Engine Architecture

```mermaid
graph TD
    Start[Document Chunks] --> Orch[Orchestrator]

    Orch --> E1[Engine 1:<br/>Semantic Similarity<br/>Weight: 0.25]
    Orch --> E2[Engine 2:<br/>Contradiction Detection<br/>Weight: 0.40]
    Orch --> E3[Engine 3:<br/>Thematic Bridge<br/>Weight: 0.35]

    E1 --> Method1[Vector Search<br/>pgvector cosine distance<br/>No AI calls]
    E2 --> Method2[Metadata Analysis<br/>Concept + polarity matching<br/>No AI calls]
    E3 --> Method3[AI Analysis<br/>Cross-domain bridges<br/>~200 AI calls/doc]

    Method1 --> Score1[Similarity Scores<br/>0.7-1.0]
    Method2 --> Score2[Tension Scores<br/>0.0-1.0]
    Method3 --> Score3[Bridge Scores<br/>0.0-1.0]

    Score1 --> Agg[Score Aggregation]
    Score2 --> Agg
    Score3 --> Agg

    Agg --> Weight[Apply User Weights<br/>weighted_sum = Σ(score × weight)]

    Weight --> Norm[Normalize<br/>Softmax/Linear/Sigmoid]

    Norm --> Filter{Score ≥<br/>Threshold?}
    Filter -->|No| Discard[Discard Connection]
    Filter -->|Yes| Save[(Save to Database)]

    Save --> Done[Connections Complete]

    style E1 fill:#e3f2fd
    style E2 fill:#ffebee
    style E3 fill:#fff4e6
    style Orch fill:#f3e5f5
    style Done fill:#e1f5e1
```

### Engine 1: Semantic Similarity

```mermaid
sequenceDiagram
    participant Chunk as Source Chunk
    participant Vector as Vector Store
    participant DB as PostgreSQL
    participant Result as Connection

    Chunk->>Chunk: Get embedding (768d)
    Chunk->>Vector: Query similar embeddings

    Vector->>DB: SELECT * FROM chunks<br/>ORDER BY embedding <=> query<br/>LIMIT 50

    DB->>Vector: Top 50 similar chunks
    Vector->>Vector: Filter: similarity ≥ 0.7
    Vector->>Vector: Filter: cross-document only

    Vector->>Result: Return connections<br/>with strength scores

    Note over Result: Example:<br/>Similarity 0.85<br/>"surveillance state" ↔ "Big Brother"
```

### Engine 2: Contradiction Detection

```mermaid
flowchart TD
    Chunk[Source Chunk] --> Extract1[Extract Concepts<br/>surveillance, privacy, freedom]
    Extract1 --> Extract2[Extract Polarity<br/>+0.8 positive]

    Extract2 --> Find[Find Chunks with:<br/>1. Same concepts 50%+<br/>2. Opposite polarity]

    Find --> Match1[Match Found:<br/>Concepts: surveillance, privacy<br/>Polarity: -0.7 negative]

    Match1 --> Score[Calculate Strength<br/>concept_overlap × polarity_diff]

    Score --> Result[Contradiction Strength: 0.92]

    style Chunk fill:#e3f2fd
    style Find fill:#fff4e6
    style Result fill:#ffebee

    Note1[Example:<br/>Fiction: Dystopian surveillance -0.7<br/>Tech: Protective surveillance +0.8<br/>→ Same topic, opposite stance]
    style Note1 fill:#fff9c4
```

### Engine 3: Thematic Bridge

```mermaid
flowchart TD
    All[All Chunks] --> Filter1[Filter 1:<br/>Importance > 0.6]
    Filter1 --> Filter2[Filter 2:<br/>Cross-document only]
    Filter2 --> Filter3[Filter 3:<br/>Different domains]
    Filter3 --> Filter4[Filter 4:<br/>Share ≥1 concept]

    Filter4 --> Count[Result:<br/>~200 candidate pairs<br/>not 145,924!]

    Count --> AI[AI Analysis<br/>for each pair]

    AI --> Prompt["Prompt:<br/>Do these discuss related<br/>concepts across domains?"]

    Prompt --> Response{AI Response}

    Response -->|Yes| Bridge[Detected: true<br/>Strength: 0.78<br/>Bridge concept: control systems]
    Response -->|No| Skip[No connection]

    Bridge --> Save[Save Connection]

    style Filter4 fill:#fff4e6
    style AI fill:#e3f2fd
    style Bridge fill:#c8e6c9

    Note1[Example:<br/>Literary: Pynchon's paranoia<br/>Tech: Algorithmic surveillance<br/>→ Both discuss invisible control]
    style Note1 fill:#fff9c4
```

### Orchestrator Score Aggregation

```mermaid
flowchart LR
    E1[Engine 1<br/>Score: 0.85] --> Collect
    E2[Engine 2<br/>Score: 0.92] --> Collect
    E3[Engine 3<br/>Score: 0.78] --> Collect

    Collect[Collect Scores] --> Weights[User Weights<br/>0.25, 0.40, 0.35]

    Weights --> Calc[Calculate:<br/>0.85×0.25 + 0.92×0.40 + 0.78×0.35]

    Calc --> Sum[Weighted Sum: 0.854]

    Sum --> Norm[Normalize<br/>Softmax/Linear]

    Norm --> Final[Final Strength: 0.87]

    Final --> Store[(Store Connection<br/>+ metadata)]

    style Collect fill:#f3e5f5
    style Final fill:#c8e6c9
```

---

## Reader Experience

### Viewport Tracking Flow

```mermaid
sequenceDiagram
    participant User
    participant JS as JavaScript
    participant Chunks as Chunk Store
    participant Conn as Connections DB
    participant UI as Right Panel

    User->>JS: Scroll document
    JS->>JS: Calculate scroll position<br/>top: 5000, bottom: 8000

    JS->>Chunks: Find visible chunks<br/>start_offset ≤ 8000<br/>end_offset ≥ 5000

    Chunks->>JS: Return [chunk_1, chunk_2, chunk_3]

    JS->>Conn: Fetch connections<br/>WHERE source_chunk_id IN (...)

    Conn->>JS: Return connections<br/>ORDER BY strength DESC

    JS->>UI: Render connection cards<br/>• Strength (0-100%)<br/>• Type icon<br/>• Preview text

    User->>UI: Click connection
    UI->>JS: Jump to target chunk
    JS->>User: Scroll to target position

    Note over User,UI: Accurate offsets ensure<br/>correct viewport tracking
```

### Why Accurate Offsets Matter

```mermaid
graph TD
    A[User at Position 5000] --> B{Chunk Offsets<br/>Accurate?}

    B -->|Yes ✓| C[Show connections for:<br/>Chunks 2, 3, 4<br/>Actually at position 5000]
    B -->|No ✗| D[Show connections for:<br/>Chunks 7, 8, 9<br/>Wrong chunks displayed!]

    C --> E[Correct Experience<br/>Relevant connections shown]
    D --> F[Broken Experience<br/>Unrelated connections shown]

    style A fill:#e3f2fd
    style C fill:#c8e6c9
    style D fill:#ffccbc
    style E fill:#e1f5e1
    style F fill:#ffebee
```

---

## Error Handling & Fallbacks

### Chunking Failure Recovery

```mermaid
flowchart TD
    Start[AI Chunking Attempt] --> Result{Result?}

    Result -->|Success| Continue1[Continue Pipeline]
    Result -->|Oversized Chunks| Split[Auto-split at Paragraphs]
    Result -->|Wrong Offsets| Fuzzy[Fuzzy Matcher Corrects]
    Result -->|Batch Failure| Retry{Retry Count?}

    Split --> Continue1
    Fuzzy --> Continue1

    Retry -->|< 3| Backoff[Exponential Backoff<br/>Wait: 2^n seconds]
    Backoff --> Start

    Retry -->|= 3| SmallBatch[Split Batch in Half<br/>Retry Smaller Batches]

    SmallBatch --> SubResult{Result?}
    SubResult -->|Success| Continue1
    SubResult -->|Fail| Final{All Retries<br/>Exhausted?}

    Final -->|Yes| Fallback[Regex Fallback Chunking<br/>~1500 chars/chunk<br/>Minimal metadata]
    Final -->|No| SmallBatch

    Fallback --> Continue2[Continue with<br/>Fallback Chunks]

    style Continue1 fill:#e1f5e1
    style Continue2 fill:#fff9c4
    style Fallback fill:#ffccbc
```

### Connection Detection Failures

```mermaid
flowchart TD
    Start[Run All 3 Engines] --> E1[Engine 1:<br/>Semantic Similarity]
    Start --> E2[Engine 2:<br/>Contradiction Detection]
    Start --> E3[Engine 3:<br/>Thematic Bridge]

    E1 --> R1{Success?}
    E2 --> R2{Success?}
    E3 --> R3{Success?}

    R1 -->|Yes| S1[47 connections]
    R1 -->|No| F1[0 connections<br/>Log warning]

    R2 -->|Yes| S2[23 connections]
    R2 -->|No| F2[0 connections<br/>Corrupted metadata]

    R3 -->|Yes| S3[15 connections]
    R3 -->|No| F3[0 connections<br/>AI timeout]

    S1 --> Combine
    F1 --> Combine
    S2 --> Combine
    F2 --> Combine
    S3 --> Combine
    F3 --> Combine

    Combine[Combine Results] --> Total[Total: 47 + 23 + 15<br/>= 85 connections]

    Total --> Quality{Quality<br/>Acceptable?}
    Quality -->|Yes| Done[Degraded but Functional]
    Quality -->|No| Warn[Warn User:<br/>Partial results only]

    style Done fill:#c8e6c9
    style Warn fill:#fff9c4
```

### Cost Protection

```mermaid
flowchart TD
    Start[Thematic Bridge Engine] --> Filter[Aggressive Filtering<br/>importance > 0.6<br/>cross-document<br/>different domains]

    Filter --> Count{Candidate<br/>Pairs?}

    Count --> Process[Process Pairs<br/>AI Analysis]

    Process --> Check{AI Calls<br/>Made?}

    Check -->|< 300| Continue[Continue Processing]
    Continue --> Process

    Check -->|≥ 300| Stop[Budget Exceeded<br/>Stop Engine]

    Stop --> Log[Log Warning:<br/>Budget limit reached]

    Log --> Return[Return Connections<br/>Found So Far]

    Return --> Result[User Gets:<br/>✓ Semantic connections<br/>✓ Contradictions<br/>✓ Partial bridges]

    style Filter fill:#fff4e6
    style Stop fill:#ffccbc
    style Result fill:#c8e6c9

    Note[500-page book:<br/>382 chunks × 382 = 145,924 pairs<br/>After filtering: ~200 pairs<br/>Budget: 300 AI calls max]
    style Note fill:#e3f2fd
```

---

## Performance Characteristics

### Processing Timeline (500-page book)

```mermaid
gantt
    title Document Processing Timeline
    dateFormat X
    axisFormat %s

    section Extraction
    PDF Upload to Gemini    :0, 30
    Gemini Processing       :30, 180
    Markdown Generation     :180, 300

    section Chunking
    Batch Creation          :300, 360
    AI Semantic Analysis    :360, 1200
    Offset Correction       :1200, 1320
    Deduplication          :1320, 1380

    section Embeddings
    Batch Processing        :1380, 1440
    Vector Storage         :1440, 1500

    section Connections
    Semantic Similarity     :1500, 1620
    Contradiction Detection :1500, 1680
    Thematic Bridge        :1500, 2100
    Score Aggregation      :2100, 2160

    section Complete
    Ready for Reading      :2160, 2220
```

### Cost Breakdown (500-page book)

**Normal Processing:**
```mermaid
pie title Cost Distribution (~$0.54 total)
    "PDF Extraction ($0.12)" : 22
    "Semantic Chunking ($0.20)" : 37
    "Embeddings ($0.02)" : 4
    "Thematic Bridge ($0.20)" : 37
```

**With Pre-Chunking Review:**
```mermaid
pie title Cost Distribution (~$0.54 total - Same Cost!)
    "PDF Extraction ($0.12)" : 22
    "Semantic Chunking ($0.20)" : 37
    "Embeddings ($0.02)" : 4
    "Thematic Bridge ($0.20)" : 37
```

**Cost Comparison:**
| Mode | Extraction | Chunking | Total | Notes |
|------|-----------|----------|-------|-------|
| **Normal** | $0.12 | $0.20 | $0.54 | Direct AI chunking |
| **Pre-Review** | $0.12 | $0.20 | $0.54 | Simple chunks (free) → AI chunking edited markdown |
| **Old Bug** | $0.12 | $0.40 | $0.74 | AI chunking twice (fixed!) |

---

## Key System Insights

```mermaid
mindmap
  root((Rhizome V2<br/>Processing))
    AI + Fuzzy Matching
      AI: Semantic boundaries
      AI: Metadata extraction
      Fuzzy: Offset accuracy
      Partnership model
    3-Engine Connections
      Semantic: Fast baseline
      Contradiction: Tensions
      Thematic: Cross-domain
      Weighted aggregation
    Graceful Degradation
      Auto-split oversized
      Fuzzy offset correction
      Regex fallback
      Never lose data
    Cost-Aware Design
      Aggressive filtering
      Metadata reuse
      Budget protection
      $0.54 per 500-page book
    Viewport-Driven UX
      Accurate offsets
      Scroll-based detection
      Connection panel
      One-click navigation
```

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [ASCII Version](./PROCESSING_PIPELINE.md) (terminal-friendly)
- [ECS Implementation](./ECS_IMPLEMENTATION.md)
- [Testing Strategy](./testing/TESTING_README.md)
- [Code Examples](./CODE_EXAMPLES.md)

---

**Completed Features**:
- [x] Obsidian Integration (export, sync, advanced URI)
- [x] Pre-Chunking Review Workflow (save $0.20 per document)
- [x] Post-Completion Sync with Annotation Recovery
- [x] Double-Chunking Cost Bug Fix

**Next Steps**:
- [ ] Continue Reader UI (markdown renderer, virtual scrolling)
- [ ] Implement Annotations (text selection → ECS persistence)
- [ ] Build Connection Panel (display 3-engine results)
- [ ] Add Study System (flashcards with FSRS)
- [ ] Create Export (ZIP bundles with markdown + annotations)
