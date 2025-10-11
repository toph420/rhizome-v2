#!/bin/bash

# Cleanup script for zombie workers and stuck jobs
# Called before starting dev environment to ensure clean state

set -e

echo "🧹 Cleaning up old workers and stuck jobs..."
echo ""

# 1. Kill all old worker processes
WORKER_PIDS=$(pgrep -f "tsx.*index.ts" 2>/dev/null || true)

if [ -n "$WORKER_PIDS" ]; then
  WORKER_COUNT=$(echo "$WORKER_PIDS" | wc -l | tr -d ' ')
  echo "⚠️  Found $WORKER_COUNT zombie worker process(es)"
  echo "   PIDs: $(echo $WORKER_PIDS | tr '\n' ' ')"

  echo "$WORKER_PIDS" | xargs kill -9 2>/dev/null || true
  sleep 1

  # Verify they're dead
  REMAINING=$(pgrep -f "tsx.*index.ts" 2>/dev/null || true)
  if [ -z "$REMAINING" ]; then
    echo "✅ All zombie workers killed"
  else
    echo "⚠️  Some workers still running: $REMAINING"
  fi
else
  echo "✅ No zombie workers found"
fi

echo ""

# 2. Reset stuck jobs in database
echo "🔄 Checking for stuck jobs..."

# Get database URL from environment
if [ -f ".env.local" ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Default to local Supabase
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

# Check for stuck jobs
STUCK_JOBS=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM background_jobs WHERE status = 'processing';" 2>/dev/null || echo "0")
STUCK_COUNT=$(echo "$STUCK_JOBS" | tr -d ' ')

if [ "$STUCK_COUNT" -gt 0 ]; then
  echo "⚠️  Found $STUCK_COUNT stuck job(s) in 'processing' state"

  # Show stuck jobs
  psql "$DB_URL" -c "SELECT id, job_type, created_at, progress FROM background_jobs WHERE status = 'processing';" 2>/dev/null || true

  # Reset them to pending
  RESET_COUNT=$(psql "$DB_URL" -t -c "UPDATE background_jobs SET status = 'pending' WHERE status = 'processing' RETURNING id;" 2>/dev/null | wc -l | tr -d ' ')

  echo "✅ Reset $RESET_COUNT job(s) to 'pending'"
else
  echo "✅ No stuck jobs found"
fi

echo ""
echo "🎉 Cleanup complete! Ready to start fresh."
echo ""
