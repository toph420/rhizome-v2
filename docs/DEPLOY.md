# Rhizome V2 - Production Deployment Guide

**Last Updated**: 2025-10-25
**Architecture**: Hybrid (Cloud UI + Cloud Database + Local Processing)
**Status**: Production Ready

---

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Production Credentials](#production-credentials)
- [Initial Deployment](#initial-deployment)
- [Ongoing Deployments](#ongoing-deployments)
- [Worker Configuration](#worker-configuration)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

---

## Architecture Overview

### Hybrid Deployment Model

```
┌──────────────────────────────────────────────────────┐
│  CLIENT DEVICES (iPad, iPhone, Web)                  │
│  ↓ HTTPS                                             │
├──────────────────────────────────────────────────────┤
│  VERCEL (Next.js 15 + React 19)                      │
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
│  ↑ Polling every 5s                                  │
├──────────────────────────────────────────────────────┤
│  MAC AT HOME (Worker Process)                        │
│  - Polls Supabase for pending jobs                   │
│  - Docling (PDF processing)                          │
│  - Ollama (qwen2.5:32b, local AI)                    │
│  - Transformers.js (embeddings)                      │
│  - 3-engine connection detection                     │
│  - Saves results back to Supabase                    │
└──────────────────────────────────────────────────────┘
```

### Benefits
- ✅ **$0/month cost**: Free tiers for Vercel + Supabase
- ✅ **Mobile access**: Upload/read from anywhere
- ✅ **Local processing**: Unlimited AI usage with Ollama
- ✅ **No VPN needed**: Worker uses outbound HTTPS only
- ✅ **Auto-scaling UI**: Vercel handles traffic
- ✅ **Persistent storage**: Supabase manages data

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
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_<your-key>

# Secret Key (server-side, service_role)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_<your-key>
```

**Note**: Get these from Supabase Dashboard → Settings → API → "Project API keys"

**Database**:
- **Password**: Saved in 1Password (Supabase Production DB)
- **Connection String**: Available in Supabase Dashboard → Settings → Database
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

**Expected**: 68 migrations applied successfully
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
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://pqkdcfxkitovcgvjoyuu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_1OLaFwC1fEhzlEoPgRjTNg_qeqpxhJJ
SUPABASE_SERVICE_ROLE_KEY=sb_secret_DmzMNorjia_FKkbiElNy0Q_ftsBjeWY

# Google AI
GOOGLE_AI_API_KEY=AIzaSyC0KCHfUIy0aKKtZY_v7uxf3eLHUEnsuPM
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyC0KCHfUIy0aKKtZY_v7uxf3eLHUEnsuPM
GEMINI_API_KEY=AIzaSyC0KCHfUIy0aKKtZY_v7uxf3eLHUEnsuPM
GEMINI_MODEL=gemini-2.5-flash

# External APIs
YOUTUBE_API_KEY=AIzaSyAqmAteOtQ-iL714WkdpIwxJ_rb1br_6U8
READWISE_ACCESS_TOKEN=YlszXAfi1AdX6WMl0VyMdSP0irmhxPolTBEz6zA3hXCAH2z4gm

# Processing Mode
PROCESSING_MODE=cloud  # Vercel has no Ollama
USE_GEMINI_CLEANUP=true
USE_INLINE_METADATA=true
```

**Production Deploy**:
```bash
vercel --prod --yes
```

### Step 3: Worker Configuration

**Update Environment** (`worker/.env`):
```bash
# Production Supabase
SUPABASE_URL=https://pqkdcfxkitovcgvjoyuu.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://pqkdcfxkitovcgvjoyuu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_DmzMNorjia_FKkbiElNy0Q_ftsBjeWY

# Local Processing
PROCESSING_MODE=local  # Use Ollama on Mac
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b
```

**Start Worker**:
```bash
cd /Users/topher/Code/rhizome-v2/worker
npm start
```

**Expected Output**:
```
🚀 Background worker started
✅ Connected to Supabase: https://pqkdcfxkitovcgvjoyuu.supabase.co
Polling for jobs...
```

### Step 4: Fix Trigger Race Condition

Run this SQL in **Supabase Dashboard → SQL Editor**:

```sql
-- Recreate the trigger with error handling
CREATE OR REPLACE FUNCTION create_default_prompts()
RETURNS TRIGGER AS $$
BEGIN
  -- Safety check: only proceed if prompt_templates table exists
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'prompt_templates'
  ) THEN
    INSERT INTO prompt_templates (user_id, name, description, template, variables, is_system, is_default) VALUES
      (NEW.id, 'Comprehensive Concepts', 'Key definitions, core ideas, and concept relationships',
       E'Generate {{count}} flashcards covering the most important concepts in this text.\n\nFocus on:\n- Key definitions and terminology\n- Core ideas and principles\n- Relationships between concepts\n\nFor each card:\n- Question should be clear and specific\n- Answer should be concise but complete (1-3 sentences)\n- Include keywords from the source text for chunk matching\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["concept1", "concept2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
       ARRAY['count', 'content', 'chunks', 'custom'], TRUE, TRUE);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_user_created_prompts ON auth.users;
CREATE TRIGGER on_user_created_prompts
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_prompts();
```

---

## Ongoing Deployments

### Code Changes

**Automatic Deployment** (Recommended):
```bash
# In main worktree
cd /Users/topher/Code/rhizome-v2
git pull origin main  # Get latest
# Make changes...
git add .
git commit -m "feat: description"
git push origin main

# Vercel auto-deploys from GitHub
# Check status: https://vercel.com/dashboard
```

### Database Migrations

**Create New Migration**:
```bash
cd /Users/topher/Code/rhizome-v2
npx supabase migration new add_feature_name
```

**Test Locally**:
```bash
# Start local Supabase
npx supabase start

# Reset DB with new migration
npx supabase db reset

# Verify
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\dt"
```

**Push to Production**:
```bash
npx supabase db push --linked
```

**Verify**:
```bash
npx supabase migration list --linked
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

**"Database error saving new user"**:
- Trigger race condition (see Step 4 in Initial Deployment)
- Check if user actually created: Supabase Dashboard → Authentication → Users
- If user exists, error is cosmetic - proceed with login

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

**Deployment Guide Version**: 1.0
**Last Verified**: 2025-10-25
**Maintained By**: Topher
**Support**: See `thoughts/handoffs/` for session-specific notes
