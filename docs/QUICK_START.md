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
Check Supabase Edge Function logs:
```bash
npx supabase functions serve
```

### Embeddings not generating
Verify Gemini API key and quota

## Key Files to Check

- `lib/ecs/simple-ecs.ts` - ECS implementation
- `app/page.tsx` - Library/upload interface  
- `app/read/[id]/page.tsx` - Document reader
- `components/layout/processing-dock.tsx` - Processing status
- `supabase/functions/process-document` - Gemini processing