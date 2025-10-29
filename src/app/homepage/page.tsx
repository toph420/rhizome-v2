import { Suspense } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Skeleton } from '@/components/rhizome/skeleton'
import { StatCard } from '@/components/rhizome/stat-card'
import { FileText, Database, Network, CheckCircle2, Zap, AlertCircle } from 'lucide-react'

/**
 * Homepage - Diagonal Cascade Layout
 *
 * Grid Structure:
 * - 66% / 34% column split
 * - Percentage-based responsive design
 * - Tight staggering with no gaps
 * - Activity Feed spans 2 rows (560px)
 * - Stats + Connections = 66% width
 *
 * Design Document: /thoughts/plans/home-page-redesign-2025-10-25.md
 */
export default async function HomePage() {
  // TODO: Fetch data with Server Actions
  // const currentReading = await getCurrentReading()
  // const library = await getLibrary({ limit: 8 })
  // const connections = await getConnections({ validated: true, limit: 12 })
  // const sparks = await getSparks({ limit: 6 })
  // const flashcards = await getFlashcards({ dueOnly: false })
  // const stats = await getStats()

  return (
    <div className="homepage-container w-full max-w-[1440px] mx-auto">
      {/* CSS Grid Layout - 5 rows for precise staggering */}
      <div className="homepage-grid grid grid-cols-[66%_34%] grid-rows-[360px_240px_140px_140px_320px] gap-0 w-full">

        {/* ==================== LEFT COLUMN (66%) ==================== */}

        {/* Row 1: Hero Card (Currently Reading) */}
        <section
          className="col-start-1 row-start-1 bg-white border-r border-b border-border"
          data-section="hero"
        >
          <Suspense fallback={<HeroSkeleton />}>
            <HeroCard />
          </Suspense>
        </section>

        {/* Row 2: Library */}
        <section
          className="col-start-1 row-start-2 bg-gray-50 border-r border-b border-border"
          data-section="library"
        >
          <Suspense fallback={<LibrarySkeleton />}>
            <LibraryGrid />
          </Suspense>
        </section>

        {/* Rows 3-4: Stats + Connections (spans rows 3 & 4) */}
        <div
          className="col-start-1 row-start-3 row-span-2 grid grid-cols-[36.36%_63.64%] gap-0 border-b border-border"
          data-section="stats-connections"
        >
          {/* Stats (24% of total, 36.36% of 66%) */}
          <section className="stats-section bg-gray-100 border-r border-border p-4">
            <Suspense fallback={<StatsSkeleton />}>
              <StatsPanel />
            </Suspense>
          </section>

          {/* Connections (42% of total, 63.64% of 66%) */}
          <section className="connections-section bg-white border-r border-border p-4">
            <Suspense fallback={<ConnectionsSkeleton />}>
              <ConnectionsPanel />
            </Suspense>
          </section>
        </div>

        {/* Row 5: Sparks (full 66% width) */}
        <section
          className="col-start-1 row-start-5 bg-gray-50 border-r border-border p-4"
          data-section="sparks"
        >
          <Suspense fallback={<SparksSkeleton />}>
            <SparksGrid />
          </Suspense>
        </section>

        {/* ==================== RIGHT COLUMN (34%) ==================== */}

        {/* Rows 1-3: Quick Capture + Activity Feed */}
        <div className="col-start-2 row-start-1 row-span-3 flex flex-col">
          {/* Quick Capture at top (200px) */}
          <section
            className="h-[200px] bg-gray-100 border-b border-border p-4"
            data-section="capture"
          >
            <QuickCaptureForm />
          </section>

          {/* Activity Feed below (ends halfway down Connections) */}
          <section
            className="flex-1 bg-gray-100 border-l border-b border-border p-4 overflow-y-auto"
            data-section="activity"
          >
            <Suspense fallback={<ActivitySkeleton />}>
              <ActivityFeed />
            </Suspense>
          </section>
        </div>

        {/* Rows 4-5: Flashcards (starts halfway down Connections) */}
        <section
          className="col-start-2 row-start-4 row-span-2 bg-gray-50 border-l border-border p-4"
          data-section="flashcards"
        >
          <Suspense fallback={<FlashcardsSkeleton />}>
            <FlashcardsPanel />
          </Suspense>
        </section>
      </div>
    </div>
  )
}

