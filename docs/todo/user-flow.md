## Complete User Flow: Frontend & Backend

### 1. **First Visit - Empty Library**

**Frontend:**
```tsx
// app/page.tsx - Library view
export default function LibraryPage() {
  const { documents, isLoading } = useDocuments()
  
  if (documents.length === 0) {
    return (
      <EmptyLibrary>
        {/* Large drop zone */}
        <DropZone onDrop={handleUpload} />
        {/* Or command palette hint */}
        <kbd>⌘K</kbd> to upload
      </EmptyLibrary>
    )
  }
}
```

**Backend:**
```typescript
// API: GET /api/documents
const { data: documents } = await supabase
  .from('documents')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
```

---

### 2. **Document Upload (Drag & Drop)**

**Frontend:**
```tsx
// User drags PDF onto page
function handleDrop(files: File[]) {
  files.forEach(file => {
    // 1. Show in processing dock immediately (optimistic)
    processingStore.addJob({
      id: tempId,
      filename: file.name,
      status: 'uploading',
      progress: 0
    })
    
    // 2. Upload to Supabase Storage
    uploadFile(file)
  })
}

async function uploadFile(file: File) {
  // Upload to storage bucket
  const { data } = await supabase.storage
    .from('documents')
    .upload(`${userId}/${fileId}/original.pdf`, file)
  
  // Create document record
  const { data: doc } = await supabase
    .from('documents')
    .insert({
      title: file.name,
      source_type: 'pdf',
      source_url: data.path,
      processing_status: 'pending'
    })
  
  // Trigger processing
  await supabase.functions.invoke('process-document', {
    body: { documentId: doc.id }
  })
}
```

**Backend (Edge Function):**
```typescript
// supabase/functions/process-document/index.ts
export async function handler(req: Request) {
  const { documentId } = await req.json()
  
  // 1. Extract text from PDF
  const pdfUrl = await getSignedUrl(documentId)
  const text = await extractPDF(pdfUrl) // Using pdf.js or llamaparse
  
  // 2. Convert to markdown
  const markdown = await cleanAndFormat(text)
  
  // 3. Save initial markdown
  await supabase
    .from('documents')
    .update({ 
      markdown_content: markdown,
      processing_status: 'chunking'
    })
    .eq('id', documentId)
  
  // 4. Semantic chunking with Gemini
  const chunks = await gemini.generateContent({
    model: 'gemini-1.5-pro',
    contents: [{ parts: [{ text: markdown }] }],
    systemInstruction: CHUNKING_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: CHUNK_SCHEMA
    }
  })
  
  // 5. Generate embeddings for each chunk
  const embeddings = await Promise.all(
    chunks.map(chunk => 
      gemini.embedContent({
        model: 'text-embedding-004',
        content: chunk.content
      })
    )
  )
  
  // 6. Store chunks with ECS
  for (let i = 0; i < chunks.length; i++) {
    // Create chunk record
    const { data: chunkRecord } = await supabase
      .from('chunks')
      .insert({
        document_id: documentId,
        content: chunks[i].content,
        chunk_index: i,
        embedding: embeddings[i],
        themes: chunks[i].themes,
        entities: chunks[i].entities,
        chunk_type: chunks[i].type
      })
      .select()
      .single()
    
    // Create ECS entity for chunk
    await ecs.createEntity(userId, {
      chunk: {
        id: chunkRecord.id,
        content: chunks[i].content
      },
      embedding: embeddings[i],
      themes: chunks[i].themes,
      source: {
        document_id: documentId,
        chunk_index: i
      }
    })
  }
  
  // 7. Update status
  await supabase
    .from('documents')
    .update({ processing_status: 'complete' })
    .eq('id', documentId)
}
```

---

### 3. **Processing Status (Bottom Dock)**

**Frontend:**
```tsx
// components/processing-dock.tsx
function ProcessingDock() {
  // Subscribe to real-time updates
  useEffect(() => {
    const subscription = supabase
      .channel('processing')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'documents',
        filter: `user_id=eq.${userId}`
      }, handleUpdate)
      .subscribe()
  }, [])
  
  return (
    <motion.div className="fixed bottom-0">
      {jobs.map(job => (
        <ProcessingCard key={job.id}>
          <div>{job.filename}</div>
          <Progress value={job.progress} />
          <div className="text-sm">
            {job.status === 'chunking' && 'Analyzing structure...'}
            {job.status === 'embedding' && 'Creating embeddings...'}
          </div>
        </ProcessingCard>
      ))}
    </motion.div>
  )
}
```

**Backend:**
```typescript
// Real-time updates during processing
await supabase
  .from('documents')
  .update({ 
    processing_status: 'embedding',
    processing_progress: 60 
  })
  .eq('id', documentId)
// This triggers the real-time subscription
```

