# SUPABASE_AUTH_RULES.md - Personal Project Edition

## Context

This is a **personal, single-user application**. No multi-user features, no collaboration, no public access. Just a powerful tool for personal knowledge management.

## Current Approach (Simplified for Solo Use)

### Why This Approach Works

Since you're the only user:
- No need for complex authentication flows
- No need for RLS policies (Row Level Security)
- No need for user management
- Focus 100% on features, not auth infrastructure

### Current Implementation

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Hardcoded for personal use
NEXT_PUBLIC_DEV_USER_ID=dev-user-123
```

### Simplified Auth Helper

```typescript
// lib/auth/index.ts - Minimal wrapper for consistency
import { supabaseAdmin } from '@/lib/supabase/admin'

const USER_ID = 'dev-user-123' // Your personal ID

export async function getCurrentUser() {
  return {
    id: USER_ID,
    email: 'you@local'
  }
}

export function getSupabaseClient() {
  // Always use admin client for personal app
  return supabaseAdmin
}

export async function requireUser() {
  // Always returns your user - no actual check needed
  return getCurrentUser()
}
```

### Database Setup (No RLS Needed)

```sql
-- Tables without RLS complexity
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT DEFAULT 'dev-user-123', -- Your ID as default
  title TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS policies needed
-- No row level security needed
-- Just you and your data
```

### Using in Code

```typescript
// app/actions/documents.ts
'use server'

import { getSupabaseClient } from '@/lib/auth'

export async function uploadDocument(formData: FormData) {
  const supabase = getSupabaseClient()
  const userId = 'dev-user-123' // Always you
  
  // Direct operations, no auth checks needed
  const file = formData.get('file') as File
  const documentId = crypto.randomUUID()
  
  await supabase.storage
    .from('documents')
    .upload(`${userId}/${documentId}/source.pdf`, file)
  
  await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: userId,
      title: file.name,
      storage_path: `${userId}/${documentId}`
    })
  
  return { success: true, id: documentId }
}
```

## Optional: Future Authentication (If Ever Needed)

If you ever decide to:
- Share with family/friends
- Deploy publicly
- Add collaborators

Then you can add proper auth. But for now, this is unnecessary complexity.

### Quick Migration Path (If Ever Needed)

1. **Add Supabase Auth**
```typescript
// Only when actually needed
await supabase.auth.signInWithOtp({
  email: 'your.email@domain.com'
})
```

2. **Enable RLS**
```sql
-- One-line migrations when ready
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON documents 
  USING (auth.uid()::text = user_id);
```

3. **Update Auth Helper**
```typescript
// Change getCurrentUser() to check real auth
const { data: { user } } = await supabase.auth.getUser()
return user
```

## Benefits of Current Approach

### What You Get
- ✅ **Zero login friction** - Open app, start working
- ✅ **No auth bugs** - Can't break what doesn't exist
- ✅ **Faster development** - No auth logic to test
- ✅ **Better DX** - No token refreshing, session management
- ✅ **Full admin access** - Your app, your rules

### What You Don't Need
- ❌ Login pages
- ❌ Password resets  
- ❌ Session management
- ❌ JWT tokens
- ❌ Auth middleware
- ❌ RLS policies
- ❌ User profiles

## Security Considerations

### Local Development (Current)
- ✅ **Safe** - Runs on localhost only
- ✅ **Private** - No external access
- ✅ **Simple** - No attack surface

### If Deploying to Cloud (Future)
Options from simplest to most secure:

1. **Basic Auth on Reverse Proxy** (Simplest)
```nginx
# nginx.conf - Password protect entire app
auth_basic "Personal App";
auth_basic_user_file /etc/nginx/.htpasswd;
```

2. **Vercel Password Protection** (Easy)
```javascript
// middleware.ts
export function middleware(request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Basic ${btoa('you:your-password')}`) {
    return new Response('Auth required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic' }
    })
  }
}
```

3. **IP Whitelisting** (Most Secure)
```javascript
// Only allow your home/office IP
const ALLOWED_IPS = ['YOUR.HOME.IP.ADDRESS']
```

## Development Workflow

### Initial Setup (One-time)
```bash
# After first `npx supabase db reset`, seed the dev user:
psql postgresql://postgres:postgres@localhost:54322/postgres -f scripts/seed-dev-user.sql

# This creates user with ID: 00000000-0000-0000-0000-000000000000
# Required for foreign key constraints in user_settings and other tables
```

### Daily Use
```bash
# Start everything
npm run dev

# That's it. No login. Just work.
```

### Database Access
```bash
# Direct SQL access when needed
npx supabase db reset  # Reset everything (remember to re-run seed-dev-user.sql after!)
psql $DATABASE_URL      # Direct SQL access
```

### Backups (Important for Personal Data!)
```bash
# Regular backups since it's your personal knowledge
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Or use Supabase dashboard for automatic backups
```

## Code Patterns

### Simplified Patterns for Personal Use

```typescript
// No need for defensive coding
const userId = 'dev-user-123'

// Direct queries without filters
const allDocs = await supabase
  .from('documents')
  .select('*')
  .order('created_at', { ascending: false })

// Simple mutations
await supabase
  .from('flashcards')
  .insert({ question, answer })

// No permission checks needed
await supabase
  .from('documents')
  .delete()
  .eq('id', docId)
```

### What to Skip

```typescript
// ❌ Don't need this complexity
if (!user) redirect('/login')
if (user.id !== resource.owner_id) throw new Error('Forbidden')
const session = await getSession()

// ✅ Just do the work
const data = await getData()
```

## Migration Checklist (If Ever Needed)

Only consider auth when you actually need:

- [ ] Multiple users
- [ ] Public deployment  
- [ ] Sharing features
- [ ] Collaboration
- [ ] API access for other apps

Until then, **keep it simple**.

## Current Status

- **Auth Strategy**: Hardcoded single user
- **User ID**: `dev-user-123`
- **RLS**: Disabled
- **Auth Pages**: None needed
- **Session Management**: None needed
- **Deploy Ready**: Local only (add basic auth for cloud)

## Philosophy

> "The best auth system for a personal project is no auth system."

You're building a powerful knowledge tool for yourself. Every minute spent on auth is a minute not spent on features you'll actually use. When (if) you need auth later, it's a day of work to add it. Until then, build the features that matter.

## Quick Reference

```typescript
// This is all you need to remember:
const userId = 'dev-user-123'
const supabase = supabaseAdmin

// That's it. Go build cool features.
```