# Rhizome: Spark Feature Specification

## Executive Summary

Spark is a rapid-capture system for preserving thoughts with their full reading context, enabling automatic resurrection of buried insights. Designed specifically for fiction writers and researchers who need their marginalia to actively surface during creative work.

## Core Problem

Writers accumulate thousands of annotations across hundreds of texts. These insights die in the margins - marked with "lightbulbs" but never revisited. When writing fiction, relevant annotations remain buried while the writer faces a blank page.

## The Spark Solution

### What Is A Spark?

A **cognitive event capture** that preserves:
- The thought itself (text/voice)
- The complete app context when thought occurred
- All visible content, connections, and navigation state

Think of it as a screenshot of your mind + the app state that triggered it.

### Technical Architecture

**ECS Implementation**:
```
Entity: Spark_[uuid]
Components:
- ContextRef (entire app state at capture time)
- Content (the actual thought)
- Temporal (timestamp, decay status)
- Embedding (vector for similarity search)
- SparkType (insight|question|connection|contradiction)
```

**ContextRef Captures**:
- All visible chunks and their positions
- Active connections being viewed
- Navigation breadcrumb trail
- Scroll positions and zoom levels
- Search terms and active filters
- Which collision engines were firing

### User Interface (Using shadcn Components)

#### 1. Omnipresent Capture

**Global Command Bar** (`Cmd+S`)
- Triggers command palette in "spark mode"
- Captures context automatically
- Single input field, saves on Enter

**Fixed Bottom Bar** (Collapsible)
```
[⚡ Click or Cmd+S to spark] (collapsed)
[⚡ Type spark... | Insight ▼ | ●●●○○] (expanded)
```

#### 2. Spark Management

**Right-Side Sheet** (`Cmd+Shift+S`)
- Slides in from right edge
- Can pin open while working
- Shows chronological spark list with context
- Inline search and filtering

**Dedicated Hub** (`/sparks` route)
- Timeline view (temporal clustering)
- List view (with context previews)
- Graph view (spark constellation)
- Fossil view (30+ day old sparks)

#### 3. Context Features

**Breadcrumb Time Machine**
- Each spark shows its capture context as breadcrumb
- Click any crumb to restore exact app state
- Returns to exact scroll position
- Shows what else was being read that session

**Inline Indicators**
- Lightning badges (⚡) on chunks with associated sparks
- Hover for popover preview
- Stack indicator for multiple sparks (⚡×3)

### Resurrection System

#### Multiple Entry Points

**1. Command Palette Search** (`Cmd+K`)
```
Search: "control"
Results segmented by:
- Sparks (12)
- Documents (8)  
- Connections (23)
- Threads (3)
```

**2. Writing Mode Contextual Surfacing**
- As user types keywords, right sidebar updates
- Shows related sparks, connections, contradictions
- Zero-friction integration with writing flow

**3. Synthesis View** (`/synthesize [keyword]`)
Generates comprehensive report:
- Dominant patterns across all sources
- Contradiction clusters
- Timeline of thought evolution
- Suggested new threads

**4. Scout Command** (`/scout [keyword]`)
Multi-wave reconnaissance:
- Wave 1: Direct keyword matches
- Wave 2: Semantic similarities
- Wave 3: Structural patterns
- Wave 4: Productive contradictions

### Fiction-Specific Features

**Character Constellation Mode**
- Tag sparks with character names
- Each character accumulates knowledge graph
- "What would [character] think about this?"

**Scene Collision Detection**
- Upload draft scenes
- Auto-surface resonant sparks/annotations
- "This scene structurally mirrors your Bataille notes"

**Narrative Thread Weaving**
- Track how concepts manifest across fiction
- "Show everywhere 'entropy' appears in novel + research"

### Spark Lifecycle

1. **Genesis** (<2 sec capture)
2. **Processing** (embedded immediately)
3. **Connection** (aggressive auto-linking)
4. **Evolution** (→ threads, annotations, or standalone)
5. **Fossilization** (30 days inactive, still searchable)
6. **Resurrection** (old sparks surface when relevant)

### Success Metrics

- Capture friction: <3 seconds thought-to-save
- Spark→Thread conversion: 5-10% (not higher)
- Fossil resurrection rate (old becoming relevant)
- Context restoration usage

## Implementation Priority

### Phase 1: Core Capture
- Global hotkey (`Cmd+S`)
- Basic context preservation
- Simple chronological list

### Phase 2: Resurrection
- Search integration
- Context breadcrumbs
- Writing mode sidebar

### Phase 3: Intelligence
- Synthesis view
- Scout reconnaissance
- Collision detection

## Example User Flow

**Writing scene about control**:

1. User types "control" in draft
2. Sidebar auto-updates with control-related sparks
3. Sees spark: "Deleuze control = API architecture"
4. Clicks context breadcrumb
5. Returns to exact reading state from 6 months ago
6. Sees what else they were reading that day
7. Discovers unexpected connection to debugging notes
8. Scene crystallizes: surveillance as recursive function

## The Core Promise

Every annotation ever made becomes part of an active conspiracy to feed the user's fiction. Nothing stays buried. Everything resurfaces exactly when most generative.

Sparks aren't notes - they're **cognitive events the system witnesses**, creating a seismograph of intellectual activity that actively hunts for relevance across time.

---

*Note: This system is designed for personal use without user-experience compromises. Build for maximum intelligence and connection surfacing, not user-friendliness.*