/* ==================== PLACEHOLDER COMPONENTS ==================== */
/* TODO: Move these to separate client component files in /components/homepage/ */

function HeroCard() {
  return (
    <Card className="h-full border-0 shadow-none rounded-none">
      <CardHeader>
        <CardTitle className="text-lg font-heading">Currently Reading</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-6 h-full">
        {/* Cover Image */}
        <div className="flex-shrink-0">
          <div className="w-[180px] h-[260px] bg-gray-200 border-2 border-border rounded-base flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Cover Image</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Thinking Fast & Slow</h2>
              <p className="text-muted-foreground">Daniel Kahneman</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm">Chapter 12 of 34 · 35% complete</p>
              <p className="text-sm text-muted-foreground">234 chunks · 45 connections</p>
            </div>
          </div>
          <Button className="w-full">CONTINUE READING →</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LibraryGrid() {
  return (
    <Card className="h-full border-0 shadow-none rounded-none bg-gray-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Your Library (47)</CardTitle>
          <div className="flex gap-2 text-sm">
            <button className="hover:underline">Recent▾</button>
            <button className="hover:underline">A-Z▾</button>
            <button className="hover:underline">Connected▾</button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-2 border-border rounded-base p-2 bg-white">
              <div className="text-xs font-bold">Doc {i + 1}</div>
              <div className="text-xs text-muted-foreground">234 chunks</div>
              <div className="text-xs text-muted-foreground">45c</div>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="w-full mt-3">View all 47 documents →</Button>
      </CardContent>
    </Card>
  )
}

function StatsPanel() {
  return (
    <div className="h-full flex flex-col justify-between gap-3">
      <div>
        <h3 className="font-heading text-sm font-bold mb-3">Stats & Processing</h3>
        <div className="grid grid-cols-1 gap-2">
          {/* Primary Variant - bg-main accent */}
          <StatCard
            label="documents"
            value={47}
            variant="primary"
            icon={<FileText className="w-4 h-4" />}
            onClick={() => console.log('Navigate to documents')}
          />

          {/* Vibrant Variants - colorful highlights */}
          <StatCard
            label="chunks"
            value="12.4K"
            variant="vibrant-pink"
            icon={<Database className="w-4 h-4" />}
          />

          <StatCard
            label="connections"
            value={891}
            variant="vibrant-purple"
            icon={<Network className="w-4 h-4" />}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Processing Queue</p>
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label="completed"
            value={44}
            variant="success"
            icon={<CheckCircle2 className="w-3 h-3" />}
            compact
          />
          <StatCard
            label="active"
            value={2}
            variant="warning"
            icon={<Zap className="w-3 h-3" />}
            compact
          />
          <StatCard
            label="failed"
            value={1}
            variant="danger"
            icon={<AlertCircle className="w-3 h-3" />}
            compact
          />
        </div>
        <Button variant="neutral" className="w-full text-xs">View Processing Graph →</Button>
      </div>
    </div>
  )
}

function ConnectionsPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-bold">Connections (891)</h3>
        <div className="flex gap-2 text-xs">
          <button className="hover:underline">Valid▾</button>
          <button className="hover:underline">Engine▾</button>
          <button className="hover:underline">Type▾</button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Showing: 12 validated</p>
      <div className="space-y-2 flex-1 overflow-y-auto">
        {[
          { type: 'BRIDGE', strength: 0.89, text: 'Buddhism → CogSci' },
          { type: 'TENSION', strength: 0.92, text: 'Free Will ⟷ Determinism' },
          { type: 'SIMILAR', strength: 0.84, text: 'Consciousness' },
        ].map((conn, i) => (
          <div key={i} className="border-2 border-border rounded-base p-2 bg-white">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold">{conn.type}</span>
              <span className="font-mono">{conn.strength}</span>
            </div>
            <p className="text-xs mt-1">{conn.text}</p>
            <Button variant="ghost" size="sm" className="w-full mt-1 text-xs">VIEW IN READER</Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="w-full mt-2 text-xs">View all 891 →</Button>
    </div>
  )
}

function SparksGrid() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-bold">Your Sparks (23)</h3>
        <div className="flex gap-2 text-xs">
          <button className="hover:underline">Recent▾</button>
          <button className="hover:underline">Theme▾</button>
          <label className="flex items-center gap-1">
            <input type="checkbox" className="w-3 h-3" />
            <span>Unlinked only</span>
          </label>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 flex-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-2 border-border rounded-base p-2 bg-white">
            <div className="text-xs font-bold">Spark {i + 1}</div>
            <div className="text-xs text-muted-foreground truncate">Quick thought...</div>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="w-full mt-2 text-xs">View all 23 sparks →</Button>
    </div>
  )
}

function QuickCaptureForm() {
  return (
    <div className="h-full flex flex-col">
      <h3 className="font-heading text-sm font-bold mb-3">Quick Capture</h3>
      <div className="flex-1 flex flex-col gap-2">
        <input
          type="text"
          placeholder="New spark:"
          className="border-2 border-border rounded-base px-3 py-2 text-sm"
        />
        <Button size="sm">SAVE NOW</Button>
        <div className="flex-1">
          <p className="text-xs font-medium mb-1">Recent sparks:</p>
          <ul className="text-xs space-y-1">
            <li>• Spark 1</li>
            <li>• Spark 2</li>
            <li>• Spark 3</li>
          </ul>
        </div>
        <Button variant="ghost" size="sm" className="text-xs">View all 23 →</Button>
      </div>
    </div>
  )
}

function ActivityFeed() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-bold">Activity Feed</h3>
        <div className="flex gap-2 text-xs">
          <button className="hover:underline">All▾</button>
          <button className="hover:underline">24h▾</button>
        </div>
      </div>
      <div className="space-y-3 flex-1 overflow-y-auto">
        {[
          { time: '2h ago', icon: '✓', text: 'Validated Bridge connection' },
          { time: '3h ago', icon: '📝', text: 'Annotation added' },
          { time: '5h ago', icon: '⚡', text: 'Document processed' },
          { time: '8h ago', icon: '💭', text: 'Spark captured' },
          { time: 'Yesterday', icon: '📚', text: 'Document added' },
          { time: '2 days ago', icon: '⚡', text: 'Processing started' },
        ].map((item, i) => (
          <div key={i} className="border-b border-border pb-2">
            <p className="text-xs text-muted-foreground">{item.time}</p>
            <p className="text-sm">{item.icon} {item.text}</p>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="w-full mt-2 text-xs">Load more ↓</Button>
    </div>
  )
}

function FlashcardsPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-bold">Flashcards (4)</h3>
        <div className="flex gap-2 text-xs">
          <button className="hover:underline">Due only▾</button>
          <button className="hover:underline">Deck: All▾</button>
        </div>
      </div>
      <div className="space-y-2 flex-1 overflow-y-auto">
        {[
          { name: 'Philosophy', count: 45, due: 12 },
          { name: 'AI Safety', count: 23, due: 3 },
          { name: 'Buddhism', count: 18, due: 0 },
          { name: 'Cognition', count: 12, due: 5 },
        ].map((deck, i) => (
          <div key={i} className="border-2 border-border rounded-base p-2 bg-white">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold">{deck.name}</span>
              <span className="text-muted-foreground">{deck.count}</span>
            </div>
            <p className="text-xs mt-1">{deck.due > 0 ? `${deck.due} due` : 'None due'}</p>
            <Button variant="ghost" size="sm" className="w-full mt-1 text-xs">PRACTICE NOW →</Button>
          </div>
        ))}
      </div>
      <Button variant="outline" className="w-full mt-2 text-xs">Create new deck +</Button>
    </div>
  )
}

/* ==================== LOADING SKELETONS ==================== */

function HeroSkeleton() {
  return (
    <Card className="h-full border-0 shadow-none rounded-none">
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent className="flex gap-6">
        {/* Cover Image Skeleton */}
        <Skeleton className="w-[180px] h-[260px] flex-shrink-0" />

        {/* Content Skeleton */}
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}

function LibrarySkeleton() {
  return (
    <Card className="h-full border-0 shadow-none rounded-none bg-gray-50">
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function StatsSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-28" />
    </div>
  )
}

function ConnectionsSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

function SparksSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  )
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

function FlashcardsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}
