# Product Requirements & Plans: Document Upload to Storage

**Version:** 2.0  
**Date:** January 26, 2025  
**Feature:** Document Upload to Storage with Cross-Document Connection Detection  
**Author:** AI Development Team  
**Status:** Ready for Implementation  
**Confidence Level:** 9/10 (One-pass implementation success probability - comprehensive Phase 8 specifications added)

---

## 1. Executive Summary

### Feature Overview
A sophisticated document ingestion and knowledge synthesis system for Rhizome V2 that accepts multiple file formats (PDF, TXT, Markdown, EPUB, YouTube transcripts), processes them through Gemini AI to create clean markdown versions, and provides a delightful upload experience with real-time progress tracking. The system implements a two-phase AI processing approach (quick metadata + full extraction) with background processing and beautiful preview cards. Post-processing includes automatic cross-document connection detection using pgvector similarity search and Gemini analysis, creating an intelligent knowledge network that surfaces non-obvious relationships between documents through elegant margin indicators, split-screen comparisons, and connection-aware flashcards.

### Business Value
- **User Productivity**: Batch upload up to 10 documents simultaneously
- **Knowledge Synthesis**: Automatic discovery of connections across documents (supports, contradicts, extends, bridges)
- **Enhanced Learning**: Connection-aware flashcards that test relationship understanding
- **Non-Intrusive Discovery**: Margin indicators preserve reading flow while surfacing insights
- **Data Portability**: User-owned content with export capability
- **Delightful UX**: Real-time progress, preview cards, no modal interruptions

### Success Metrics
- Upload success rate > 95%
- Processing time < 2 minutes for average document (20 pages)
- Connection detection < 30 seconds for 20-page document
- Connection relevance > 80% (users find them meaningful)
- User satisfaction with metadata extraction accuracy
- Zero data loss during processing
- Cost per document < $0.15 for AI processing (includes connection detection)
- Connection engagement rate > 30% (users interact with discovered connections)

---

## 2. Technical Requirements

### Functional Requirements

#### Core Upload Capabilities
- Support for PDF, TXT, Markdown, EPUB, YouTube transcripts
- Drag & drop or file picker interface  
- Batch upload up to 10 documents simultaneously
- Maximum file size: 50MB
- Real-time upload progress tracking

#### AI Processing
- Two-phase processing: Quick metadata (seconds) + Full extraction (minutes)
- Metadata extraction: title, author, summary, themes, tags
- Semantic chunking for knowledge synthesis
- Clean markdown generation preserving formatting
- YouTube transcript cleaning with optional timestamp preservation
- Post-processing connection detection: pgvector similarity + Gemini analysis
- Four connection types: supports, contradicts, extends, bridges
- Importance scoring for high-value connection notifications

#### User Experience
- Preview cards with extracted/default metadata
- Optional cover image (extract from PDF/upload custom/none)
- AI enhancement button for metadata ("magic stars")
- Background processing with visible progress dock
- Delightful completion notifications with action buttons
- Margin indicators for discovered connections (colored dots)
- Hover preview cards showing connection details
- Split-screen comparison mode for deep exploration
- Connection sidebar for managing relationships
- Manual connection creation via "clipboard" pattern
- Connection-based flashcards for relationship learning
- Activity feed on synthesis page
- Real-time notifications for high-value discoveries

### Non-Functional Requirements

#### Performance
- Quick metadata extraction < 5 seconds
- Full document processing < 2 minutes (20 pages)
- Virtual scrolling for documents > 100 pages
- Streaming markdown from storage (never load fully)

#### Scalability
- 10 concurrent document processing limit
- Queue management with prioritization
- Horizontal scaling ready for Edge Functions

#### Security
- User data isolation through RLS policies
- Signed URLs with 1-hour expiry
- API keys stored securely in environment
- No client-side exposure of sensitive data

#### Reliability
- Atomic operations with rollback support
- Retry mechanism for failed processing
- Graceful degradation for missing features
- Export system for data ownership

---

## 3. Architecture Design

### System Architecture

```typescript
// High-Level Flow
Client (Upload) → Storage → Edge Function → Gemini API → Database/Storage
                    ↓                         ↓
              ProcessingDock          Realtime Updates
```

### Storage Architecture

```typescript
// HYBRID STORAGE PATTERN - Critical Architecture Decision
// Rule: Large immutable files in Storage, queryable data in PostgreSQL

// Supabase Storage Structure
userId/
└── documentId/
    ├── source.pdf          // Original upload (immutable)
    ├── content.md          // Processed markdown (immutable, large)
    ├── cover.jpg           // Optional cover image
    └── export.bundle.zip   // User's portable backup

// PostgreSQL Database (queryable, mutable)
- documents table: Metadata only (title, storage_path, status)
- chunks table: Text content + embeddings for search
- components table: User annotations/flashcards (ECS pattern)
- processing_queue table: Status tracking
```

### Component Architecture

