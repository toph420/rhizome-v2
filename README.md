# Rhizome V2 - AI-Powered Document Reader & Knowledge Synthesis

**Rhizome V2** is a document reader with integrated flashcard study system and AI-powered knowledge synthesis. Transform any content into clean markdown, create flashcards inline, and discover connections between ideas across your reading library.

---

## ✨ Key Features

### 📄 Multi-Format Document Processing
- **PDF Documents**: Academic papers, books, reports via Gemini Files API
- **Markdown Files**: Technical docs, notes (save as-is or clean with AI)
- **Plain Text**: Automatically converted to structured markdown
- **YouTube Videos**: Auto-fetch transcripts with clickable timestamps
- **Web Articles**: Clean extraction from news sites and blogs (no ads/navigation)
- **Direct Pasting**: Any text content with optional source attribution

### 🎯 Smart Reading Features
- **Clean Markdown Rendering**: All documents processed to portable markdown format
- **Inline Annotations**: Highlight and annotate without leaving the reading flow
- **Quick Flashcard Creation**: Select text → instant flashcard
- **Zero Modals**: Docks, panels, and overlays preserve reading state

### 🧠 Knowledge Synthesis
- **Semantic Chunking**: AI-powered content segmentation
- **Connection Discovery**: pgvector similarity search finds related concepts
- **Spaced Repetition**: FSRS algorithm for optimized learning
- **Timestamp Preservation**: YouTube videos maintain clickable timestamps

### 🔄 Background Processing
- **Async Job Queue**: Documents process in background worker
- **Real-Time Progress**: ProcessingDock shows live processing status
- **Error Recovery**: User-friendly error messages with recovery actions
- **Retry Logic**: Automatic retry for transient failures

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ 
- **Supabase CLI** (for local development)
- **Google AI API Key** (Gemini)

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/rhizome-v2.git
cd rhizome-v2

# Install dependencies
npm install

# Install worker dependencies
cd worker && npm install && cd ..

# Setup environment
cp .env.local.example .env.local
# Add your GEMINI_API_KEY to .env.local

# Start Supabase (includes PostgreSQL + Storage)
npx supabase start

# Run database migrations
npx supabase db reset

