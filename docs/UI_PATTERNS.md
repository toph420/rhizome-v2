# UI Patterns Guide - No Modals Philosophy

## Core Principle: Flow State Preservation
Never interrupt the user's reading or thinking with modals. Use persistent, non-blocking UI elements that enhance rather than obstruct.

## UI Component Hierarchy

```
┌─────────────────────────────────────────────────┐
│  Main Content Area (Never Blocked)              │
│  ┌──────────────────────────────────┐           │
│  │                                  │  [Panel]  │
│  │  Document Reader / Library       │     →     │
│  │  (Primary Focus)                 │  Right    │
│  │                                  │  Sidebar  │
│  └──────────────────────────────────┘           │
│                                                  │
│  [Floating Elements]                             │
│  • Quick Capture Bar (bottom-center)             │
│  • Command Palette (center overlay)              │
│                                                  │
│  ╔════════════════════════════════════════════╗ │
│  ║ Processing Dock (bottom - collapsible)     ║ │
│  ╚════════════════════════════════════════════╝ │
└─────────────────────────────────────────────────┘
```

## Pattern 1: Processing Dock (Bottom)

### When to Use
- Background tasks (document processing, imports)
- Multi-step workflows that shouldn't block
- Progress tracking
- Batch operations

### Implementation
```tsx
// components/layout/processing-dock.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, X } from 'lucide-react'

export function ProcessingDock() {
  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(200)
  const jobs = useProcessingStore(s => s.jobs)
  
  // Auto-collapse when no jobs
  useEffect(() => {
    if (jobs.length === 0) {
      setTimeout(() => setCollapsed(true), 3000)
    }
  }, [jobs.length])
  
  // Hide completely if no jobs and collapsed
  if (jobs.length === 0 && collapsed) return null
  
  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm"
      initial={{ y: 300 }}
      animate={{ 
        y: 0,
        height: collapsed ? 48 : height 
      }}
      transition={{ type: "spring", damping: 25 }}
    >
      {/* Always Visible Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-accent rounded"
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          
          <span className="text-sm font-medium">
            {jobs.length} {jobs.length === 1 ? 'task' : 'tasks'} running
          </span>
          
          {/* Mini progress bars when collapsed */}
          {collapsed && (
            <div className="flex gap-1">
              {jobs.slice(0, 3).map(job => (
                <div key={job.id} className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${job.progress}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Drag handle for resizing */}
        {!collapsed && (
          <div 
            className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-primary/20"
            onMouseDown={handleResize}
          />
        )}
      </div>
      
      {/* Expanded Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overflow-auto"
            style={{ height: height - 48 }}
          >
            <div className="p-4 space-y-2">
              {jobs.map(job => (
                <ProcessingJob key={job.id} job={job} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Individual job component
function ProcessingJob({ job }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="p-3 bg-card rounded-lg border"
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium text-sm">{job.title}</p>
          <p className="text-xs text-muted-foreground">{job.status}</p>
        </div>
        <button 
          onClick={() => cancelJob(job.id)}
          className="p-1 hover:bg-destructive/10 rounded"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      
      <Progress value={job.progress} className="h-1" />
      
      {job.error && (
        <p className="text-xs text-destructive mt-2">{job.error}</p>
      )}
    </motion.div>
  )
}
```

## Pattern 2: Right Panel (Sidebar)

### When to Use
- Contextual information (connections, notes)
- Secondary navigation
- Filters and settings
- Metadata display