```typescript
// UI Components (No Modals Philosophy)
src/components/
├── upload/
│   ├── UploadZone.tsx         // Drag & drop interface
│   ├── DocumentPreviewCard.tsx // Metadata display
│   ├── CoverImageSelector.tsx  // Image options
│   └── BatchUploadGrid.tsx    // Multiple files
├── processing/
│   ├── ProcessingDock.tsx     // Bottom dock (collapsible)
│   ├── ProgressBar.tsx        // Individual progress
│   └── CompletionNotification.tsx
├── connections/                // Phase 8 Connection Components
│   ├── MarginIndicators.tsx   // Colored dots in margins
│   ├── ConnectionPreview.tsx  // HoverCard preview
│   ├── ConnectionSidebar.tsx  // Sheet with connection details
│   ├── ComparisonView.tsx     // Split-screen comparison
│   ├── ConnectionClipboard.tsx // Manual connection dialog
│   └── ConnectionNotifications.tsx // Dropdown notifications
├── synthesis/
│   ├── ActivityFeed.tsx       // Connection activity timeline
│   └── ConnectionFilters.tsx  // Filter by type/strength
├── study/
│   └── ConnectionFlashcard.tsx // Relationship-based cards
└── ui/                        // Existing shadcn components

// API Structure
src/app/api/
├── metadata/extract/route.ts  // Quick metadata extraction
├── process/document/route.ts  // Full processing trigger
├── youtube/transcript/route.ts // YouTube special handling
├── upload/signed-url/route.ts // Secure upload URLs
├── connections/
│   ├── create/route.ts        // Manual connection creation
│   ├── [id]/
│   │   ├── route.ts          // Update/dismiss connection
│   │   └── comparison/route.ts // Get comparison data
│   ├── clipboard/
│   │   ├── start/route.ts    // Start manual connection
│   │   └── complete/route.ts // Complete connection
│   ├── feed/route.ts         // Activity feed
│   └── search/route.ts       // Search connections
├── notifications/
│   ├── connections/route.ts  // Connection notifications
│   └── [id]/read/route.ts    // Mark as read
└── documents/
    ├── [id]/
    │   ├── settings/route.ts  // Connection settings
    │   └── detect-connections/route.ts // Trigger detection
    └── detection-status/route.ts // Batch status check

// Edge Functions
supabase/functions/
├── process-document/
│   └── index.ts               // Gemini processing pipeline
└── detect-connections/
    └── index.ts               // Connection detection with pgvector + Gemini
```

### Database Schema Updates

```sql
-- Add to existing documents table
ALTER TABLE documents ADD COLUMN
  original_filename TEXT,
  cover_image_path TEXT,
  processing_queue_id UUID,
  cost_estimate DECIMAL(10,4);

-- New processing queue table
CREATE TABLE processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users NOT NULL,
  status TEXT DEFAULT 'pending', 
  -- Status values: pending|metadata|processing|chunking|embedding|connections|complete|failed
  progress INTEGER DEFAULT 0, -- 0-100
  status_message TEXT,
  error_message TEXT,
  metadata JSONB, -- Extracted metadata
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connection-related tables (Phase 8)
CREATE TABLE connection_dismissals (
  user_id UUID NOT NULL REFERENCES auth.users,
  connection_id UUID NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT, -- 'not_relevant', 'incorrect', 'duplicate'
  PRIMARY KEY (user_id, connection_id)
);

CREATE TABLE connection_clipboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  source_chunk_id UUID NOT NULL REFERENCES chunks,
  source_text TEXT NOT NULL,
  source_document_id UUID NOT NULL REFERENCES documents,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  type TEXT NOT NULL, -- 'connection_found', 'batch_complete'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE connection_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  connection_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'created', 'modified', 'annotated'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_queue_status ON processing_queue(status);
CREATE INDEX idx_queue_user ON processing_queue(user_id);
CREATE INDEX idx_queue_created ON processing_queue(created_at);

-- RLS policies
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own queue items" ON processing_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own queue items" ON processing_queue
  FOR UPDATE USING (auth.uid() = user_id);
```

---

## 4. Implementation Blueprint

### Phase 1: Upload UI Components (2 days)

#### 1.1 UploadZone Component
```typescript
// src/components/upload/UploadZone.tsx
// Reference: src/components/ui/card.tsx for component structure

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { createSignedUploadUrl } from '@/app/actions/upload';

export function UploadZone() {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Validate file types and sizes
    const validFiles = acceptedFiles.filter(file => {
      const validTypes = ['application/pdf', 'text/plain', 'text/markdown'];
      return validTypes.includes(file.type) && file.size <= 50 * 1024 * 1024;
    });
    
    // Create preview cards for each file
    setFiles(validFiles);
    
    // Start upload process
    for (const file of validFiles) {
      await uploadFile(file);
    }
  }, []);
  
  const uploadFile = async (file: File) => {
    // Get signed URL from server action
    const { signedUrl, documentId } = await createSignedUploadUrl(
      file.name,
      file.type
    );
    
    // Upload with progress tracking using XMLHttpRequest
    const xhr = new XMLHttpRequest();
    
    xhr.upload.onprogress = (event) => {
      const progress = (event.loaded / event.total) * 100;
      updateFileProgress(file.name, progress);
    };
    
    xhr.onload = () => {
      if (xhr.status === 200) {
        triggerProcessing(documentId);
      }
    };
    
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  };
  
  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    maxFiles: 10,
    maxSize: 50 * 1024 * 1024
  });
  
  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center",
        isDragging && "border-primary bg-primary/5"
      )}
    >
      <input {...getInputProps()} />
      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
      <p>Drag & drop documents here, or click to select</p>
      <p className="text-sm text-muted-foreground mt-2">
        PDF, TXT, Markdown, EPUB (max 50MB, up to 10 files)
      </p>
    </div>
  );
}
```

#### 1.2 DocumentPreviewCard Component
```typescript
// src/components/upload/DocumentPreviewCard.tsx
// Reference: src/components/ui/card.tsx for base structure

interface DocumentPreviewProps {
  file: File;
  metadata?: {
    title: string;
    author?: string;
    summary?: string;
    themes?: string[];
  };
  coverImage?: string;
  onEnhance: () => void;
  onUpdateCover: (image: string | null) => void;
}

export function DocumentPreviewCard({ 
  file, 
  metadata, 
  coverImage,
  onEnhance,
  onUpdateCover 
}: DocumentPreviewProps) {
  return (
    <Card className="relative">
      <CardHeader>
        <div className="flex items-start gap-4">
          {/* Cover Image Section */}
          <CoverImageSelector
            currentImage={coverImage}
            onUpdate={onUpdateCover}
            documentName={file.name}
          />
          
          {/* Metadata Section */}
          <div className="flex-1">
            <CardTitle>{metadata?.title || file.name}</CardTitle>
            {metadata?.author && (
              <p className="text-sm text-muted-foreground">{metadata.author}</p>
            )}
            
            {/* AI Enhancement Button */}
            <Button
              onClick={onEnhance}
              size="sm"
              variant="ghost"
              className="mt-2"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Enhance with AI
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {metadata?.summary && (
          <p className="text-sm">{metadata.summary}</p>
        )}
        
        {metadata?.themes && (
          <div className="flex flex-wrap gap-1 mt-2">
            {metadata.themes.map(theme => (
              <Badge key={theme} variant="secondary">{theme}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### Phase 2: File Validation & Storage (1 day)

#### 2.1 Server Actions for Upload
```typescript
// src/app/actions/upload.ts
// Reference: src/lib/supabase/server.ts for Supabase client

