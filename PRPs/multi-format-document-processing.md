# Implementation Plan: Multi-Format Document Processing Pipeline

## Overview

This plan implements comprehensive multi-format document processing for Rhizome V2, extending the current PDF-only system to support markdown files, plain text, YouTube transcripts, and generic pasted content. The implementation maintains the existing hybrid storage architecture (files in Supabase Storage, chunks in PostgreSQL) while using Gemini AI for all format processing and semantic chunking.

**Archon Project ID**: `a2232595-4e55-41d2-a041-1a4a8a4ff3c6`

**Timeline**: 2 weeks (Week 2 of MVP timeline)

**Impact**: Positions Rhizome as a universal document ingestion platform, removing barriers for users with diverse content sources.

## Requirements Summary

### Core Requirements
- **PDF Processing**: Maintain existing functionality (unchanged)
- **Markdown Upload**: Optional processing with "Clean formatting?" checkbox
- **Plain Text Files**: Automatic formatting to clean markdown
- **YouTube Integration**: 
  - Auto-fetch transcripts from URL
  - Manual paste fallback with timestamp detection
  - Clickable timestamp links preserved in chunks
- **Generic Paste**: Process any pasted text into readable markdown
- **Unified Pipeline**: All formats follow same chunking/embedding flow

### Technical Constraints
- Must extend existing worker handler architecture (not replace)
- Hybrid storage pattern maintained (files in Storage, chunks in DB)
- Gemini AI handles ALL processing (no PDF/text parsing libraries)
- pgvector semantic search must work across all formats
- Processing quality maintained (similar chunk quality to PDFs)

### Success Criteria
- 95%+ processing success rate across all formats
- <2 minute processing time for typical documents
- Gemini API costs <$0.05 per document
- Storage efficiency maintained
- All formats searchable with pgvector

## Research Findings

### Architecture Analysis (from codebase-analyst)

**Current Processing Flow**:
```yaml
Upload → Storage → background_jobs → Worker Handler → Gemini → Markdown (Storage) + Chunks (DB)
```

**Key Architectural Patterns Discovered**:
1. **Files API Integration**: Current system uses Gemini Files API for large PDFs (not inline data)
2. **5-Stage Processing**: download → extract → save_markdown → embed → complete
3. **Checkpoint Recovery**: Can resume from any completed stage
4. **Rate Limiting**: 1-second delays every 10 embedding requests
5. **Timeout Protection**: 8-minute application timeout with graceful handling
6. **Atomic Operations**: Combined status+progress updates prevent race conditions

**Critical Storage Decision** (from CLAUDE.md):
```
Supabase Storage:  source.pdf, content.md, export.bundle.zip
PostgreSQL DB:     chunks (text + embeddings), metadata only
```

### Gemini API Capabilities (from RAG search)

**Multimodal Processing**:
- Native support for PDF, text, images, audio, video
- Long context windows (1M+ tokens)
- Structured output with JSON schema validation
- Files API for large documents (>20MB)

**Best Practices Identified**:
1. Use `responseMimeType: "application/json"` for structured output
2. Complex schemas should avoid long property names, deep nesting
3. File prompting strategies improve multimodal results
4. "Think step-by-step" prompts enhance reasoning quality

### YouTube Transcript Libraries (research)

**Recommended**: `youtube-transcript` npm package
- Widely used, well-maintained
- No YouTube API key required (uses internal API)
- Automatic language detection
- Returns timestamps with text
- Fallback mechanisms for restricted videos

### Integration Points (from codebase analysis)

**Files to Extend**:
- `worker/handlers/process-document.ts` - Core processing logic (468 lines)
- `src/app/actions/documents.ts` - Upload server actions
- `src/components/library/UploadZone.tsx` - Upload UI
- `src/components/layout/ProcessingDock.tsx` - Status tracking
- `supabase/migrations/` - Schema additions

**Existing Patterns to Follow**:
- JSDoc required on all exported functions
- Server Actions for mutations ('use server')
- Zustand for client state, React Query for server state
- No modals (use docks, panels, overlays)
- Co-located tests in `__tests__` folders

## Implementation Tasks

### Phase 1: Database & Infrastructure (Days 1-2)

#### Task 1.1: Create Database Migration for Multi-Format Support
- **Description**: Add schema fields to support multiple document formats and source metadata
- **Files to create**: 
  - `supabase/migrations/010_multi_format_support.sql`
- **Dependencies**: None (builds on migration 009)
- **Estimated effort**: 2 hours

**SQL Schema Changes**:
```sql
-- Add source type and format tracking
ALTER TABLE documents 
  ADD COLUMN source_type TEXT DEFAULT 'pdf' 
    CHECK (source_type IN ('pdf', 'markdown', 'txt', 'youtube', 'manual_paste')),
  ADD COLUMN source_url TEXT,
  ADD COLUMN processing_requested BOOLEAN DEFAULT true;

-- Add timestamp support for YouTube chunks
ALTER TABLE chunks
  ADD COLUMN source_timestamp INTEGER;

-- Add indexes for new fields
CREATE INDEX idx_documents_source_type ON documents(source_type);
CREATE INDEX idx_chunks_source_timestamp ON chunks(source_timestamp) WHERE source_timestamp IS NOT NULL;

-- Update existing documents to have source_type
UPDATE documents SET source_type = 'pdf' WHERE source_type IS NULL;
```

#### Task 1.2: Install YouTube Transcript Library
- **Description**: Add youtube-transcript dependency and verify integration
- **Files to modify**: 
  - `package.json`
  - `worker/package.json` (if separate)
- **Dependencies**: None
- **Estimated effort**: 1 hour

**Installation**:
```bash
npm install youtube-transcript
cd worker && npm install youtube-transcript
```

**Test Integration**:
```typescript
// Test file: worker/__tests__/youtube-transcript.test.ts
import { YoutubeTranscript } from 'youtube-transcript';

test('fetches transcript from test video', async () => {
  const transcript = await YoutubeTranscript.fetchTranscript('dQw4w9WgXcQ');
  expect(transcript).toHaveLength(greaterThan(0));
  expect(transcript[0]).toHaveProperty('text');
  expect(transcript[0]).toHaveProperty('offset');
});
```

#### Task 1.3: Create TypeScript Types for Multi-Format Processing
- **Description**: Define types for new document formats and processing options
- **Files to create**: 
  - `src/types/documents.ts` (extend existing)
- **Dependencies**: None
- **Estimated effort**: 1 hour