---

### 4. **Opening Document Reader**

**Frontend:**
```tsx
// app/read/[id]/page.tsx
export default async function ReaderPage({ params }) {
  const { id } = params
  
  // Load document and chunks
  const document = await getDocument(id)
  const chunks = await getChunks(id)
  
  return (
    <div className="grid grid-cols-[1fr,400px]">
      <DocumentReader 
        document={document}
        chunks={chunks}
      />
      <RightPanel documentId={id} />
    </div>
  )
}

function DocumentReader({ chunks }) {
  const [visibleChunks, setVisibleChunks] = useState([])
  
  // Virtual scrolling - only render visible chunks
  return (
    <article className="prose max-w-none">
      <VirtualScroller
        items={chunks}
        onVisibleChange={setVisibleChunks}
      >
        {visibleChunks.map(chunk => (
          <ChunkContainer key={chunk.id} chunk={chunk}>
            <MarkdownRenderer content={chunk.content} />
          </ChunkContainer>
        ))}
      </VirtualScroller>
    </article>
  )
}
```

**Backend:**
```typescript
// Load chunks for document
const { data: chunks } = await supabase
  .from('chunks')
  .select('*')
  .eq('document_id', documentId)
  .order('chunk_index', { ascending: true })

// Also load any existing annotations
const { data: annotations } = await supabase
  .from('components')
  .select('*')
  .eq('component_type', 'annotation')
  .eq('data->>document_id', documentId)
```

---

### 5. **Creating Annotation (Text Selection)**

**Frontend:**
```tsx
// components/reader/chunk-container.tsx
function ChunkContainer({ chunk, children }) {
  const [selectedText, setSelectedText] = useState(null)
  
  const handleTextSelect = () => {
    const selection = window.getSelection()
    if (selection.toString()) {
      setSelectedText({
        text: selection.toString(),
        range: getSelectionRange(selection)
      })
      
      // Show quick capture bar
      quickCaptureStore.show({
        text: selection.toString(),
        chunkId: chunk.id
      })
    }
  }
  
  return (
    <div 
      onMouseUp={handleTextSelect}
      className="relative"
    >
      {children}
      {selectedText && (
        <HighlightOverlay range={selectedText.range} />
      )}
    </div>
  )
}

// components/quick-capture-bar.tsx
function QuickCaptureBar() {
  const { text, chunkId } = useQuickCaptureStore()
  
  const createAnnotation = async () => {
    // Optimistic update - show immediately
    const tempId = nanoid()
    annotationStore.add({
      id: tempId,
      text,
      chunkId
    })
    
    // Create in backend
    const entityId = await ecs.createEntity(userId, {
      annotation: { text, selection_range },
      source: { chunk_id: chunkId, document_id },
      embedding: null // Will be generated async
    })
    
    // Update with real ID
    annotationStore.update(tempId, { id: entityId })
  }
}
```

**Backend:**
```typescript
// Creating annotation entity
await db.transaction(async tx => {
  // 1. Create entity
  const { data: entity } = await tx
    .from('entities')
    .insert({ user_id: userId })
    .select()
    .single()
  
  // 2. Create annotation component
  await tx
    .from('components')
    .insert({
      entity_id: entity.id,
      component_type: 'annotation',
      data: {
        text: annotationText,
        range: selectionRange
      },
      chunk_id: chunkId,
      document_id: documentId
    })
  
  // 3. Generate embedding async
  queue.push({
    type: 'generate_embedding',
    entity_id: entity.id,
    text: annotationText
  })
})
```

---

### 6. **Creating Flashcard from Selection**

**Frontend:**
```tsx
// Still in quick-capture-bar.tsx
function QuickCaptureBar() {
  const [expanded, setExpanded] = useState(false)
  
  if (expanded) {
    return (
      <div className="fixed bottom-20 p-4 bg-background border rounded-lg">
        <Textarea
          placeholder="Question..."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Tab') {
              e.preventDefault()
              answerRef.current?.focus()
            }
          }}
        />
        <Textarea
          ref={answerRef}
          placeholder="Answer..."
          defaultValue={selectedText}
          value={answer}
          onChange={e => setAnswer(e.target.value)}
        />
        <Button onClick={createFlashcard}>
          Create <kbd>⌘⏎</kbd>
        </Button>
      </div>
    )
  }
}

async function createFlashcard() {
  const entityId = await ecs.createEntity(userId, {
    flashcard: { question, answer },
    study: { 
      due: new Date(),
      ease: 2.5,
      interval: 0,
      reviews: 0
    },
    source: { chunk_id: chunkId, document_id },
    embedding: null // Generated async
  })
  
  // Add to current deck or auto-assign
  const deckId = currentDeck || await getAutoDesk(documentId)
  await assignToDeck(entityId, deckId)
}
```