'use server';

import { createServerClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function createSignedUploadUrl(
  filename: string,
  mimeType: string
) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Unauthorized');
  
  // Validate file type
  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/epub+zip'
  ];
  
  if (!allowedTypes.includes(mimeType)) {
    throw new Error('Invalid file type');
  }
  
  // Generate document ID and storage path
  const documentId = uuidv4();
  const storagePath = `${user.id}/${documentId}/source-${filename}`;
  
  // Create document record
  const { error: dbError } = await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: user.id,
      title: filename,
      storage_path: `${user.id}/${documentId}`,
      original_filename: filename,
      processing_status: 'pending'
    });
  
  if (dbError) throw dbError;
  
  // Generate signed upload URL
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUploadUrl(storagePath, 60); // 60 seconds to upload
  
  if (error) throw error;
  
  return {
    signedUrl: data.signedUrl,
    documentId,
    storagePath
  };
}

export async function triggerDocumentProcessing(documentId: string) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Unauthorized');
  
  // Create processing queue entry
  const { data: queueEntry, error } = await supabase
    .from('processing_queue')
    .insert({
      document_id: documentId,
      user_id: user.id,
      status: 'pending'
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // Trigger Edge Function
  const { error: functionError } = await supabase.functions.invoke(
    'process-document',
    {
      body: {
        documentId,
        queueId: queueEntry.id
      }
    }
  );
  
  if (functionError) throw functionError;
  
  return queueEntry.id;
}
```

### Phase 3: AI Metadata Extraction (2 days)

#### 3.1 Metadata Extraction Endpoint
```typescript
// src/app/api/metadata/extract/route.ts
// Pattern: Use Gemini for quick metadata extraction

import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();
    const supabase = createServerClient();
    
    // Get document from storage
    const { data: doc } = await supabase
      .from('documents')
      .select('storage_path, original_filename')
      .eq('id', documentId)
      .single();
    
    // Download first 3 pages worth of content (or full if small)
    const { data: fileData } = await supabase.storage
      .from('documents')
      .download(`${doc.storage_path}/source-${doc.original_filename}`);
    
    // Convert to base64 (limit to first 1MB for quick processing)
    const buffer = await fileData.arrayBuffer();
    const limitedBuffer = buffer.slice(0, 1024 * 1024);
    const base64 = Buffer.from(limitedBuffer).toString('base64');
    
    // Extract metadata with Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `Extract metadata from this document. Return JSON only.
    Focus on: title, author, publication date, summary (2-3 sentences), 
    main themes (3-5 tags), document type.`;
    
    const result = await model.generateContent({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64
            }
          },
          { text: prompt }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            author: { type: "string" },
            publicationDate: { type: "string" },
            summary: { type: "string" },
            themes: { 
              type: "array",
              items: { type: "string" }
            },
            documentType: { type: "string" }
          },
          required: ["title", "summary", "themes"]
        }
      }
    });
    
    const metadata = JSON.parse(result.response.text());
    
    // Calculate cost estimate for full processing
    const fileSizeMB = buffer.byteLength / (1024 * 1024);
    const estimatedTokens = fileSizeMB * 1000; // Rough estimate
    const costEstimate = (estimatedTokens / 1000) * 0.00025; // Gemini pricing
    
    // Update document with metadata
    await supabase
      .from('documents')
      .update({
        title: metadata.title,
        cost_estimate: costEstimate
      })
      .eq('id', documentId);
    
    // Update processing queue with metadata
    await supabase
      .from('processing_queue')
      .update({
        metadata,
        status: 'metadata',
        progress: 10
      })
      .eq('document_id', documentId);
    
    return NextResponse.json({ metadata, costEstimate });
    
  } catch (error) {
    console.error('Metadata extraction failed:', error);
    return NextResponse.json(
      { error: 'Failed to extract metadata' },
      { status: 500 }
    );
  }
}
```

### Phase 3.5: Connection Detection System (5 days)

#### 3.5.1 Connection Detection Backend
```typescript
// supabase/functions/detect-connections/index.ts
// Runs after document processing as background job

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!);
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  const { documentId } = await req.json();
  
  // Process in background using EdgeRuntime.waitUntil
  const detectionPromise = detectConnectionsAsync(documentId);
  
  return new Response(
    JSON.stringify({ status: 'detecting', documentId }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

async function detectConnectionsAsync(documentId: string) {
  try {
    // Update status
    await updateDetectionStatus(documentId, 'detecting', 'Searching for connections');
    
    // 1. Get chunks from new document
    const { data: newChunks } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index');
    
    let connectionsFound = 0;
    const batchSize = 5; // Process in batches for efficiency
    
    for (let i = 0; i < newChunks.length; i += batchSize) {
      const batch = newChunks.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (chunk) => {
        // 2. Use pgvector for similarity search
        const { data: similar } = await supabase.rpc('match_chunks', {
          query_embedding: chunk.embedding,
          match_threshold: 0.75,
          match_count: 10,
          exclude_document: documentId
        });
        
        // 3. Analyze top matches with Gemini
        for (const match of similar.slice(0, 5)) {
          const connectionType = await analyzeConnectionType(
            chunk.content,
            match.content
          );
          
          if (connectionType && connectionType !== 'none') {
            // 4. Create connection entity using ECS pattern
            await createConnectionEntity({
              sourceChunkId: chunk.id,
              targetChunkId: match.id,
              sourceDocumentId: documentId,
              targetDocumentId: match.document_id,
              type: connectionType,
              strength: match.similarity,
              reasoning: await generateReasoning(chunk.content, match.content, connectionType)
            });
            
            connectionsFound++;
          }
        }
      }));
      
      // Update progress
      const progress = Math.round((i / newChunks.length) * 100);
      await updateDetectionStatus(
        documentId,
        'detecting',
        `Found ${connectionsFound} connections`,
        progress
      );
    }
    
    // 5. Complete and notify if high-value connections
    await updateDetectionStatus(documentId, 'complete', `Detection complete: ${connectionsFound} connections found`, 100);
    
    if (connectionsFound > 0) {
      await createNotification(documentId, connectionsFound);
    }
    
  } catch (error) {
    console.error('Connection detection failed:', error);
    await updateDetectionStatus(documentId, 'failed', error.message);
  }
}

async function analyzeConnectionType(source: string, target: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  const result = await model.generateContent({
    contents: [{
      parts: [{
        text: `Analyze the relationship between these passages:
        
        Passage A: "${source.substring(0, 500)}..."
        Passage B: "${target.substring(0, 500)}..."
        
        Classify as ONE of:
        - supports: B reinforces A's argument
        - contradicts: B opposes A's claim
        - extends: B builds upon A's idea
        - bridges: A and B connect different domains
        - none: No meaningful connection
        
        Return only the classification word.`
      }]
    }]
  });
  
  return result.response.text().trim().toLowerCase();
}
```

#### 3.5.2 Frontend Connection Components
```typescript
// components/connections/MarginIndicators.tsx
// See brainstorming doc for complete implementation

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const CONNECTION_COLORS = {
  supports: 'bg-green-500',
  contradicts: 'bg-red-500',
  extends: 'bg-blue-500',
  bridges: 'bg-amber-500'
};

interface MarginIndicatorProps {
  connections: Connection[];
  position: { top: number };
  onConnectionClick: (id: string) => void;
}

export function MarginIndicator({ connections, position, onConnectionClick }: MarginIndicatorProps) {
  return (
    <div 
      className="absolute left-2" 
      style={{ top: position.top }}
    >
      {connections.slice(0, 5).map((conn, idx) => (
        <HoverCard key={conn.id}>
          <HoverCardTrigger asChild>
            <button
              onClick={() => onConnectionClick(conn.id)}
              className={cn(
                "w-2 h-2 rounded-full mb-1 transition-all hover:scale-150",
                CONNECTION_COLORS[conn.type]
              )}
              style={{ marginTop: idx * 12 }}
            />
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant={conn.type === 'contradicts' ? 'destructive' : 'default'}>
                  {conn.type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {Math.round(conn.strength * 100)}% match
                </span>
              </div>
              <p className="text-sm">{conn.targetDocument.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {conn.targetChunk.preview}
              </p>
            </div>
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  );
}
```

### Phase 4: Processing Queue System (3 days)

#### 4.1 Edge Function for Document Processing
```typescript
// supabase/functions/process-document/index.ts
// CRITICAL: This is where Gemini does ALL the heavy lifting

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!);
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  try {
    const { documentId, queueId } = await req.json();
    
    // Use EdgeRuntime.waitUntil for background processing
    // This allows the function to continue after response
    const processingPromise = processDocumentAsync(documentId, queueId);
    
    // Return immediately while processing continues
    return new Response(
      JSON.stringify({ status: 'processing', queueId }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});

async function processDocumentAsync(documentId: string, queueId: string) {
  try {
    // Update status to processing
    await updateQueueStatus(queueId, 'processing', 20, 'Downloading document');
    
    // Get document from database
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    // Download from storage
    const { data: fileData } = await supabase.storage
      .from('documents')
      .download(`${doc.storage_path}/source-${doc.original_filename}`);
    
    // Convert to base64
    const buffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    // Update status
    await updateQueueStatus(queueId, 'processing', 30, 'Extracting content with AI');
    
    // Process with Gemini 1.5 Pro
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    const EXTRACTION_PROMPT = `
    You are an expert document processor. Extract this document in two parts:
    
    1. CONTENT EXTRACTION:
    - Convert the entire document to clean, well-formatted markdown
    - Preserve all headings, lists, tables, and formatting
    - Clean up any OCR errors or formatting issues
    - Maintain document structure and hierarchy
    - Remove page numbers, headers, footers
    - Preserve important footnotes inline or at section end
    
    2. SEMANTIC CHUNKING:
    - Break the content into semantic chunks (300-500 words each)
    - Each chunk should be a complete thought or concept
    - Preserve context by including section headers
    - Identify 2-3 key themes for each chunk
    - Maintain reading flow and coherence
    
    Return as JSON with structure:
    {
      "markdown": "full document in markdown",
      "chunks": [
        {
          "content": "chunk text",
          "themes": ["theme1", "theme2"],
          "startOffset": 0,
          "endOffset": 500
        }
      ],
      "metadata": {
        "totalWords": 0,
        "readingTime": "X minutes",
        "complexity": "beginner|intermediate|advanced"
      }
    }`;
    
    const result = await model.generateContent({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: doc.original_filename.endsWith('.pdf') 
                ? 'application/pdf' 
                : 'text/plain',
              data: base64
            }
          },
          { text: EXTRACTION_PROMPT }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            markdown: { type: "string" },
            chunks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string" },
                  themes: { 
                    type: "array",
                    items: { type: "string" }
                  },
                  startOffset: { type: "number" },
                  endOffset: { type: "number" }
                }
              }
            },
            metadata: {
              type: "object",
              properties: {
                totalWords: { type: "number" },
                readingTime: { type: "string" },
                complexity: { type: "string" }
              }
            }
          }
        }
      }
    });
    
    const extracted = JSON.parse(result.response.text());
    
    // Update status
    await updateQueueStatus(queueId, 'chunking', 60, 'Saving content and chunks');
    
    // Save markdown to storage
    const markdownPath = `${doc.storage_path}/content.md`;
    await supabase.storage
      .from('documents')
      .upload(markdownPath, extracted.markdown, {
        contentType: 'text/markdown'
      });
    
    // Generate embeddings and save chunks
    await updateQueueStatus(queueId, 'embedding', 70, 'Generating embeddings');
    
    const embeddingModel = genAI.getGenerativeModel({ 
      model: 'text-embedding-004' 
    });
    
    for (let i = 0; i < extracted.chunks.length; i++) {
      const chunk = extracted.chunks[i];
      
      // Generate embedding for chunk
      const embeddingResult = await embeddingModel.embedContent({
        content: chunk.content,
        taskType: 'RETRIEVAL_DOCUMENT'
      });
      
      // Save chunk to database
      await supabase
        .from('chunks')
        .insert({
          document_id: documentId,
          content: chunk.content,
          embedding: embeddingResult.embedding.values,
          themes: chunk.themes,
          start_offset: chunk.startOffset,
          end_offset: chunk.endOffset,
          chunk_index: i
        });
      
      // Update progress
      const progress = 70 + (i / extracted.chunks.length) * 25;
      await updateQueueStatus(
        queueId, 
        'embedding', 
        Math.round(progress),
        `Processing chunk ${i + 1} of ${extracted.chunks.length}`
      );
    }
    
    // Update document status
    await supabase
      .from('documents')
      .update({
        processing_status: 'complete',
        metadata: extracted.metadata
      })
      .eq('id', documentId);
    
    // Complete queue entry
    await updateQueueStatus(queueId, 'complete', 100, 'Processing complete');
    
  } catch (error) {
    console.error('Processing failed:', error);
    
    // Update queue with error
    await supabase
      .from('processing_queue')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', queueId);
    
    // Update document status
    await supabase
      .from('documents')
      .update({
        processing_status: 'failed'
      })
      .eq('id', documentId);
  }
}

async function updateQueueStatus(
  queueId: string,
  status: string,
  progress: number,
  message: string
) {
  await supabase
    .from('processing_queue')
    .update({
      status,
      progress,
      status_message: message,
      updated_at: new Date().toISOString(),
      ...(status === 'complete' && {
        completed_at: new Date().toISOString()
      })
    })
    .eq('id', queueId);
}
```

#### 4.2 Realtime Subscription for Progress
```typescript
// src/hooks/useProcessingStatus.ts
// Pattern: Subscribe to processing updates

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

export function useProcessingStatus(queueIds: string[]) {
  const [statuses, setStatuses] = useState<Map<string, ProcessingStatus>>(
    new Map()
  );
  
  useEffect(() => {
    const supabase = createBrowserClient();
    
    // Subscribe to realtime updates
    const subscription = supabase
      .channel('processing-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_queue',
          filter: `id=in.(${queueIds.join(',')})`
        },
        (payload) => {
          setStatuses(prev => {
            const updated = new Map(prev);
            updated.set(payload.new.id, payload.new);
            return updated;
          });
        }
      )
      .subscribe();
    
    // Initial load
    const loadStatuses = async () => {
      const { data } = await supabase
        .from('processing_queue')
        .select('*')
        .in('id', queueIds);
      
      if (data) {
        const statusMap = new Map();
        data.forEach(item => statusMap.set(item.id, item));
        setStatuses(statusMap);
      }
    };
    
    loadStatuses();
    
    return () => {
      subscription.unsubscribe();
    };
  }, [queueIds]);
  
  return statuses;
}
```

### Phase 5: Processing Dock UI (2 days)

#### 5.1 ProcessingDock Component
```typescript
// src/components/processing/ProcessingDock.tsx
// Pattern: Bottom dock that doesn't block content (No modals!)

import { useState } from 'react';
import { useProcessingStatus } from '@/hooks/useProcessingStatus';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export function ProcessingDock({ queueIds }: { queueIds: string[] }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const statuses = useProcessingStatus(queueIds);
  
  if (queueIds.length === 0) return null;
  
  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 bg-background border-t z-50",
      "transition-transform duration-200",
      isMinimized && "translate-y-[calc(100%-48px)]"
    )}>
      {/* Header Bar - Always Visible */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">
              Processing {queueIds.length} document{queueIds.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        
        <Button variant="ghost" size="sm">
          {isMinimized ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>
      
      {/* Expandable Content */}
      {!isMinimized && (
        <div className="border-t p-4 max-h-64 overflow-y-auto">
          {Array.from(statuses.entries()).map(([id, status]) => (
            <ProcessingItem key={id} status={status} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProcessingItem({ status }: { status: ProcessingStatus }) {
  const getStatusColor = () => {
    switch (status.status) {
      case 'complete': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'processing': return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };
  
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", getStatusColor())} />
          <span className="text-sm font-medium">
            {status.document?.title || 'Document'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {status.progress}%
        </span>
      </div>
      
      <Progress value={status.progress} className="h-1.5" />
      
      {status.status_message && (
        <p className="text-xs text-muted-foreground mt-1">
          {status.status_message}
        </p>
      )}
      
      {status.status === 'complete' && (
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/read/${status.document_id}`}>Read Now</Link>
          </Button>
          <Button size="sm" variant="ghost">
            Create Flashcards
          </Button>
        </div>
      )}
    </div>
  );
}
```

### Phase 6: YouTube Integration (1.5 days)

#### 6.1 YouTube Transcript Fetching
```typescript
// src/app/api/youtube/transcript/route.ts
// Special handling for YouTube videos