### Implementation
```tsx
// components/layout/right-panel.tsx
export function RightPanel({ documentId }) {
  const [width, setWidth] = useState(400)
  const [collapsed, setCollapsed] = useState(false)
  
  return (
    <>
      {/* Resize handle */}
      <div
        className="fixed right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 z-50"
        style={{ right: collapsed ? 0 : width }}
        onMouseDown={handleResize}
      />
      
      {/* Panel */}
      <motion.aside
        className="fixed right-0 top-0 bottom-0 bg-background border-l z-40"
        animate={{ 
          width: collapsed ? 0 : width,
          opacity: collapsed ? 0 : 1
        }}
        transition={{ type: "spring", damping: 25 }}
      >
        <Tabs defaultValue="connections" className="h-full flex flex-col">
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="connections" className="flex-1">
              Connections
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              Notes
            </TabsTrigger>
            <TabsTrigger value="cards" className="flex-1">
              Cards
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="flex-1">
            <TabsContent value="connections" className="p-4">
              <ConnectionsList documentId={documentId} />
            </TabsContent>
            
            <TabsContent value="notes" className="p-4">
              <AnnotationsList documentId={documentId} />
            </TabsContent>
            
            <TabsContent value="cards" className="p-4">
              <FlashcardsList documentId={documentId} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
        
        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 bg-background border rounded"
        >
          {collapsed ? <ChevronLeft /> : <ChevronRight />}
        </button>
      </motion.aside>
    </>
  )
}
```

## Pattern 3: Quick Capture Bar (Contextual)

### When to Use
- Text selection actions
- Quick input without leaving context
- Temporary tool palettes
- In-place editing

### Implementation
```tsx
// components/reader/quick-capture-bar.tsx
export function QuickCaptureBar() {
  const selection = useTextSelection()
  const [mode, setMode] = useState<'buttons' | 'flashcard' | 'note'>('buttons')
  
  if (!selection) return null
  
  // Calculate position based on selection
  const position = getSelectionPosition(selection)
  
  return (
    <motion.div
      className="fixed z-50 bg-background border rounded-lg shadow-lg"
      style={{
        top: position.bottom + 10,
        left: position.left,
        transform: 'translateX(-50%)'
      }}
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
    >
      {mode === 'buttons' ? (
        <div className="flex items-center gap-1 p-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setMode('flashcard')}
                  className="p-2 hover:bg-accent rounded"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Create Flashcard <kbd>F</kbd>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setMode('note')}
                  className="p-2 hover:bg-accent rounded"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Add Note <kbd>N</kbd>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={createHighlight}
                  className="p-2 hover:bg-accent rounded"
                >
                  <Highlighter className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Highlight <kbd>H</kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : mode === 'flashcard' ? (
        <div className="p-3 w-96 space-y-2">
          <textarea
            autoFocus
            placeholder="Question..."
            className="w-full min-h-[60px] p-2 border rounded resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault()
                document.getElementById('answer')?.focus()
              }
            }}
          />
          <textarea
            id="answer"
            placeholder="Answer..."
            defaultValue={selection.text}
            className="w-full min-h-[60px] p-2 border rounded resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setMode('buttons')}
              className="px-3 py-1 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={createFlashcard}
              className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
            >
              Create <kbd>⌘⏎</kbd>
            </button>
          </div>
        </div>
      ) : (
        // Note mode
        <div className="p-3 w-80">
          <textarea
            autoFocus
            placeholder="Add a note..."
            className="w-full min-h-[80px] p-2 border rounded resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setMode('buttons')}>Cancel</button>
            <button onClick={saveNote}>Save</button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
```

## Pattern 4: Command Palette (Overlay)

### When to Use
- Global navigation
- Quick actions
- Search
- Keyboard-driven workflows