**Type Definitions**:
```typescript
export type DocumentSourceType = 
  | 'pdf' 
  | 'markdown' 
  | 'txt' 
  | 'youtube' 
  | 'manual_paste';

export interface UploadDocumentOptions {
  sourceType: DocumentSourceType;
  sourceUrl?: string; // For YouTube videos
  processingRequested?: boolean; // For markdown optional processing
  rawContent?: string; // For manual paste/YouTube fallback
}

export interface YouTubeTranscriptSegment {
  text: string;
  offset: number; // milliseconds
  duration: number;
}

export interface ProcessingResult {
  markdown: string;
  chunks: Array<{
    content: string;
    themes: string[];
    sourceTimestamp?: number; // For YouTube chunks
  }>;
}
```

### Phase 2: Worker Handler Refactoring (Days 3-5)

#### Task 2.1: Refactor Worker Handler with Type-Based Routing
- **Description**: Extract PDF processing into dedicated function and add routing logic for multiple formats
- **Files to modify**: 
  - `worker/handlers/process-document.ts`
- **Dependencies**: Task 1.1, 1.3 complete
- **Estimated effort**: 8 hours

**Architectural Changes**:
```typescript
// Current structure (to preserve):
export async function processDocumentHandler(job: BackgroundJob) {
  // ... existing checkpoint/progress logic ...
}

// New structure (to implement):
async function routeProcessing(
  documentId: string, 
  sourceType: DocumentSourceType,
  fileUrl: string,
  options: ProcessingOptions
): Promise<ProcessingResult> {
  switch (sourceType) {
    case 'pdf':
      return await processPDF(fileUrl);
    case 'markdown':
      return await processMarkdown(fileUrl, options.processingRequested);
    case 'txt':
      return await processTextFile(fileUrl);
    case 'youtube':
      return await processYouTubeTranscript(options.sourceUrl, options.rawContent);
    case 'manual_paste':
      return await processManualPaste(options.rawContent);
  }
}
```

**Integration Points**:
- Preserve existing progress tracking (5 stages)
- Maintain checkpoint/resume functionality
- Keep timeout protection (8-minute limit)
- Reuse embedding generation logic
- Follow atomic operation patterns

#### Task 2.2: Implement PDF Processing Extraction (No-Op Refactor)
- **Description**: Extract current PDF logic into `processPDF()` function without changing behavior
- **Files to modify**: 
  - `worker/handlers/process-document.ts`
- **Dependencies**: Task 2.1 complete
- **Estimated effort**: 2 hours

**Extraction Pattern**:
```typescript
/**
 * Processes PDF document using Gemini Files API.
 * Extracted from main handler to support multi-format routing.
 * 
 * @param fileUrl - Signed URL to PDF in Supabase Storage
 * @returns Processed markdown and semantic chunks
 */
async function processPDF(fileUrl: string): Promise<ProcessingResult> {
  // Move existing PDF processing logic here (lines 120-380)
  // No behavior changes - pure extraction
  
  // 1. Download PDF
  // 2. Upload to Gemini Files API
  // 3. Generate content with chunking prompt
  // 4. Parse JSON response with jsonrepair
  // 5. Return { markdown, chunks }
}
```

**Testing**:
- Verify existing PDF tests still pass
- No regression in PDF processing quality
- Checkpoint recovery still works

#### Task 2.3: Implement Markdown Processing
- **Description**: Add markdown processing with optional Gemini cleanup
- **Files to modify**: 
  - `worker/handlers/process-document.ts`
- **Dependencies**: Task 2.1, 2.2 complete
- **Estimated effort**: 4 hours

**Processing Logic**:
```typescript
/**
 * Processes markdown file with optional formatting cleanup.
 * 
 * @param fileUrl - Signed URL to markdown in Supabase Storage
 * @param shouldCleanup - Whether user requested Gemini cleanup
 * @returns Processed markdown and semantic chunks
 */
async function processMarkdown(
  fileUrl: string, 
  shouldCleanup: boolean
): Promise<ProcessingResult> {
  // 1. Fetch markdown from storage
  const response = await fetch(fileUrl);
  const rawMarkdown = await response.text();
  
  // 2. Strip front matter if present (YAML/TOML)
  const { content, metadata } = stripFrontMatter(rawMarkdown);
  
  if (!shouldCleanup) {
    // Fast path: Just chunk existing markdown
    return await chunkMarkdown(content);
  }
  
  // 3. Optional: Send to Gemini for cleanup
  const cleanedMarkdown = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      parts: [{ text: `Clean and format this markdown:\n\n${content}` }]
    }]
  });
  
  // 4. Chunk the result
  return await chunkMarkdown(cleanedMarkdown.text);
}

/**
 * Chunks markdown into semantic segments using Gemini.
 * Reusable for markdown, text files, and manual paste.
 */
async function chunkMarkdown(markdown: string): Promise<ProcessingResult> {
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      parts: [{ text: CHUNKING_PROMPT }, { text: markdown }]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: CHUNK_SCHEMA
    }
  });
  
  return JSON.parse(result.text);
}
```

**Front Matter Handling**:
```typescript
function stripFrontMatter(markdown: string): { content: string; metadata: object } {
  const frontMatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = markdown.match(frontMatterRegex);
  
  if (!match) {
    return { content: markdown, metadata: {} };
  }
  
  // Parse YAML front matter (basic implementation)
  const metadataLines = match[1].split('\n');
  const metadata = {};
  metadataLines.forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      metadata[key.trim()] = valueParts.join(':').trim();
    }
  });
  
  return {
    content: markdown.slice(match[0].length),
    metadata
  };
}
```

#### Task 2.4: Implement Plain Text File Processing
- **Description**: Add automatic markdown formatting for plain text uploads
- **Files to modify**: 
  - `worker/handlers/process-document.ts`
- **Dependencies**: Task 2.3 complete (reuses chunkMarkdown)
- **Estimated effort**: 3 hours

**Processing Logic**:
```typescript
/**
 * Processes plain text file by converting to markdown.
 * Always applies Gemini formatting (no opt-out).
 * 
 * @param fileUrl - Signed URL to text file in Supabase Storage
 * @returns Formatted markdown and semantic chunks
 */
async function processTextFile(fileUrl: string): Promise<ProcessingResult> {
  // 1. Fetch text from storage
  const response = await fetch(fileUrl);
  const rawText = await response.text();
  
  // 2. Convert to markdown with Gemini
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      parts: [{
        text: `Convert this plain text into well-formatted markdown:

Requirements:
- Add appropriate headers for sections
- Format lists and quotes properly  
- Preserve paragraph structure
- Add emphasis where natural
- Make it readable and scannable

Plain text:
${rawText}`
      }]
    }]
  });
  
  const markdown = result.text;
  
  // 3. Chunk the formatted markdown
  return await chunkMarkdown(markdown);
}
```

#### Task 2.5: Implement YouTube Transcript Processing
- **Description**: Add YouTube auto-fetch with manual fallback and timestamp preservation
- **Files to modify**: 
  - `worker/handlers/process-document.ts`
