# Hybrid Deployment Strategy: Local Processing + Cloud Access

**Created**: 2025-10-19
**Status**: Implementation Ready
**Cost**: $0/month
**Benefit**: iPad/phone access + unlimited local AI processing

---

## Overview

Deploy Rhizome V2 with **maximum experimentability** and **zero ongoing costs** by splitting the architecture:

- **UI Layer** → Vercel (cloud, accessible anywhere)
- **Database** → Supabase Cloud (shared state)
- **Processing** → Mac at home (local Ollama, free overnight processing)

This enables:
- ✅ Upload PDFs from iPad while traveling
- ✅ Read documents on phone during commute
- ✅ Run overnight connection detection on Mac (free)
- ✅ Experiment with AI weights without cost anxiety
- ✅ Queue jobs from anywhere, process when Mac is available

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT DEVICES (iPad, iPhone, anywhere)                    │
│  ↓ HTTPS                                                    │
├─────────────────────────────────────────────────────────────┤
│  VERCEL (Next.js App)                                       │
│  - Server Components for data fetching                      │
│  - Server Actions for mutations                             │
│  - Static UI assets (cached globally)                       │
│  ↓ PostgreSQL wire protocol                                 │
├─────────────────────────────────────────────────────────────┤
│  SUPABASE CLOUD (Database + Storage)                        │
│  - PostgreSQL with pgvector                                 │
│  - Storage buckets (PDFs, markdown, exports)                │
│  - background_jobs table (job queue)                        │
│  ↑ Polling (every 5s)                                       │
├─────────────────────────────────────────────────────────────┤
│  MAC AT HOME (Worker Process)                               │
│  - Polls Supabase for jobs                                  │
│  - Docling + Ollama + Transformers.js                       │
│  - 3-engine connection detection                            │
│  - Saves results back to Supabase                           │
└─────────────────────────────────────────────────────────────┘
```

**Key Insight**: Mac doesn't need to be publicly accessible. It only needs outbound HTTPS to Supabase Cloud (same as accessing any website).

---

## Why Hybrid for This Project?

### The Overnight Processing Use Case

**Scenario**: Run connection detection all night to discover new insights

```
CLOUD MODE (Gemini):
- 50 documents × $0.15/doc = $7.50 per run
- Nightly runs × 30 days = $225/month
- Experimentation: "This costs money, better be careful..."
- Monthly budget anxiety

LOCAL MODE (Ollama):
- 50 documents × $0.00/doc = $0.00 per run
- Nightly runs × 30 days = $0.00/month
- Experimentation: "Let's try 10 different weight combinations!"
- Unlimited freedom to explore
```

**For AI-first knowledge synthesis** where you want to continuously experiment with connection weights, thresholds, and engine combinations, local processing is essential.

---

## Deployment Steps

### Phase 1: Supabase Cloud Setup (15 minutes)

#### 1.1 Create Production Project

```bash
# Visit https://supabase.com/dashboard
# Click "New Project"
# Choose region closest to you
# Set database password (save to 1Password)
# Wait 2-3 minutes for project creation
```

#### 1.2 Run Migrations

```bash
# In your rhizome-v2 directory
cd /Users/topher/Code/rhizome-v2-worktree-1

# Link to cloud project
npx supabase link --project-ref <your-project-ref>

# Push all migrations
npx supabase db push

# Verify migrations
npx supabase db remote commit
```

**Expected migrations**: 052 migrations (check `supabase/migrations/`)

#### 1.3 Configure Storage Buckets

```sql
-- Run in Supabase SQL Editor
-- Already created by migrations, just verify:

SELECT name, public FROM storage.buckets;

-- Should see:
-- documents (public: false)
-- markdown (public: false)
-- exports (public: false)
```

#### 1.4 Get Production Credentials

From Supabase Dashboard → Settings → API:

```bash
# Copy these values:
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Phase 2: Vercel Deployment (10 minutes)

#### 2.1 Install Vercel CLI

```bash
npm install -g vercel
```

#### 2.2 Deploy from Repository

```bash
cd /Users/topher/Code/rhizome-v2-worktree-1

# First deployment (interactive)
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your personal account
# - Link to existing project? No
# - Project name? rhizome-v2
# - Directory? ./
# - Override settings? No
```

#### 2.3 Configure Environment Variables

**Vercel Dashboard** → Project Settings → Environment Variables

Add for **Production** environment:

```bash
# Supabase (from Phase 1.4)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Gemini (optional, for cloud mode fallback)
GOOGLE_AI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash-lite
```

#### 2.4 Deploy to Production

```bash
vercel --prod
```

**Result**: Your app is live at `https://rhizome-v2-xxxxx.vercel.app`