### Implementation
```tsx
// components/layout/command-palette.tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(open => !open)
      }
    }
    
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])
  
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => {
            uploadDocument()
            setOpen(false)
          }}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
            <CommandShortcut>⌘U</CommandShortcut>
          </CommandItem>
          
          <CommandItem onSelect={() => {
            startStudySession()
            setOpen(false)
          }}>
            <Brain className="mr-2 h-4 w-4" />
            Start Study Session
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        
        <CommandGroup heading="Navigation">
          <CommandItem>
            <FileText className="mr-2 h-4 w-4" />
            Go to Library
          </CommandItem>
          <CommandItem>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        
        <CommandSeparator />
        
        <CommandGroup heading="Recent Documents">
          {recentDocs.map(doc => (
            <CommandItem key={doc.id} onSelect={() => navigateToDoc(doc.id)}>
              <FileText className="mr-2 h-4 w-4" />
              {doc.title}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

## Pattern 5: Inline Study Overlay

### When to Use
- Quick reviews without leaving document
- Temporary focused tasks
- Interstitial content
- Non-critical interruptions

### Implementation
```tsx
// components/study/inline-study-overlay.tsx
export function InlineStudyOverlay() {
  const { active, card } = useInlineStudy()
  const [showAnswer, setShowAnswer] = useState(false)
  
  if (!active) return null
  
  return (
    <>
      {/* Backdrop - subtle, not fully opaque */}
      <motion.div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => dismissStudy()}
      />
      
      {/* Card */}
      <motion.div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <Card className="w-[600px]">
          <CardContent className="p-8">
            <div className="space-y-4">
              <p className="text-lg">{card.question}</p>
              
              {showAnswer && (
                <div className="pt-4 border-t">
                  <p>{card.answer}</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-center gap-4 mt-8">
              {!showAnswer ? (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded"
                >
                  Show Answer <kbd>Space</kbd>
                </button>
              ) : (
                <>
                  <button onClick={() => rateCard(1)}>
                    Again <kbd>1</kbd>
                  </button>
                  <button onClick={() => rateCard(2)}>
                    Hard <kbd>2</kbd>
                  </button>
                  <button onClick={() => rateCard(3)}>
                    Good <kbd>3</kbd>
                  </button>
                  <button onClick={() => rateCard(4)}>
                    Easy <kbd>4</kbd>
                  </button>
                </>
              )}
            </div>
            
            <button
              onClick={dismissStudy}
              className="absolute top-4 right-4 p-2 hover:bg-accent rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      </motion.div>
    </>
  )
}
```

## Pattern 6: Split Screen Mode

### When to Use
- Document comparison
- Study with context
- Reference while writing
- Dual-focus workflows

### Implementation
```tsx
// components/layout/split-screen.tsx
export function SplitScreen({ 
  left, 
  right, 
  defaultRatio = 0.5,
  minSize = 300 
}) {
  const [ratio, setRatio] = useState(defaultRatio)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const handleDrag = (e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const newRatio = (e.clientX - rect.left) / rect.width
    setRatio(Math.max(0.2, Math.min(0.8, newRatio)))
  }
  
  return (
    <div ref={containerRef} className="flex h-full relative">
      <div 
        className="overflow-auto"
        style={{ width: `${ratio * 100}%` }}
      >
        {left}
      </div>
      
      {/* Resizer */}
      <div
        className="w-1 bg-border hover:bg-primary/20 cursor-ew-resize relative"
        onMouseDown={(e) => {
          e.preventDefault()
          const handleMouseMove = (e: MouseEvent) => handleDrag(e)
          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
          }
          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        }}
      >
        <div className="absolute inset-y-0 -inset-x-2" />
      </div>
      
      <div 
        className="overflow-auto flex-1"
        style={{ width: `${(1 - ratio) * 100}%` }}
      >
        {right}
      </div>
    </div>
  )
}
```

## Pattern 7: Floating Action Button (FAB)

### When to Use
- Primary action always accessible
- Mobile-friendly touch targets
- Persistent tools
- Spark/idea capture

### Implementation
```tsx
// components/layout/floating-action.tsx
export function FloatingAction() {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <motion.div
      className="fixed bottom-24 right-8 z-30"
      animate={{ scale: expanded ? 1.1 : 1 }}
    >
      {expanded && (
        <motion.div
          className="absolute bottom-16 right-0 space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button className="flex items-center gap-2 px-4 py-2 bg-background border rounded-full shadow-lg">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm">Quick Spark</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-background border rounded-full shadow-lg">
            <Plus className="h-4 w-4" />
            <span className="text-sm">New Note</span>
          </button>
        </motion.div>
      )}
      
      <button
        onClick={() => setExpanded(!expanded)}
        className="p-4 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-shadow"
      >
        <motion.div
          animate={{ rotate: expanded ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          <Plus className="h-6 w-6" />
        </motion.div>
      </button>
    </motion.div>
  )
}
```

Excellent catch! The annotation layer is crucial and I missed it. Here's the comprehensive annotation layer pattern to add to `UI_PATTERNS.md`:

## Pattern 8: Annotation Layer (Document Overlay)

### The Challenge
Annotations must float over text, handle overlaps, survive document reflows, and remain interactive without blocking text selection.

### Implementation

```tsx
// components/reader/annotation-layer.tsx
export function AnnotationLayer({ 
  chunks, 
  annotations,
  documentId 
}) {
  return (
    <div className="relative">
      {/* Base document text */}
      <div className="prose max-w-none">
        {chunks.map(chunk => (
          <ChunkWrapper key={chunk.id} chunk={chunk}>
            <MarkdownRenderer content={chunk.content} />
          </ChunkWrapper>
        ))}
      </div>
      
      {/* Annotation overlay - absolute positioned */}
      <div className="absolute inset-0 pointer-events-none">
        {annotations.map(annotation => (
          <AnnotationHighlight
            key={annotation.id}
            annotation={annotation}
            documentId={documentId}
          />
        ))}
      </div>
      
      {/* Active annotation popover */}
      <AnnotationPopover />
    </div>
  )
}
```

### Annotation Highlight Component

```tsx
// components/reader/annotation-highlight.tsx
interface AnnotationHighlight {
  id: string
  startOffset: number
  endOffset: number
  type: 'highlight' | 'note' | 'flashcard'
  color?: string
  text: string
}

export function AnnotationHighlight({ annotation }) {
  const [showPopover, setShowPopover] = useState(false)
  const [bounds, setBounds] = useState<DOMRect | null>(null)
  
  useEffect(() => {
    // Find and highlight the text range
    const range = findTextRange(
      annotation.startOffset, 
      annotation.endOffset
    )
    
    if (!range) return
    
    // Get bounding rectangles for all lines of text
    const rects = Array.from(range.getClientRects())
    
    // Create highlight spans for each line
    rects.forEach(rect => {
      const highlight = createHighlightElement(rect, annotation)
      document.body.appendChild(highlight)
    })
    
    return () => {
      // Cleanup highlights
      document.querySelectorAll(`[data-annotation="${annotation.id}"]`)
        .forEach(el => el.remove())
    }
  }, [annotation])
  
  return null // Highlights are rendered as absolute divs
}

function createHighlightElement(
  rect: DOMRect, 
  annotation: AnnotationHighlight
) {
  const div = document.createElement('div')
  
  // Position absolutely over text
  div.style.position = 'fixed'
  div.style.left = `${rect.left + window.scrollX}px`
  div.style.top = `${rect.top + window.scrollY}px`
  div.style.width = `${rect.width}px`
  div.style.height = `${rect.height}px`
  
  // Styling based on type
  const colors = {
    highlight: 'rgba(255, 235, 59, 0.3)',  // Yellow
    note: 'rgba(156, 39, 176, 0.2)',       // Purple
    flashcard: 'rgba(76, 175, 80, 0.2)'    // Green
  }
  
  div.style.backgroundColor = colors[annotation.type]
  div.style.pointerEvents = 'auto'
  div.style.cursor = 'pointer'
  div.style.mixBlendMode = 'multiply'
  
  // Data attributes
  div.setAttribute('data-annotation', annotation.id)
  div.className = 'annotation-highlight'
  
  // Interactions
  div.addEventListener('mouseenter', () => {
    div.style.backgroundColor = colors[annotation.type].replace('0.3', '0.4')
    showAnnotationPopover(annotation)
  })
  
  div.addEventListener('mouseleave', () => {
    div.style.backgroundColor = colors[annotation.type]
  })
  
  div.addEventListener('click', (e) => {
    e.stopPropagation()
    openAnnotationEditor(annotation)
  })
  
  return div
}
```

### Text Range Mapping (Robust)

```tsx
// lib/annotations/text-range.ts

interface TextRange {
  startContainer: Node
  startOffset: number
  endContainer: Node
  endOffset: number
  text: string
}

// Store annotations with multiple strategies for resilience
interface StoredAnnotation {
  id: string
  chunkId: string          // Which chunk contains it
  
  // Strategy 1: Character offsets
  startOffset: number      // Characters from chunk start
  endOffset: number        
  
  // Strategy 2: Text snippet for fuzzy matching
  textBefore: string       // 20 chars before selection
  textContent: string      // The actual selected text
  textAfter: string        // 20 chars after selection
  
  // Strategy 3: Paragraph + sentence indices
  paragraphIndex: number   // Which paragraph in chunk
  sentenceIndex: number    // Which sentence in paragraph
  
  // Strategy 4: DOM path (backup)
  domPath: string         // CSS selector to element
  
  // User data
  note?: string
  color?: string
  type: 'highlight' | 'note' | 'flashcard'
  created: Date
}

export function createAnnotation(
  selection: Selection, 
  chunkId: string
): StoredAnnotation {
  const range = selection.getRangeAt(0)
  const text = selection.toString()
  
  // Get context for fuzzy matching
  const container = range.commonAncestorContainer
  const fullText = container.textContent || ''
  const startIdx = fullText.indexOf(text)
  
  return {
    id: nanoid(),
    chunkId,
    
    // Character offsets
    startOffset: calculateOffset(range.startContainer, range.startOffset),
    endOffset: calculateOffset(range.endContainer, range.endOffset),
    
    // Text context for fuzzy matching
    textBefore: fullText.slice(Math.max(0, startIdx - 20), startIdx),
    textContent: text,
    textAfter: fullText.slice(startIdx + text.length, startIdx + text.length + 20),
    
    // Structural indices
    paragraphIndex: getParagraphIndex(range.startContainer),
    sentenceIndex: getSentenceIndex(range.startContainer, range.startOffset),
    
    // DOM path as backup
    domPath: getDOMPath(range.startContainer),
    
    type: 'highlight',
    created: new Date()
  }
}

export function restoreAnnotation(
  annotation: StoredAnnotation,
  chunkElement: HTMLElement
): Range | null {
  // Try strategies in order of reliability
  
  // 1. Try exact character offsets
  let range = tryCharacterOffsets(annotation, chunkElement)
  if (range && validateRange(range, annotation.textContent)) {
    return range
  }
  
  // 2. Try fuzzy text matching
  range = tryFuzzyMatching(annotation, chunkElement)
  if (range) {
    return range
  }
  
  // 3. Try structural indices
  range = tryStructuralIndices(annotation, chunkElement)
  if (range) {
    return range
  }
  
  // 4. Last resort: DOM path
  range = tryDOMPath(annotation, chunkElement)
  return range
}

function tryFuzzyMatching(
  annotation: StoredAnnotation,
  element: HTMLElement
): Range | null {
  const fullText = element.textContent || ''
  
  // Look for the pattern: textBefore + textContent + textAfter
  const pattern = annotation.textBefore + annotation.textContent + annotation.textAfter
  const patternIndex = fullText.indexOf(pattern)
  
  if (patternIndex === -1) {
    // Try just the content with some context
    const contentIndex = fullText.indexOf(annotation.textContent)
    if (contentIndex !== -1) {
      return createRangeFromIndices(
        element,
        contentIndex,
        contentIndex + annotation.textContent.length
      )
    }
  } else {
    const start = patternIndex + annotation.textBefore.length
    const end = start + annotation.textContent.length
    return createRangeFromIndices(element, start, end)
  }
  
  return null
}
```

### Annotation Popover

```tsx
// components/reader/annotation-popover.tsx
export function AnnotationPopover() {
  const { activeAnnotation, position } = useAnnotationStore()
  
  if (!activeAnnotation) return null
  
  return (
    <motion.div
      className="absolute z-50 p-3 bg-background border rounded-lg shadow-lg"
      style={{
        left: position.x,
        top: position.y + 20
      }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {activeAnnotation.type === 'note' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Note</p>
          <p className="text-sm">{activeAnnotation.note}</p>
          <button className="text-xs text-primary">
            Edit
          </button>
        </div>
      )}
      
      {activeAnnotation.type === 'flashcard' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Flashcard</p>
          <p className="text-sm font-medium">Q: {activeAnnotation.question}</p>
          <button className="text-xs text-primary">
            Study
          </button>
        </div>
      )}
      
      {activeAnnotation.type === 'highlight' && (
        <div className="flex items-center gap-2">
          <button className="p-1 hover:bg-accent rounded">
            <MessageSquare className="h-4 w-4" />
          </button>
          <button className="p-1 hover:bg-accent rounded">
            <Sparkles className="h-4 w-4" />
          </button>
          <button className="p-1 hover:bg-accent rounded">
            <Trash className="h-4 w-4" />
          </button>
        </div>
      )}
    </motion.div>
  )
}
```

### Handling Overlapping Annotations

```tsx
// components/reader/annotation-merger.tsx
interface AnnotationGroup {
  id: string
  annotations: StoredAnnotation[]
  bounds: DOMRect
  maxDepth: number // For stacking
}

