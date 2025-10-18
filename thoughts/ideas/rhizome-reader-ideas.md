# Rhizome Reader - Comprehensive Implementation Plan

**Version**: 1.0  
**Date**: 2025-10-16  
**Estimated Timeline**: 6-8 weeks  
**Target**: Complete four-panel reader with AI-powered context features

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema Changes](#database-schema-changes)
3. [Component Hierarchy](#component-hierarchy)
4. [State Management](#state-management)
5. [Feature Specifications](#feature-specifications)
6. [User Flows](#user-flows)
7. [Implementation Phases](#implementation-phases)
8. [Integration Points](#integration-points)
9. [Cost & Performance](#cost--performance)
10. [Testing Strategy](#testing-strategy)

---

## Architecture Overview

### Current vs. New Architecture

**CURRENT** (from mock-up):
```
DocumentReader (single component)
├─ TopBar
├─ ReaderContent
├─ RightSidebar (6 tabs)
└─ QuickSparkModal
```

**NEW** (four-panel system):
```
DocumentReader (orchestrator)
├─ TopPanel
│   ├─ MainHeader (56px, always visible)
│   └─ DocToolbar (44px, auto-hide on scroll)
├─ LeftPanel (collapsible, 4 tabs)
│   ├─ OutlineTab
│   ├─ StatsTab
│   ├─ HeatmapTab
│   └─ HistoryTab
├─ CenterPanel (reading area)
│   ├─ VirtualizedReader (existing)
│   └─ BlockRenderer (existing)
├─ RightPanel (collapsible, enhanced 6 tabs)
│   ├─ ConnectionsTab (enhanced)
│   ├─ AnnotationsTab
│   ├─ SparksTab (AI suggestions)
│   ├─ FlashcardsTab
│   ├─ TuneTab
│   └─ QualityTab
└─ BottomPanel (contextual bar)
    ├─ CompactBar (56px default)
    ├─ ExpandedView (240px)
    └─ ChatInterface (40vh slide-up)
```

### View Mode States

| Mode | Left Panel | Right Panel | Top Toolbar | Bottom Bar | Reading Width |
|------|------------|-------------|-------------|------------|---------------|
| **Normal** | 48px collapsed | 48px collapsed | Visible | 56px | ~70% |
| **Focus** | Hidden (0px) | Hidden (0px) | Auto-hide | 56px | ~90% |
| **Explore** | 320px expanded | 384px expanded | Visible | 56px | ~50% |

### Key Design Principles

1. **Panels are persistent overlays** - Not part of document flow, prevent reflow on collapse/expand
2. **State lives in Zustand** - Reading position, view mode, panel states, session tracking
3. **Server Actions for mutations** - Chat messages, sparks, session updates
4. **Storage-first for large data** - Cleaned markdown, full conversations
5. **Database for queryable data** - Reading sessions, connection validations, preferences

---

## Database Schema Changes

### New Tables

```sql
-- Migration 051: Reading Sessions Tracking
CREATE TABLE reading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  -- Session boundaries
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  
  -- Reading progress
  start_chunk_index INTEGER NOT NULL,
  end_chunk_index INTEGER NOT NULL,
  start_scroll_position FLOAT,  -- 0.0 to 1.0
  end_scroll_position FLOAT,
  
  -- Activity during session
  duration_seconds INTEGER,
  sparks_created INTEGER DEFAULT 0,
  annotations_created INTEGER DEFAULT 0,
  connections_validated INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reading_sessions_user_doc 
  ON reading_sessions(user_id, document_id, started_at DESC);

CREATE INDEX idx_reading_sessions_ended 
  ON reading_sessions(user_id, ended_at DESC) 
  WHERE ended_at IS NOT NULL;

-- Migration 052: Document Conversations
CREATE TABLE document_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  -- Conversation context
  context_mode TEXT NOT NULL CHECK (context_mode IN ('full', 'section', 'local')),
  section_heading_path TEXT[],  -- If section mode
  chunk_range_start INTEGER,    -- If local mode
  chunk_range_end INTEGER,       -- If local mode
  
  -- Gemini caching
  gemini_cache_name TEXT,
  cache_created_at TIMESTAMPTZ,
  cache_expires_at TIMESTAMPTZ,
  
  -- Messages stored in Storage, path here
  storage_path TEXT,  -- e.g., "conversations/{user_id}/{doc_id}/messages.json"
  message_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, document_id)
);

-- Migration 053: Section Summaries (for "Where was I?")
CREATE TABLE section_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Section identification
  heading_path TEXT[] NOT NULL,
  chunk_range_start INTEGER NOT NULL,
  chunk_range_end INTEGER NOT NULL,
  
  -- Summary content
  summary TEXT NOT NULL,
  summary_tokens INTEGER,
  
  -- Validity tracking
  valid_up_to_chunk INTEGER NOT NULL,  -- Summary valid until this chunk
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(document_id, user_id, heading_path)
);

-- Migration 054: AI Suggestions Tracking
CREATE TABLE ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  -- Suggestion type
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('spark', 'connection', 'thread')),
  
  -- Content
  content TEXT NOT NULL,
  metadata JSONB,  -- Type-specific data
  confidence FLOAT,
  reason TEXT,
  
  -- Source chunks
  source_chunk_ids UUID[],
  
  -- User response
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'edited', 'rejected')),
  user_response TEXT,  -- If edited, the user's version
  responded_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_suggestions_user_pending 
  ON ai_suggestions(user_id, status) 
  WHERE status = 'pending';

-- Migration 055: Conversation Insights (learning system)
CREATE TABLE conversation_insights (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Query patterns
  frequently_queried_concepts JSONB DEFAULT '[]',  -- [{concept: "paranoia", count: 12}, ...]
  query_count INTEGER DEFAULT 0,
  
  -- Connection preferences
  validated_connection_types JSONB DEFAULT '{}',  -- {contradiction: 23, bridge: 15, semantic: 8}
  
  -- AI suggestion acceptance rates
  accepted_ai_sparks INTEGER DEFAULT 0,
  rejected_ai_sparks INTEGER DEFAULT 0,
  accepted_ai_connections INTEGER DEFAULT 0,
  rejected_ai_connections INTEGER DEFAULT 0,
  
  -- Learned preferences
  learned_preferences JSONB DEFAULT '{}',  -- {prefers: "bridges", focus_areas: ["tech", "control"]}
  
  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Schema Updates to Existing Tables

```sql
-- Add to user_preferences table (or create if doesn't exist)
ALTER TABLE user_preferences 
  ADD COLUMN IF NOT EXISTS default_view_mode TEXT DEFAULT 'normal' 
    CHECK (default_view_mode IN ('normal', 'focus', 'explore')),
  ADD COLUMN IF NOT EXISTS left_panel_default_tab TEXT DEFAULT 'outline',
  ADD COLUMN IF NOT EXISTS right_panel_default_tab TEXT DEFAULT 'connections',
  ADD COLUMN IF NOT EXISTS auto_track_sessions BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS session_idle_threshold_minutes INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS enable_ai_suggestions BOOLEAN DEFAULT true;

-- Add to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS total_reading_time_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_read_position FLOAT,  -- 0.0 to 1.0
  ADD COLUMN IF NOT EXISTS last_read_chunk_index INTEGER;
```

### Materialized Views for Performance

```sql
-- Aggregated reading stats per document
CREATE MATERIALIZED VIEW reading_stats_by_document AS
SELECT 
  user_id,
  document_id,
  COUNT(*) as total_sessions,
  SUM(duration_seconds) as total_seconds,
  AVG(duration_seconds) as avg_session_seconds,
  MAX(ended_at) as last_read_at,
  SUM(sparks_created) as total_sparks,
  SUM(annotations_created) as total_annotations
FROM reading_sessions
WHERE ended_at IS NOT NULL
GROUP BY user_id, document_id;

CREATE UNIQUE INDEX idx_reading_stats_user_doc 
  ON reading_stats_by_document(user_id, document_id);

-- Refresh strategy: On session end (via trigger or manual refresh)
CREATE OR REPLACE FUNCTION refresh_reading_stats()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY reading_stats_by_document;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aggregated stats by section (using heading_path from chunks)
CREATE MATERIALIZED VIEW reading_stats_by_section AS
SELECT 
  rs.user_id,
  rs.document_id,
  c.heading_path[1] as section_heading,  -- Top-level heading
  COUNT(DISTINCT rs.id) as session_count,
  SUM(rs.duration_seconds) as total_seconds,
  SUM(rs.sparks_created) as sparks_count,
  SUM(rs.annotations_created) as annotations_count
FROM reading_sessions rs
JOIN chunks c ON c.document_id = rs.document_id 
  AND c.chunk_index BETWEEN rs.start_chunk_index AND rs.end_chunk_index
WHERE rs.ended_at IS NOT NULL
GROUP BY rs.user_id, rs.document_id, c.heading_path[1];

CREATE INDEX idx_reading_stats_section 
  ON reading_stats_by_section(user_id, document_id, section_heading);
```

---

## Component Hierarchy

### File Structure

```
src/components/reader/
├── DocumentReader.tsx              # Main orchestrator (MODIFY EXISTING)
├── TopPanel/
│   ├── MainHeader.tsx             # NEW: Always-visible header
│   ├── DocToolbar.tsx             # NEW: Auto-hide toolbar
│   └── index.ts
├── LeftPanel/
│   ├── LeftPanel.tsx              # NEW: Panel container with collapse logic
│   ├── OutlineTab.tsx             # NEW: Hierarchical outline with connection density
│   ├── StatsTab.tsx               # NEW: Reading time & patterns
│   ├── HeatmapTab.tsx             # MOVE: From existing ConnectionHeatmap
│   ├── HistoryTab.tsx             # NEW: Session timeline
│   └── index.ts
├── CenterPanel/
│   ├── VirtualizedReader.tsx      # EXISTING: Keep as-is
│   ├── BlockRenderer.tsx          # EXISTING: Keep as-is
│   └── index.ts
├── RightPanel/
│   ├── RightPanel.tsx             # MODIFY EXISTING: Add collapse logic
│   ├── ConnectionsTab.tsx         # ENHANCE EXISTING: Add grouping & filters
│   ├── AnnotationsTab.tsx         # EXISTING: Keep structure
│   ├── SparksTab.tsx              # ENHANCE EXISTING: Add AI suggestions
│   ├── FlashcardsTab.tsx          # EXISTING: Placeholder for now
│   ├── TuneTab.tsx                # EXISTING: Add reading preferences
│   ├── QualityTab.tsx             # EXISTING: Keep as-is
│   └── index.ts
├── BottomPanel/
│   ├── BottomPanel.tsx            # NEW: Contextual bar container
│   ├── CompactBar.tsx             # NEW: 56px persistent bar
│   ├── ExpandedView.tsx           # NEW: 240px detail view
│   ├── ChatInterface.tsx          # NEW: 40vh slide-up chat
│   ├── WhereWasI.tsx              # NEW: Context summary generator
│   └── index.ts
└── shared/
    ├── ConnectionCard.tsx         # EXISTING: Reuse
    ├── SparkCard.tsx              # EXISTING: Reuse
    └── AISuggestionCard.tsx       # NEW: For AI-generated suggestions
```

### Component Props & Interfaces

```typescript
// src/components/reader/types.ts

export type ViewMode = 'normal' | 'focus' | 'explore';

export interface ReaderState {
  viewMode: ViewMode;
  leftPanel: {
    collapsed: boolean;
    activeTab: 'outline' | 'stats' | 'heatmap' | 'history';
  };
  rightPanel: {
    collapsed: boolean;
    activeTab: 'connections' | 'annotations' | 'sparks' | 'cards' | 'tune' | 'quality';
  };
  bottomPanel: {
    visible: boolean;
    expanded: boolean;
    showChat: boolean;
  };
}

export interface ReadingSession {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  startChunkIndex: number;
  endChunkIndex: number;
  durationSeconds?: number;
  sparksCreated: number;
  annotationsCreated: number;
}

export interface SectionStats {
  heading: string;
  sessionCount: number;
  totalSeconds: number;
  sparksCount: number;
  annotationsCount: number;
}

export interface AISuggestion {
  id: string;
  type: 'spark' | 'connection' | 'thread';
  content: string;
  metadata: any;
  confidence: number;
  reason: string;
  sourceChunkIds: string[];
  status: 'pending' | 'accepted' | 'edited' | 'rejected';
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface DocumentConversation {
  id: string;
  contextMode: 'full' | 'section' | 'local';
  geminiCacheName?: string;
  cacheExpiresAt?: Date;
  messages: ConversationMessage[];
}
```

---

## State Management

### Zustand Store: `reader-store.ts`

```typescript
// src/stores/reader-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ReaderStore {
  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  
  // Panel states
  leftPanel: {
    collapsed: boolean;
    activeTab: string;
  };
  rightPanel: {
    collapsed: boolean;
    activeTab: string;
  };
  bottomPanel: {
    visible: boolean;
    expanded: boolean;
    showChat: boolean;
  };
  
  // Panel actions
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setLeftTab: (tab: string) => void;
  setRightTab: (tab: string) => void;
  setBottomExpanded: (expanded: boolean) => void;
  setShowChat: (show: boolean) => void;
  
  // Reading position
  currentChunkIndex: number;
  scrollPosition: number;  // 0.0 to 1.0
  visibleChunks: number[];
  setCurrentChunk: (index: number) => void;
  setScrollPosition: (position: number) => void;
  setVisibleChunks: (chunks: number[]) => void;
  
  // Session tracking
  sessionId: string | null;
  sessionStartTime: Date | null;
  startSession: (documentId: string, chunkIndex: number) => void;
  endSession: () => void;
  updateSessionActivity: (activity: { sparks?: number; annotations?: number }) => void;
}

export const useReaderStore = create<ReaderStore>()(
  persist(
    (set, get) => ({
      // Initial state
      viewMode: 'normal',
      leftPanel: { collapsed: true, activeTab: 'outline' },
      rightPanel: { collapsed: true, activeTab: 'connections' },
      bottomPanel: { visible: true, expanded: false, showChat: false },
      currentChunkIndex: 0,
      scrollPosition: 0,
      visibleChunks: [],
      sessionId: null,
      sessionStartTime: null,
      
      // Actions
      setViewMode: (mode) => {
        const collapsed = mode === 'normal' || mode === 'focus';
        const hidden = mode === 'focus';
        set({
          viewMode: mode,
          leftPanel: { ...get().leftPanel, collapsed: hidden ? true : collapsed },
          rightPanel: { ...get().rightPanel, collapsed: hidden ? true : collapsed }
        });
      },
      
      toggleLeftPanel: () => set((state) => ({
        leftPanel: { ...state.leftPanel, collapsed: !state.leftPanel.collapsed }
      })),
      
      toggleRightPanel: () => set((state) => ({
        rightPanel: { ...state.rightPanel, collapsed: !state.rightPanel.collapsed }
      })),
      
      toggleBottomPanel: () => set((state) => ({
        bottomPanel: { ...state.bottomPanel, visible: !state.bottomPanel.visible }
      })),
      
      setLeftTab: (tab) => set((state) => ({
        leftPanel: { ...state.leftPanel, activeTab: tab }
      })),
      
      setRightTab: (tab) => set((state) => ({
        rightPanel: { ...state.rightPanel, activeTab: tab }
      })),
      
      setBottomExpanded: (expanded) => set((state) => ({
        bottomPanel: { ...state.bottomPanel, expanded }
      })),
      
      setShowChat: (show) => set((state) => ({
        bottomPanel: { ...state.bottomPanel, showChat: show }
      })),
      
      setCurrentChunk: (index) => set({ currentChunkIndex: index }),
      setScrollPosition: (position) => set({ scrollPosition: position }),
      setVisibleChunks: (chunks) => set({ visibleChunks: chunks }),
      
      startSession: async (documentId, chunkIndex) => {
        // Call server action to create session
        const { sessionId } = await createReadingSession(documentId, chunkIndex);
        set({ sessionId, sessionStartTime: new Date() });
      },
      
      endSession: async () => {
        const { sessionId } = get();
        if (sessionId) {
          await endReadingSession(sessionId);
          set({ sessionId: null, sessionStartTime: null });
        }
      },
      
      updateSessionActivity: (activity) => {
        // Increment counters (handled by server action)
      }
    }),
    {
      name: 'reader-state',
      partialize: (state) => ({
        viewMode: state.viewMode,
        leftPanel: state.leftPanel,
        rightPanel: state.rightPanel
        // Don't persist session or position
      })
    }
  )
);
```

### Real-time Session Tracking

```typescript
// src/hooks/useSessionTracking.ts

import { useEffect, useRef } from 'react';
import { useReaderStore } from '@/stores/reader-store';
import { updateReadingSession } from '@/app/actions/reading-sessions';

export function useSessionTracking(documentId: string) {
  const { sessionId, currentChunkIndex, startSession, endSession } = useReaderStore();
  const updateIntervalRef = useRef<NodeJS.Timeout>();
  const lastUpdateRef = useRef<Date>(new Date());
  
  // Start session on mount
  useEffect(() => {
    startSession(documentId, currentChunkIndex);
    
    return () => {
      endSession();
    };
  }, [documentId]);
  
  // Update session every 30 seconds
  useEffect(() => {
    if (!sessionId) return;
    
    updateIntervalRef.current = setInterval(async () => {
      const now = new Date();
      const durationSeconds = Math.floor((now.getTime() - lastUpdateRef.current.getTime()) / 1000);
      
      await updateReadingSession(sessionId, {
        endChunkIndex: currentChunkIndex,
        durationSeconds
      });
      
      lastUpdateRef.current = now;
    }, 30000); // 30 seconds
    
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [sessionId, currentChunkIndex]);
  
  // End session on page blur/close
  useEffect(() => {
    const handleBlur = () => endSession();
    const handleBeforeUnload = () => endSession();
    
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [endSession]);
}
```

---

## Feature Specifications

### 1. Left Panel - Outline Tab

**Purpose**: Navigate document via hierarchical outline with connection density indicators

**Data Source**:
- Chunks table: `heading_path`, `heading_level`
- Connections table: Count per heading path
- Reading sessions: Progress per section

**Component Logic**:
```typescript
// OutlineTab.tsx

interface OutlineItem {
  level: number;
  title: string;
  headingPath: string[];
  chunkRange: { start: number; end: number };
  connectionCount: number;
  progress: number; // 0-100
  isCurrentSection: boolean;
}

async function buildOutline(documentId: string, currentChunkIndex: number): Promise<OutlineItem[]> {
  // 1. Get unique heading paths from chunks
  const { data: chunks } = await supabase
    .from('chunks')
    .select('heading_path, heading_level, chunk_index')
    .eq('document_id', documentId)
    .order('chunk_index');
  
  // 2. Group by heading_path to get ranges
  const headingGroups = groupBy(chunks, (c) => c.heading_path.join('|'));
  
  // 3. For each heading, count connections
  const outlineItems = await Promise.all(
    Object.entries(headingGroups).map(async ([pathKey, chunks]) => {
      const chunkIds = chunks.map(c => c.id);
      const { count } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .in('source_chunk_id', chunkIds);
      
      // 4. Calculate progress (chunks read / total chunks in section)
      const readChunks = chunks.filter(c => c.chunk_index < currentChunkIndex).length;
      const progress = (readChunks / chunks.length) * 100;
      
      return {
        level: chunks[0].heading_level,
        title: chunks[0].heading_path[chunks[0].heading_path.length - 1],
        headingPath: chunks[0].heading_path,
        chunkRange: { start: chunks[0].chunk_index, end: chunks[chunks.length - 1].chunk_index },
        connectionCount: count || 0,
        progress,
        isCurrentSection: currentChunkIndex >= chunks[0].chunk_index && currentChunkIndex <= chunks[chunks.length - 1].chunk_index
      };
    })
  );
  
  return outlineItems.sort((a, b) => a.chunkRange.start - b.chunkRange.start);
}

// Click handler
function handleOutlineClick(item: OutlineItem) {
  // Scroll to chunk
  scrollToChunk(item.chunkRange.start);
  
  // Update right panel to show connections for this section
  const sectionChunks = getChunksInRange(item.chunkRange.start, item.chunkRange.end);
  updateVisibleConnections(sectionChunks);
}
```

**UI Details**:
- Hierarchical indentation (12px per level)
- Connection count badge (blue if >10, gray otherwise)
- Progress bar for incomplete sections
- Current section highlighted (blue background, left border)
- Hover shows tooltip: "Chapter 3: 47 min reading time, 12 connections"

---

### 2. Left Panel - Stats Tab

**Purpose**: Show reading time, patterns, and engagement metrics

**Data Sources**:
- `reading_sessions` table
- `reading_stats_by_document` materialized view
- `reading_stats_by_section` materialized view

**Component Logic**:
```typescript
// StatsTab.tsx

interface ReadingStats {
  document: {
    totalWords: number;
    progress: number;
    totalConnections: number;
  };
  time: {
    thisSession: number;    // minutes
    thisChapter: number;
    thisDocument: number;
    thisWeek: number;
  };
  patterns: {
    peakFocusTime: string;  // e.g., "Monday 2-4 PM"
    mostSparksTime: string;
    avgSessionMinutes: number;
  };
  engagement: {
    sparksCount: number;
    annotationsCount: number;
    connectionsValidated: number;
  };
  sections: Array<{
    heading: string;
    readingTime: number;
    sparksCount: number;
    annotationsCount: number;
  }>;
}

async function getReadingStats(documentId: string, userId: string): Promise<ReadingStats> {
  // Current session (from Zustand store)
  const currentSession = useReaderStore.getState();
  const sessionStartTime = currentSession.sessionStartTime;
  const thisSessionMinutes = sessionStartTime 
    ? Math.floor((Date.now() - sessionStartTime.getTime()) / 60000)
    : 0;
  
  // Document-level stats
  const { data: docStats } = await supabase
    .from('reading_stats_by_document')
    .select('*')
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .single();
  
  // Current chapter stats (based on current chunk's heading_path)
  const { data: currentChunk } = await supabase
    .from('chunks')
    .select('heading_path')
    .eq('document_id', documentId)
    .eq('chunk_index', currentSession.currentChunkIndex)
    .single();
  
  const currentSection = currentChunk?.heading_path?.[0];
  
  const { data: sectionStats } = await supabase
    .from('reading_stats_by_section')
    .select('*')
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .eq('section_heading', currentSection)
    .single();
  
  // Weekly stats (past 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { data: weeklySessions } = await supabase
    .from('reading_sessions')
    .select('duration_seconds')
    .eq('user_id', userId)
    .gte('ended_at', sevenDaysAgo.toISOString())
    .not('ended_at', 'is', null);
  
  const weeklyMinutes = weeklySessions
    ? weeklySessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 60
    : 0;
  
  // Peak patterns (requires aggregation by hour of day/day of week)
  const { data: hourlyPattern } = await supabase.rpc('get_peak_reading_hours', {
    p_user_id: userId
  });
  
  return {
    document: {
      totalWords: docStats?.total_words || 0,
      progress: (currentSession.currentChunkIndex / docStats?.total_chunks || 1) * 100,
      totalConnections: docStats?.total_connections || 0
    },
    time: {
      thisSession: thisSessionMinutes,
      thisChapter: Math.floor((sectionStats?.total_seconds || 0) / 60),
      thisDocument: Math.floor((docStats?.total_seconds || 0) / 60),
      thisWeek: Math.floor(weeklyMinutes)
    },
    patterns: {
      peakFocusTime: hourlyPattern?.peak_hour || 'Not enough data',
      mostSparksTime: 'Weekend mornings',  // TODO: Similar aggregation
      avgSessionMinutes: Math.floor((docStats?.avg_session_seconds || 0) / 60)
    },
    engagement: {
      sparksCount: docStats?.total_sparks || 0,
      annotationsCount: docStats?.total_annotations || 0,
      connectionsValidated: 0  // TODO: Add to schema
    },
    sections: []  // TODO: Load section breakdown
  };
}
```

**Database Function for Peak Hours**:
```sql
-- Function to get peak reading hours
CREATE OR REPLACE FUNCTION get_peak_reading_hours(p_user_id UUID)
RETURNS TABLE (
  peak_hour TEXT,
  peak_day TEXT,
  total_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TO_CHAR(started_at, 'Day HH:00-HH:59') as peak_hour,
    TO_CHAR(started_at, 'Day') as peak_day,
    SUM(duration_seconds)::INTEGER / 60 as total_minutes
  FROM reading_sessions
  WHERE user_id = p_user_id
    AND ended_at IS NOT NULL
  GROUP BY DATE_TRUNC('hour', started_at), TO_CHAR(started_at, 'Day')
  ORDER BY total_minutes DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
```

---

### 3. Bottom Panel - "Where Was I?" Feature

**Purpose**: Anti-spoiler summary of everything before current position

**Cost Estimate**: ~$0.01 per summary (13k input tokens + 500 output tokens)

**Component Logic**:
```typescript
// WhereWasI.tsx

interface ContextSummary {
  completedSections: Array<{
    heading: string;
    summary: string;
  }>;
  currentSection: {
    heading: string;
    fullText: string;
    userPosition: string;
  };
  immediateContext: {
    chunks: Array<any>;
    userSparks: Array<any>;
    userAnnotations: Array<any>;
  };
  generatedAt: Date;
  cachedUntilChunk: number;
}

async function generateWhereWasI(
  documentId: string, 
  userId: string, 
  currentChunkIndex: number
): Promise<ContextSummary> {
  
  // 1. Check for cached summary
  const { data: cachedSummary } = await supabase
    .from('section_summaries')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .lte('chunk_range_start', currentChunkIndex)
    .gte('valid_up_to_chunk', currentChunkIndex)
    .order('chunk_range_start', { ascending: false })
    .limit(1);
  
  if (cachedSummary) {
    return JSON.parse(cachedSummary.summary);
  }
  
  // 2. Load all chunks up to current position
  const { data: allChunks } = await supabase
    .from('chunks')
    .select('*, connections(*)')
    .eq('document_id', documentId)
    .lte('chunk_index', currentChunkIndex)
    .order('chunk_index');
  
  // 3. Get current chunk to identify current section
  const currentChunk = allChunks.find(c => c.chunk_index === currentChunkIndex);
  const currentSectionHeading = currentChunk?.heading_path?.[0];
  
  // 4. Group chunks by top-level section
  const sections = groupBy(allChunks, (c) => c.heading_path?.[0] || 'Unknown');
  
  // 5. For completed sections, generate/load summaries
  const completedSections = await Promise.all(
    Object.entries(sections)
      .filter(([heading]) => heading !== currentSectionHeading)
      .map(async ([heading, chunks]) => {
        // Check if we have cached summary for this section
        const { data: sectionSummary } = await supabase
          .from('section_summaries')
          .select('summary')
          .eq('document_id', documentId)
          .eq('heading_path', [heading])
          .single();
        
        if (sectionSummary) {
          return { heading, summary: sectionSummary.summary };
        }
        
        // Generate new summary
        const sectionText = chunks.map(c => c.content).join('\n\n');
        const summary = await generateSectionSummary(heading, sectionText);
        
        // Cache it
        await supabase.from('section_summaries').insert({
          document_id: documentId,
          user_id: userId,
          heading_path: [heading],
          chunk_range_start: chunks[0].chunk_index,
          chunk_range_end: chunks[chunks.length - 1].chunk_index,
          summary: summary,
          summary_tokens: estimateTokens(summary),
          valid_up_to_chunk: currentChunkIndex
        });
        
        return { heading, summary };
      })
  );
  
  // 6. For current section, get full text up to current position
  const currentSectionChunks = sections[currentSectionHeading] || [];
  const currentSectionText = currentSectionChunks
    .filter(c => c.chunk_index <= currentChunkIndex)
    .map(c => c.content)
    .join('\n\n');
  
  // 7. Get immediate context (3 chunks before current)
  const immediateChunks = allChunks.slice(Math.max(0, currentChunkIndex - 3), currentChunkIndex + 1);
  
  // 8. Load user's sparks and annotations in immediate context
  const chunkIds = immediateChunks.map(c => c.id);
  const { data: userSparks } = await supabase
    .from('entities')
    .select('*, spark:components!inner(*)')
    .eq('user_id', userId)
    .in('source_chunk_id', chunkIds);
  
  const { data: userAnnotations } = await supabase
    .from('entities')
    .select('*, annotation:components!inner(*)')
    .eq('user_id', userId)
    .in('source_chunk_id', chunkIds);
  
  // 9. Build context object
  const context: ContextSummary = {
    completedSections,
    currentSection: {
      heading: currentSectionHeading,
      fullText: currentSectionText,
      userPosition: `${Math.round((currentChunkIndex / allChunks.length) * 100)}% through section`
    },
    immediateContext: {
      chunks: immediateChunks,
      userSparks: userSparks || [],
      userAnnotations: userAnnotations || []
    },
    generatedAt: new Date(),
    cachedUntilChunk: currentChunkIndex + 10  // Valid for next 10 chunks
  };
  
  // 10. Generate AI summary using context
  const aiSummary = await generateAISummary(context, documentId);
  
  return {
    ...context,
    aiGeneratedSummary: aiSummary
  };
}

async function generateSectionSummary(heading: string, text: string): Promise<string> {
  const prompt = `Summarize this section in 150-200 words, focusing on key themes, events, and concepts. Do not spoil future content.

Section: ${heading}

Content:
${text.slice(0, 50000)}  // Limit to ~50k chars

Summary:`;

  const response = await generateContent({
    model: 'gemini-2.0-flash-exp',
    prompt,
    maxOutputTokens: 300
  });
  
  return response.text;
}

async function generateAISummary(context: ContextSummary, documentId: string): Promise<string> {
  const { data: doc } = await supabase
    .from('documents')
    .select('title')
    .eq('id', documentId)
    .single();
  
  const prompt = `User is reading "${doc.title}" and left off here. Give them a rich "where you left off" summary that:

1. Reminds them of major themes/events from completed sections (be concise)
2. Recaps current section up to where they are (more detailed)
3. Mentions their own sparks/annotations to jog memory
4. CRITICAL: Do not mention or hint at anything beyond their current position

Completed Sections:
${context.completedSections.map(s => `${s.heading}: ${s.summary}`).join('\n\n')}

Current Section (${context.currentSection.heading}):
${context.currentSection.fullText.slice(0, 30000)}

User is at: ${context.currentSection.userPosition}

Their recent sparks:
${context.immediateContext.userSparks.map(s => `- ${s.spark.content}`).join('\n')}

Their recent annotations:
${context.immediateContext.userAnnotations.map(a => `- ${a.annotation.text}`).join('\n')}

Provide a warm, conversational "where you left off" summary (200-300 words):`;

  const response = await generateContent({
    model: 'gemini-2.0-flash-exp',
    prompt,
    maxOutputTokens: 500
  });
  
  return response.text;
}
```

**UI Interaction**:
1. User clicks "📍 Where was I?" in bottom bar
2. First click: Check for cached summary (instant)
3. If no cache: Show loading state, call `generateWhereWasI()` (5-10 sec)
4. Display summary in modal or expanded bottom panel
5. Cache summary for next 10 chunks of reading

---

### 4. Bottom Panel - Chat Interface

**Purpose**: Context-aware conversation with 3 modes (full book, section, local chunks)

**Gemini Context Caching Strategy**:

```typescript
// ChatInterface.tsx

type ChatMode = 'full' | 'section' | 'local';

interface ChatState {
  mode: ChatMode;
  cacheStatus: 'none' | 'creating' | 'ready' | 'expired';
  messages: ConversationMessage[];
}

async function initializeChatCache(
  documentId: string,
  userId: string,
  mode: ChatMode
): Promise<string | null> {
  
  if (mode === 'local') {
    // No caching for local mode (too dynamic)
    return null;
  }
  
  // Check if cache exists and is valid
  const { data: existingConv } = await supabase
    .from('document_conversations')
    .select('gemini_cache_name, cache_expires_at')
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .single();
  
  if (existingConv?.gemini_cache_name && existingConv.cache_expires_at) {
    const expiresAt = new Date(existingConv.cache_expires_at);
    if (expiresAt > new Date()) {
      // Cache still valid
      return existingConv.gemini_cache_name;
    }
  }
  
  // Create new cache
  let contentToCache: string;
  
  if (mode === 'full') {
    // Load entire cleaned markdown from Storage
    const { data } = await supabase.storage
      .from('documents')
      .download(`${userId}/${documentId}/content.md`);
    
    contentToCache = await data.text();
    
  } else if (mode === 'section') {
    // Load current section chunks
    const currentChunk = useReaderStore.getState().currentChunkIndex;
    const { data: chunk } = await supabase
      .from('chunks')
      .select('heading_path')
      .eq('document_id', documentId)
      .eq('chunk_index', currentChunk)
      .single();
    
    const sectionHeading = chunk?.heading_path?.[0];
    
    const { data: sectionChunks } = await supabase
      .from('chunks')
      .select('content')
      .eq('document_id', documentId)
      .contains('heading_path', [sectionHeading])
      .order('chunk_index');
    
    contentToCache = sectionChunks?.map(c => c.content).join('\n\n') || '';
  }
  
  // Create Gemini cache
  const { name, expireTime } = await createGeminiCache({
    model: 'gemini-2.0-flash-exp',
    systemInstruction: `You are discussing "${doc.title}". Answer questions accurately based on the provided content. Be conversational but precise.`,
    contents: [{
      role: 'user',
      parts: [{ text: contentToCache }]
    }],
    ttl: '3600s'  // 1 hour
  });
  
  // Store cache reference
  await supabase.from('document_conversations').upsert({
    user_id: userId,
    document_id: documentId,
    context_mode: mode,
    gemini_cache_name: name,
    cache_created_at: new Date(),
    cache_expires_at: new Date(expireTime)
  });
  
  return name;
}

async function sendChatMessage(
  message: string,
  documentId: string,
  userId: string,
  mode: ChatMode
): Promise<string> {
  
  // Load conversation
  const { data: conv } = await supabase
    .from('document_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .single();
  
  // Load message history from Storage
  let messages: ConversationMessage[] = [];
  if (conv?.storage_path) {
    const { data } = await supabase.storage
      .from('documents')
      .download(conv.storage_path);
    messages = JSON.parse(await data.text());
  }
  
  // Add user message
  messages.push({ role: 'user', content: message, timestamp: new Date() });
  
  let response: string;
  
  if (mode === 'local') {
    // No cache, just send visible chunks as context
    const visibleChunks = useReaderStore.getState().visibleChunks;
    const { data: chunks } = await supabase
      .from('chunks')
      .select('content')
      .in('chunk_index', visibleChunks)
      .eq('document_id', documentId);
    
    const context = chunks?.map(c => c.content).join('\n\n') || '';
    
    response = await generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [
        { role: 'user', parts: [{ text: context }] },
        { role: 'user', parts: [{ text: message }] }
      ]
    });
    
  } else {
    // Use cached context
    const cacheName = conv?.gemini_cache_name || await initializeChatCache(documentId, userId, mode);
    
    response = await generateContent({
      model: 'gemini-2.0-flash-exp',
      cachedContent: cacheName,
      contents: messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }))
    });
  }
  
  // Add assistant response
  messages.push({ role: 'assistant', content: response.text, timestamp: new Date() });
  
  // Save to Storage
  const storagePath = `conversations/${userId}/${documentId}/messages.json`;
  await supabase.storage
    .from('documents')
    .upload(storagePath, JSON.stringify(messages), { upsert: true });
  
  // Update conversation record
  await supabase.from('document_conversations').upsert({
    user_id: userId,
    document_id: documentId,
    storage_path: storagePath,
    message_count: messages.length,
    updated_at: new Date()
  });
  
  return response.text;
}
```

**UI Components**:
```typescript
// ChatInterface.tsx JSX

<div className="chat-interface">
  <div className="chat-header">
    <span>Chat with Document</span>
    <select value={mode} onChange={(e) => setMode(e.target.value)}>
      <option value="full">📚 Entire Book</option>
      <option value="section">📖 Current Section</option>
      <option value="local">🔍 Nearby Chunks</option>
    </select>
  </div>
  
  {mode === 'full' && cacheStatus === 'creating' && (
    <div className="cache-banner">
      ⚡ Creating context cache... (one-time, ~10 sec)
    </div>
  )}
  
  {mode === 'full' && cacheStatus === 'ready' && (
    <div className="cache-banner success">
      ⚡ Context cached • Full document available • 75% cost reduction
    </div>
  )}
  
  <div className="messages">
    {messages.map((msg, i) => (
      <ChatMessage key={i} message={msg} />
    ))}
  </div>
  
  <div className="quick-prompts">
    <button onClick={() => sendMessage('Summarize this section')}>
      Summarize
    </button>
    <button onClick={() => sendMessage('How does this connect to other books?')}>
      Connect to...
    </button>
    <button onClick={() => sendMessage('What are the weaknesses in this argument?')}>
      Challenge
    </button>
  </div>
  
  <div className="input">
    <textarea value={input} onChange={(e) => setInput(e.target.value)} />
    <button onClick={() => sendMessage(input)}>Send</button>
  </div>
</div>
```

---

### 5. AI Suggestions System

**Purpose**: Proactively suggest sparks, connections, and threads based on patterns

**Background Job**: Weekly sweep for suggestions

```typescript
// worker/jobs/generate-ai-suggestions.ts

async function generateAISuggestions(documentId: string, userId: string) {
  
  // 1. Find high-density regions without user engagement
  const { data: candidates } = await supabase
    .from('chunks')
    .select(`
      *,
      connections!inner(count),
      entities!left(id)
    `)
    .eq('document_id', documentId)
    .gt('importance_score', 0.8)
    .gt('connections.count', 5)
    .is('entities.id', null)  // No annotations/sparks
    .limit(10);
  
  for (const chunk of candidates) {
    // Get connections for context
    const { data: connections } = await supabase
      .from('connections')
      .select('*, target:chunks!target_chunk_id(*)')
      .eq('source_chunk_id', chunk.id)
      .order('strength', { ascending: false })
      .limit(5);
    
    // Generate spark suggestion
    const sparkSuggestion = await generateContent({
      model: 'gemini-2.0-flash-exp',
      prompt: `This passage has high importance and connects to multiple other ideas:

"${chunk.content}"

Connections:
${connections.map(c => `- ${c.target.document_title}: ${c.metadata.reason}`).join('\n')}

Generate a 1-2 sentence "spark" that captures why this is interesting or noteworthy. Be specific and insightful.`
    });
    
    // Save suggestion
    await supabase.from('ai_suggestions').insert({
      user_id: userId,
      document_id: documentId,
      suggestion_type: 'spark',
      content: sparkSuggestion.text,
      metadata: {
        connectionCount: connections.length,
        importance: chunk.importance_score
      },
      confidence: 0.85,
      reason: 'High connection density, no user annotations',
      source_chunk_ids: [chunk.id]
    });
  }
  
  // 2. Find cross-document patterns
  const { data: userDocs } = await supabase
    .from('documents')
    .select('id, title')
    .eq('user_id', userId);
  
  // Get recurring concepts across documents
  const { data: conceptFreq } = await supabase.rpc('concept_frequency_across_docs', {
    p_user_id: userId,
    p_min_documents: 3
  });
  
  for (const concept of conceptFreq.slice(0, 5)) {
    // Get chunks from different books mentioning this concept
    const { data: chunks } = await supabase
      .from('chunks')
      .select('*, document:documents(*)')
      .contains('concepts', [{ text: concept.text }])
      .in('document_id', concept.document_ids)
      .limit(5);
    
    // Analyze pattern
    const patternAnalysis = await generateContent({
      model: 'gemini-2.0-flash-exp',
      prompt: `The user has read about "${concept.text}" across multiple books:

${chunks.map(c => `From ${c.document.title}:\n${c.content}`).join('\n\n---\n\n')}

Identify a non-obvious connection or pattern between 2-3 of these passages. Generate:
1. A brief description of the connection
2. Why this connection is intellectually interesting
3. A suggested spark the user might want to capture

Format as JSON:
{
  "connection": "...",
  "reason": "...",
  "suggestedSpark": "..."
}`
    });
    
    const analysis = JSON.parse(patternAnalysis.text);
    
    // Save suggestion
    await supabase.from('ai_suggestions').insert({
      user_id: userId,
      suggestion_type: 'connection',
      content: `Pattern detected: "${concept.text}" across ${concept.document_ids.length} books`,
      metadata: {
        concept: concept.text,
        documents: concept.document_ids,
        connection: analysis.connection
      },
      confidence: 0.75,
      reason: analysis.reason,
      source_chunk_ids: chunks.map(c => c.id)
    });
  }
}

// SQL function for concept frequency
CREATE OR REPLACE FUNCTION concept_frequency_across_docs(
  p_user_id UUID,
  p_min_documents INTEGER DEFAULT 3
)
RETURNS TABLE (
  concept_text TEXT,
  document_count BIGINT,
  document_ids UUID[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (jsonb_array_elements(concepts) ->> 'text')::TEXT as concept_text,
    COUNT(DISTINCT c.document_id) as document_count,
    ARRAY_AGG(DISTINCT c.document_id) as document_ids
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE d.user_id = p_user_id
  GROUP BY concept_text
  HAVING COUNT(DISTINCT c.document_id) >= p_min_documents
  ORDER BY document_count DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;
```

**UI for Suggestions**:
```typescript
// AISuggestionCard.tsx

<div className="ai-suggestion-card">
  <div className="header">
    <Badge>
      <Sparkles className="h-3 w-3" />
      AI Suggested
    </Badge>
    <span className="confidence">{(suggestion.confidence * 100).toFixed(0)}%</span>
  </div>
  
  <div className="content">
    {suggestion.content}
  </div>
  
  <div className="reason">
    {suggestion.reason}
  </div>
  
  <div className="actions">
    <button onClick={() => acceptSuggestion(suggestion.id)}>
      Accept
    </button>
    <button onClick={() => editSuggestion(suggestion.id)}>
      Edit
    </button>
    <button onClick={() => rejectSuggestion(suggestion.id)}>
      Dismiss
    </button>
  </div>
</div>
```

---

## User Flows

### Flow 1: Reading Session Start to End

```
1. User navigates to /read/[documentId]
   └─> DocumentReader mounts
   └─> useSessionTracking hook starts session
       └─> createReadingSession() server action
       └─> Inserts row in reading_sessions table
       └─> Returns sessionId
       └─> Stored in Zustand (sessionId, sessionStartTime)

2. User reads, scrolls through content
   └─> VirtualizedReader tracks scroll position
   └─> onScroll handler updates Zustand:
       └─> currentChunkIndex
       └─> scrollPosition (0.0-1.0)
       └─> visibleChunks (array of chunk indices)
   
   └─> Every 30 seconds, useSessionTracking calls:
       └─> updateReadingSession(sessionId, {
             endChunkIndex: currentChunkIndex,
             durationSeconds: elapsed
           })
       └─> Updates reading_sessions row

3. User creates spark (⌘K)
   └─> QuickSparkModal opens
   └─> User types content, submits
   └─> createSpark() server action
   └─> ECS entity created with spark component
   └─> useSessionTracking increments sparksCreated counter
   └─> updateReadingSession(sessionId, { sparksCreated: +1 })

4. User closes tab / navigates away
   └─> window 'beforeunload' event fires
   └─> endSession() called
       └─> endReadingSession(sessionId) server action
       └─> Sets ended_at, calculates final duration
       └─> Triggers materialized view refresh
   
   └─> Next time user opens Stats tab:
       └─> Sees updated reading time for this document
```

### Flow 2: "Where Was I?" Generation

```
1. User returns to reading after 2 days away
   └─> Bottom bar shows: "📍 Where was I?"
   
2. User clicks "Where was I?"
   └─> WhereWasI component calls generateWhereWasI()
   
3. Server Action: generateWhereWasI()
   └─> Check section_summaries for cached summary
       └─> Query: valid_up_to_chunk >= currentChunkIndex
   
   CASE 1: Cache exists
   └─> Return cached summary instantly
   └─> Display in modal
   
   CASE 2: No cache
   └─> Show loading state: "Generating summary... (~10 sec)"
   
   └─> Load all chunks up to current position
   └─> Group by top-level heading (Part 1, Part 2, etc.)
   
   └─> For each COMPLETED section:
       └─> Check section_summaries table
       └─> If exists: Use it
       └─> If not: Generate via Gemini (150-200 words)
           └─> Cache in section_summaries
   
   └─> For CURRENT section:
       └─> Load full text from start to current chunk
       └─> Don't summarize (user is in the middle of it)
   
   └─> Get immediate context (last 3 chunks)
   └─> Load user's sparks/annotations in those chunks
   
   └─> Call Gemini with hierarchical context:
       {
         completedSections: [summaries],
         currentSection: {fullText},
         immediateContext: {chunks, sparks, annotations}
       }
   
   └─> Gemini generates warm, conversational summary
   └─> Return to UI
   └─> Display in modal
   
4. User clicks away, continues reading
   └─> Summary cached for next 10 chunks
   └─> Won't regenerate until chunk +10
```

### Flow 3: Chat with Document (Full Book Mode)

```
1. User clicks "💬 Chat" in bottom bar
   └─> ChatInterface slides up (40vh)
   └─> Default mode: "📚 Entire Book"
   
2. Component checks: Do we have a cache?
   └─> Query document_conversations table
       └─> Where: user_id, document_id
       └─> Check: cache_expires_at > NOW()
   
   CASE 1: Cache exists and valid
   └─> Show banner: "⚡ Context cached • 75% cost reduction"
   └─> Load conversation history from Storage
   └─> Ready for messages
   
   CASE 2: No cache or expired
   └─> Show banner: "⚡ Creating context cache... (~10 sec)"
   └─> initializeChatCache() server action:
       └─> Load content.md from Storage (entire cleaned markdown)
       └─> Call Gemini API: cacheContent()
           model: 'gemini-2.0-flash-exp'
           systemInstruction: "You are discussing [title]..."
           contents: [{role: 'user', parts: [{text: fullMarkdown}]}]
           ttl: '3600s'
       └─> Gemini returns: { name, expireTime }
       └─> Store in document_conversations:
           gemini_cache_name: name
           cache_expires_at: expireTime
   └─> Show success banner: "⚡ Context cached"
   
3. User sends first message: "What is the main theme?"
   └─> sendChatMessage() server action
   └─> Load conversation history (empty for first message)
   └─> Add user message to history
   └─> Call Gemini with cached content:
       generateContent({
         cachedContent: cacheName,
         contents: [{ role: 'user', parts: [{text: "What is the main theme?"}] }]
       })
   └─> Gemini response (75% cheaper due to cache)
   └─> Add assistant message to history
   └─> Save history to Storage (messages.json)
   └─> Update document_conversations (message_count++, updated_at)
   └─> Return response to UI
   └─> Display in chat

4. User sends follow-up: "How does entropy connect to control?"
   └─> Same flow, but now:
       contents: [
         { role: 'user', content: "What is the main theme?" },
         { role: 'assistant', content: "[previous response]" },
         { role: 'user', content: "How does entropy connect to control?" }
       ]
   └─> Gemini has full conversation context + cached document
   └─> Response uses conversation history for coherent follow-up
   
5. User switches mode to "📖 Current Section"
   └─> setMode('section')
   └─> Invalidates cache (section is smaller context)
   └─> initializeChatCache() with mode='section'
       └─> Loads only current section's chunks
       └─> Creates new cache with section content
   └─> Continues conversation in section context
   
6. User closes chat
   └─> Conversation persists in Storage
   └─> Cache stays warm for 1 hour
   └─> Next open: Instant load, no cache recreation
```

### Flow 4: AI Spark Suggestion Acceptance

```
1. Background job runs weekly (or on-demand)
   └─> generateAISuggestions() for each user document
   └─> Finds high-density chunks without annotations
   └─> Generates spark suggestions via Gemini
   └─> Inserts into ai_suggestions table (status='pending')

2. User opens Sparks tab
   └─> Loads pending AI suggestions
   └─> Displays in purple card at top:
       "AI Suggested: [content]"
       "Reason: High connection density, no annotations"
       Confidence: 85%
   
3. User clicks "Accept"
   └─> acceptSuggestion() server action
   └─> Creates ECS entity:
       {
         spark: {
           content: suggestion.content,
           ai_generated: true,
           ai_edited: false
         },
         source: {
           chunk_id: suggestion.source_chunk_ids[0],
           document_id: suggestion.document_id
         }
       }
   └─> Updates ai_suggestions:
       status: 'accepted'
       responded_at: NOW()
   └─> Updates conversation_insights:
       accepted_ai_sparks++
   └─> Removes from pending list
   └─> Adds to user's Sparks list

4. User clicks "Edit"
   └─> Opens inline editor
   └─> User modifies: "The intersection of paranoia and surveillance systems"
   └─> Saves
   └─> Same as Accept, but:
       ai_edited: true
       user_response: "[edited content]"
   └─> Updates conversation_insights

5. User clicks "Dismiss"
   └─> rejectSuggestion() server action
   └─> Updates ai_suggestions:
       status: 'rejected'
       responded_at: NOW()
   └─> Updates conversation_insights:
       rejected_ai_sparks++
   └─> Removes from pending list

6. Learning system (passive)
   └─> After 10+ suggestions:
       └─> Query conversation_insights
       └─> Calculate acceptance rate by type
       └─> If user consistently rejects spark suggestions:
           └─> Disable AI spark suggestions
           └─> Or adjust confidence threshold
       └─> If user loves bridge connection suggestions:
           └─> Increase bridge_weight in future suggestions
```

---

## Implementation Phases

### Phase 1: Core Layout (Week 1)
**Goal**: Functional four-panel layout with view mode switching

**Tasks**:
1. Create base components:
   - `DocumentReader.tsx` orchestrator (modify existing)
   - `TopPanel/MainHeader.tsx`
   - `TopPanel/DocToolbar.tsx`
   - `LeftPanel/LeftPanel.tsx` (container with tabs)
   - `RightPanel/RightPanel.tsx` (enhance existing)
   - `BottomPanel/BottomPanel.tsx`

2. Implement Zustand store (`reader-store.ts`):
   - View mode state
   - Panel collapse states
   - Tab selections
   - Reading position tracking

3. View mode logic:
   - Normal: Panels collapsed (48px)
   - Focus: Panels hidden (0px)
   - Explore: Panels expanded (320px/384px)
   - Keyboard shortcuts (⌘1, ⌘2, ⌘3)

4. Panel collapse/expand animations:
   - CSS transitions (200ms ease-out)
   - Hover-to-expand in Normal mode
   - Pin/unpin functionality

**Deliverables**:
- Working layout with three view modes
- Smooth collapse/expand transitions
- Keyboard shortcuts functional
- Placeholders for tab content

**Testing**:
- View mode switching works correctly
- Panels don't cause content reflow
- Keyboard shortcuts respond properly
- Mobile/responsive breakpoints (single panel mode)

---

### Phase 2: Reading Session Tracking (Week 2)
**Goal**: Track reading time, patterns, and engagement

**Tasks**:
1. Database migrations:
   - `051_reading_sessions.sql`
   - `reading_stats_by_document` materialized view
   - `reading_stats_by_section` materialized view
   - `get_peak_reading_hours()` function

2. Server Actions:
   - `src/app/actions/reading-sessions.ts`:
     - `createReadingSession()`
     - `updateReadingSession()`
     - `endReadingSession()`
     - `getReadingStats()`

3. `useSessionTracking` hook:
   - Auto-start session on mount
   - Update every 30 seconds
   - End on blur/beforeunload
   - Increment sparks/annotations counters

4. Left Panel - Stats Tab:
   - Load stats from materialized views
   - Display time breakdowns
   - Show reading patterns
   - Per-section stats

**Deliverables**:
- Sessions automatically track in background
- Stats Tab shows accurate reading time
- Materialized views update on session end
- No performance impact on reading

**Testing**:
- Session starts on page load
- Updates every 30 seconds
- Ends cleanly on navigation away
- Stats reflect actual reading time
- Peak hours calculated correctly

---

### Phase 3: Left Panel Features (Week 3)
**Goal**: Outline, Heatmap, History tabs fully functional

**Tasks**:
1. Outline Tab:
   - Query chunks for heading hierarchy
   - Count connections per section
   - Calculate progress per section
   - Click to jump + show connections
   - Current section highlighting

2. Heatmap Tab:
   - Move existing ConnectionHeatmap component
   - Add click-to-jump functionality
   - Show tooltip with connection count
   - Highlight current position

3. History Tab:
   - Query reading_sessions for timeline
   - Show session cards (date, duration, position)
   - Mark sessions with sparks/annotations
   - Click to jump to that position

4. Stats Tab enhancements:
   - Add section breakdown table
   - Weekly reading chart
   - Pattern insights

**Deliverables**:
- Outline navigable with connection density
- Heatmap interactive
- History shows all sessions
- All tabs data-driven from DB

**Testing**:
- Outline reflects document structure
- Connection counts accurate
- Heatmap density matches connections
- History shows all past sessions
- Click-to-jump works from all tabs

---

### Phase 4: Bottom Panel (Week 4)
**Goal**: Contextual bar, "Where was I?", chat interface

**Tasks**:
1. Database migrations:
   - `052_document_conversations.sql`
   - `053_section_summaries.sql`

2. Compact Bar:
   - Rotating contextual messages
   - Quick action buttons
   - Expand/collapse logic

3. "Where Was I?" feature:
   - `generateWhereWasI()` server action
   - Hierarchical context loading
   - Section summary generation
   - Gemini integration for final summary
   - Caching in `section_summaries`
   - Modal/expanded view for display

4. Chat Interface (basic):
   - Slide-up panel (40vh)
   - Mode selector (full/section/local)
   - Message history from Storage
   - Basic send/receive (no caching yet)

**Deliverables**:
- Bottom bar shows contextual info
- "Where was I?" generates rich summaries
- Summaries cached for performance
- Chat interface functional (basic mode)

**Testing**:
- Rotating messages display correctly
- "Where was I?" generates accurate summaries
- Summaries don't spoil future content
- Cache prevents regeneration
- Chat sends/receives messages

---

### Phase 5: Gemini Context Caching (Week 5)
**Goal**: Implement caching for cost savings in chat

**Tasks**:
1. Gemini caching integration:
   - `initializeChatCache()` server action
   - Cache entire book for 'full' mode
   - Cache section for 'section' mode
   - Store cache metadata in DB

2. Chat enhancements:
   - Check cache validity on open
   - Show cache creation status
   - Use cached content in messages
   - Refresh cache on expiry

3. Cost tracking:
   - Log cache hits/misses
   - Calculate savings (75% reduction)
   - Display to user in UI

4. Quick prompt buttons:
   - "Summarize"
   - "Connect to..."
   - "Challenge"
   - Pre-fill with templates

**Deliverables**:
- Full book mode uses caching
- 75% cost reduction for cached messages
- Cache persists across sessions (1 hour)
- User sees cost savings

**Testing**:
- Cache created on first message
- Subsequent messages use cache
- Cache expires after 1 hour
- New cache created after expiry
- Cost savings logged correctly

---

### Phase 6: AI Suggestions (Week 6)
**Goal**: Proactive AI-generated sparks and connections

**Tasks**:
1. Database migration:
   - `054_ai_suggestions.sql`
   - `055_conversation_insights.sql`

2. Background job:
   - `generateAISuggestions()` worker function
   - Find high-density chunks without engagement
   - Find cross-document concept patterns
   - Generate suggestions via Gemini
   - Insert into ai_suggestions table

3. UI components:
   - `AISuggestionCard.tsx`
   - Display in Sparks tab
   - Accept/Edit/Dismiss actions
   - Learning feedback loop

4. Server actions:
   - `acceptSuggestion()`
   - `rejectSuggestion()`
   - `editSuggestion()`
   - Update conversation_insights

**Deliverables**:
- Weekly AI suggestions generated
- Suggestions display in Sparks tab
- User can accept/edit/dismiss
- System learns from feedback

**Testing**:
- Background job runs successfully
- Suggestions are insightful
- Accept creates proper spark
- Dismiss doesn't recreate suggestion
- Learning system tracks preferences

---

### Phase 7: Polish & Optimization (Week 7-8)
**Goal**: Animations, responsive design, performance tuning

**Tasks**:
1. Animations:
   - Connection badge pulse
   - Spark capture feedback
   - Panel slide transitions
   - Dense region glow

2. Responsive design:
   - <1600px: Auto-collapse left panel
   - <1400px: Right panel overlay
   - <1200px: Single panel mode
   - Mobile: Stack panels vertically

3. Performance:
   - Virtualize long lists (outline, history)
   - Debounce scroll updates
   - Lazy load tab content
   - Optimize materialized view refreshes

4. Accessibility:
   - Keyboard navigation for all panels
   - Screen reader labels
   - Focus management
   - Color contrast checks

5. Testing:
   - Integration tests for user flows
   - E2E tests for critical paths
   - Load testing for large documents
   - Cost validation for Gemini usage

**Deliverables**:
- Smooth animations throughout
- Responsive on all screen sizes
- Fast performance (no jank)
- Accessible to all users
- Comprehensive test coverage

---

## Integration Points

### Existing Code to Modify

1. **`src/app/read/[id]/page.tsx`**
   - Replace single DocumentReader with new four-panel layout
   - Add session tracking hook
   - Load initial reader state from preferences

2. **`src/components/reader/VirtualizedReader.tsx`**
   - Keep existing virtualization logic
   - Add scroll position tracking (% of document)
   - Add visible chunks tracking (chunk indices in viewport)
   - Emit events to Zustand store

3. **`src/components/reader/ConnectionHeatmap.tsx`**
   - Move to `LeftPanel/HeatmapTab.tsx`
   - Add click-to-jump functionality
   - Enhance tooltips with connection details

4. **`src/components/sidebar/RightPanel.tsx`**
   - Add collapse/expand logic
   - Enhance ConnectionsTab with grouping
   - Add AI suggestions to SparksTab
   - Keep other tabs largely as-is

5. **`src/stores/background-jobs.ts`**
   - Add AI suggestion job types
   - Track suggestion generation progress

### New Files to Create

**Components** (34 files):
```
src/components/reader/
├── TopPanel/
│   ├── MainHeader.tsx
│   ├── DocToolbar.tsx
│   └── index.ts
├── LeftPanel/
│   ├── LeftPanel.tsx
│   ├── OutlineTab.tsx
│   ├── StatsTab.tsx
│   ├── HeatmapTab.tsx
│   ├── HistoryTab.tsx
│   └── index.ts
├── BottomPanel/
│   ├── BottomPanel.tsx
│   ├── CompactBar.tsx
│   ├── ExpandedView.tsx
│   ├── ChatInterface.tsx
│   ├── WhereWasI.tsx
│   └── index.ts
└── shared/
    └── AISuggestionCard.tsx
```

**Server Actions** (4 files):
```
src/app/actions/
├── reading-sessions.ts        # Session CRUD
├── section-summaries.ts        # "Where was I?"
├── chat.ts                     # Chat messages
└── ai-suggestions.ts           # Suggestion management
```

**Hooks** (3 files):
```
src/hooks/
├── useSessionTracking.ts       # Auto session tracking
├── useChatCache.ts            # Gemini cache management
└── useAISuggestions.ts        # Load/manage suggestions
```

**Worker Jobs** (1 file):
```
worker/jobs/
└── generate-ai-suggestions.ts  # Background AI job
```

**Database** (5 migrations):
```
supabase/migrations/
├── 051_reading_sessions.sql
├── 052_document_conversations.sql
├── 053_section_summaries.sql
├── 054_ai_suggestions.sql
└── 055_conversation_insights.sql
```

---

## Cost & Performance

### Gemini API Cost Breakdown

**Per Document (500 pages):**
- Chat cache creation: ~$0.01 (150k tokens × $0.075/1M)
- 10 cached messages: ~$0.03 (10 × 150k tokens × $0.01875/1M)
- "Where was I?" summaries: ~$0.05 (5 sections × ~$0.01 each)
- AI suggestions: ~$0.05 (10 suggestions × ~$0.005 each)
- **Total: ~$0.14 per document per month**

**Heavy User (100 documents, active chat):**
- Chat: 100 docs × 10 messages × $0.003 = $3.00
- Summaries: 100 docs × 5 summaries × $0.01 = $5.00
- AI suggestions: 100 docs × $0.05 = $5.00
- **Total: ~$13/month**

### Performance Targets

**Page Load**:
- Initial render: <500ms
- Panel collapse/expand: <200ms
- Tab switching: <100ms

**Session Tracking**:
- Update interval: 30 seconds
- DB write latency: <100ms
- No impact on reading experience

**Chat**:
- Cache creation: 5-10 seconds (one-time)
- Cached message response: 2-3 seconds
- Local mode response: 1-2 seconds

**AI Suggestions**:
- Background job: Run weekly (off-peak)
- Processing time: ~5 min per 100 documents
- No user-visible latency

---

## Testing Strategy

### Unit Tests

```typescript
// reader-store.test.ts
describe('ReaderStore', () => {
  it('switches view modes correctly', () => {
    const { setViewMode } = useReaderStore.getState();
    setViewMode('focus');
    expect(useReaderStore.getState().viewMode).toBe('focus');
    expect(useReaderStore.getState().leftPanel.collapsed).toBe(true);
  });
  
  it('tracks session start/end', async () => {
    const { startSession, endSession } = useReaderStore.getState();
    await startSession('doc-123', 0);
    expect(useReaderStore.getState().sessionId).toBeTruthy();
    await endSession();
    expect(useReaderStore.getState().sessionId).toBeNull();
  });
});

// generateWhereWasI.test.ts
describe('Where Was I', () => {
  it('generates summary without spoilers', async () => {
    const summary = await generateWhereWasI('doc-123', 'user-456', 42);
    
    // Verify completed sections included
    expect(summary.completedSections).toHaveLength(2);
    
    // Verify current section has full text
    expect(summary.currentSection.fullText).toBeTruthy();
    
    // Verify user context included
    expect(summary.immediateContext.userSparks).toBeTruthy();
  });
  
  it('uses cached summaries when available', async () => {
    // First call generates
    const first = await generateWhereWasI('doc-123', 'user-456', 42);
    
    // Second call uses cache
    const second = await generateWhereWasI('doc-123', 'user-456', 43);
    
    expect(first.generatedAt).toEqual(second.generatedAt);
  });
});
```

### Integration Tests

```typescript
// reading-flow.test.ts
describe('Reading Session Flow', () => {
  it('tracks complete reading session', async () => {
    // 1. Start session
    render(<DocumentReader documentId="doc-123" />);
    await waitFor(() => {
      expect(screen.getByText(/Gravity's Rainbow/)).toBeInTheDocument();
    });
    
    // 2. Verify session created
    const session = await getActiveSession('user-456', 'doc-123');
    expect(session).toBeTruthy();
    
    // 3. Scroll through content
    fireEvent.scroll(screen.getByRole('main'), { scrollTop: 1000 });
    await waitFor(() => {
      expect(useReaderStore.getState().scrollPosition).toBeGreaterThan(0);
    });
    
    // 4. Create spark
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(/What sparked/), {
      target: { value: 'Test spark' }
    });
    fireEvent.click(screen.getByText(/Capture/));
    
    // 5. Verify session updated
    const updated = await getActiveSession('user-456', 'doc-123');
    expect(updated.sparksCreated).toBe(1);
    
    // 6. Navigate away
    await cleanup();
    
    // 7. Verify session ended
    const ended = await getSession(session.id);
    expect(ended.endedAt).toBeTruthy();
  });
});
```

### E2E Tests (Playwright)

```typescript
// reader-e2e.spec.ts
test('complete reader workflow', async ({ page }) => {
  // 1. Navigate to document
  await page.goto('/read/doc-123');
  await expect(page.locator('h1')).toContainText("Gravity's Rainbow");
  
  // 2. Switch view modes
  await page.click('[data-testid="view-mode-focus"]');
  await expect(page.locator('[data-testid="left-panel"]')).toBeHidden();
  
  await page.click('[data-testid="view-mode-explore"]');
  await expect(page.locator('[data-testid="left-panel"]')).toBeVisible();
  
  // 3. Navigate via outline
  await page.click('[data-testid="outline-tab"]');
  await page.click('text=Part 3: In the Zone');
  await expect(page.locator('[data-chunk-index="127"]')).toBeInViewport();
  
  // 4. Check stats
  await page.click('[data-testid="stats-tab"]');
  await expect(page.locator('text=This session:')).toBeVisible();
  
  // 5. Open chat
  await page.click('text=Chat');
  await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();
  
  // 6. Send message
  await page.fill('[data-testid="chat-input"]', 'What is the main theme?');
  await page.click('[data-testid="send-button"]');
  await expect(page.locator('.chat-message.assistant')).toBeVisible();
  
  // 7. Generate "Where was I?"
  await page.click('text=Where was I?');
  await expect(page.locator('[data-testid="context-summary"]')).toBeVisible();
  
  // 8. Accept AI suggestion
  await page.click('[data-testid="sparks-tab"]');
  await page.click('[data-testid="ai-suggestion"] >> text=Accept');
  await expect(page.locator('.spark-card')).toContainText('AI Suggested');
});
```

---

## Success Metrics

**Adoption**:
- % of reading sessions with panel interactions
- Average time spent in each panel
- Most-used tabs

**Engagement**:
- Reading time increase (compared to old reader)
- Sparks captured per session
- Connections validated per session
- AI suggestions acceptance rate

**Performance**:
- Page load time (target: <500ms)
- Session tracking overhead (target: <50ms)
- Chat response time (target: <3s with cache)

**Cost**:
- Average Gemini cost per document per month
- Cache hit rate (target: >80%)
- Cost per user per month (target: <$15)

---

## Notes for Developer

### Placeholder Names
The following may need adjustment based on actual codebase:
- `src/components/reader/VirtualizedReader.tsx` - Check actual path
- `src/stores/background-jobs.ts` - May be named differently
- `@/lib/ecs/ecs.ts` - ECS system location
- `@/app/actions/` - Server actions directory
- Supabase table names (verify in existing migrations)

### Unknown Context
- Existing annotation system implementation details
- Current ECS component structure
- Existing Gemini integration patterns (check `docs/GEMINI_PROCESSING.md`)
- Current Zustand store organization (check `docs/ZUSTAND_RULES.md`)

### Integration Questions
1. Does VirtualizedReader already emit scroll events?
2. Is there an existing session tracking system to merge with?
3. Are there existing Server Actions for ECS entities?
4. What's the current Gemini error handling pattern?
5. Is there a job queue system for background tasks?

### Dependencies to Install
```bash
# Main app
npm install framer-motion  # For panel animations (if not already installed)

# Worker
# (Gemini SDK already installed per docs)
```

### Environment Variables to Add
```bash
# .env.local
ENABLE_AI_SUGGESTIONS=true
AI_SUGGESTION_WEEKLY_SCHEDULE="0 2 * * 0"  # Sunday 2 AM
GEMINI_CACHE_TTL_SECONDS=3600
SESSION_IDLE_THRESHOLD_MINUTES=5
```

---

**End of Implementation Plan**

This plan is comprehensive but flexible. Prioritize Phase 1-4 for MVP (core layout + session tracking + context features). Phase 5-6 (caching + AI suggestions) are enhancements that can be added incrementally.

Questions or clarifications? Reference:
- `docs/APP_VISION.md` for philosophy
- `docs/PROCESSING_PIPELINE.md` for chunk/metadata details
- `docs/CLAUDE.md` for overall architecture
- `docs/ZUSTAND_RULES.md` for state management patterns