Test from iPad: Open Safari, navigate to URL, verify you can see the UI.

#### 2.5 Enable Temporary Password Protection (1 minute)

**Quick protection for initial deployment:**

**Vercel Dashboard** → Settings → Deployment Protection

1. Enable **"Password Protection"**
2. Set a temporary password
3. Click "Save"

**Test the protection:**

```bash
# Open incognito/private browser window
# Navigate to: https://rhizome-v2-xxxxx.vercel.app
# Should see: Password prompt before accessing app
```

**Note**: This is temporary. We'll replace it with proper Supabase Auth in Phase 4 for better UX across devices.

---

### Phase 3: Local Worker Configuration (5 minutes)

#### 3.1 Update Worker Environment

Edit `worker/.env`:

```bash
# Point to Supabase Cloud (not localhost!)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Local Processing Mode
PROCESSING_MODE=local
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M

# Gemini (optional fallback)
GOOGLE_AI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash-lite
```

#### 3.2 Update Main App Environment

Edit `.env.local`:

```bash
# Same Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 3.3 Start Worker on Mac

```bash
cd /Users/topher/Code/rhizome-v2-worktree-1

# Start all services (Supabase local, Worker, Next.js dev)
npm run dev

# OR just worker (if you only want processing)
cd worker
npm start
```

**Verify**: Check `worker/worker.log` for connection to Supabase Cloud

```bash
tail -f worker/worker.log

# Should see:
# [2025-10-19T...] 🚀 Background worker started
# [2025-10-19T...] ✅ Annotation export cron started (runs hourly)
# [2025-10-19T...] Query for pending jobs: { found: 0, error: null }
```

---

### Phase 4: Auto-Start Worker on Mac (Optional)

Make worker start automatically when Mac boots:

#### 4.1 Create Launch Agent

Create `~/Library/LaunchAgents/com.rhizome.worker.plist`:

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
        <string>/Users/topher/Code/rhizome-v2-worktree-1/worker/index.ts</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/topher/Code/rhizome-v2-worktree-1/worker/worker.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/topher/Code/rhizome-v2-worktree-1/worker/worker-error.log</string>
</dict>
</plist>
```

#### 4.2 Load Launch Agent

```bash
launchctl load ~/Library/LaunchAgents/com.rhizome.worker.plist
launchctl start com.rhizome.worker

# Verify it's running
launchctl list | grep rhizome

# Check logs
tail -f /Users/topher/Code/rhizome-v2-worktree-1/worker/worker.log
```

**Now**: Worker starts automatically on Mac login, keeps running in background.

---

### Phase 5: Upgrade to Supabase Auth (15 minutes) - RECOMMENDED

Replace Vercel password protection with proper authentication for better UX.

#### 5.1 Enable Supabase Auth

Your migrations already support this! Just enable it:

```bash
# Verify auth is available
npx supabase db remote --project-ref <ref> sql \
  "SELECT * FROM auth.users LIMIT 1;"

# Should work (empty result is fine)
```

#### 5.2 Create Login Page

