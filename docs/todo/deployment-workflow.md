# Deployment Workflow: Dev → Stable → Production

**Created:** 2025-10-12
**Purpose:** Manage concurrent versions for development, daily use, and remote access

---

## Three-Tier Strategy

```
┌─────────────────────────────────────────────────────┐
│ TIER 1: Development (Active Work)                   │
│ • Branch: feature/* branches                        │
│ • Database: Local Supabase (port 54321)            │
│ • Purpose: Break things, experiment                 │
└─────────────────────────────────────────────────────┘
                    ↓ (merge when stable)
┌─────────────────────────────────────────────────────┐
│ TIER 2: Local Stable (Daily Use on Desktop)        │
│ • Branch: main                                      │
│ • Database: Separate local Supabase instance       │
│ • Purpose: Actual work, real documents              │
└─────────────────────────────────────────────────────┘
                    ↓ (deploy when tested)
┌─────────────────────────────────────────────────────┐
│ TIER 3: Production (iPad/Phone Access)             │
│ • Platform: Vercel + Supabase Cloud                │
│ • Domain: rhizome.yourdomain.com                   │
│ • Purpose: Remote access, sync across devices      │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Options

### Option 1: Single Database with Branches

**Simplest approach for personal use**

```bash
# Development work (current setup)
cd /Users/topher/Code/rhizome-v2-cached-chunks
npm run dev  # Uses local Supabase (dev data)

# Daily use (stable version)
cd /Users/topher/Code/rhizome-v2
git checkout main
npm run dev  # Same database, but stable code
```

**Trade-offs:**
- Simple: One database, real data in dev
- Fast: No data migration between environments
- Risk: Breaking changes affect real data
- Migration issues: Can't easily revert schema changes

**Use case:** Low-risk changes, UI work, non-breaking features

---

### Option 2: Separate Dev/Stable Databases

**For risky database migrations**

#### Setup Stable Database

```bash
# Create stable database directory
mkdir ~/rhizome-stable
cd ~/rhizome-stable

# Initialize separate Supabase instance
npx supabase init
npx supabase start --port 54323  # Different port

# Stable instance runs on:
# - API: http://localhost:54323
# - DB: localhost:54324
# - Studio: http://localhost:54325
```

#### Configure Stable Environment

Create `~/rhizome-stable/.env.local`:
```bash
# Stable Database (different port)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54323
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from stable supabase start>
SUPABASE_SERVICE_ROLE_KEY=<from stable supabase start>

GOOGLE_AI_API_KEY=<your key>
```

#### Run Stable Version

```bash
# Terminal 1: Start stable database
cd ~/rhizome-stable
npx supabase start

# Terminal 2: Run stable app
cd /Users/topher/Code/rhizome-v2
npm run dev  # Uses stable .env.local
```

**Trade-offs:**
- Safe: Dev database can be reset anytime
- Isolated: Breaking changes don't affect real data
- Testable: Seed dev DB with test documents
- Complexity: Manage two Supabase instances
- Data sync: Must migrate important documents to stable

---

### Option 3: Docker Compose

**Production-like local setup**

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  rhizome-stable:
    build: .
    ports:
      - "3001:3000"  # Different port from dev
    environment:
      - SUPABASE_URL=http://supabase-stable:54321
      - NODE_ENV=production
    depends_on:
      - supabase-stable

  supabase-stable:
    image: supabase/postgres:15
    ports:
      - "54323:5432"
    volumes:
      - stable-data:/var/lib/postgresql/data

volumes:
  stable-data:
```

**Usage:**
```bash
# Start stable version
docker-compose up -d

# Access at http://localhost:3001

# Dev work continues on port 3000
cd /Users/topher/Code/rhizome-v2-cached-chunks
npm run dev
```

**Trade-offs:**
- Production-like: Closer to deployed environment
- Isolated: Complete environment separation
- Overhead: Docker resource usage
- Learning curve: Requires Docker knowledge

---

## Deployment to Production

### Phase 1: Supabase Cloud Setup

```bash
# Link to Supabase Cloud project
npx supabase link --project-ref <your-project-ref>

# Push migrations to production
npx supabase db push

# Get production credentials
npx supabase projects api-keys
```

### Phase 2: Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from main branch
cd /Users/topher/Code/rhizome-v2
git checkout main
vercel deploy --prod

# Set environment variables in Vercel dashboard:
# - NEXT_PUBLIC_SUPABASE_URL (cloud URL)
# - NEXT_PUBLIC_SUPABASE_ANON_KEY (cloud key)
# - SUPABASE_SERVICE_ROLE_KEY (cloud key)
# - GOOGLE_AI_API_KEY (same as local)
```

### Phase 3: Custom Domain (Optional)

```bash
# In Vercel dashboard:
# Settings > Domains > Add rhizome.yourdomain.com
```

---

## Recommended Path

For a personal tool with iterative development:

### **Start: Option 1 + Port-Based Separation**

```bash
# Daily use (stable, always running)
cd /Users/topher/Code/rhizome-v2
git checkout main
npm run dev  # Port 3000

# Development work (different terminal)
cd /Users/topher/Code/rhizome-v2-cached-chunks
npm run dev:next -- -p 3001  # Port 3001
```

### **Upgrade to Option 2 when:**
- Making risky database migrations (like cached_chunks table)
- Testing with synthetic data
- Experimenting with schema changes

### **Deploy to Production when:**
- Main branch stable for 1+ weeks
- Need iPad/phone access
- Ready for Supabase Cloud costs (~$25/month)

---

## Daily Workflow Pattern

### Morning: Start Stable Version
```bash
# Terminal 1 (keep open)
cd ~/Code/rhizome-v2
git checkout main
npm run dev

# Browser: http://localhost:3000
# Use for actual work
```

### Development Sessions
```bash
# Terminal 2 (new features)
cd ~/Code/rhizome-v2-cached-chunks
npm run dev:next -- -p 3001

# Browser: http://localhost:3001
# Test changes here
```

### Promote Changes
```bash
# When feature is stable
cd ~/Code/rhizome-v2
git merge feature/cached-chunks

# Restart stable version
# Ctrl+C in Terminal 1, then npm run dev
```

---

## Current Status

**Active Setup:** Option 1 (single database, branch-based)

**Next Steps:**
1. Implement cached_chunks table (no database separation needed - additive change)
2. Test stability on main for 1-2 weeks
3. Consider Option 2 if doing risky schema migrations
4. Deploy to Vercel when ready for remote access