- **Dependencies**: Task 1.2 complete (youtube-transcript installed)
- **Estimated effort**: 6 hours

**Processing Logic**:
```typescript
/**
 * Processes YouTube transcript with timestamp preservation.
 * Supports auto-fetch from URL or manual paste.
 * 
 * @param sourceUrl - YouTube video URL (optional)
 * @param rawTranscript - Manually pasted transcript (fallback)
 * @returns Markdown with clickable timestamps and semantic chunks
 */
async function processYouTubeTranscript(
  sourceUrl?: string,
  rawTranscript?: string
): Promise<ProcessingResult> {
  let segments: YouTubeTranscriptSegment[];
  
  if (sourceUrl) {
    // Extract video ID from URL
    const videoId = extractYouTubeVideoId(sourceUrl);
    
    try {
      // Auto-fetch using youtube-transcript library
      segments = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (error) {
      if (!rawTranscript) {
        throw new Error('Failed to fetch transcript and no manual fallback provided');
      }
      // Fall through to manual parsing
      segments = parseManualTranscript(rawTranscript);
    }
  } else if (rawTranscript) {
    segments = parseManualTranscript(rawTranscript);
  } else {
    throw new Error('Either sourceUrl or rawTranscript required');
  }
  
  // Convert to markdown with timestamp links
  const markdown = convertTranscriptToMarkdown(segments, sourceUrl);
  
  // Chunk semantically (not by timestamp!)
  const chunks = await chunkTranscript(markdown, segments, sourceUrl);
  
  return { markdown, chunks };
}

/**
 * Extracts YouTube video ID from various URL formats.
 */
function extractYouTubeVideoId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  throw new Error('Invalid YouTube URL format');
}

/**
 * Parses manually pasted transcript with timestamps.
 * Supports formats: "00:00:00 text", "0:00 text", "[00:00] text"
 */
function parseManualTranscript(rawTranscript: string): YouTubeTranscriptSegment[] {
  const lines = rawTranscript.split('\n');
  const segments: YouTubeTranscriptSegment[] = [];
  
  const timestampRegex = /^(?:\[)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\])?\s+(.+)/;
  
  for (const line of lines) {
    const match = line.match(timestampRegex);
    if (match) {
      const [, hours, minutes, seconds, text] = match;
      const offset = (
        (hours ? parseInt(hours) * 3600 : 0) +
        parseInt(minutes) * 60 +
        (seconds ? parseInt(seconds) : 0)
      ) * 1000; // Convert to milliseconds
      
      segments.push({
        text: text.trim(),
        offset,
        duration: 0 // Unknown for manual transcripts
      });
    } else if (line.trim()) {
      // Text without timestamp - append to previous
      if (segments.length > 0) {
        segments[segments.length - 1].text += ' ' + line.trim();
      }
    }
  }
  
  return segments;
}

/**
 * Converts transcript segments to markdown with clickable timestamp links.
 */
function convertTranscriptToMarkdown(
  segments: YouTubeTranscriptSegment[],
  videoUrl?: string
): string {
  const lines: string[] = [];
  
  for (const segment of segments) {
    const timestamp = formatTimestamp(segment.offset);
    const link = videoUrl 
      ? `[${timestamp}](${videoUrl}&t=${Math.floor(segment.offset / 1000)}s)`
      : `[${timestamp}]`;
    
    lines.push(`${link} ${segment.text}`);
  }
  
  return lines.join('\n\n');
}

/**
 * Formats milliseconds as MM:SS or HH:MM:SS.
 */
function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function pad(num: number): string {
  return num.toString().padStart(2, '0');
}

/**
 * Chunks YouTube transcript semantically with timestamp tracking.
 * Each chunk gets ONE representative timestamp link.
 */
async function chunkTranscript(
  markdown: string,
  segments: YouTubeTranscriptSegment[],
  videoUrl?: string
): Promise<Array<{ content: string; themes: string[]; sourceTimestamp?: number }>> {
  // Use Gemini for semantic chunking
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      parts: [{
        text: `Break this YouTube transcript into semantic chunks:

Requirements:
- Create chunks of complete thoughts (200-500 words)
- Each chunk should be topically coherent
- Preserve at least one timestamp link per chunk
- Extract 2-3 themes per chunk

Transcript:
${markdown}`
      }]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: CHUNK_SCHEMA
    }
  });
  
  const chunks = JSON.parse(result.text).chunks;
  
  // Extract first timestamp from each chunk for source_timestamp
  return chunks.map(chunk => {
    const timestampMatch = chunk.content.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
    let sourceTimestamp = undefined;
    
    if (timestampMatch) {
      const [, hours, minutes, seconds] = timestampMatch;
      sourceTimestamp = (
        (hours ? parseInt(hours) * 3600 : 0) +
        parseInt(minutes) * 60 +
        (seconds ? parseInt(seconds) : 0)
      ) * 1000;
    }
    
    return {
      content: chunk.content,
      themes: chunk.themes,
      sourceTimestamp
    };
  });
}
```

#### Task 2.6: Implement Generic Manual Paste Processing
- **Description**: Add processing for any pasted text content
- **Files to modify**: 
  - `worker/handlers/process-document.ts`
- **Dependencies**: Task 2.3 complete (reuses chunkMarkdown)
- **Estimated effort**: 2 hours

**Processing Logic**:
```typescript
/**
 * Processes manually pasted text content.
 * Detects if it's a transcript (has timestamps) vs generic text.
 * 
 * @param rawContent - User-pasted text content
 * @returns Formatted markdown and semantic chunks
 */
async function processManualPaste(rawContent: string): Promise<ProcessingResult> {
  // Check if content looks like a transcript
  const hasTimestamps = /\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+\w+/.test(rawContent);
  
  if (hasTimestamps) {
    // Treat as transcript without video URL
    return await processYouTubeTranscript(undefined, rawContent);
  }
  
  // Generic text processing
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      parts: [{
        text: `Convert this pasted text into clean, readable markdown:

Requirements:
- Add appropriate structure (headers, lists, quotes)
- Preserve meaning and important details
- Format for easy reading
- Clean up formatting artifacts (extra spaces, broken lines)

Content:
${rawContent}`
      }]
    }]
  });
  
  const markdown = result.text;
  return await chunkMarkdown(markdown);
}
```

### Phase 3: Server Actions & UI (Days 6-8)

#### Task 3.1: Extend Upload Server Action
- **Description**: Add support for new file types and processing options in uploadDocument action
- **Files to modify**: 
  - `src/app/actions/documents.ts`
- **Dependencies**: Task 1.3 complete (types defined)
- **Estimated effort**: 4 hours