# Start all services (Supabase + Worker + Next.js)
npm run dev
```

### Access the App

- **Frontend**: http://localhost:3000
- **Supabase Studio**: http://localhost:54323
- **API**: http://localhost:3000/api

---

## 📚 Supported Content Sources

### 1. PDF Documents
Upload research papers, books, reports, presentations.
- **Processing**: Gemini Files API extracts text with high accuracy
- **Time**: ~1-2 minutes for 10-page document
- **Output**: Clean markdown with preserved structure

### 2. Markdown Files
Two processing modes:
- **Save As-Is**: Fast heading-based chunking, no AI processing (~30s)
- **Clean with AI**: AI cleanup and semantic chunking (~1min)

### 3. Text Files
Plain text automatically formatted to structured markdown.
- **Processing**: AI adds headings, formatting, and structure
- **Time**: ~1 minute
- **Output**: Well-structured markdown document

### 4. YouTube Videos
Automatically fetch and process transcripts with AI-powered cleaning.
- **Processing**: Enhanced 7-stage pipeline (~1-2 minutes)
  - **Stage 1**: Transcript fetch (no API key needed)
  - **Stage 2**: Original backup with timestamps
  - **Stage 3**: AI cleaning (removes timestamp noise, fixes grammar, adds headings)
  - **Stage 4**: Semantic chunking with complete metadata
  - **Stage 5**: Fuzzy positioning for future annotations
  - **Stage 6**: Embeddings generation
  - **Stage 7**: Database storage
- **Features**: 
  - Clean, readable markdown without timestamp clutter
  - Original transcript preserved in `source-raw.txt`
  - Complete metadata (themes, importance scores, summaries)
  - Chunk positioning with 0.3-1.0 confidence scores
  - 100% graceful degradation (zero data loss on errors)
- **Quality Metrics**:
  - Timestamp removal: 100% (zero `[[MM:SS](url)]` in cleaned content)
  - Metadata completeness: 100% (all non-null fields)
  - Positioning accuracy: >70% high confidence for typical videos
- **Fallback**: If transcript disabled, paste manually

### 5. Web Articles
Extract clean content from any web article.
- **Processing**: Mozilla Readability + AI cleanup (~45s)
- **Output**: Article content without ads, navigation, or boilerplate
- **Error Handling**: Paywall detection suggests archive.ph

### 6. Pasted Content
Paste any text directly.
- **Processing**: Format to markdown + semantic chunking (~30s)
- **YouTube Detection**: Auto-detects timestamps if pasting transcript
- **Source Attribution**: Optional URL field for attribution

---

## 🏗️ Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15 (App Router) + React 19 + TailwindCSS 4
- **Backend**: Supabase (PostgreSQL + Storage + Auth)
- **Worker**: Node.js background processor with TypeScript
- **AI**: Google Gemini 2.5 Flash (text generation + embeddings)
- **State**: Zustand (client) + React Query (server state)

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                       Next.js Frontend                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Upload UI    │  │ Document     │  │ Processing      │  │
│  │ (6 methods)  │  │ Reader       │  │ Dock            │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (Database + Storage)             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PostgreSQL: documents, chunks, components, jobs     │  │
│  │  Storage: PDFs, markdown files, processed content    │  │
│  │  pgvector: embeddings for semantic search            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Background Worker                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Job Queue Processor (polls every 5s)                │  │
│  │  • PDF → Markdown (Gemini Files API)                 │  │
│  │  • YouTube → Transcript (youtube-transcript-plus)    │  │
│  │  • Web → Article (jsdom + Readability)               │  │
│  │  • Markdown → Chunks (AI or heading-based)           │  │
│  │  • Embeddings → pgvector (Gemini text-embedding)     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Hybrid Storage Strategy

**Supabase Storage** (Large, Immutable):
- Original files (PDFs, markdown)
- Processed markdown content
- Export bundles

**PostgreSQL Database** (Queryable, Mutable):
- Document metadata (NOT content)
- Chunks with embeddings (for pgvector search)
- User annotations and flashcards (ECS)
- Background job queue

### ECS (Entity-Component-System) Pattern

Everything is an **entity** (UUID). Behavior comes from **components**:
- Flashcard component → entity becomes a flashcard
- Annotation component → entity becomes a note
- Study component → entity has spaced repetition data

Maximum flexibility without database migrations.

---

## 🛠️ Development

### Project Structure

```
rhizome-v2/
├── src/                           # Next.js application
│   ├── app/                       # App Router pages
│   │   ├── page.tsx              # Library grid view
│   │   ├── read/[id]/            # Document reader
│   │   └── actions/              # Server Actions
│   ├── components/                # React components
│   │   ├── library/              # Upload, grid
│   │   ├── reader/               # Markdown viewer
│   │   ├── layout/               # Docks, panels
│   │   └── ui/                   # shadcn/ui
│   ├── lib/                       # Utilities
│   │   ├── ecs/                  # Entity-Component-System
│   │   ├── supabase/             # Database clients
│   │   └── auth/                 # Authentication
│   └── stores/                    # Zustand state
├── worker/                        # Background processor
│   ├── handlers/                  # Job handlers
│   │   └── process-document.ts   # Main routing logic
│   ├── lib/                       # Worker utilities
│   │   ├── youtube.ts            # YouTube transcript
│   │   ├── web-extraction.ts     # Web scraping
│   │   ├── markdown-chunking.ts  # Heading-based chunks
│   │   └── errors.ts             # Error handling
│   ├── types/                     # TypeScript types
│   └── index.ts                   # Queue processor
├── supabase/
│   ├── migrations/                # Database schema
│   └── functions/                 # Edge Functions (unused)
├── docs/                          # Documentation
│   ├── testing/                   # Test plans
│   └── tasks/                     # Task breakdowns
└── test-files/                    # Sample files for testing
```

### Available Scripts

```bash
# Development
npm run dev              # Start all services (Supabase + Worker + Next.js)
npm run dev:next         # Start only Next.js (if Supabase running)
npm run dev:worker       # Start only worker
npm run worker           # Run worker (production mode)

# Build & Quality
npm run build            # Build Next.js for production
npm run lint             # ESLint with JSDoc validation
npm test                 # Run Jest tests
npm run test:watch       # Jest in watch mode
npm run docs             # Generate TypeDoc API docs

# Database
npx supabase db reset    # Apply all migrations
npx supabase migration new <name>  # Create new migration
npx supabase status      # Check service status