import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { url, preserveTimestamps = false } = await request.json();
    
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL' },
        { status: 400 }
      );
    }
    
    // Fetch transcript
    let transcript;
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (error) {
      // Fallback message for user
      return NextResponse.json({
        error: 'No transcript available for this video',
        fallbackOptions: [
          'Enable auto-generated captions on YouTube',
          'Use a transcript service like rev.com',
          'Manually paste transcript text'
        ]
      }, { status: 404 });
    }
    
    // Process transcript with Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const YOUTUBE_PROMPT = `
    Process this YouTube transcript into clean, readable markdown:
    
    1. Remove filler words and repeated phrases
    2. Add proper punctuation and paragraph breaks  
    3. Create logical sections based on topic changes
    4. Format speaker changes clearly (if multi-speaker)
    5. ${preserveTimestamps ? 'Preserve timestamps as [HH:MM:SS] markers at section starts' : 'Remove all timestamps'}
    6. Extract key topics and themes
    
    Transcript: ${JSON.stringify(transcript)}
    
    Return as JSON with structure:
    {
      "markdown": "processed content",
      "metadata": {
        "title": "video title if mentioned",
        "duration": "estimated duration",
        "speakers": ["list of speakers if identified"],
        "topics": ["main topics discussed"]
      }
    }`;
    
    const result = await model.generateContent(YOUTUBE_PROMPT);
    const processed = JSON.parse(result.response.text());
    
    // Generate thumbnail URL
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    
    return NextResponse.json({
      videoId,
      thumbnailUrl,
      ...processed
    });
    
  } catch (error) {
    console.error('YouTube processing failed:', error);
    return NextResponse.json(
      { error: 'Failed to process YouTube video' },
      { status: 500 }
    );
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}
```