**Server Action Changes**:
```typescript
/**
 * Uploads document with multi-format support.
 * 
 * @param formData - Contains file, sourceType, and processing options
 * @returns Document ID and job ID on success
 */
export async function uploadDocument(
  formData: FormData
): Promise<{ success: boolean; documentId?: string; jobId?: string; error?: string }> {
  'use server';
  
  const file = formData.get('file') as File;
  const sourceType = formData.get('sourceType') as DocumentSourceType;
  const sourceUrl = formData.get('sourceUrl') as string | null;
  const processingRequested = formData.get('processingRequested') === 'true';
  const rawContent = formData.get('rawContent') as string | null;
  
  // Validate file type vs source type
  if (!validateFileType(file, sourceType)) {
    return { success: false, error: 'Invalid file type for selected source' };
  }
  
  // Generate document ID
  const documentId = crypto.randomUUID();
  const storagePath = `${DEV_USER_ID}/${documentId}`;
  
  try {
    // 1. Upload file to storage (if present)
    if (file && file.size > 0) {
      const fileName = getSourceFileName(sourceType, file.name);
      await supabaseAdmin.storage
        .from('documents')
        .upload(`${storagePath}/${fileName}`, file);
    }
    
    // 2. Create document record with new fields
    const { error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        id: documentId,
        user_id: DEV_USER_ID,
        title: file?.name || 'Pasted Content',
        storage_path: storagePath,
        source_type: sourceType,
        source_url: sourceUrl,
        processing_requested: processingRequested,
        processing_status: 'pending'
      });
    
    if (docError) throw docError;
    
    // 3. Create background job with processing options
    const { data: job, error: jobError } = await supabaseAdmin
      .from('background_jobs')
      .insert({
        job_type: 'process_document',
        entity_type: 'document',
        entity_id: documentId,
        status: 'pending',
        payload: {
          source_type: sourceType,
          source_url: sourceUrl,
          processing_requested: processingRequested,
          raw_content: rawContent
        }
      })
      .select('id')
      .single();
    
    if (jobError) throw jobError;
    
    return {
      success: true,
      documentId,
      jobId: job.id
    };
  } catch (error) {
    // Rollback on failure
    await supabaseAdmin.storage.from('documents').remove([`${storagePath}`]);
    await supabaseAdmin.from('documents').delete().eq('id', documentId);
    
    return {
      success: false,
      error: getUserFriendlyError(error)
    };
  }
}

function validateFileType(file: File, sourceType: DocumentSourceType): boolean {
  const validations = {
    pdf: () => file.type === 'application/pdf',
    markdown: () => file.name.endsWith('.md') || file.type === 'text/markdown',
    txt: () => file.type === 'text/plain',
    youtube: () => true, // URL-based, no file required
    manual_paste: () => true // Content-based, no file required
  };
  
  return validations[sourceType]?.() ?? false;
}

function getSourceFileName(sourceType: DocumentSourceType, originalName: string): string {
  const extensions = {
    pdf: 'source.pdf',
    markdown: 'source.md',
    txt: 'source.txt',
    youtube: 'source.txt',
    manual_paste: 'source.txt'
  };
  
  return extensions[sourceType] || originalName;
}
```

#### Task 3.2: Create YouTube Fetch Server Action
- **Description**: Add server action for fetching YouTube transcripts from frontend
- **Files to modify**: 
  - `src/app/actions/documents.ts`
- **Dependencies**: Task 1.2 complete
- **Estimated effort**: 2 hours

**New Server Action**:
```typescript
/**
 * Fetches YouTube transcript for preview before upload.
 * 
 * @param videoUrl - YouTube video URL
 * @returns Transcript text or error message
 */
export async function fetchYouTubeTranscript(
  videoUrl: string
): Promise<{ success: boolean; transcript?: string; error?: string }> {
  'use server';
  
  try {
    const videoId = extractYouTubeVideoId(videoUrl);
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    
    // Format as readable text with timestamps
    const transcript = segments
      .map(seg => {
        const timestamp = formatTimestamp(seg.offset);
        return `[${timestamp}] ${seg.text}`;
      })
      .join('\n');
    
    return {
      success: true,
      transcript
    };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch transcript. Please paste it manually.'
    };
  }
}
```

#### Task 3.3: Update UploadZone Component
- **Description**: Redesign upload UI to support 5 input methods
- **Files to modify**: 
  - `src/components/library/UploadZone.tsx`
- **Dependencies**: Task 3.1, 3.2 complete
- **Estimated effort**: 8 hours

**UI Structure**:
```tsx
/**
 * Multi-format upload zone with tabbed interface.
 * Supports PDF, Markdown, Text, YouTube, and Manual Paste.
 */
export function UploadZone() {
  const [selectedTab, setSelectedTab] = useState<DocumentSourceType>('pdf');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [processingMarkdown, setProcessingMarkdown] = useState(false);
  const [pastedContent, setPastedContent] = useState('');
  
  return (
    <div className="border rounded-lg p-6">
      {/* Tab Navigation */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="pdf">📄 PDF</TabsTrigger>
          <TabsTrigger value="markdown">📝 Markdown</TabsTrigger>
          <TabsTrigger value="txt">📋 Text File</TabsTrigger>
          <TabsTrigger value="youtube">🎥 YouTube</TabsTrigger>
          <TabsTrigger value="manual_paste">✍️ Paste Text</TabsTrigger>
        </TabsList>
        
        {/* PDF Upload (Existing) */}
        <TabsContent value="pdf">
          <FileDropZone 
            accept="application/pdf"
            onDrop={handlePdfUpload}
          />
        </TabsContent>
        
        {/* Markdown Upload with Optional Processing */}
        <TabsContent value="markdown">
          <FileDropZone 
            accept=".md,text/markdown"
            onDrop={handleMarkdownUpload}
          />
          <label className="flex items-center gap-2 mt-4">
            <input 
              type="checkbox"
              checked={processingMarkdown}
              onChange={(e) => setProcessingMarkdown(e.target.checked)}
            />
            <span>Clean formatting with AI?</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>ℹ️</TooltipTrigger>
                <TooltipContent>
                  Optional: Gemini will improve markdown formatting
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </label>
        </TabsContent>
        
        {/* Text File Upload */}
        <TabsContent value="txt">
          <FileDropZone 
            accept="text/plain"
            onDrop={handleTextUpload}
          />
          <p className="text-sm text-muted-foreground mt-2">
            Text files are automatically formatted to markdown
          </p>
        </TabsContent>
        
        {/* YouTube URL Input */}
        <TabsContent value="youtube">
          <div className="space-y-4">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
            <Button 
              onClick={handleFetchTranscript}
              disabled={!youtubeUrl}
            >
              Fetch Transcript
            </Button>
            
            {/* Manual Fallback */}
            <div className="border-t pt-4">
              <p className="text-sm mb-2">Or paste transcript manually:</p>
              <Textarea
                placeholder="[0:00] Video intro..."
                rows={10}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />
            </div>
            
            <Button
              onClick={handleYouTubeUpload}
              disabled={!youtubeUrl && !transcript}
            >
              Process YouTube Content
            </Button>
          </div>
        </TabsContent>
        
        {/* Generic Paste */}
        <TabsContent value="manual_paste">
          <Textarea
            placeholder="Paste any text content here..."
            rows={15}
            value={pastedContent}
            onChange={(e) => setPastedContent(e.target.value)}
          />
          <Button
            onClick={handleManualPaste}
            disabled={!pastedContent}
            className="mt-4"
          >
            Process Text
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Upload Handlers**:
```typescript
async function handleMarkdownUpload(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sourceType', 'markdown');
  formData.append('processingRequested', processingMarkdown.toString());
  
  const result = await uploadDocument(formData);
  // Handle result...
}