**Backend:**
```typescript
// Auto-deck assignment based on document
async function getAutoDeck(documentId: string) {
  // Check if deck exists for this document
  const { data: deck } = await supabase
    .from('decks')
    .select('id')
    .eq('source_document_id', documentId)
    .single()
  
  if (deck) return deck.id
  
  // Create new deck for document
  const { data: doc } = await supabase
    .from('documents')
    .select('title')
    .eq('id', documentId)
    .single()
  
  const { data: newDeck } = await supabase
    .from('decks')
    .insert({
      name: `${doc.title} - Cards`,
      source_document_id: documentId,
      user_id: userId
    })
    .select()
    .single()
  
  return newDeck.id
}
```

---

### 7. **Finding Connections (Right Panel)**

**Frontend:**
```tsx
// components/connection-sidebar.tsx
function ConnectionSidebar({ chunkId }) {
  const { data: connections } = useQuery({
    queryKey: ['connections', chunkId],
    queryFn: () => findConnections(chunkId)
  })
  
  return (
    <aside className="p-4 space-y-4">
      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="cards">Related Cards</TabsTrigger>
          <TabsTrigger value="annotations">Notes</TabsTrigger>
        </TabsList>
        
        <TabsContent value="connections">
          {connections.map(conn => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onClick={() => navigateToChunk(conn.target_chunk_id)}
            />
          ))}
        </TabsContent>
      </Tabs>
    </aside>
  )
}
```

**Backend:**
```typescript
// Finding connections via embeddings
async function findConnections(chunkId: string) {
  // Get chunk's embedding
  const { data: chunk } = await supabase
    .from('chunks')
    .select('embedding')
    .eq('id', chunkId)
    .single()
  
  // Find similar chunks using pgvector
  const { data: similar } = await supabase.rpc(
    'find_similar_chunks',
    {
      query_embedding: chunk.embedding,
      similarity_threshold: 0.8,
      limit: 10
    }
  )
  
  // Also find entities (cards, annotations) near this chunk
  const { data: relatedEntities } = await supabase
    .from('components')
    .select(`
      entity_id,
      data,
      entities!inner(id)
    `)
    .eq('chunk_id', chunkId)
  
  return { similar, relatedEntities }
}

// SQL function for similarity search
CREATE FUNCTION find_similar_chunks(
  query_embedding vector(768),
  similarity_threshold float,
  limit int
)
RETURNS TABLE (
  chunk_id uuid,
  content text,
  similarity float
) AS $$
  SELECT 
    id as chunk_id,
    content,
    1 - (embedding <=> query_embedding) as similarity
  FROM chunks
  WHERE 1 - (embedding <=> query_embedding) > similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT limit
$$ LANGUAGE SQL;
```

---

### 8. **Study Session (Split Screen)**

**Frontend:**
```tsx
// Triggered by: clicking study button, keyboard shortcut, or smart queue
function StudyMode({ deckId, documentId }) {
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  
  // Load cards due for review
  useEffect(() => {
    loadDueCards(deckId)
  }, [deckId])
  
  return (
    <div className="grid grid-cols-2 h-screen">
      {/* Left: Document with context */}
      <div className="overflow-auto border-r">
        <DocumentReader
          documentId={documentId}
          highlightChunkId={cards[currentIndex]?.chunkId}
          dimOthers={true}
        />
      </div>
      
      {/* Right: Study interface */}
      <div className="flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="w-full max-w-2xl">
            <CardContent className="p-8">
              <div className="text-lg mb-4">
                {cards[currentIndex]?.question}
              </div>
              
              {showAnswer && (
                <div className="pt-4 border-t">
                  {cards[currentIndex]?.answer}
                </div>
              )}
            </CardContent>
            
            <CardFooter>
              {!showAnswer ? (
                <Button onClick={() => setShowAnswer(true)}>
                  Show Answer (Space)
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => rateCard(1)}>
                    Again (1)
                  </Button>
                  <Button onClick={() => rateCard(2)}>
                    Hard (2)
                  </Button>
                  <Button onClick={() => rateCard(3)}>
                    Good (3)
                  </Button>
                  <Button onClick={() => rateCard(4)}>
                    Easy (4)
                  </Button>
                </div>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
```

