'use client'

import { StatCard } from '@/components/rhizome/stat-card'
import { Button } from '@/components/rhizome/button'
import { FileText, Database, Network, CheckCircle2, Zap, AlertCircle } from 'lucide-react'

/**
 * StatsPanel - Client Component that orchestrates StatCard components
 *
 * Pattern: Like DeckGrid, this is a Client Component that:
 * - Creates callback functions for navigation
 * - Passes them to StatCard (which accepts onClick props)
 * - Manages interactive state if needed
 *
 * Used in: Homepage stats section
 */
export function StatsPanel() {
  // TODO: Replace with useRouter when adding navigation
  const handleNavigate = (section: string) => {
    console.log(`Navigate to ${section}`)
  }

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
            onClick={() => handleNavigate('documents')}
          />

          {/* Vibrant Variants - colorful highlights */}
          <StatCard
            label="chunks"
            value="12.4K"
            variant="vibrant-pink"
            icon={<Database className="w-4 h-4" />}
            onClick={() => handleNavigate('chunks')}
          />

          <StatCard
            label="connections"
            value={891}
            variant="vibrant-purple"
            icon={<Network className="w-4 h-4" />}
            onClick={() => handleNavigate('connections')}
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
            onClick={() => handleNavigate('processing/completed')}
          />
          <StatCard
            label="active"
            value={2}
            variant="warning"
            icon={<Zap className="w-3 h-3" />}
            compact
            onClick={() => handleNavigate('processing/active')}
          />
          <StatCard
            label="failed"
            value={1}
            variant="danger"
            icon={<AlertCircle className="w-3 h-3" />}
            compact
            onClick={() => handleNavigate('processing/failed')}
          />
        </div>
        <Button variant="neutral" className="w-full text-xs">View Processing Graph →</Button>
      </div>
    </div>
  )
}