export function mergeOverlappingAnnotations(
  annotations: StoredAnnotation[]
): AnnotationGroup[] {
  const groups: AnnotationGroup[] = []
  
  // Sort by start position
  const sorted = [...annotations].sort((a, b) => a.startOffset - b.startOffset)
  
  for (const annotation of sorted) {
    const overlapping = groups.find(group => 
      isOverlapping(annotation, group)
    )
    
    if (overlapping) {
      overlapping.annotations.push(annotation)
      overlapping.maxDepth = Math.max(
        overlapping.maxDepth, 
        overlapping.annotations.length
      )
    } else {
      groups.push({
        id: nanoid(),
        annotations: [annotation],
        bounds: getAnnotationBounds(annotation),
        maxDepth: 1
      })
    }
  }
  
  return groups
}

// Render overlapping annotations with visual distinction
export function AnnotationGroup({ group }: { group: AnnotationGroup }) {
  return (
    <div className="relative">
      {group.annotations.map((annotation, index) => (
        <div
          key={annotation.id}
          className="absolute inset-0"
          style={{
            // Offset each layer slightly
            transform: `translateY(${index * 2}px)`,
            // Fade overlapping layers
            opacity: 1 - (index * 0.1),
            // Different mix modes for overlap visibility
            mixBlendMode: 'multiply',
            zIndex: group.maxDepth - index
          }}
        >
          <AnnotationHighlight annotation={annotation} />
        </div>
      ))}
      
      {/* Indicator for multiple annotations */}
      {group.annotations.length > 1 && (
        <div className="absolute -right-6 top-0 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">
          {group.annotations.length}
        </div>
      )}
    </div>
  )
}
```

### Virtual Scrolling with Annotations

```tsx
// components/reader/virtual-annotated-reader.tsx
export function VirtualAnnotatedReader({ chunks, annotations }) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 })
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Only render visible chunks and their annotations
  const visibleChunks = chunks.slice(visibleRange.start, visibleRange.end)
  const visibleAnnotations = annotations.filter(a => 
    visibleChunks.some(c => c.id === a.chunkId)
  )
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Update visible range based on scroll
        const firstVisible = entries.find(e => e.isIntersecting)
        if (firstVisible) {
          const index = parseInt(firstVisible.target.getAttribute('data-chunk-index')!)
          setVisibleRange({
            start: Math.max(0, index - 5),
            end: Math.min(chunks.length, index + 15)
          })
        }
      },
      { rootMargin: '100px' }
    )
    
    // Observe sentinel elements
    const sentinels = containerRef.current?.querySelectorAll('.chunk-sentinel')
    sentinels?.forEach(s => observer.observe(s))
    
    return () => observer.disconnect()
  }, [chunks])
  
  return (
    <div ref={containerRef} className="relative">
      {/* Spacer for scroll height */}
      <div style={{ height: chunks.length * 200 }} />
      
      {/* Visible chunks */}
      <div 
        className="absolute inset-x-0"
        style={{ top: visibleRange.start * 200 }}
      >
        {visibleChunks.map((chunk, index) => (
          <div
            key={chunk.id}
            data-chunk-index={visibleRange.start + index}
            className="chunk-sentinel relative"
          >
            <MarkdownRenderer content={chunk.content} />
            
            {/* Annotations for this chunk */}
            {visibleAnnotations
              .filter(a => a.chunkId === chunk.id)
              .map(annotation => (
                <AnnotationHighlight
                  key={annotation.id}
                  annotation={annotation}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Annotation Persistence

```tsx
// lib/annotations/storage.ts
export async function saveAnnotation(annotation: StoredAnnotation) {
  // Save to ECS
  const entityId = await ecs.createEntity(userId, {
    annotation: {
      text: annotation.textContent,
      note: annotation.note,
      color: annotation.color
    },
    position: {
      chunkId: annotation.chunkId,
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
      textContext: {
        before: annotation.textBefore,
        content: annotation.textContent,
        after: annotation.textAfter
      }
    },
    source: {
      chunk_id: annotation.chunkId,
      document_id: documentId
    }
  })
  
  return entityId
}

// Load and restore on document open
export async function loadAnnotations(documentId: string) {
  const annotations = await ecs.query(
    ['annotation', 'position'],
    userId,
    { document_id: documentId }
  )
  
  return annotations.map(entity => 
    restoreAnnotation(entity.components.position, chunkElement)
  )
}
```

### Mobile Touch Selection

```tsx
// components/reader/touch-selection.tsx
export function TouchSelection({ onSelect }) {
  const [selecting, setSelecting] = useState(false)
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  
  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    setStart({ x: touch.clientX, y: touch.clientY })
    setSelecting(true)
  }
  
  const handleTouchMove = (e: TouchEvent) => {
    if (!selecting) return
    const touch = e.touches[0]
    setEnd({ x: touch.clientX, y: touch.clientY })
    
    // Update selection highlight
    updateSelectionHighlight(start!, { x: touch.clientX, y: touch.clientY })
  }
  
  const handleTouchEnd = () => {
    if (!selecting) return
    
    const selection = getTextInBounds(start!, end!)
    onSelect(selection)
    
    setSelecting(false)
    setStart(null)
    setEnd(null)
  }
  
  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="select-none"
    >
      {children}
      
      {/* Selection handles for mobile */}
      {selecting && (
        <>
          <SelectionHandle position={start} type="start" />
          <SelectionHandle position={end} type="end" />
        </>
      )}
    </div>
  )
}
```

This annotation layer system provides:

1. **Robust text range mapping** that survives document changes
2. **Visual overlapping** for multiple annotations
3. **Performance optimization** with virtual scrolling
4. **Mobile support** with touch selection
5. **Multiple fallback strategies** for finding text
6. **Clean visual hierarchy** with mix-blend modes

The key insight is storing annotations with multiple strategies (offsets, text context, structural position) so they can be restored even if the document reformats.


## Layout Composition

### Standard Reader Layout
```tsx
export function ReaderLayout({ children, documentId }) {
  return (
    <div className="h-screen flex flex-col">
      {/* Optional top bar */}
      <TopBar />
      
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Primary content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        
        {/* Right panel */}
        <RightPanel documentId={documentId} />
      </div>
      
      {/* Persistent bottom elements */}
      <ProcessingDock />
      
      {/* Floating elements */}
      <QuickCaptureBar />
      <CommandPalette />
      <FloatingAction />
    </div>
  )
}
```

## Animation Patterns

### Smooth Transitions
```tsx
// Use Framer Motion for all animations
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
}

// Stagger children
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}
```

### Spring Animations
```tsx
// Natural feeling springs
const springConfig = {
  type: "spring",
  damping: 25,
  stiffness: 200
}

// Gentle ease for overlays
const overlayTransition = {
  type: "tween",
  duration: 0.2,
  ease: "easeOut"
}
```

## Keyboard Navigation

### Global Shortcuts
```typescript
const shortcuts = {
  'cmd+k': 'Open command palette',
  'cmd+/': 'Toggle right panel',
  'cmd+\\': 'Toggle split screen',
  'esc': 'Dismiss overlay/selection',
  's': 'Start inline study',
  'f': 'Create flashcard from selection',
  'n': 'Create note from selection',
  'h': 'Highlight selection'
}
```

### Focus Management
```tsx
// Trap focus in overlays
export function useFocusTrap(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement
    
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }
    
    element.addEventListener('keydown', handleTab)
    firstElement?.focus()
    
    return () => element.removeEventListener('keydown', handleTab)
  }, [ref])
}
```

## Mobile Responsiveness

### Adaptive Layouts
```tsx
// Hide panels on mobile, use sheets instead
export function ResponsivePanel({ children }) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  
  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <button className="fixed bottom-4 right-4 p-3 bg-primary rounded-full">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[80vh]">
          {children}
        </SheetContent>
      </Sheet>
    )
  }
  
  return <RightPanel>{children}</RightPanel>
}
```

### Touch Gestures
```tsx
// Swipe to dismiss
export function SwipeDismiss({ children, onDismiss }) {
  const [{ x }, api] = useSpring(() => ({ x: 0 }))
  
  const bind = useDrag(({ movement: [mx], velocity, direction, cancel }) => {
    if (mx > 200 || (velocity[0] > 0.5 && direction[0] > 0)) {
      api.start({ x: window.innerWidth })
      onDismiss()
    } else {
      api.start({ x: 0 })
    }
  })
  
  return (
    <animated.div {...bind()} style={{ x }}>
      {children}
    </animated.div>
  )
}
```

## State Management

### Dock/Panel State
```typescript
// stores/ui-store.ts
interface UIStore {
  // Panels
  rightPanelOpen: boolean
  rightPanelWidth: number
  toggleRightPanel: () => void
  
  // Dock
  processingDockOpen: boolean
  processingDockHeight: number
  toggleProcessingDock: () => void
  
  // Overlays
  commandPaletteOpen: boolean
  inlineStudyActive: boolean
  
  // Layout
  splitScreenRatio: number
  setSplitScreenRatio: (ratio: number) => void
}

export const useUIStore = create<UIStore>((set) => ({
  rightPanelOpen: true,
  rightPanelWidth: 400,
  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
  // ...
}))
```

## DO NOT USE - Modal Anti-Patterns

```tsx
// ❌ NEVER DO THIS
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <CreateFlashcard />
  </DialogContent>
</Dialog>

// ❌ NEVER DO THIS
<Modal isOpen={isOpen}>
  <ProcessingStatus />
</Modal>

// ❌ NEVER DO THIS
<AlertDialog>
  <AlertDialogContent>
    Are you sure?
  </AlertDialogContent>
</AlertDialog>
```

## Instead, Use These Patterns

```tsx
// ✅ Inline editing
<QuickCaptureBar />

// ✅ Persistent status
<ProcessingDock />

// ✅ Contextual panels
<RightPanel />

// ✅ Non-blocking overlays
<InlineStudyOverlay />

// ✅ Command palette
<CommandPalette />
```

## Summary Rules

1. **Never block the main content** - User can always read/interact
2. **Persistent over temporary** - Docks/panels over modals
3. **Contextual over global** - Show UI near relevant content
4. **Collapsible everything** - Let users control their space
5. **Keyboard accessible** - Every action has a shortcut
6. **Mobile adaptive** - Panels become sheets on small screens
7. **Smooth animations** - Use springs, avoid jarring transitions
8. **Focus management** - Trap focus in overlays, return on dismiss


This comprehensive guide ensures Claude Code will never use modals and always implements the correct non-blocking UI patterns. Each pattern includes complete implementation code that can be directly used.