# Utilities
npm run status           # Check all services
npm run stop             # Stop all services
```

### Environment Variables

Required in `.env.local`:

```bash
# Supabase (from `npx supabase start` output)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Google AI
GEMINI_API_KEY=<your Google AI Studio key>
```

### Development Mode

For MVP, authentication is bypassed with hardcoded dev user:
- User ID: `dev-user-123`
- RLS disabled on all tables
- Service role key used for admin operations

---

## 📖 Usage Guide

### Uploading Content

**1. File Upload Tab**
- Drag & drop or browse for: PDFs, Markdown (.md), Text (.txt)
- For markdown: Choose "Save as-is" or "Clean with AI"
- Click "Upload"

**2. Fetch from URL Tab**
- Paste YouTube video URL or web article URL
- System auto-detects type (YouTube vs web article)
- Click "Fetch"

**3. Paste Content Tab**
- Paste any text content
- Optionally add source URL for attribution
- System detects timestamps for YouTube transcripts
- Click "Submit"

### YouTube Videos

- **Automatic Processing**: Transcripts automatically fetched (no API key needed)
- **AI-Powered Cleaning**: 
  - Removes `[[MM:SS](url)]` timestamp noise from display content
  - Fixes grammar and combines sentence fragments
  - Adds semantic section headings every 3-5 minutes
  - Removes filler words for cleaner reading
- **Dual Storage**:
  - `content.md`: Clean markdown for reading
  - `source-raw.txt`: Original transcript with timestamps (for reference and positioning)
- **Complete Metadata**: All chunks include themes, importance scores (0.0-1.0), and summaries
- **Positioning Data**: Chunks have confidence-scored positions (exact/fuzzy/approximate) for future annotation features
- **If transcript disabled**: Paste manually from YouTube's transcript feature

### Web Articles

- Content extracted without ads, navigation, or boilerplate
- Formatted as clean markdown
- Paywalled articles: try https://archive.ph/ for archived version

### Error Handling

- **YouTube transcript disabled**: Suggestion to paste manually
- **Paywalled article**: Link to archive.ph
- **Network errors**: Auto-retry with exponential backoff
- **Invalid URLs**: Validation error before processing

---

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test worker/lib/__tests__/youtube.test.ts

# Watch mode
npm run test:watch

# With coverage
npm test -- --coverage
```

### Manual Testing

See comprehensive test plan: `docs/testing/multi-format-manual-tests.md`

Test all 6 input methods with real content and verify:
- Processing times <2 minutes
- Content quality and accuracy
- Error handling and recovery
- Timestamp preservation (YouTube)
- Clean extraction (web articles)

### Performance Validation

See performance testing guide: `docs/testing/performance-validation.md`

Validate against success criteria:
- Processing time: <2 minutes per document
- API cost: <$0.05 per document  
- Success rate: >95% for valid inputs
- Throughput: 10+ concurrent jobs

---

## 📋 Roadmap

### Phase 1: MVP ✅ (Complete)
- [x] Multi-format document processing (6 input methods)
- [x] Background job queue with worker
- [x] Document upload and viewer
- [x] Markdown rendering
- [x] Processing status UI

### Phase 2: Study System (In Progress)
- [ ] Flashcard creation from text selection
- [ ] FSRS spaced repetition algorithm
- [ ] Study dashboard and sessions
- [ ] Progress tracking

### Phase 3: Knowledge Synthesis (Planned)
- [ ] Semantic search with pgvector
- [ ] Connection discovery between documents
- [ ] Knowledge graph visualization
- [ ] Synthesis studio

### Phase 4: Export & Collaboration (Future)
- [ ] Export to ZIP bundle (markdown + annotations + flashcards)
- [ ] Real authentication (currently dev mode)
- [ ] Sharing and collaboration features
- [ ] Mobile responsive design

---

## 🤝 Contributing

Contributions welcome! Please follow these guidelines:

1. **Code Style**: Follow existing patterns, run `npm run lint` before committing
2. **Documentation**: All exported functions require JSDoc comments
3. **Testing**: Add tests for new features (`npm test`)
4. **Architecture**: Consult `CLAUDE.md` for architectural decisions
5. **Commit Messages**: Use conventional commits (feat:, fix:, docs:, etc.)

---

## 📄 License

This project is licensed under the MIT License. See `LICENSE` file for details.

---

## 🙏 Acknowledgments

- **Google Gemini**: AI processing and embeddings
- **Supabase**: Database, storage, and authentication
- **Mozilla Readability**: Web article extraction
- **youtube-transcript-plus**: YouTube transcript fetching
- **Next.js Team**: Modern React framework
- **Vercel**: Deployment platform

---

## 📞 Support

- **Issues**: https://github.com/yourusername/rhizome-v2/issues
- **Discussions**: https://github.com/yourusername/rhizome-v2/discussions
- **Email**: support@rhizome.app

---

**Built with ❤️ using Next.js, Supabase, and Google Gemini**