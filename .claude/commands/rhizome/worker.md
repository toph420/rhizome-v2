---
description: Manage worker processes (stop/start/status for local dev or production)
---

# Rhizome Worker Management

Manage background worker processes for local development and production environments.

## Usage

```
/rhizome:worker [action]
```

**Actions:**
- `status` - Check which workers are running (default if no action provided)
- `stop` - Stop all running workers (production and dev)
- `dev` - Start local development worker
- `prod` - Start production worker (alias for `/rhizome:production-worker`)
- `restart-dev` - Stop all workers, then start dev worker
- `restart-prod` - Stop all workers, then start production worker

> **Note**: For detailed production worker documentation including monitoring, troubleshooting, and post-deployment workflows, use `/rhizome:production-worker` directly.

## Instructions

### 1. Check Worker Status

**Always start by checking current status:**

```bash
ps aux | grep "node.*worker/index.js" | grep -v grep
```

**Parse the output:**
- If empty → No workers running
- If contains `/rhizome-v2/worker` → Production worker running
- If contains `/rhizome-v2-dev-1/worker` → Dev worker running
- If contains both → ERROR: Both running (conflict!)

**Display status clearly:**

```
🔍 Worker Status
───────────────────────────────

Production Worker (rhizome-v2):
  ❌ Not running

Development Worker (rhizome-v2-dev-1):
  ✅ Running (PID: 12345)
  Database: localhost:54322
```

### 2. Stop Workers

**Stop all workers (safe for both):**

```bash
pkill -f "node.*worker/index.js"
```

**Verify stopped:**
```bash
ps aux | grep "node.*worker/index.js" | grep -v grep
```

**Output:**
```
🛑 Stopping all workers...
✅ All workers stopped

No workers currently running.
```

### 3. Start Development Worker

**Pre-checks:**
1. Stop any running workers first
2. Verify local Supabase is running
3. Confirm in dev worktree

**Commands:**
```bash
# Stop any existing workers
pkill -f "node.*worker/index.js"

# Check Supabase is running
npx supabase status | grep "API URL"

# Start dev worker
cd /Users/topher/Code/rhizome-v2-dev-1/worker
npm start
```

**Output:**
```
🚀 Starting Development Worker
─────────────────────────────────

Worker location: /Users/topher/Code/rhizome-v2-dev-1/worker
Database: localhost:54322 (local Supabase)
Mode: Development

Processing capabilities:
- Document uploads and processing
- Chunk enrichment jobs
- Connection detection
- Export operations
- All background jobs from local development

To stop: Ctrl+C or run `/rhizome:worker stop`
```

### 4. Start Production Worker

**This is an alias for `/rhizome:production-worker`.**

For quick start, execute the production worker logic here.

For detailed production worker documentation, monitoring guides, and troubleshooting:
- Use `/rhizome:production-worker` directly
- Includes comprehensive post-deployment workflows
- Detailed error handling and health monitoring
- Environment variable verification steps

### 5. Restart Workers

**For `restart-dev`:**
1. Stop all workers
2. Wait 1 second (let processes clean up)
3. Start dev worker

**For `restart-prod`:**
1. Stop all workers
2. Wait 1 second
3. Start production worker

## Important Notes

### Worker Conflict Prevention

⚠️ **CRITICAL**: Never run both workers simultaneously!

**Why?**
- Production worker connects to cloud database (different DB)
- Dev worker connects to local database (localhost:54322)
- But if production worker accidentally uses local config → CONFLICT!

**Safety Rules:**
- ✅ Development: Only dev worker running
- ✅ Production testing: Only production worker running
- ❌ NEVER: Both workers running at same time

### When to Use Each Worker

**Development Worker** (`/rhizome:worker dev`):
- ✅ When developing locally
- ✅ Testing worker code changes
- ✅ Processing test documents
- ✅ Running with local Supabase

**Production Worker** (`/rhizome:worker prod`):
- ✅ After deploying to production
- ✅ Processing real user jobs
- ✅ Connected to cloud database
- ✅ Using latest deployed code from `main`

### Recommended Development Workflow

```bash
# Starting local development session
/rhizome:worker stop       # Stop production worker if running
npm run dev                # Starts Supabase + Dev worker + Next.js

# Switching to production testing
/rhizome:worker stop       # Stop dev worker
/rhizome:worker prod       # Start production worker
```

### Environment Variables

**Development Worker** (`.env.local` in dev worktree):
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54322
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
```

**Production Worker** (`.env.local` in production worktree):
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-anon-key>
```

## Error Handling

### Worker Already Running

```
⚠️ Worker Conflict Detected!

Production worker is running (PID: 12345)
Development worker is running (PID: 67890)

This is a CONFLICT - both workers should NOT run simultaneously!

Action: Stopping both workers for safety...
✅ All workers stopped

What would you like to do?
1. Start dev worker (for local development)
2. Start production worker (for production testing)
3. Do nothing (manual decision)
```

### Supabase Not Running (Dev Worker)

```bash
# Check Supabase status
npx supabase status
```

If not running:
```
❌ Cannot start dev worker - Supabase not running!

Local Supabase must be running for dev worker.

Start Supabase first:
  npm run dev
  OR
  npx supabase start

Then try again.
```

### Worker Directory Not Found

```
❌ Error: Worker directory not found!

Expected location: /Users/topher/Code/rhizome-v2-dev-1/worker

Check:
- Are you in the correct worktree?
- Is the worker directory present?
- Run: ls -la /Users/topher/Code/rhizome-v2-dev-1/worker
```

## Quick Reference

```bash
# Check what's running
/rhizome:worker status

# Stop everything
/rhizome:worker stop

# Start dev worker (most common during development)
/rhizome:worker dev

# Start production worker
/rhizome:worker prod

# Restart dev worker (common after code changes)
/rhizome:worker restart-dev
```

## Safety Checklist

Before starting any worker:

- [ ] Verify which worker you need (dev vs prod)
- [ ] Stop conflicting workers
- [ ] Verify database is accessible
- [ ] Confirm correct environment variables
- [ ] Check worker directory exists

## Integration with npm run dev

**Note**: `npm run dev` already starts the dev worker automatically!

```json
// package.json script (for reference)
"dev": "concurrently \"npm:supabase:start\" \"npm:worker:dev\" \"npm:next:dev\""
```

So typically you DON'T need `/rhizome:worker dev` during normal development.

**Use `/rhizome:worker` when:**
- ✅ Worker crashed and needs restart
- ✅ Switched from prod worker to dev worker
- ✅ Testing worker in isolation (without Next.js)
- ❌ Starting fresh dev session (use `npm run dev` instead)

## Example Sessions

### Session 1: Fresh Development Start

```
User: I'm starting development
Claude: Running npm run dev for you (includes worker)

# Later, worker crashes
User: /rhizome:worker restart-dev
Claude: ✅ Dev worker restarted (PID: 99999)
```

### Session 2: Switch from Production to Development

```
User: /rhizome:worker status
Claude: Production worker running (PID: 12345)

User: /rhizome:worker restart-dev
Claude:
  🛑 Stopped production worker
  🚀 Started dev worker
  ✅ Ready for local development
```

### Session 3: Production Worker Testing

```
User: /rhizome:worker prod
Claude:
  ⚠️ Dev worker is running - stopping first
  🛑 Stopped dev worker
  🚀 Starting production worker...
  ✅ Production worker ready (connects to cloud DB)
```
