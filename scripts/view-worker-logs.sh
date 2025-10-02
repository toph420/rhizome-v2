#!/bin/bash

# Monitor worker logs and database job status

echo "📊 Rhizome V2 Worker Monitor"
echo "=============================="
echo ""

# Check if worker is running
WORKER_PID=$(pgrep -f "tsx.*worker" | head -1)
if [ -z "$WORKER_PID" ]; then
  echo "❌ Worker is not running!"
  echo ""
  echo "Start the worker with: npm run dev"
  exit 1
fi

echo "✅ Worker running (PID: $WORKER_PID)"
echo ""

# Show recent job activity
echo "📋 Recent Background Jobs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
  SELECT
    LEFT(id::text, 8) as job_id,
    job_type,
    status,
    progress->>'stage' as stage,
    CASE
      WHEN status = 'processing' THEN
        EXTRACT(epoch FROM (now() - started_at))::int || 's'
      ELSE
        EXTRACT(epoch FROM (completed_at - started_at))::int || 's'
    END as duration,
    created_at
  FROM background_jobs
  ORDER BY created_at DESC
  LIMIT 5;
" 2>/dev/null

echo ""
echo "📝 Worker Log Output:"
echo "━━━━━━━━━━━━━━━━━━━━"
echo "(Worker logs go to the terminal where 'npm run dev' was started)"
echo ""
echo "To capture worker logs to a file, run:"
echo "  cd worker && npm run dev > worker.log 2>&1 &"
echo ""
echo "Press Ctrl+C to exit this monitor"
echo ""

# Watch for job changes
while true; do
  clear
  echo "📊 Rhizome V2 Worker Monitor (refreshing every 5s)"
  echo "=================================================="
  echo ""

  # Active jobs
  ACTIVE=$(psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -t -c "
    SELECT COUNT(*) FROM background_jobs WHERE status IN ('pending', 'processing');
  " 2>/dev/null | tr -d ' ')

  echo "🔄 Active Jobs: $ACTIVE"
  echo ""

  # Recent jobs table
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
    SELECT
      LEFT(id::text, 8) as job_id,
      job_type,
      status,
      progress->>'stage' as stage,
      progress->>'percent' as pct,
      CASE
        WHEN status = 'processing' THEN
          EXTRACT(epoch FROM (now() - started_at))::int || 's'
        WHEN completed_at IS NOT NULL THEN
          EXTRACT(epoch FROM (completed_at - started_at))::int || 's'
        ELSE '-'
      END as duration,
      to_char(created_at, 'HH24:MI:SS') as time
    FROM background_jobs
    ORDER BY created_at DESC
    LIMIT 8;
  " 2>/dev/null

  echo ""
  echo "Last updated: $(date '+%H:%M:%S')"

  sleep 5
done