### Phase 8: Connection Detection UI (15 days)

#### Phase 8.1: Margin Indicators (2 days)
```typescript
// components/connections/MarginIndicators.tsx
// Display connection dots in document margins

- [ ] Create MarginIndicator component with colored dots
- [ ] Implement color coding by connection type
- [ ] Add hover detection and preview trigger
- [ ] Handle multiple connections per chunk (max 5)
- [ ] Responsive sizing for mobile
```

#### Phase 8.2: Connection Preview Cards (1.5 days)
```typescript
// components/connections/ConnectionPreview.tsx
// HoverCard component for quick preview

- [ ] Build ConnectionPreview hover card
- [ ] Display type, source, strength, count
- [ ] Position intelligently (avoid edges)
- [ ] Add click handler to open sidebar
- [ ] Mobile tap behavior
```

#### Phase 8.3: Connection Sidebar (2 days)
```typescript
// components/connections/ConnectionSidebar.tsx
// Sheet component for detailed view

- [ ] Create ConnectionSidebar using Sheet
- [ ] Show full connection details
- [ ] List all connections for selected chunk
- [ ] Add "Compare" button for split-screen
- [ ] Enable connection editing/dismissal
- [ ] User notes on connections
```

#### Phase 8.4: Split-Screen Comparison (3 days)
```typescript
// components/connections/ComparisonView.tsx
// ResizablePanel for side-by-side viewing

- [ ] Build ComparisonView with two readers
- [ ] Implement ResizablePanel with handle
- [ ] Highlight connected passages
- [ ] Optional scroll synchronization
- [ ] Pin/unpin functionality
- [ ] Annotation tools for both documents
```

