# Quick Start Guide

## Environment Setup

```bash
# 1. Clone and install
git clone [repo]
cd rhizome
npm install

# 2. Setup Supabase
npx supabase init
npx supabase start
# Note the URLs and keys

# 3. Environment variables
cp .env.example .env.local
# Add your keys:
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
# GEMINI_API_KEY=

# 4. Database setup
npx supabase db push
npm run migrate

# 5. Start development
npm run dev
```

## Running with Background Processing

The application uses a background worker system for document processing to eliminate timeout limitations and enable processing of documents of any size.

### Option 1: Integrated (Recommended)

```bash
npm run dev  # Starts Supabase + Edge Functions + Worker + Next.js
```

This starts all services in a single command with proper cleanup on exit.

### Option 2: Separate Terminals

**Terminal 1: Next.js + Supabase**
```bash
npm run dev:next
```

**Terminal 2: Background Worker**
```bash
# First time: Install worker dependencies
cd worker && npm install && cd ..

# Then start worker
npm run worker
```

### Checking Worker Status

- **Worker logs**: Visible in Terminal 2 (or integrated output)
- **Database**: Check `background_jobs` table in Supabase Studio
- **UI**: View real-time progress in ProcessingDock (bottom of screen)

### Worker Features

- **No Timeout Limits**: Process documents of any size (500+ pages, 2+ hour processing)
- **Real-time Progress**: Live updates via Supabase Realtime
- **Checkpoint System**: Resume from failure at save_markdown stage
- **Progressive Availability**: Read markdown while embeddings generate
- **Auto-retry**: Transient errors (rate limits, network) retry automatically
- **Manual Retry**: Failed jobs can be retried via ProcessingDock UI

## Test Document
Use a small PDF (5-10 pages) for initial testing.
Academic papers work well for testing synthesis.

## Development Flow

1. Upload document via drag-drop
2. Watch processing in bottom dock
3. Open reader when complete
4. Select text to create annotations/cards
5. Check right panel for connections

## Common Issues

### "Port 3000 in use"
```bash
pkill -f 'next dev'
npm run dev
```

### Processing stuck
Check background worker logs in Terminal 2, or restart the worker:
```bash
npm run worker
```

Check `background_jobs` table for failed jobs with error messages.

### Embeddings not generating
Verify Gemini API key and quota

## Key Files to Check

- `lib/ecs/ecs.ts` - ECS implementation
- `app/page.tsx` - Library/upload interface  
- `app/read/[id]/page.tsx` - Document reader
- `components/layout/processing-dock.tsx` - Processing status
- `worker/handlers/process-document.ts` - Background document processing
- `worker/index.ts` - Job polling and dispatch
- `supabase/migrations/008_background_jobs.sql` - Job tracking table