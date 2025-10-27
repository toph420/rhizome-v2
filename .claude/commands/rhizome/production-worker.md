---
description: Start the production worker in rhizome-v2 worktree (connects to cloud database)
---

# Rhizome Production Worker

Start the background worker in the production worktree to process jobs from the cloud database.

## Instructions

You are starting the production worker that processes background jobs for the deployed Rhizome application.

### Pre-Start Checks

1. **Verify production worktree exists:**
   ```bash
   ls -la /Users/topher/Code/rhizome-v2/worker
   ```
   - Confirm worker directory exists
   - If not found, error and abort

2. **Check if worker is already running (optional):**
   ```bash
   ps aux | grep "node.*rhizome-v2/worker" | grep -v grep
   ```
   - If running, inform user and ask if they want to restart
   - Show PID of running worker

### Start Production Worker

Execute these commands:

**Step 1: Change to production worker directory**
```bash
cd /Users/topher/Code/rhizome-v2/worker
```

**Step 2: Start the worker**
```bash
npm start
```

### Post-Start Information

Provide the user with:

```
🚀 Production Worker Started!

Worker location: /Users/topher/Code/rhizome-v2/worker
Database: Production cloud (via Supabase)
Mode: Background job processing

The worker is now processing:
- Document uploads and processing
- Chunk enrichment jobs
- Connection detection
- Obsidian sync operations
- Readwise imports
- Export operations

To stop the worker:
- Press Ctrl+C in the terminal running the worker
- Or find PID: ps aux | grep "node.*rhizome-v2/worker"
- Then kill: kill <PID>

Monitor jobs:
- Admin Panel: Cmd+Shift+A → Jobs tab
- Or check background_jobs table in Supabase dashboard
```

## Important Notes

**Production vs Development:**
- **Production Worker** (`/Users/topher/Code/rhizome-v2/worker`)
  - Connects to cloud Supabase database
  - Processes jobs from production site
  - Always runs from `main` branch code

- **Development Worker** (local, if needed)
  - Would connect to local Supabase (localhost:54322)
  - For testing worker changes before deployment

**Worker Updates:**
- After deploying worker code changes via `/rhizome:deploy`
- Restart production worker to pick up new code:
  1. Stop current worker (Ctrl+C)
  2. Run `/rhizome:production-worker` again

**Environment Variables:**
- Production worker uses environment variables from `/Users/topher/Code/rhizome-v2/.env.local`
- Ensure `NEXT_PUBLIC_SUPABASE_URL` points to cloud (not localhost)
- Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is for production project

## Error Handling

**If worker directory not found:**
- Error: "Production worker directory not found at /Users/topher/Code/rhizome-v2/worker"
- Check: "Is the production worktree set up correctly?"
- Suggest: "Verify both worktrees exist and are at correct locations"

**If npm start fails:**
- Show full error output
- Common issues:
  1. Missing dependencies → Run `npm install` first
  2. Port already in use → Check for duplicate worker process
  3. Environment variables missing → Check `.env.local` file
  4. Database connection failed → Verify Supabase credentials

**If worker already running:**
- Ask user: "Production worker is already running (PID: {pid}). Would you like to:
  1. Keep it running (no action)
  2. Restart it (kill current + start new)
  3. Cancel"

## Safety Checks

Before starting:
- ✅ Verify correct directory (production worktree)
- ✅ Verify npm dependencies installed
- ✅ Warn if worker already running
- ⚠️ Remind user this processes PRODUCTION jobs

## Critical Rules

- ✅ ALWAYS start from `/Users/topher/Code/rhizome-v2/worker` (production)
- ✅ ALWAYS use `npm start` (not npm run dev or other commands)
- ❌ NEVER start production worker from dev worktree
- ⚠️ Production worker should always reflect latest deployed code
- ⚠️ Restart worker after deploying worker code changes

## Example Output

```
🔍 Checking production worker status...
✅ Production worktree found
⚠️ Worker not currently running

🚀 Starting production worker...
───────────────────────────────

> rhizome-v2@1.0.0 start
> node index.js

[2025-10-27 01:45:32] 🎯 Rhizome Worker Starting
[2025-10-27 01:45:32] 📊 Connected to cloud database
[2025-10-27 01:45:32] 🔄 Polling for jobs every 5s
[2025-10-27 01:45:32] ✅ Worker ready

Worker is now processing background jobs from production!
Press Ctrl+C to stop.
```

## Monitoring Production Worker

**Check worker health:**
```bash
# In production worktree
cd /Users/topher/Code/rhizome-v2/worker
npm run logs  # If you have a logs command

# Or check database directly
psql {production-db-url} -c "SELECT * FROM background_jobs WHERE status = 'active' ORDER BY created_at DESC LIMIT 5;"
```

**Common monitoring tasks:**
1. Jobs stuck in "active" status → Restart worker
2. Jobs failing repeatedly → Check worker logs for errors
3. Long queue times → May need to scale workers (future)