#### Phase 8.5: Manual Connection Creation (2 days)
```typescript
// components/connections/ConnectionClipboard.tsx
// Dialog for defining connection type

- [ ] Implement ConnectionClipboard state management
- [ ] "Start connection" context menu
- [ ] Floating connection badge
- [ ] Target selection UI
- [ ] Connection type dialog with RadioGroup
- [ ] Save manual connection via API
```

#### Phase 8.6: Connection Flashcards (1.5 days)
```typescript
// components/study/ConnectionFlashcard.tsx
// Special cards for testing relationships

- [ ] Create ConnectionFlashcard component
- [ ] Generate relationship questions
- [ ] Link flashcard to connection entity
- [ ] Special styling for connection cards
- [ ] Integration with study system
```

#### Phase 8.7: Notifications & Activity Feed (2 days)
```typescript
// components/connections/ConnectionNotifications.tsx
// components/synthesis/ActivityFeed.tsx

- [ ] Build ConnectionNotifications dropdown
- [ ] Real-time notification system
- [ ] Activity feed on synthesis page
- [ ] Filtering by type/date/importance
- [ ] Mark as read functionality
```

#### Phase 8.8: Document Settings & Privacy (1 day)
```typescript
// Document-level connection settings

- [ ] Add privacy toggle to document settings
- [ ] "Find connections now" button
- [ ] Connection detection status display
- [ ] Bulk enable/disable for library
- [ ] Connection type preferences
```

---

## 5. Integration Points

### External Services

#### Gemini API Integration
- **Endpoint**: `https://generativelanguage.googleapis.com`
- **Models Used**:
  - `gemini-1.5-flash`: Quick metadata extraction
  - `gemini-1.5-pro`: Full document processing
  - `text-embedding-004`: Chunk embeddings (768 dimensions)
- **Configuration**: API key in `GEMINI_API_KEY` environment variable
- **Rate Limits**: 60 RPM for Pro, 1500 RPM for Flash

#### YouTube Transcript API
- **Library**: `youtube-transcript` npm package
- **Fallbacks**: Manual transcript paste, external services
- **Thumbnail Pattern**: `https://img.youtube.com/vi/{videoId}/maxresdefault.jpg`

#### Connection Detection APIs (Phase 8)

