✅ Already Built (From docs)
Reader Components

VirtualizedReader - react-virtuoso-based document reader
BlockRenderer - Per-block markdown rendering with annotation injection
QuickCapturePanel - Create/edit annotations
QuickSparkCapture - Cmd+K quick thought capture
CorrectionModePanel - Fix chunk quality issues

Sidebar (RightPanel - 6 Tabs)

ConnectionsTab - Active connections for visible chunks ✅
AnnotationsList - All document annotations ✅
ChunkQualityPanel - Chunk confidence metrics ✅
SparksTab - Quick captures (placeholder UI) ⚠️
CardsTab - Flashcards (placeholder UI) ⚠️
ReviewTab - Annotation recovery workflow ✅
TuneTab - Engine weight configuration ✅

Layout Components

ProcessingDock - Bottom-right status dock
AdminPanel - Cmd+Shift+A (6 admin tabs)

Library Components

UploadZone - Document upload with chunker selection

🔨 Need to Build/Complete
1. LeftPanel (Collapsed by default)
Currently missing. From UI_PROTOTYPE.tsx, needs:

OutlineTab - Document structure/TOC with connection counts
StatsTab - Reading analytics (time, progress, patterns)
TimelineTab - Reading session history
ThemesTab - Extracted themes and concepts
Collapsible state (icon bar when collapsed)

2. Connection Visualization (In Reader)
Missing from VirtualizedReader:

ConnectionHeatmap - Left margin density visualization (doc mentions it exists)
InlineConnectionHighlights - Active connection emphasis
ConnectionStrengthGradients - Visual strength indicators
Click to navigate to connected chunk

3. View Mode Switcher (Top Toolbar)
From UI_PROTOTYPE.tsx:

Focus Mode - Reader only, both panels hidden
Read Mode - Reader + RightPanel (default)
Explore Mode - All panels visible
Toggle buttons in header

4. Document Header (Top Bar)
Partially exists, needs:

Back button
Document title + metadata (words, chunks)
View mode toggles
Progress indicator

5. Bottom Toolbar (Below Header)
From UI_PROTOTYPE.tsx:

Current view mode display
Chunk navigation
Reading stats (speed, time)
Export/share actions

6. BottomPanel (Chat/AI Assistance)
Not yet implemented:

Expandable panel from bottom
Full Chat Mode - Document Q&A
Context Mode - Section-specific chat
Integration with visible chunks

7. Sparks System (Backend + Full UI)
Backend missing, UI placeholder exists:

SparksList - Chronological feed
SparkCard - Individual spark display
SparkFilters - By date, tags, document
SparkConnections - Auto-linked chunks
Convert to flashcard button

8. Flashcard System (Backend + Full UI)
Backend missing, UI placeholder exists:

CardCreator - From annotation/spark
CardReviewer - FSRS spaced repetition
CardStats - Study metrics
DueCards - Review queue

9. Thread System (Not Started)
From docs - planned feature:

ThreadView - Group related sparks
ThreadCreator - Manual grouping
ThreadGraph - Visual connections
ThreadNavigation - Browse by thread

10. Search/Filter Components
Not in current implementation:

GlobalSearch - Across all documents
SemanticSearch - Embedding-based
AdvancedFilters - Date, tags, connections
SavedSearches - Common queries

Component Hierarchy
DocumentReaderPage
├── DocumentHeader
│   ├── BackButton
│   ├── TitleMetadata
│   └── ViewModeSwitcher (Focus/Read/Explore)
├── BottomToolbar
│   ├── ViewModeDisplay
│   ├── ChunkNavigation
│   └── StatsDisplay
├── LayoutManager
│   ├── LeftPanel (collapsible)
│   │   ├── OutlineTab
│   │   ├── StatsTab
│   │   ├── TimelineTab
│   │   └── ThemesTab
│   ├── ReaderPanel
│   │   ├── VirtualizedReader
│   │   │   ├── ConnectionHeatmap (left margin)
│   │   │   ├── BlockRenderer (with annotations)
│   │   │   └── InlineConnectionHighlights
│   │   ├── QuickCapturePanel
│   │   └── CorrectionModePanel
│   ├── RightPanel (6 tabs)
│   │   ├── ConnectionsTab ✅
│   │   ├── AnnotationsList ✅
│   │   ├── ChunkQualityPanel ✅
│   │   ├── SparksTab (needs backend)
│   │   ├── CardsTab (needs backend)
│   │   ├── ReviewTab ✅
│   │   └── TuneTab ✅
│   └── BottomPanel (chat)
│       ├── FullChatMode
│       └── ContextChatMode
├── ProcessingDock (bottom-right)
└── QuickSparkModal (Cmd+K)
Priority Order for Missing Components
Phase 1 - Reader Polish (Next)

ConnectionHeatmap - Left margin visualization
InlineConnectionHighlights - Active connections
ViewModeSwitcher - Focus/Read/Explore modes
DocumentHeader - Complete top bar

Phase 2 - Navigation & Context

LeftPanel - Outline, stats, timeline
BottomToolbar - View state, navigation
OutlineTab - TOC with connection density

Phase 3 - AI Integration

BottomPanel - Chat interface
ContextChatMode - Section-specific Q&A

Phase 4 - Sparks (Backend First)

SparkOperations - Backend ECS (partial exists)
SparksTab - Full UI with filters
SparkConnections - Auto-linking

Phase 5 - Study System

CardCreator - From annotations
CardReviewer - FSRS implementation
CardsTab - Study queue

Phase 6 - Advanced Features

ThreadSystem - Group related ideas
SemanticSearch - Embedding queries
ThemesTab - Concept extraction