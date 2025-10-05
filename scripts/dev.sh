#!/bin/bash

set -e

echo "🚀 Starting Rhizome V2 Development Environment"
echo ""

# Check and kill anything on port 3000
if lsof -ti:3000 > /dev/null 2>&1; then
  echo "⚠️  Port 3000 is occupied. Killing process..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
  echo "✅ Port 3000 cleared"
fi

# Start Supabase
echo "🔧 Starting Supabase..."
npx supabase start

# Start Supabase Edge Functions with environment file
echo "⚡ Starting Supabase Edge Functions..."
npx supabase functions serve --env-file supabase/.env.local &
FUNCTIONS_PID=$!

# Give functions a moment to start
sleep 2

# Start background worker with logging
echo "🔄 Starting Background Worker..."
echo "📝 Worker logs: /tmp/worker.log"
(cd worker && npm run dev) > /tmp/worker.log 2>&1 &
WORKER_PID=$!

# Give worker a moment to start
sleep 1

# Start Next.js dev server on port 3000
echo "🌐 Starting Next.js on port 3000..."
PORT=3000 npm run dev:next

# Cleanup on exit
trap "echo '🛑 Stopping services...'; kill $FUNCTIONS_PID $WORKER_PID 2>/dev/null; npx supabase stop" EXIT