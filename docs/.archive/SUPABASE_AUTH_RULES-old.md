# SUPABASE_AUTH_RULES.md - Production Path

## Development Phases

### Phase 1: Building Core Features (Current)
Use simplified auth to avoid blocking development, but structure it properly from the start.

### Phase 2: Real Auth (After core features work)
Implement proper authentication without rewriting everything.

## Phase 1: Simplified Auth for Development

### Environment Setup

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Development only
NEXT_PUBLIC_DEV_MODE=true
NEXT_PUBLIC_DEV_USER_ID=dev-user-123
```

### Auth Wrapper (Proper Structure from Start)

```typescript
// lib/auth/index.ts - REAL CODE, not throwaway
import { supabase } from '@/lib/supabase/client'
import { supabaseAdmin } from '@/lib/supabase/admin'

const IS_DEV = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID

export async function getCurrentUser() {
  if (IS_DEV) {
    return {
      id: DEV_USER_ID,
      email: 'dev@localhost'
    }
  }
  
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export function getSupabaseClient() {
  // In dev, use admin client to bypass RLS
  // In prod, use regular client with RLS
  return IS_DEV ? supabaseAdmin : supabase
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}
```

### Use Proper Patterns from Start

```typescript
// app/actions/documents.ts - REAL CODE
'use server'

import { requireUser, getSupabaseClient } from '@/lib/auth'

export async function uploadDocument(formData: FormData) {
  const user = await requireUser() // Proper auth check
  const supabase = getSupabaseClient() // Right client for environment
  
  const file = formData.get('file') as File
  const documentId = crypto.randomUUID()
  const storagePath = `${user.id}/${documentId}`
  
  await supabase.storage
    .from('documents')
    .upload(`${storagePath}/source.pdf`, file)
  
  await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: user.id, // Using real user ID field
      title: file.name,
      storage_path: storagePath
    })
  
  return { success: true, id: documentId }
}
```

### Database Setup (With RLS Ready)

```sql
-- Create tables with RLS in mind, but disabled
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- Real field from start
  title TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create RLS policies but DON'T enable yet
CREATE POLICY "Users can view own documents" ON documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Keep RLS disabled for development
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;

-- Add comment for future
COMMENT ON TABLE documents IS 'RLS ready - enable with: ALTER TABLE documents ENABLE ROW LEVEL SECURITY';
```

## Phase 2: Enabling Real Auth (Week 2-3)

When core features work, flip the switch:

### 1. Enable Magic Link Auth

```typescript
// app/login/page.tsx
'use client'

import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  
  async function handleLogin(formData: FormData) {
    const email = formData.get('email') as string
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    })
    
    if (!error) {
      router.push('/auth/check-email')
    }
  }
  
  return (
    <form action={handleLogin}>
      <input type="email" name="email" required />
      <button type="submit">Send Login Link</button>
    </form>
  )
}
```

### 2. Add Auth Callback

```typescript
// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  
  return NextResponse.redirect(requestUrl.origin)
}
```

### 3. Enable RLS

```sql
-- When ready, just run:
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE components ENABLE ROW LEVEL SECURITY;
```

### 4. Update Environment

```bash
# .env.local - Disable dev mode
NEXT_PUBLIC_DEV_MODE=false
# Remove DEV_USER_ID
```

## Migration Checklist

When moving from dev to real auth:

- [ ] Set up Supabase Auth in dashboard
- [ ] Add login page
- [ ] Add auth callback route
- [ ] Enable RLS on all tables
- [ ] Set NEXT_PUBLIC_DEV_MODE=false
- [ ] Test with real email
- [ ] Add logout functionality
- [ ] Add user profile page

## Common Operations

### Check Auth Status

```typescript
// Works in both dev and prod
const user = await getCurrentUser()
if (!user) {
  redirect('/login')
}
```

### Database Operations

```typescript
// This pattern works in both phases
const user = await requireUser()
const supabase = getSupabaseClient()

const { data } = await supabase
  .from('documents')
  .select('*')
  .eq('user_id', user.id) // Always use user.id
```

### Protected Server Actions

```typescript
'use server'

export async function protectedAction(data: any) {
  const user = await requireUser() // Throws if no user
  const supabase = getSupabaseClient()
  
  // Your logic here
}
```

## What's Different from MVP Approach

1. **Proper structure from day 1** - No throwaway code
2. **Real user_id fields** - Not hardcoded strings in queries  
3. **RLS policies created** - Just disabled initially
4. **Auth wrapper functions** - Same API for dev and prod
5. **Environment flags** - Not code changes to enable auth

## Quick Start Commands

```bash
# Start development (Phase 1)
supabase start
npm run dev

# When ready for auth (Phase 2)
supabase migration run  # Run RLS enable migration
npm run dev             # Test with real auth

# Check auth is working
supabase auth users list
```

## Debugging

```typescript
// Add to any page to debug auth
export default async function DebugPage() {
  const user = await getCurrentUser()
  
  return (
    <pre>
      {JSON.stringify({
        user,
        isDev: process.env.NEXT_PUBLIC_DEV_MODE,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
      }, null, 2)}
    </pre>
  )
}
```
