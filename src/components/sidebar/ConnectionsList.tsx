'use client'

import { useMemo, useState } from 'react'
import { useAnnotationStore } from '@/stores/annotation-store'
import { MOCK_CONNECTIONS } from '@/lib/annotations/mock-connections'
import { ConnectionCard } from './ConnectionCard'
import { CollapsibleSection } from './CollapsibleSection'
import type { SynthesisEngine } from '@/types/annotations'

interface ConnectionsListProps {
  documentId: string
}

/**
 * Displays mock connections grouped by engine type.
 * Re-ranks connections in real-time based on weight tuning (<100ms target).
 *
 * **Performance Critical**: Re-ranking must complete in <100ms to meet UX requirements.
 * Uses useMemo for optimized filtering, weighting, and sorting.
 *
 * **Filtering Logic**:
 * 1. Filter by enabled engines (toggleEngine action)
 * 2. Filter by strength threshold (setStrengthThreshold action)
 * 3. Apply weight multiplier to strength (weightedStrength = strength × weight)
 * 4. Sort by weighted strength descending
 *
 * @param props - Component props.
 * @param props.documentId - Current document ID for navigation context.
 * @returns Connections list component with grouped sections.
 */
export function ConnectionsList({ documentId }: ConnectionsListProps) {
  const { weights, enabledEngines, strengthThreshold } = useAnnotationStore()
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  
  // Filter and re-rank connections (CRITICAL: must be <100ms)
  const filteredConnections = useMemo(() => {
    const start = performance.now()
    
    const result = MOCK_CONNECTIONS
      .filter(c => enabledEngines.has(c.engine_type))
      .filter(c => c.strength >= strengthThreshold)
      .map(c => ({
        ...c,
        weightedStrength: c.strength * weights[c.engine_type]
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength)
    
    const duration = performance.now() - start
    if (duration > 100) {
      console.warn(`⚠️ Connection re-ranking took ${duration}ms (target: <100ms)`)
    } else {
      console.log(`✅ Re-ranking: ${duration.toFixed(2)}ms`)
    }
    
    return result
  }, [weights, enabledEngines, strengthThreshold])
  
  // Group by engine type
  const grouped = useMemo(() => {
    return filteredConnections.reduce((acc, conn) => {
      if (!acc[conn.engine_type]) {
        acc[conn.engine_type] = []
      }
      acc[conn.engine_type].push(conn)
      return acc
    }, {} as Record<string, typeof filteredConnections>)
  }, [filteredConnections])
  
  // Engine metadata (labels and colors)
  const engineMeta: Record<SynthesisEngine, { label: string; color: string }> = {
    semantic: { label: 'Semantic', color: 'blue-500' },
    thematic: { label: 'Thematic', color: 'purple-500' },
    structural: { label: 'Structural', color: 'green-500' },
    contradiction: { label: 'Contradiction', color: 'red-500' },
    emotional: { label: 'Emotional', color: 'pink-500' },
    methodological: { label: 'Methodological', color: 'orange-500' },
    temporal: { label: 'Temporal', color: 'yellow-500' }
  }
  
  if (filteredConnections.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No connections match current filters
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Adjust weights or enable more engines
        </p>
      </div>
    )
  }
  
  return (
    <div className="space-y-2 p-4">
      {Object.entries(grouped).map(([engineType, connections]) => {
        const meta = engineMeta[engineType as SynthesisEngine]
        
        return (
          <CollapsibleSection
            key={engineType}
            title={meta.label}
            count={connections.length}
            color={meta.color}
            defaultOpen={true}
          >
            <div className="space-y-2">
              {connections.map(connection => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  documentId={documentId}
                  isActive={activeConnectionId === connection.id}
                  onClick={() => setActiveConnectionId(connection.id)}
                />
              ))}
            </div>
          </CollapsibleSection>
        )
      })}
    </div>
  )
}