##### Connection Management Endpoints
- `POST /api/connections/create` - Manual connection creation
- `PATCH /api/connections/:id` - Modify existing connection
- `DELETE /api/connections/:id/dismiss` - Hide connection
- `GET /api/connections/:id/comparison` - Get split-screen data

##### Connection Clipboard Flow
- `POST /api/connections/clipboard/start` - Begin manual connection
- `POST /api/connections/clipboard/complete` - Finish connection
- `GET /api/connections/clipboard` - Current clipboard state
- `DELETE /api/connections/clipboard` - Cancel in-progress

##### Discovery & Activity
- `GET /api/connections/feed` - Activity timeline with pagination
- `GET /api/chunks/:id/connections` - Connections for specific chunk
- `GET /api/connections/search` - Search by themes or content
- `GET /api/connections/progress/:documentId` - SSE progress stream

##### Notifications
- `GET /api/notifications/connections` - Unread notifications
- `POST /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/read-all` - Mark all read

##### Document Settings
- `PATCH /api/documents/:id/settings` - Connection preferences
- `POST /api/documents/:id/detect-connections` - Trigger detection
- `POST /api/documents/detection-status` - Batch status check

### Internal Systems

#### Supabase Storage
- **Bucket**: `documents`
- **Policies**: User isolation via RLS
- **Pattern**: `userId/documentId/filename`
- **Signed URLs**: 1-hour expiry

#### ECS Integration
```typescript
// Creating document entity
await ecs.createEntity(userId, {
  document: { 
    title, 
    storage_path,
    processing_status 
  }
});

// Adding flashcards from chunks
await ecs.createEntity(userId, {
  flashcard: { question, answer },
  source: { document_id, chunk_id }
});
```

#### Database Transactions
- Atomic document + queue creation
- Rollback on upload failure
- Chunk batch inserts with progress updates

---

## 6. Validation Gates

### Development Validation

```bash
# Code Quality Gates - MUST PASS BEFORE COMMIT
npm run lint          # ESLint with JSDoc requirements
npm run build         # TypeScript + Next.js build
npm run type-check    # TypeScript strict mode

# Supabase Validation
npx supabase db diff  # Check migration changes
npx supabase db reset # Test migrations clean
npx supabase functions serve process-document # Test locally

# Manual Testing Checklist
- [ ] Upload single 5-page PDF
- [ ] Upload batch of 3 files simultaneously  
- [ ] Test 50MB file size limit rejection
- [ ] Verify progress updates in ProcessingDock
- [ ] Test YouTube URL with transcript
- [ ] Test YouTube URL without transcript (fallback)
- [ ] Verify metadata extraction accuracy
- [ ] Check markdown quality in reader view
- [ ] Test cover image upload/extraction
- [ ] Verify cost estimates display
```

### Integration Testing

```typescript
// test/integration/upload.test.ts
describe('Document Upload Flow', () => {
  it('should handle complete upload flow', async () => {
    // 1. Create signed URL
    const { signedUrl, documentId } = await createSignedUploadUrl(
      'test.pdf',
      'application/pdf'
    );
    expect(signedUrl).toBeDefined();
    
    // 2. Upload file
    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: testPdfBuffer
    });
    expect(response.ok).toBe(true);
    
    // 3. Trigger processing
    const queueId = await triggerDocumentProcessing(documentId);
    expect(queueId).toBeDefined();
    
    // 4. Wait for completion
    await waitForProcessing(queueId);
    
    // 5. Verify results
    const chunks = await getChunks(documentId);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].embedding).toHaveLength(768);
  });
});
```

### Production Readiness

```yaml
# Monitoring Checklist
- Processing success rate > 95%
- Average processing time < 2 minutes
- Failed processing alerts configured
- Cost tracking dashboard setup
- Storage usage monitoring
- API rate limit tracking

# Security Review
- API keys in environment variables only
- RLS policies tested
- Signed URLs have appropriate expiry
- File type validation enforced
- Size limits enforced
- User data isolation verified
```

---

## 7. Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Gemini API costs exceed budget | Medium | High | Show estimates, implement quotas, monitor usage dashboard |
| Processing queue bottlenecks | Low | Medium | 10-doc limit, horizontal scaling ready, queue prioritization |
| YouTube transcript failures | High | Low | Clear fallback options, manual paste support |
| Large file upload timeouts | Medium | Medium | Chunked uploads, progress indication, retry mechanism |
| PDF extraction quality issues | Low | High | Gemini 1.5 Pro with structured prompts, user can edit |

### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Storage costs increase | Medium | Medium | Monitor usage, implement cleanup policies |
| Edge Function timeouts | Low | High | Use waitUntil(), implement checkpoints |
| Realtime subscription failures | Low | Medium | Polling fallback, connection retry |
| User data loss | Very Low | Critical | Export system, backup strategy |

---

## 8. Success Criteria

### Launch Criteria (MVP)
- [ ] Upload and process 10 test documents successfully
- [ ] All validation gates pass
- [ ] ProcessingDock shows real-time updates
- [ ] Metadata extraction accuracy > 80%
- [ ] YouTube transcript integration works
- [ ] No modal dialogs anywhere
- [ ] Connection detection completes < 30s for 20-page document
- [ ] Documents readable immediately (not blocked by connections)
- [ ] High-value connections trigger notifications

### Post-Launch Metrics (Week 1)
- Upload success rate > 95%
- Processing completion rate > 90%  
- Average processing time < 2 minutes
- User engagement with AI enhancement > 50%
- Cost per document < $0.10
- Connection relevance > 80% (users find them meaningful)
- Connection detection doesn't block document access

### Long-term Success (Month 1)
- 100+ documents processed
- User satisfaction score > 4.5/5
- System stability (99% uptime)
- Feature adoption rate > 70%
- Users annotating/studying connections (>30% engagement)
- Meta-connections discovered between connections

---

## 9. Implementation Schedule

