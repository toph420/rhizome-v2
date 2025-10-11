#!/bin/bash

echo "🛑 Stopping Rhizome V2 Development Environment"
echo ""

# Stop Supabase
echo "🔧 Stopping Supabase..."
npx supabase stop

# Kill any process on port 3000
if lsof -ti:3000 > /dev/null 2>&1; then
  echo "🌐 Stopping Next.js (port 3000)..."
  lsof -ti:3000 | xargs kill 2>/dev/null || true
fi

# Kill any Supabase Edge Functions
FUNC_PIDS=$(pgrep -f "supabase functions serve" || true)
if [ -n "$FUNC_PIDS" ]; then
  echo "⚡ Stopping Edge Functions..."
  echo "$FUNC_PIDS" | xargs kill 2>/dev/null || true
fi

# Kill any Worker processes
WORKER_PIDS=$(pgrep -f "tsx.*index.ts" || true)
if [ -n "$WORKER_PIDS" ]; then
  echo "🔄 Stopping Background Worker..."
  echo "$WORKER_PIDS" | xargs kill 2>/dev/null || true
fi

echo ""
echo "✅ All services stopped"