**Backend (FSRS Scheduling):**
```typescript
// Update card after review
async function updateCardReview(
  entityId: string, 
  rating: number
) {
  // Get current study component
  const { data: studyComp } = await supabase
    .from('components')
    .select('data')
    .eq('entity_id', entityId)
    .eq('component_type', 'study')
    .single()
  
  // Calculate next review with FSRS
  const fsrs = new FSRS()
  const card = studyComp.data
  const now = new Date()
  
  const scheduledCard = fsrs.schedule(card, now, rating)
  
  // Update study component
  await supabase
    .from('components')
    .update({
      data: {
        due: scheduledCard.due,
        ease: scheduledCard.ease,
        interval: scheduledCard.interval,
        reviews: card.reviews + 1,
        last_review: now
      }
    })
    .eq('entity_id', entityId)
    .eq('component_type', 'study')
  
  // Log review for analytics
  await supabase
    .from('review_log')
    .insert({
      entity_id: entityId,
      rating,
      reviewed_at: now
    })
}
```

---

### 9. **Spark Creation (Synthesis Moment)**

**Frontend:**
```tsx
// User has an idea while reading
function SparkButton({ entityId }) {
  const [sparkText, setSparkText] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setIsOpen(true)}
        className="hover:bg-yellow-100"
      >
        <Sparkles className="h-4 w-4" />
      </Button>
      
      {isOpen && (
        <div className="absolute z-50 p-2 bg-background border rounded">
          <Textarea
            autoFocus
            placeholder="What's your idea?"
            value={sparkText}
            onChange={e => setSparkText(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && e.metaKey) {
                await createSpark()
                setIsOpen(false)
              }
            }}
          />
        </div>
      )}
    </>
  )
}

async function createSpark() {
  // Create spark entity
  const sparkId = await ecs.createEntity(userId, {
    spark: {
      idea: sparkText,
      created_at: new Date()
    },
    source: {
      parent_entity_id: entityId,
      chunk_id: chunkId,
      document_id: documentId
    }
  })
  
  // Find connections immediately
  await findSparkConnections(sparkId, sparkText)
}
```

**Backend (Synthesis Detection):**
```typescript
// Automatically find connections for new spark
async function findSparkConnections(
  sparkId: string, 
  sparkText: string
) {
  // Generate embedding for spark
  const embedding = await gemini.embedContent({
    model: 'text-embedding-004',
    content: sparkText
  })
  
  // Find related entities across all documents
  const { data: related } = await supabase.rpc(
    'find_related_entities',
    {
      query_embedding: embedding,
      user_id: userId,
      limit: 20,
      min_similarity: 0.75
    }
  )
  
  // Create connection records
  const connections = related.map(entity => ({
    source_entity_id: sparkId,
    target_entity_id: entity.id,
    connection_type: determineConnectionType(sparkText, entity),
    strength: entity.similarity,
    auto_detected: true
  }))
  
  await supabase
    .from('connections')
    .insert(connections)
  
  // Notify user of interesting connections
  if (connections.some(c => c.strength > 0.9)) {
    await notifyUser('Strong connections found!')
  }
}
```

---

### 10. **Knowledge Graph Emerges**

**Frontend:**
```tsx
// Viewing the emerging knowledge graph
function KnowledgeGraph({ documentId }) {
  const { data: graph } = useQuery({
    queryKey: ['knowledge-graph', documentId],
    queryFn: () => loadKnowledgeGraph(documentId)
  })
  
  return (
    <ForceGraph3D
      graphData={graph}
      nodeLabel="label"
      onNodeClick={handleNodeClick}
      linkDirectionalArrowLength={3.5}
      linkDirectionalArrowRelPos={1}
      linkCurvature={0.25}
      nodeColor={node => {
        switch(node.type) {
          case 'chunk': return '#blue'
          case 'flashcard': return '#green'
          case 'annotation': return '#yellow'
          case 'spark': return '#orange'
        }
      }}
    />
  )
}
```

**Backend:**
```typescript
// Build knowledge graph data
async function loadKnowledgeGraph(documentId: string) {
  // Get all entities for document
  const { data: entities } = await supabase
    .from('components')
    .select(`
      entity_id,
      component_type,
      data,
      entities!inner(id)
    `)
    .eq('document_id', documentId)
  
  // Get all connections
  const { data: connections } = await supabase
    .from('connections')
    .select('*')
    .in('source_entity_id', entities.map(e => e.entity_id))
  
  // Format for graph visualization
  const nodes = entities.map(e => ({
    id: e.entity_id,
    label: getEntityLabel(e),
    type: e.component_type,
    data: e.data
  }))
  
  const links = connections.map(c => ({
    source: c.source_entity_id,
    target: c.target_entity_id,
    type: c.connection_type,
    value: c.strength
  }))
  
  return { nodes, links }
}
```

This is the complete flow from upload to synthesis, with every frontend interaction and backend process detailed. The key is that **everything uses the same ECS pattern**, making the entire system consistent and extensible.