async function handleFetchTranscript() {
  const result = await fetchYouTubeTranscript(youtubeUrl);
  if (result.success) {
    setTranscript(result.transcript);
  } else {
    toast.error(result.error);
  }
}

async function handleYouTubeUpload() {
  const formData = new FormData();
  formData.append('file', new Blob([''])); // Empty file
  formData.append('sourceType', 'youtube');
  formData.append('sourceUrl', youtubeUrl);
  formData.append('rawContent', transcript);
  
  const result = await uploadDocument(formData);
  // Handle result...
}

async function handleManualPaste() {
  const formData = new FormData();
  formData.append('file', new Blob(['']));
  formData.append('sourceType', 'manual_paste');
  formData.append('rawContent', pastedContent);
  
  const result = await uploadDocument(formData);
  // Handle result...
}
```

#### Task 3.4: Update ProcessingDock for Multi-Format Display
- **Description**: Show format-specific icons and labels in processing dock
- **Files to modify**: 
  - `src/components/layout/ProcessingDock.tsx`
- **Dependencies**: Task 1.3 complete
- **Estimated effort**: 2 hours

**UI Enhancements**:
```typescript
const SOURCE_TYPE_ICONS = {
  pdf: FileText,
  markdown: FileCode,
  txt: FileText,
  youtube: Video,
  manual_paste: ClipboardType
};

const SOURCE_TYPE_LABELS = {
  pdf: 'PDF Document',
  markdown: 'Markdown File',
  txt: 'Text File',
  youtube: 'YouTube Video',
  manual_paste: 'Pasted Content'
};