### Sprint 1 (Week 1)
- **Days 1-2**: Upload UI Components
  - UploadZone with drag & drop
  - DocumentPreviewCard
  - CoverImageSelector
  - Batch upload grid
  
- **Day 3**: File Validation & Storage
  - Server actions for secure upload
  - Signed URL generation
  - File type/size validation
  
- **Days 4-5**: AI Metadata Extraction
  - Quick extraction endpoint
  - Cost estimation
  - Metadata enhancement UI

### Sprint 2 (Week 2)  
- **Days 6-8**: Processing Queue System
  - Edge Function implementation
  - Gemini full processing
  - Chunk generation & embeddings
  - Realtime subscriptions
  
- **Days 9-10**: Processing Dock UI
  - Bottom dock component
  - Progress tracking
  - Completion notifications

### Sprint 3 (Week 3)
- **Day 11**: YouTube Integration
  - Transcript fetching
  - Thumbnail generation
  - Fallback handling
  
- **Day 12**: Polish & Testing (Core Upload)
  - Integration testing for upload/processing
  - Error handling
  - Performance optimization
  - Documentation

- **Days 13-15**: Connection Detection Backend
  - pgvector similarity functions
  - Edge Function for detection
  - Gemini connection analysis
  - Batched processing implementation
  - Connection limits and thresholds

### Sprint 4 (Week 4): Connection UI Foundation
- **Days 16-17**: Margin Indicators & Preview Cards
  - MarginIndicators component (Phase 8.1)
  - ConnectionPreview hover cards (Phase 8.2)
  - Color coding and positioning
  
- **Days 18-19**: Connection Sidebar
  - ConnectionSidebar with Sheet (Phase 8.3)
  - Connection details and management
  - Edit/dismiss functionality

- **Days 20-22**: Split-Screen Comparison
  - ComparisonView with ResizablePanel (Phase 8.4)
  - Synchronized scrolling option
  - Highlight connected passages

### Sprint 5 (Week 5): Connection Features
- **Days 23-24**: Manual Connection Creation
  - Connection clipboard pattern (Phase 8.5)
  - Context menu integration
  - Type selection dialog

- **Days 25-26**: Connection Flashcards
  - ConnectionFlashcard component (Phase 8.6)
  - Relationship questions
  - Study system integration

### Sprint 6 (Week 6): Polish & Notifications
- **Days 27-28**: Notifications & Activity Feed
  - ConnectionNotifications dropdown (Phase 8.7)
  - Activity feed for synthesis page
  - Real-time updates

- **Day 29**: Document Settings
  - Privacy controls (Phase 8.8)
  - Connection preferences
  - Bulk operations

- **Day 30**: Final Integration & Testing
  - End-to-end connection flow testing
  - Performance optimization
  - Documentation updates

**Total: 30 days** (12 days core + 3 days backend + 15 days UI)


---

## 10. Appendices

### A. Database Schema SQL

```sql
-- Complete schema updates for document upload feature
-- Run with: npx supabase migration new document-upload

-- See Section 3: Database Schema Updates for full SQL
```

### B. Environment Variables

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
GEMINI_API_KEY=your-gemini-api-key

# Supabase Edge Functions (.env.functions)
GEMINI_API_KEY=your-gemini-api-key
```

### C. External Documentation

- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini Document Processing](https://ai.google.dev/gemini-api/docs/document-processing)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [YouTube Transcript NPM](https://www.npmjs.com/package/youtube-transcript)

### D. Code References

#### Existing Patterns to Follow
- **ECS Implementation**: `/src/lib/ecs/ecs.ts` lines 33-73
- **Supabase Client**: `/src/lib/supabase/server.ts`
- **UI Components**: `/src/components/ui/card.tsx`
- **Database Schema**: `/supabase/migrations/001_initial_schema.sql`

#### UI Pattern References  
- **No Modals**: See `/docs/UI_PATTERNS.md`
- **ProcessingDock**: Bottom panel pattern
- **RightPanel**: Side panel for connections
- **QuickCaptureBar**: Selection overlay

### E. Testing Data

```typescript
// Sample test files for development
const testFiles = [
  'sample-5page.pdf',    // Small PDF for quick tests
  'academic-paper.pdf',  // 20 pages, good for chunks
  'textbook-chapter.pdf', // 50 pages, test limits
  'youtube-url.txt'      // Contains test YouTube URLs
];

// YouTube test URLs
const testYouTubeUrls = [
  'https://youtube.com/watch?v=dQw4w9WgXcQ', // Has transcript
  'https://youtube.com/watch?v=invalid123',   // No transcript
  'https://youtu.be/dQw4w9WgXcQ',            // Short URL format
];
```

---

## Quality Score: 9/10

### Confidence Factors
- ✅ Complete technical specification
- ✅ Detailed implementation pseudocode
- ✅ References to existing codebase patterns
- ✅ External API documentation included
- ✅ Validation gates are executable
- ✅ Risk mitigation planned
- ✅ Clear phase-by-phase implementation
- ✅ No ambiguity in requirements

### Minor Gaps
- ⚠️ Some business logic decisions made based on common patterns (duplicate handling, error recovery)
- ⚠️ Specific Gemini rate limits may need adjustment based on actual usage

This PRP provides comprehensive context for one-pass implementation success with all necessary technical details, code patterns, and external documentation references.

---

## Task Breakdown

A detailed task breakdown has been generated for this feature and is available at:
**📋 [`/docs/tasks/document-upload-storage-with-connections.md`](/docs/tasks/document-upload-storage-with-connections.md)**

The task breakdown includes:
- 45+ granular development tasks (2-8 hours each)
- Phase 8 connection detection tasks fully integrated
- Clear dependencies and critical path analysis
- Given-When-Then acceptance criteria for each task
- Team structure and parallelization opportunities
- 30-day implementation schedule with 6 sprints