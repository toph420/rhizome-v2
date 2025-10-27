# Rhizome V2 - Production Deployment Guide

**Last Updated**: 2025-10-26
**Architecture**: Hybrid (Cloud UI + Cloud Database + Local Processing)
**Status**: Production Ready

---

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Production Credentials](#production-credentials)
- [Initial Deployment](#initial-deployment)
- [Ongoing Deployments](#ongoing-deployments)
- [Database Migrations](#database-migrations)
- [Worker Configuration](#worker-configuration)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

---

## Architecture Overview

### Hybrid Deployment Model (Dual-Worktree Setup)

```
┌──────────────────────────────────────────────────────┐
│  CLIENT DEVICES (iPad, iPhone, Web)                  │
│  ↓ HTTPS                                             │
├──────────────────────────────────────────────────────┤
│  VERCEL (Next.js 15 + React 19)                      │
│  - Auto-deploys from main branch                     │
│  - Server Components (data fetching)                 │
│  - Server Actions (mutations)                        │
│  - Supabase Auth (magic links)                       │
│  - Static UI (cached globally)                       │
│  ↓ PostgreSQL wire protocol                          │
├──────────────────────────────────────────────────────┤
│  SUPABASE CLOUD (Database + Storage)                 │
│  - PostgreSQL 15 + pgvector                          │
│  - Storage buckets (documents, markdown, exports)    │
│  - background_jobs queue                             │
│  - Auth system (magic links, sessions)               │
│  ↑ Polling every 5s         ↑ Polling every 5s      │
├──────────────┬───────────────────────────────────────┤
│  Production  │  Development                          │
│  Worker      │  Worker                               │
├──────────────┴───────────────────────────────────────┤
│  LOCAL MAC - DUAL WORKTREE SETUP                     │
│                                                       │
│  /rhizome-v2/ (main branch)                          │
│  └─ worker/.env → Production DB                      │
│     - Polls production Supabase                      │
│     - Processes real user jobs                       │
│     - Docling (PDF processing)                       │
│     - Ollama (qwen2.5:32b, local AI)                 │
│     - 3-engine connection detection                  │
│                                                       │
│  /rhizome-v2-dev-1/ (dev branch)            │
│  └─ worker/.env → Local DB (localhost:54322)         │
│     - Development and testing                        │
│     - Local Supabase instance                        │
│     - Same code, isolated data                       │
└──────────────────────────────────────────────────────┘
```

### Benefits
- ✅ **$0/month cost**: Free tiers for Vercel + Supabase
- ✅ **Mobile access**: Upload/read from anywhere
- ✅ **Local processing**: Unlimited AI usage with Ollama
- ✅ **No VPN needed**: Worker uses outbound HTTPS only
- ✅ **Auto-scaling UI**: Vercel handles traffic
- ✅ **Dual-module architecture**: Clean separation between app and worker
- ✅ **Isolated dev environment**: Test safely without affecting production

---

## Production Credentials

### Supabase Cloud

**Project Details**:
- **URL**: `https://pqkdcfxkitovcgvjoyuu.supabase.co`
- **Project ID**: `pqkdcfxkitovcgvjoyuu`
- **Region**: East US (North Virginia)
- **Dashboard**: https://supabase.com/dashboard/project/pqkdcfxkitovcgvjoyuu

**API Keys** (New Format):
```bash
# Publishable Key (client-side, anon role)
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_[get-from-dashboard]

# Secret Key (server-side, service_role)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_[get-from-dashboard]
```

**Note**: Get these from Supabase Dashboard → Settings → API → "Project API keys"

**Database**:
- **Connection String**: Get from Supabase Dashboard → Settings → Database
- **Format**: `postgresql://postgres:[password]@db.pqkdcfxkitovcgvjoyuu.supabase.co:5432/postgres`
- **Direct Link**: `npx supabase link --project-ref pqkdcfxkitovcgvjoyuu`

### Vercel

**Project Details**:
- **Project Name**: `rhizome-v2`
- **GitHub Repo**: https://github.com/toph420/rhizome-v2
- **Auto-deploy**: `main` branch triggers production deployment
- **Dashboard**: https://vercel.com/dashboard

**Deployment URL**:
- Initial: `https://rhizome-v2-or2aiw81p-xmartyxcorexs-projects.vercel.app`
- Production: Check Vercel dashboard for current URL

### External API Keys

**Google AI (Gemini)**:
```bash
GOOGLE_AI_API_KEY=<your-gemini-key>  # Get from https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.5-flash
```

**YouTube API**:
```bash
YOUTUBE_API_KEY=<your-youtube-key>  # Get from Google Cloud Console
```

**Readwise**:
```bash
READWISE_ACCESS_TOKEN=<your-readwise-token>  # Get from https://readwise.io/access_token
```

**HuggingFace** (for Docling models):
```bash
HF_TOKEN=<your-huggingface-token>  # Get from https://huggingface.co/settings/tokens
```

---

## Initial Deployment

### Prerequisites
- [x] Supabase account created
- [x] Vercel account created
- [x] GitHub repository set up
- [x] Mac with Ollama installed
- [x] Node.js 18+ installed

### Step 1: Supabase Setup

**Create Project**:
1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Choose region closest to you
4. Set strong database password
5. Wait 2-3 minutes for provisioning

**Link CLI**:
```bash
cd /Users/topher/Code/rhizome-v2
npx supabase login  # Opens browser for auth
npx supabase link --project-ref pqkdcfxkitovcgvjoyuu
```

**Push Migrations**:
```bash
npx supabase db push --linked
```

**Expected**: All migrations applied successfully
- Check latest migration: `ls supabase/migrations/ | tail -1`
- Current latest (as of 2025-10-26): `070_chunk_connection_detection.sql`
- Migrations `004` and `043` are skipped (.skip files)
- Migrations `034` and `059` are modified for Cloud compatibility

**Verify**:
```bash
npx supabase migration list --linked
```

### Step 2: Vercel Deployment

**Install CLI**:
```bash
npm install -g vercel
vercel login  # Opens browser for auth
```

**Initial Deploy**:
```bash
cd /Users/topher/Code/rhizome-v2
vercel --yes
```

**Configure Environment Variables**:

Go to Vercel Dashboard → Project Settings → Environment Variables

Add for **Production** environment:

```bash
# Supabase (get from Supabase Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://pqkdcfxkitovcgvjoyuu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_[your-key]
SUPABASE_SERVICE_ROLE_KEY=sb_secret_[your-key]

# Google AI (get from https://aistudio.google.com/apikey)
GOOGLE_AI_API_KEY=[your-key]
GOOGLE_GENERATIVE_AI_API_KEY=[your-key]
GEMINI_API_KEY=[your-key]
GEMINI_MODEL=gemini-2.5-flash

# External APIs (optional)
YOUTUBE_API_KEY=[your-key]  # Optional - for YouTube processing
READWISE_ACCESS_TOKEN=[your-key]  # Optional - for Readwise imports

# Processing Mode (Vercel has no Ollama, must use cloud)
PROCESSING_MODE=cloud
USE_GEMINI_CLEANUP=true
USE_INLINE_METADATA=true
```

**Production Deploy**:
```bash
vercel --prod --yes
```

### Step 3: Dual-Worktree Setup

**Create Development Worktree** (one-time setup):
```bash
# Navigate to main repository
cd /Users/topher/Code/rhizome-v2

# Create worktree for development (initial branch doesn't matter)
git worktree add ../rhizome-v2-dev-1 main

# You can switch to any branch in the dev worktree:
cd ../rhizome-v2-dev-1
git checkout -b feature/your-feature  # Create new feature branch
# Or: git checkout existing-branch     # Switch to existing branch
```

**Worktree Structure**:
```
/Users/topher/Code/
├── rhizome-v2/                    # Main branch (production)
│   ├── worker/.env                # → Production database
│   └── ...
└── rhizome-v2-dev-1/              # Development worktree (feature branches)
    ├── worker/.env                # → Local database (localhost:54322)
    └── ...
```

### Step 4: Worker Configuration

**Production Worker** (`/rhizome-v2/worker/.env`):
```bash
# Production database connection
DATABASE_URL=postgresql://postgres:[password]@db.pqkdcfxkitovcgvjoyuu.supabase.co:5432/postgres

# Production Supabase
NEXT_PUBLIC_SUPABASE_URL=https://pqkdcfxkitovcgvjoyuu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_[your-key]
SUPABASE_SERVICE_ROLE_KEY=sb_secret_[your-key]

# Local Processing (Ollama on Mac)
PROCESSING_MODE=local
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b
USE_GEMINI_CLEANUP=true

# API Keys
GEMINI_API_KEY=[your-key]
HF_TOKEN=[your-key]
```

**Development Worker** (`/rhizome-v2-dev-1/worker/.env`):
```bash
# Local database connection
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# Local Supabase instance
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
PROCESSING_MODE=local
```

**Start Production Worker**:
```bash
cd /Users/topher/Code/rhizome-v2/worker
npm start
```

**Start Development Worker**:
```bash
cd /Users/topher/Code/rhizome-v2-dev-1
npm run dev  # Starts both app and worker
```

**Expected Output** (Production):
```
🚀 Background worker started
✅ Connected to Supabase: https://pqkdcfxkitovcgvjoyuu.supabase.co
Polling for jobs...
```

### Step 4: Seed Prompt Templates

**Issue**: The trigger in migration `066_prompt_templates.sql` should auto-create default flashcard prompts for new users, but there's a timing issue with magic link authentication. Users are created in `auth.users` during the magic link flow, before migration 066 runs.

**Fix**: Run the seed script after deployment:

```bash
cd /Users/topher/Code/rhizome-v2
npx tsx scripts/seed-prompt-templates.ts
```

**Expected Output**:
```
🌱 Seeding prompt templates...
👥 Found 1 users
🔍 Checking user: your-email@example.com
  📝 Creating 4 prompt templates...
  ✅ Created 4 prompt templates
✅ Prompt template seeding complete!
```

**What This Creates**:
- **Comprehensive Concepts** (default) - Key definitions and core ideas
- **Deep Details** - Specific claims and evidence
- **Connections & Synthesis** - How ideas connect
- **Contradiction Focus** - Conceptual tensions

**Note**: This script is idempotent - safe to run multiple times. It checks for existing prompts before creating new ones.

---

## Ongoing Deployments

### Dual-Worktree Workflow

**Development Workflow** (feature branch):
```bash
# Work in development worktree
cd /Users/topher/Code/rhizome-v2-dev-1

# Start local development environment
npm run dev  # Runs app + worker with local Supabase

# Make changes, test locally...
git add .
git commit -m "feat: your feature"
git push origin your-feature-branch  # e.g., homepage-and-search
```

**Production Deployment** (main branch):
```bash
# Merge in production worktree (main is already checked out there)
# Note: Can't checkout main in dev worktree - git limitation with dual worktrees
cd /Users/topher/Code/rhizome-v2
git pull origin main
git merge your-feature-branch --no-edit  # e.g., feature/document-last-viewed
git push origin main

# Push migration IMMEDIATELY after code deployment
cd /Users/topher/Code/rhizome-v2-dev-1  # Back to dev worktree (has .supabase/ link)
npx supabase db push

# Vercel auto-deploys from main branch
# Check status: https://vercel.com/dashboard
```

**Worker Deployment**:
```bash
# Production worker runs from main worktree
cd /Users/topher/Code/rhizome-v2/worker

# Pull latest changes
git pull origin main

# Restart worker to pick up changes
# (Ctrl+C to stop, then:)
npm start
```

### Database Migrations

**📖 See [MIGRATION_WORKFLOW.md](./MIGRATION_WORKFLOW.md) for comprehensive migration guide**

The complete workflow covers:
- Dual-worktree setup and linking
- Development cycle (additive vs breaking changes)
- Data safety strategies (storage-first architecture)
- Testing before pushing to cloud
- Common patterns and troubleshooting

**Quick commands**:
```bash
# Link development worktree to cloud (one-time)
npx supabase link --project-ref pqkdcfxkitovcgvjoyuu

# Create migration
npx supabase db diff -f feature_name

# Test locally (incremental)
npx supabase migration up

# Push to cloud
npx supabase db push
```

### Worker Updates

**Update Code**:
```bash
cd /Users/topher/Code/rhizome-v2/worker
# Make changes...
git add .
git commit -m "feat: worker update"
git push origin main
```

**Restart Worker**:
```bash
# Stop current worker (Ctrl+C)
npm start  # Restart with new code
```

---

## Worker Configuration

### Auto-Start on Mac Boot (Optional)

Create LaunchAgent: `~/Library/LaunchAgents/com.rhizome.worker.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.rhizome.worker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/topher/Code/rhizome-v2/worker/index.ts</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/topher/Code/rhizome-v2/worker/worker.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/topher/Code/rhizome-v2/worker/worker-error.log</string>
</dict>
</plist>
```

**Load Agent**:
```bash
launchctl load ~/Library/LaunchAgents/com.rhizome.worker.plist
launchctl start com.rhizome.worker

# Verify
launchctl list | grep rhizome
tail -f /Users/topher/Code/rhizome-v2/worker/worker.log
```

---

## Troubleshooting

### Deployment Fails on Vercel

**Check Build Logs**:
1. Go to Vercel Dashboard → Deployments
2. Click failed deployment
3. Check "Build Logs" tab

**Common Issues**:

1. **ESLint Errors**:
   ```
   Error: Command "npm run build" exited with 1
   ```
   **Fix**: Check `eslint.config.mjs`, ensure `no-explicit-any` is warning not error

2. **Missing Dependencies**:
   ```
   Module not found: Can't resolve 'package-name'
   ```
   **Fix**:
   ```bash
   npm install package-name
   git add package.json package-lock.json
   git commit -m "fix: add missing dependency"
   git push
   ```

3. **Environment Variables Missing**:
   ```
   process.env.NEXT_PUBLIC_SUPABASE_URL is undefined
   ```
   **Fix**: Add vars in Vercel Dashboard → Settings → Environment Variables → Redeploy

### Worker Not Picking Up Jobs

**Check 1: Worker Connected?**
```bash
tail -f /Users/topher/Code/rhizome-v2/worker/worker.log

# Should see:
# 🚀 Background worker started
# ✅ Connected to Supabase: https://pqkdcfxkitovcgvjoyuu.supabase.co
```

**Check 2: Credentials Correct?**
```bash
cd /Users/topher/Code/rhizome-v2/worker
cat .env | grep SUPABASE_URL

# Should be: https://pqkdcfxkitovcgvjoyuu.supabase.co
# NOT: http://localhost:54321
```

**Check 3: Jobs Actually Pending?**
```bash
# Query Supabase directly
cd /Users/topher/Code/rhizome-v2
npx supabase db remote --linked sql \
  "SELECT id, job_type, status, created_at FROM background_jobs ORDER BY created_at DESC LIMIT 10;"
```

**Check 4: Ollama Running?**
```bash
curl http://127.0.0.1:11434/api/tags

# Should return JSON with models
# If "connection refused":
ollama serve  # Start Ollama
```

### Authentication Issues

**"Authentication required" error in Server Actions** (FIXED in commits 885b9ad - 462bd92):
- **Issue**: Server Actions were using browser Supabase client instead of server client
- **Symptoms**: Upload fails, settings won't save, integrations fail with "Not authenticated"
- **Root Cause**: Server Actions run on Vercel servers and need server-side client to read auth cookies from Next.js request context
- **Fix Applied**: All Server Actions now use `getServerSupabaseClient()` instead of `getSupabaseClient()`
- **Files Fixed**:
  - `src/app/actions/documents/upload.ts` (3 functions)
  - `src/app/actions/documents/utils.ts` (2 functions)
  - `src/app/actions/settings.ts` (2 functions)
  - `src/app/actions/integrations.ts` (8 functions)
- **Verification**: Upload a document - should work without auth errors

**Vault path filesystem errors** (FIXED in commit 35995d4):
- **Issue**: Saving vault path shows "ENOENT: no such file or directory, mkdir '/Users'"
- **Root Cause**: Server Action tried to create directories on Vercel servers (cloud), not local filesystem
- **Fix Applied**: Removed `createVaultStructure()` call from Server Action - worker creates directories locally when exporting
- **Verification**: Save vault path in Settings → Should succeed without errors

**"Database error saving new user"**:
- Prompt template trigger timing issue (see Step 4 in Initial Deployment)
- Check if user actually created: Supabase Dashboard → Authentication → Users
- If user exists, run seed script: `npx tsx scripts/seed-prompt-templates.ts`

**Magic link not received**:
- Check Supabase Dashboard → Logs → Auth Logs
- Magic link URL visible in logs (copy and paste)
- Free tier SMTP can be slow (wait 2-3 minutes)

**Session not persisting**:
- Check middleware is deployed: `src/middleware.ts`
- Verify cookies enabled in browser
- Check Supabase Auth settings: Email confirmations enabled

### Migration Errors

**"relation does not exist"**:
- Migration order issue
- Reset and reapply: `npx supabase db reset --linked`

**"function gen_salt does not exist"**:
- Local-only migration running on Cloud
- Rename to `.skip`: `mv migration.sql migration.sql.skip`

**"uuid_generate_v4 does not exist"**:
- Use Cloud-compatible function: `gen_random_uuid()`

---

## Rollback Procedures

### Revert Vercel Deployment

**Via Dashboard**:
1. Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

**Via CLI**:
```bash
vercel rollback
```

### Revert Database Migration

**⚠️ DESTRUCTIVE - Use with caution**

```bash
cd /Users/topher/Code/rhizome-v2

# Create backup first
npx supabase db dump --linked > backup_$(date +%Y%m%d).sql

# Reset to specific migration
npx supabase db reset --linked

# Or revert single migration (if idempotent)
npx supabase db remote --linked sql "$(cat supabase/migrations/XXX_migration.sql | sed 's/CREATE/DROP/g')"
```

### Revert Worker Configuration

```bash
cd /Users/topher/Code/rhizome-v2/worker

# Restore from git
git checkout HEAD -- .env

# Or manually edit .env
# Change back to localhost for local development
```

---

## Monitoring

### Check Deployment Status

```bash
# Vercel
vercel ls  # List recent deployments

# Supabase
npx supabase projects list  # List projects

# Worker
tail -f /Users/topher/Code/rhizome-v2/worker/worker.log
```

### Health Checks

**Vercel App**:
- Visit deployment URL
- Should redirect to `/login`
- Check response time (< 2s)

**Supabase Database**:
```bash
npx supabase db remote --linked sql "SELECT NOW();"
```

**Worker**:
```bash
# Check if process running
ps aux | grep "node.*worker"

# Check recent log activity
tail -20 /Users/topher/Code/rhizome-v2/worker/worker.log
```

---

## Security Considerations

### Credentials Management
- ✅ Store in 1Password: Database passwords, API keys
- ✅ Never commit to git: `.env` files are gitignored
- ✅ Rotate regularly: API keys every 90 days
- ✅ Use new key format: `sb_publishable_...`, `sb_secret_...`

### Access Control
- ✅ Supabase RLS enabled for production
- ✅ Service role key only in server environment
- ✅ Auth required for all routes (via middleware)
- ✅ Magic links expire after 1 hour

### Network Security
- ✅ All communication over HTTPS
- ✅ Worker uses outbound connections only (no VPN needed)
- ✅ Supabase API keys scoped to project

---

## Cost Management

### Current Usage (Free Tier)

**Supabase**:
- Database: 500MB limit
- Storage: 1GB limit
- Bandwidth: 2GB/month
- Suitable for: ~50-100 documents

**Vercel**:
- Bandwidth: 100GB/month
- Deployments: Unlimited
- Build minutes: 6,000/month
- Suitable for: Personal use

**Worker (Mac)**:
- Compute: $0 (already have Mac)
- Electricity: ~$2-3/month if running 24/7
- Ollama models: $0 (one-time download)

**Total**: $0-3/month

### Upgrade Paths

**More Storage**:
- Supabase Pro: $25/month
- Gets: 8GB DB, 100GB storage, 50GB bandwidth

**More Processing**:
- Keep worker local (free)
- Or deploy worker to Railway: $10/month

---

## Useful Commands Reference

```bash
# Deployment
vercel --prod  # Deploy to production
vercel ls  # List deployments
vercel rollback  # Rollback to previous

# Supabase
npx supabase login  # Authenticate CLI
npx supabase link --project-ref <id>  # Link to project
npx supabase db push --linked  # Push migrations
npx supabase db reset --linked  # Reset database
npx supabase migration new <name>  # Create migration
npx supabase migration list --linked  # List migrations

# Worker
cd worker && npm start  # Start worker
cd worker && npm run dev  # Dev mode with auto-restart
tail -f worker/worker.log  # Monitor logs

# Git
git status  # Check changes
git add .  # Stage all
git commit -m "msg"  # Commit
git push origin main  # Push to GitHub (triggers Vercel)

# Database
psql <connection-string>  # Connect to DB
npx supabase db remote --linked sql "QUERY"  # Run SQL
```

---

**Deployment Guide Version**: 1.1
**Last Verified**: 2025-10-26
**Maintained By**: Topher
**Support**: See `thoughts/handoffs/` for session-specific notes

**Recent Updates**:
- 2025-10-26: Added authentication fixes (Server Actions client migration)
- 2025-10-26: Added prompt template seeding documentation
- 2025-10-26: Added vault path filesystem issue resolution
- 2025-10-25: Initial deployment guide created