function ProcessingJobCard({ job }: { job: BackgroundJob }) {
  const Icon = SOURCE_TYPE_ICONS[job.payload?.source_type] || FileText;
  const label = SOURCE_TYPE_LABELS[job.payload?.source_type] || 'Document';
  
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5" />
      <div className="flex-1">
        <p className="font-medium">{job.document.title}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      {/* ... existing progress UI ... */}
    </div>
  );
}
```

### Phase 4: Testing & Documentation (Days 9-10)

#### Task 4.1: Write Integration Tests for New Formats
- **Description**: Add comprehensive tests for all upload and processing flows
- **Files to create**: 
  - `src/app/actions/__tests__/multi-format-upload.test.ts`
  - `worker/handlers/__tests__/multi-format-processing.test.ts`
- **Dependencies**: All Phase 2 and 3 tasks complete
- **Estimated effort**: 6 hours

**Test Coverage**:
```typescript
describe('Multi-Format Upload', () => {
  test('uploads markdown with processing option', async () => {
    const file = createMarkdownFile('# Test');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sourceType', 'markdown');
    formData.append('processingRequested', 'true');
    
    const result = await uploadDocument(formData);
    expect(result.success).toBe(true);
  });
  
  test('fetches YouTube transcript', async () => {
    const result = await fetchYouTubeTranscript('https://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.success).toBe(true);
    expect(result.transcript).toContain('[');
  });
  
  // ... more tests for each format ...
});

describe('Multi-Format Processing', () => {
  test('processes markdown without cleanup', async () => {
    const result = await processMarkdown(markdownUrl, false);
    expect(result.chunks).toHaveLength(greaterThan(0));
  });
  
  test('preserves timestamps in YouTube chunks', async () => {
    const result = await processYouTubeTranscript(videoUrl, null);
    expect(result.chunks[0].sourceTimestamp).toBeDefined();
  });
  
  // ... more processing tests ...
});
```

#### Task 4.2: Update Documentation
- **Description**: Document new features in CLAUDE.md and create user guide
- **Files to modify**: 
  - `CLAUDE.md` (update processing section)
  - `docs/MULTI_FORMAT_GUIDE.md` (create new)
- **Dependencies**: All implementation complete
- **Estimated effort**: 3 hours

**Documentation Updates**:
```markdown
## Multi-Format Document Processing

Rhizome V2 supports five document input methods:

### Supported Formats

1. **PDF** - Existing implementation (unchanged)
2. **Markdown** - Optional AI cleanup
3. **Plain Text** - Automatic formatting
4. **YouTube** - Auto-fetch or manual paste
5. **Generic Paste** - Any text content

### Processing Flow

All formats follow the unified pipeline:
Upload → Storage → Worker → Gemini → Markdown (Storage) + Chunks (DB)

### Format-Specific Behavior

**Markdown**: User chooses whether to apply Gemini cleanup
**YouTube**: Timestamps preserved as clickable links
**Text/Paste**: Always formatted to markdown

### Database Schema

New fields:
- `documents.source_type` - Format identifier
- `documents.source_url` - YouTube URL (when applicable)
- `documents.processing_requested` - Markdown cleanup flag
- `chunks.source_timestamp` - YouTube timestamp (ms)
```

## Codebase Integration Points

### Files to Modify

**Worker Handler** (`worker/handlers/process-document.ts`):
- Add `routeProcessing()` function with format switching
- Extract `processPDF()` from existing logic (no-op refactor)
- Implement `processMarkdown()`, `processTextFile()`, `processYouTubeTranscript()`, `processManualPaste()`
- Add helper functions: `stripFrontMatter()`, `chunkMarkdown()`, `parseManualTranscript()`, `convertTranscriptToMarkdown()`

**Server Actions** (`src/app/actions/documents.ts`):
- Extend `uploadDocument()` with new parameters
- Add `fetchYouTubeTranscript()` action
- Add `validateFileType()` helper
- Add `getSourceFileName()` helper

**Upload UI** (`src/components/library/UploadZone.tsx`):
- Replace single drop zone with tabbed interface
- Add YouTube URL input + fetch button
- Add markdown processing checkbox
- Add manual paste textarea
- Implement format-specific upload handlers

**Processing Dock** (`src/components/layout/ProcessingDock.tsx`):
- Add `SOURCE_TYPE_ICONS` mapping
- Add `SOURCE_TYPE_LABELS` mapping
- Update job card display logic

### New Files to Create

**Database Migration** (`supabase/migrations/010_multi_format_support.sql`):
- ALTER TABLE documents (add 3 columns)
- ALTER TABLE chunks (add 1 column)
- CREATE INDEX (2 new indexes)
- UPDATE existing documents

**Type Definitions** (`src/types/documents.ts`):
- `DocumentSourceType` enum
- `UploadDocumentOptions` interface
- `YouTubeTranscriptSegment` interface
- `ProcessingResult` interface

**Tests**:
- `src/app/actions/__tests__/multi-format-upload.test.ts`
- `worker/handlers/__tests__/multi-format-processing.test.ts`
- `worker/__tests__/youtube-transcript.test.ts`

**Documentation**:
- `docs/MULTI_FORMAT_GUIDE.md`

### Existing Patterns to Follow

**Architecture**:
- Hybrid storage (files in Storage, chunks in DB)
- Background job processing with checkpoint recovery
- 5-stage progress tracking (download → extract → save_markdown → embed → complete)
- Atomic operations with rollback on failure
- Rate limiting for API calls (1-second delays every 10 requests)

**Code Conventions**:
- JSDoc on all exported functions
- Server Actions with 'use server'
- Client Components with 'use client' only when needed
- Co-located tests in `__tests__` folders
- No modals (use docks, panels, overlays)

**Error Handling**:
- `getUserFriendlyError()` conversion
- Try-catch with cleanup on failure
- Meaningful error messages for users

**Processing Patterns**:
- Use `@google/genai` SDK (not deprecated version)
- Files API for large documents
- JSON schema validation with `jsonrepair`
- Timeout protection (8 minutes)
- Progress updates with substages

## Technical Design

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Upload UI                              │
│  ┌─────┐ ┌────────┐ ┌────┐ ┌─────────┐ ┌───────────┐         │
│  │ PDF │ │ Markdown│ │ Txt│ │ YouTube │ │ Manual Paste│         │
│  └──┬──┘ └────┬───┘ └──┬─┘ └────┬────┘ └─────┬─────┘         │
└─────┼─────────┼────────┼────────┼────────────┼───────────────┘
      │         │        │        │            │
      └─────────┴────────┴────────┴────────────┘
                         ▼
      ┌──────────────────────────────────────────┐
      │   uploadDocument() Server Action          │
      │   - Validate file type                    │
      │   - Upload to Storage (if file present)   │
      │   - Create document record                │
      │   - Create background_jobs record         │
      └──────────────┬───────────────────────────┘
                     ▼
      ┌──────────────────────────────────────────┐
      │   Worker: processDocumentHandler()        │
      │   - Poll for pending jobs                 │
      │   - Load checkpoint if exists             │
      │   - Route to format handler               │
      └──────────────┬───────────────────────────┘
                     ▼
      ┌──────────────────────────────────────────┐
      │   routeProcessing(sourceType)             │
      └──────────────┬───────────────────────────┘
           ┌─────────┴─────────────┬─────────────┬────────────┬───────────┐
           ▼                       ▼             ▼            ▼           ▼
      ┌─────────┐          ┌──────────┐   ┌──────────┐  ┌─────────┐  ┌─────────┐
      │processPDF│          │processMarkdown│  │processText│  │processYT│  │processPaste│
      └────┬────┘          └─────┬────┘   └────┬────┘  └────┬────┘  └────┬────┘
           │                     │             │           │           │
           └─────────────────────┴─────────────┴───────────┴───────────┘
                                 ▼
           ┌─────────────────────────────────────────┐
           │   Gemini AI Processing                  │
           │   - Extract/format to markdown          │
           │   - Semantic chunking                   │
           │   - Theme extraction                    │
           └──────────────┬──────────────────────────┘
                          ▼
           ┌─────────────────────────────────────────┐
           │   Storage + Database                    │
           │   - Save markdown → Supabase Storage    │
           │   - Generate embeddings (Gemini)        │
           │   - Save chunks → PostgreSQL            │
           └─────────────────────────────────────────┘
```

### Data Flow

**Upload Flow**:
1. User selects format tab and provides input (file/URL/paste)
2. Frontend validates input and creates FormData
3. Server Action receives FormData
4. File uploaded to Storage (if present): `userId/documentId/source.{ext}`
5. Document record created with `source_type`, `source_url`, `processing_requested`
6. Background job created with format-specific payload
7. Worker polls and picks up job

**Processing Flow**:
1. Worker loads job and checks for checkpoint
2. **Download Stage** (10%): Fetch file from Storage or use raw content
3. **Extract Stage** (30%): Route to format-specific handler
   - PDF: Files API upload → Gemini extraction
   - Markdown: Fetch → Optional Gemini cleanup → Chunk
   - Text: Fetch → Gemini formatting → Chunk
   - YouTube: Auto-fetch or parse manual → Convert to markdown → Chunk
   - Paste: Detect type → Format → Chunk
4. **Save Markdown Stage** (50%): Upload processed markdown to Storage
5. **Embed Stage** (99%): Generate embeddings for all chunks (rate limited)
6. **Complete Stage** (100%): Update document status atomically

**Chunking Flow** (All Formats):
```
Raw Content → Gemini Semantic Chunking → JSON Response → Parse
→ For each chunk:
  - Extract text content
  - Extract themes
  - Extract source_timestamp (YouTube only)
  - Generate embedding
  - Save to chunks table
```

### API Endpoints

**Existing** (no changes):
- `POST /api/process` - Webhook for background jobs (unused currently)

**Server Actions** (extended/new):
- `uploadDocument(formData)` - Extended with multi-format support
- `fetchYouTubeTranscript(videoUrl)` - NEW: Fetch transcript preview
- `triggerProcessing(documentId)` - Unchanged

### Database Schema Changes

**documents table**:
```sql
-- New columns
source_type TEXT DEFAULT 'pdf' CHECK (source_type IN ('pdf', 'markdown', 'txt', 'youtube', 'manual_paste'))
source_url TEXT -- YouTube video URL
processing_requested BOOLEAN DEFAULT true -- Markdown cleanup flag

-- New indexes
CREATE INDEX idx_documents_source_type ON documents(source_type);
```

**chunks table**:
```sql
-- New column
source_timestamp INTEGER -- Milliseconds offset for YouTube videos

-- New index
CREATE INDEX idx_chunks_source_timestamp ON chunks(source_timestamp) WHERE source_timestamp IS NOT NULL;
```

**background_jobs.payload**:
```json
{
  "source_type": "youtube",
  "source_url": "https://youtube.com/watch?v=...",
  "processing_requested": false,
  "raw_content": "[0:00] Transcript text..."
}
```

## Dependencies and Libraries

### New Dependencies

**youtube-transcript** (v5.x):
- Purpose: Fetch YouTube transcripts without API key
- Usage: Auto-fetch transcripts from video URLs
- Installation: `npm install youtube-transcript`
- No additional configuration required

### Existing Dependencies (Reused)

**@google/genai** (v0.3.0):
- Purpose: All AI processing (extraction, chunking, embedding)
- Usage: PDF extraction, markdown formatting, semantic chunking
- Already installed and configured

**@supabase/supabase-js** (v2.57.4):
- Purpose: Database and storage operations
- Usage: File uploads, document records, chunks storage
- Already configured with service role key

**jsonrepair** (bundled with worker):
- Purpose: Fix malformed JSON from Gemini responses
- Usage: Parse chunking results reliably
- Already in use for PDF processing

### Development Dependencies

**@types/youtube-transcript**:
- Purpose: TypeScript definitions for youtube-transcript
- Installation: `npm install --save-dev @types/youtube-transcript` (if available)
- Fallback: Manual type declarations

## Testing Strategy

### Unit Tests

**Worker Handler Functions**:
```typescript
// Test each format processor independently
test('processPDF extracts markdown', async () => { ... });
test('processMarkdown respects cleanup flag', async () => { ... });
test('processTextFile formats to markdown', async () => { ... });
test('processYouTubeTranscript preserves timestamps', async () => { ... });
test('processManualPaste detects transcript format', async () => { ... });

// Test helper functions
test('extractYouTubeVideoId handles multiple URL formats', () => { ... });
test('parseManualTranscript handles various timestamp formats', () => { ... });
test('stripFrontMatter extracts YAML metadata', () => { ... });
test('formatTimestamp converts milliseconds correctly', () => { ... });
```

**Server Actions**:
```typescript
test('uploadDocument validates file types', async () => { ... });
test('fetchYouTubeTranscript returns formatted text', async () => { ... });
test('upload rollback occurs on database failure', async () => { ... });
```

### Integration Tests

**End-to-End Upload Flows**:
```typescript
test('markdown upload without processing', async () => {
  // Upload markdown file with processingRequested=false
  // Verify document created
  // Verify job created
  // Wait for processing
  // Verify chunks created
  // Verify embeddings generated
});

test('YouTube auto-fetch and process', async () => {
  // Submit YouTube URL
  // Verify transcript fetched
  // Verify processing completes
  // Verify timestamps preserved in chunks
});
```

**Format-Specific Processing**:
```typescript
test('all formats produce searchable chunks', async () => {
  // Upload one document of each type
  // Wait for all to process
  // Query chunks for each document
  // Verify embeddings exist
  // Test similarity search across formats
});
```

### Manual Testing Checklist

**Upload UI**:
- [ ] All 5 tabs display correctly
- [ ] PDF drag-and-drop works (existing)
- [ ] Markdown upload shows cleanup checkbox
- [ ] Text file upload works
- [ ] YouTube URL input validates format
- [ ] Fetch button retrieves transcript
- [ ] Manual transcript paste textarea works
- [ ] Generic paste textarea accepts content
- [ ] Cost estimation shows for all formats

**Processing**:
- [ ] ProcessingDock shows correct icon per format
- [ ] Progress updates appear in real-time
- [ ] All formats reach 100% completion
- [ ] Error handling shows user-friendly messages
- [ ] Retry works for failed jobs

**Document Reading**:
- [ ] Markdown renders correctly for all formats
- [ ] YouTube timestamps are clickable links
- [ ] Links navigate to correct video position
- [ ] Text formatting preserved from original
- [ ] Search works across all document types

### Test Data

**Sample Documents**:
- `test-files/sample.pdf` - Existing test PDF (5 pages)
- `test-files/sample.md` - Markdown with front matter
- `test-files/sample.txt` - Plain text article
- `test-files/sample-youtube.txt` - Transcript with timestamps
- `test-files/sample-paste.txt` - Generic web article

**Test YouTube Videos**:
- Educational video with available transcript
- Short video (<5 min) for fast testing
- Video with restricted transcript (fallback test)

### Performance Testing

**Processing Time Benchmarks**:
- Markdown (1MB): <30 seconds
- Text file (500KB): <45 seconds
- YouTube (20-min video): <90 seconds
- Manual paste (10KB): <20 seconds

**Cost Testing**:
- Track Gemini API costs per format
- Verify all formats stay <$0.05/document
- Monitor embedding generation costs

### Edge Cases to Test

**Format Detection**:
- Pasted content with timestamps vs without
- Markdown with/without front matter
- YouTube URLs in various formats
- Text files with different encodings (UTF-8 only MVP)

**Error Scenarios**:
- YouTube video with no transcript available
- Invalid YouTube URL format
- Empty file uploads
- Very large files (>10MB)
- Malformed markdown (broken links, headers)
- Transcript with inconsistent timestamp formats

**Boundary Conditions**:
- Single-word markdown file
- YouTube video with no speech (music)
- Text file with only special characters
- Extremely long pasted content (>100KB)

## Success Criteria

### Functional Requirements
- [ ] **PDF Processing**: Existing functionality works unchanged (regression test)
- [ ] **Markdown Upload**: User can upload .md files with optional AI cleanup checkbox
- [ ] **Text File Upload**: .txt files automatically formatted to readable markdown
- [ ] **YouTube Auto-Fetch**: URL input fetches transcript within 10 seconds
- [ ] **YouTube Manual Paste**: Fallback textarea accepts manually pasted transcripts
- [ ] **Generic Paste**: Any pasted text processed into clean markdown
- [ ] **Timestamp Preservation**: YouTube chunks contain clickable timestamp links
- [ ] **Semantic Chunking**: All formats produce 200-500 word semantic chunks
- [ ] **Embeddings**: All chunks have valid pgvector embeddings (768 dimensions)
- [ ] **Search**: Similarity search works across all document types

### Technical Requirements
- [ ] **Processing Success Rate**: ≥95% for all formats
- [ ] **Processing Time**: <2 minutes for typical documents (5-page PDF, 10KB text, 20-min video)
- [ ] **API Cost**: <$0.05 per document (averaged across formats)
- [ ] **Storage Efficiency**: Markdown in Storage, chunks in DB (no full content duplication)
- [ ] **Database Schema**: Migration 010 applied successfully
- [ ] **Worker Stability**: No increase in timeout errors or crashes
- [ ] **Checkpoint Recovery**: Format-specific resumption works
- [ ] **Type Safety**: No TypeScript errors, all new functions documented

### User Experience Requirements
- [ ] **UI Clarity**: Each upload method clearly labeled with icons
- [ ] **Progress Visibility**: ProcessingDock shows format-specific icons and status
- [ ] **Error Messages**: User-friendly errors for fetch failures, invalid URLs
- [ ] **Fallback UX**: YouTube manual paste workflow intuitive when auto-fetch fails
- [ ] **No Regressions**: Existing PDF upload workflow unchanged
- [ ] **Performance**: No perceived UI lag when switching tabs or submitting

### Quality Requirements
- [ ] **Test Coverage**: ≥80% coverage for new worker handler functions
- [ ] **Integration Tests**: All 5 upload flows tested end-to-end
- [ ] **Documentation**: CLAUDE.md updated, MULTI_FORMAT_GUIDE.md created
- [ ] **Code Quality**: ESLint passes, JSDoc on all exported functions
- [ ] **No Technical Debt**: All TODOs resolved, no commented-out code

### Acceptance Testing
- [ ] **Markdown Scenario**: Upload Obsidian export with front matter, verify rendering
- [ ] **YouTube Scenario**: Fetch educational video transcript, verify clickable timestamps in reader
- [ ] **Text Scenario**: Upload plain research paper, verify readable formatting
- [ ] **Paste Scenario**: Paste web article, verify structure and headings
- [ ] **Cross-Format Search**: Upload one of each type, search finds relevant chunks across all

## Notes and Considerations

### Implementation Challenges

**YouTube Transcript Reliability**:
- Library uses YouTube's internal API (no auth required)
- May break if YouTube changes API
- **Mitigation**: Prioritize manual paste fallback in UX, monitor library issues
- **Fallback Strategy**: Clear error message + pre-filled URL in manual paste

**Timestamp Detection False Positives**:
- Generic pasted text might contain timestamp-like patterns (e.g., "9:00 AM meeting")
- **Mitigation**: Only treat as YouTube if `source_url` present OR explicit video ID pattern
- **Detection Logic**: Require multiple consecutive timestamp lines for auto-detection

**Markdown Front Matter Complexity**:
- YAML parsing can be complex (multiline values, special characters)
- **Mitigation**: Basic key-value parsing for MVP, ignore complex structures
- **Future Enhancement**: Use proper YAML parser (js-yaml) in Phase 2

**Gemini Response Consistency**:
- JSON schema helps but responses may still vary
- **Mitigation**: Continue using `jsonrepair` for robustness
- **Testing**: Validate with diverse input samples

**Processing Cost Control**:
- YouTube videos can be long (1+ hour transcripts)
- **Mitigation**: Implement max length warnings in UI (>30 min videos)
- **Cost Tracking**: Log token usage per format for monitoring

### Potential Future Enhancements

**Phase 2 Features**:
- **Batch Upload**: Multiple files at once with queue management
- **Format Auto-Detection**: Smart detection of pasted content type
- **Video Player Embedding**: Show YouTube player inline in reader
- **Multi-Language Support**: YouTube transcript language selection
- **Export with Source**: Include YouTube URL in export bundles
- **Front Matter Preservation**: Parse and display metadata in document view

**Phase 3 Features**:
- **OCR Support**: Scanned PDFs and images via Gemini vision
- **EPUB/DOCX Support**: Additional document formats
- **Browser Extension**: "Save to Rhizome" button for web content
- **Notion/Obsidian Sync**: Direct integration with note-taking apps
- **Real-time Preview**: Live markdown rendering during paste

### Architectural Decisions

**Why Gemini for Everything**:
- **Consistency**: Single AI model understands all formats uniformly
- **Quality**: Native multimodal understanding superior to chained models
- **Simplicity**: No PDF parsing libraries, encoding detection, format converters
- **Future-Proof**: Easy to add new formats (audio, video) with same pipeline

**Why Semantic Chunking (Not Timestamp-Based)**:
- **Quality**: Users want to learn concepts, not arbitrary time slices
- **Searchability**: Semantic chunks produce better similarity matches
- **Consistency**: Same chunking strategy across all document types
- **Compromise**: Store one representative timestamp per YouTube chunk for context

**Why Hybrid Storage Pattern**:
- **Ownership**: Users own their markdown files (can export)
- **Performance**: PostgreSQL pgvector needed for similarity search
- **Cost**: Storage cheaper than database for large immutable content
- **Portability**: Export bundles include original markdown

**Why Optional Markdown Processing**:
- **User Autonomy**: Respect users' existing formatting choices
- **Speed**: Skip processing when not needed
- **Quality**: Some markdown (Obsidian exports) already excellent
- **Trust**: Users feel in control, not forced into AI processing

### Migration Strategy

**Rollout Plan**:
1. Deploy database migration first (backward compatible)
2. Deploy worker with new handlers (PDF processing unchanged)
3. Deploy frontend with new UI (progressive enhancement)
4. Monitor processing success rates per format
5. Adjust Gemini prompts based on quality feedback

**Backward Compatibility**:
- Existing PDFs have `source_type='pdf'` via migration UPDATE
- New columns nullable or have defaults
- Worker handler checks `source_type` before routing
- Old jobs without `source_type` default to PDF logic

**Monitoring**:
- Track processing success rate by `source_type`
- Monitor Gemini API costs per format
- Watch for timeout increases
- Check chunk quality (word count distribution)

### Team Notes

**Frontend Focus**:
- Tabbed UI is key to UX success
- YouTube URL validation critical (reduce fetch errors)
- Manual paste fallback must be obvious when fetch fails
- Cost estimation should show for all formats

**Backend Focus**:
- Worker handler routing must be clean and testable
- Each format processor should be independent function
- Reuse chunking/embedding logic across formats
- Maintain checkpoint recovery for all formats

**Testing Focus**:
- End-to-end tests for each upload flow
- YouTube library reliability testing
- Timestamp parsing edge cases
- Cross-format search quality validation

**Documentation Focus**:
- Update CLAUDE.md with format-specific patterns
- Create user guide with screenshots
- Document Gemini prompts for future tuning
- Add troubleshooting section for YouTube failures

---

*This implementation plan is ready for execution. Begin with Phase 1 tasks and progress sequentially through the phases. Each task is sized for completion within the estimated effort and includes clear acceptance criteria.*

**Next Steps**:
1. Review and approve plan
2. Create GitHub issues from task breakdown (optional)
3. Start Phase 1 Task 1.1: Database migration
4. Execute plan task by task
5. Update plan if requirements change during implementation

**Estimated Total Effort**: 10 working days (2 weeks with buffer)  
**Team Size**: 1-2 full-stack developers  
**Risk Level**: Medium (YouTube library dependency, Gemini consistency)