Create `src/app/login/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    })

    if (error) {
      alert(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md rounded-lg border p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a magic link to <strong>{email}</strong>
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Click the link to sign in. You can close this tab.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-md w-full rounded-lg border p-8">
        <h1 className="text-2xl font-bold mb-6">Sign in to Rhizome</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border px-3 py-2"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

#### 5.3 Create Auth Callback Handler

Create `src/app/auth/callback/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect to home page
  return NextResponse.redirect(`${origin}/`)
}
```

#### 5.4 Protect Routes with Middleware

Create/update `src/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  // Redirect to login if not authenticated
  if (!session && !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/auth/callback')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect to home if already logged in and trying to access login
  if (session && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

#### 5.5 Disable Vercel Password Protection

**Vercel Dashboard** → Settings → Deployment Protection → Disable

#### 5.6 Deploy Updated Code

```bash
git add src/app/login src/app/auth src/middleware.ts
git commit -m "feat: add Supabase Auth with magic links"
git push origin main

# Vercel auto-deploys
```

#### 5.7 Test End-to-End

```bash
# Incognito window
1. Visit https://rhizome-v2-xxxxx.vercel.app
2. Should redirect to /login
3. Enter your email
4. Check email → Click magic link
5. Should redirect to app (logged in)
6. Close browser → Reopen
7. Should still be logged in ✅
```

**Benefits You Get:**

✅ **Device-specific sessions**: Each device has its own login
✅ **No password to remember**: Magic links only
✅ **Auto-refresh**: Sessions last 30 days, auto-renew
✅ **Revoke access**: Can logout specific devices
✅ **Better UX**: No re-entering passwords

**What about RLS?**

You can still keep RLS disabled (single-user mode). Supabase Auth just handles login/sessions. Your worker still uses service role key to bypass RLS.

---

## Workflow Examples

### Example 1: Upload PDF from iPad

**Morning commute (iPad on train):**

1. Open Safari → `https://rhizome-v2-xxxxx.vercel.app`
2. Login (Supabase Auth)
3. Click "Upload Document"
4. Select PDF from Files app
5. Choose chunking strategy (recursive)
6. Submit

**What happens:**
- Vercel app uploads PDF → Supabase Storage
- Server Action creates `background_jobs` entry (status: pending)
- iPad shows "Processing queued"

**Later (Mac at home wakes up):**
- Worker polls Supabase → Picks up pending job
- Docling + Ollama process locally
- Results saved to Supabase
- iPad refreshes → Document ready to read

---

### Example 2: Overnight Connection Detection

**Evening (from iPad):**

1. Open Admin Panel (Cmd+Shift+A on web, or menu on iPad)
2. Go to "Connections" tab
3. Select "Reprocess All Documents"
4. Adjust engine weights:
   - Semantic: 20%
   - Contradiction: 50%
   - Thematic: 30%
5. Click "Start Processing"
6. Close iPad, go to bed

**Overnight (Mac processing):**
- Worker picks up connection detection jobs
- Ollama runs Thematic Bridge engine (free, unlimited)
- Processes 50 documents over 4-6 hours
- Saves new connections to database
- Job completes by morning

**Morning (iPad on phone):**
- Open app → See "32 new connections discovered"
- Review connections in RightPanel
- Accept/reject suggestions
- Explore new insights

---

### Example 3: Experimentation Freedom

**Saturday afternoon (Mac + Vercel web UI):**

Want to test if increasing Contradiction engine weight finds more interesting tensions:

```bash
# Run 1: Default weights (25/40/35)
Run reprocess → Wait 30 min → Review connections

# Run 2: Heavy contradiction (10/60/30)
Adjust weights → Reprocess → Wait 30 min → Review

# Run 3: Balanced (33/33/34)
Adjust weights → Reprocess → Wait 30 min → Review

# Run 4: Thematic focus (15/25/60)
Adjust weights → Reprocess → Wait 30 min → Review
```

**Cost**: $0.00 (vs $30-40 with Gemini)

**Outcome**: Find optimal weights for your reading style without budget anxiety.

---

## Troubleshooting

### Problem: Worker not picking up jobs

**Check 1**: Worker connected to cloud?

```bash
tail -f worker/worker.log | grep "Background worker started"
```

**Check 2**: Database credentials correct?

```bash
# In worker/.env
echo $NEXT_PUBLIC_SUPABASE_URL
# Should be https://xxxxx.supabase.co (not localhost!)
```

**Check 3**: Jobs actually pending?

```bash
# Query Supabase directly
npx supabase db remote --project-ref <ref> \
  sql "SELECT id, job_type, status, created_at FROM background_jobs ORDER BY created_at DESC LIMIT 10;"
```

---

### Problem: "Job stuck in processing"

**Reason**: Mac went to sleep mid-processing

**Solution 1**: Worker auto-recovers stale jobs (>30 min)

```typescript
// Already built into worker/index.ts:143
// Stale jobs (processing > 30 min) get picked up again
```

**Solution 2**: Manual recovery via Admin Panel

1. Open Admin Panel → Jobs tab
2. Find stuck job
3. Click "Retry"

---

### Problem: Upload works but processing never starts

**Check**: Ollama running?

```bash
curl http://127.0.0.1:11434/api/tags

# Should return JSON with models
# If "connection refused", start Ollama:
ollama serve
```

---

## Cost Analysis

### Monthly Costs

```
Supabase Cloud (Free Tier):
├─ 500MB database: $0/mo
├─ 1GB storage: $0/mo
├─ 2GB bandwidth: $0/mo
└─ Enough for: ~50-100 documents

Vercel (Free Tier):
├─ 100GB bandwidth: $0/mo
├─ Unlimited deployments: $0/mo
└─ Enough for: Personal use

Worker (Mac at home):
├─ Compute: $0/mo (already have Mac)
├─ Electricity: ~$2-3/mo (if running 24/7)
└─ Ollama models: $0/mo (one-time download)

TOTAL: $0-3/month
```

### Upgrade Paths (If Needed)

```
More Storage:
├─ Supabase Pro: $25/mo
└─ Gets: 8GB DB, 100GB storage

More Processing Power:
├─ Keep local (free)
└─ OR Railway for $10/mo if Mac unavailable

Cloud Processing Fallback:
├─ Set PROCESSING_MODE=cloud in worker
├─ Costs: $0.20-0.60 per document
└─ Use only when Mac is off/traveling
```

---

## Future Enhancements

### 1. Mobile Worker Monitoring

Add health check endpoint to worker:

```typescript
// worker/index.ts
import express from 'express'

const app = express()
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    jobsProcessed: jobCounter,
    lastJob: lastJobTime
  })
})
app.listen(3001)
```

Check from iPad: `http://<your-mac-ip>:3001/health`

### 2. Wake-on-LAN

Wake Mac from iPad when processing needed:

```bash
# Install wakeonlan on Mac
brew install wakeonlan

# From iPad (Shortcuts app):
# 1. SSH to home router
# 2. Run: wakeonlan <mac-mac-address>
# 3. Wait 30 seconds
# 4. Upload document
```

### 3. Processing Notifications

Get iOS notifications when jobs complete:

```typescript
// In worker, when job completes:
await fetch('https://ntfy.sh/rhizome-jobs', {
  method: 'POST',
  body: `Document "${title}" processed (${chunks} chunks, ${connections} connections)`
})

// On iPad: Install ntfy app, subscribe to 'rhizome-jobs'
```

---

## Security Notes

### What's Exposed?

```
PUBLIC (accessible from internet):
├─ Vercel app (https://rhizome-v2-xxx.vercel.app)
│  └─ Protected by: Supabase Auth (magic links)
├─ Supabase API (https://xxx.supabase.co)
│  └─ Protected by: Service role key (in env vars)
└─ Access control: Email-based authentication

PRIVATE (only accessible from Mac):
├─ Ollama (localhost:11434)
├─ Worker process (no network exposure)
└─ Local files
```

### Single-User Security Model

For this personal tool deployment:

**Auth System**: Supabase Auth (single user)
- Magic link authentication (no password to remember)
- Device-specific sessions (30-day auto-refresh)
- Can revoke access per device
- Built-in email verification

**RLS Disabled**: No multi-user policies needed
- Only one user (you)
- Simpler queries and code
- Worker uses service role key to bypass RLS
- If you want multi-user later: Enable RLS policies

**Database Access**: Service role key
- Worker uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- Key stored in environment variables only
- Never exposed to client/browser

**Result**: Magic link authentication prevents unauthorized access. Device sessions stay logged in for weeks. No passwords to manage.

### Auth Comparison

```
Vercel Password (Phase 2.5):
├─ Single shared password
├─ Re-enter on cookie expiry
├─ No device management
└─ Quick to deploy ✅

Supabase Auth (Phase 5):
├─ Email magic links
├─ Device-specific sessions
├─ 30-day auto-refresh
├─ Can revoke per device
└─ Better UX ✅✅
```

**Recommendation**: Start with Vercel password for quick deployment, upgrade to Supabase Auth after testing (takes 15 minutes).

---

## Deployment Checklist

**Before deploying:**

- [ ] Supabase Cloud project created
- [ ] All 052 migrations applied
- [ ] Production credentials saved to 1Password
- [ ] Vercel project created
- [ ] Environment variables set in Vercel
- [ ] **Password protection enabled in Vercel**
- [ ] `worker/.env` points to cloud
- [ ] `.env.local` points to cloud
- [ ] Ollama running on Mac
- [ ] Worker tested locally (polls cloud jobs)

**After deploying (with Vercel password):**

- [ ] Test password protection (incognito window)
- [ ] Test upload from Vercel web UI (after login)
- [ ] Verify worker picks up job (check logs)
- [ ] Login from iPad Safari
- [ ] Login from iPhone Safari
- [ ] Upload test document end-to-end
- [ ] Verify connection detection works

**After upgrading to Supabase Auth (Phase 5):**

- [ ] Create login page and auth callback
- [ ] Add middleware protection
- [ ] Disable Vercel password protection
- [ ] Deploy auth updates
- [ ] Test magic link flow (incognito)
- [ ] Test from iPad (click magic link)
- [ ] Test from iPhone (click magic link)
- [ ] Verify sessions persist across browser restarts
- [ ] Set up auto-start (optional)
- [ ] Document production URLs in 1Password

---

## Conclusion

This hybrid deployment gives you:

✅ **Maximum Freedom**: Unlimited AI experimentation without cost anxiety
✅ **Mobile Access**: Upload/read from iPad/phone anywhere
✅ **Zero Monthly Cost**: Stays within free tiers
✅ **Full Local Power**: M1 Max + Ollama for overnight processing
✅ **Simple Architecture**: No VPNs, no complex networking

**Total deployment time**: ~30 minutes
**Ongoing maintenance**: Zero (worker auto-recovers, Vercel auto-deploys on git push)

**When you're ready to deploy**, follow Phase 1-3 in order. Each phase is independent and can be tested before moving to the next.
