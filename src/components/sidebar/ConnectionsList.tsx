'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAnnotationStore } from '@/stores/annotation-store'
import { MOCK_CONNECTIONS } from '@/lib/annotations/mock-connections'
import { ConnectionCard } from './ConnectionCard'
import { CollapsibleSection } from './CollapsibleSection'
import { ScrollArea } from '@/components/ui/scroll-area'
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
 * 4. Sort by weighted strength descending.
 *
 * @param props - Component props.
 * @param props.documentId - Current document ID for navigation context.
 * @returns Connections list component with grouped sections.
 */
export function ConnectionsList({ documentId }: ConnectionsListProps) {
  const { weights, enabledEngines, strengthThreshold } = useAnnotationStore()
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  
  // Optimized filtering and re-ranking with performance measurement
  const filteredConnections = useMemo(() => {
    const startTime = performance.now()
    
    // Single-pass filter and map (O(n)) - optimized for performance
    const result = MOCK_CONNECTIONS
      .filter(c => enabledEngines.has(c.engine_type)) // Early exit for disabled engines
      .filter(c => c.strength >= strengthThreshold)   // Strength threshold filter
      .map(c => ({
        ...c,
        weightedStrength: c.strength * weights[c.engine_type] // Calculate weighted score
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength) // O(n log n) sort
    
    const duration = performance.now() - startTime
    
    // Performance monitoring with detailed logging
    if (duration > 100) {
      console.warn(
        `⚠️ Connection re-ranking took ${duration.toFixed(2)}ms (target: <100ms)`,
        {
          connectionCount: result.length,
          enabledEngines: Array.from(enabledEngines),
          strengthThreshold
        }
      )
    } else if (duration > 50) {
      console.info(`ℹ️ Connection re-ranking: ${duration.toFixed(2)}ms`)
    }
    
    return result
  }, [weights, enabledEngines, strengthThreshold]) // Minimize re-computation
  
  // Group connections by engine type for sectioned display
  const groupedConnections = useMemo(() => {
    return filteredConnections.reduce((acc, connection) => {
      if (!acc[connection.engine_type]) {
        acc[connection.engine_type] = []
      }
      acc[connection.engine_type].push(connection)
      return acc
    }, {} as Record<string, typeof filteredConnections>)
  }, [filteredConnections])
  
  // Engine type labels mapping for display
  const engineLabels: Record<SynthesisEngine, string> = {
    semantic: 'Semantic Similarity',
    thematic: 'Thematic Resonance',
    structural: 'Structural Patterns',
    contradiction: 'Contradictions',
    emotional: 'Emotional Tone',
    methodological: 'Methodological Approach',
    temporal: 'Temporal Relationships'
  }
  
  // Engine colors for visual distinction
  const engineColors: Record<SynthesisEngine, string> = {
    semantic: 'blue-500',
    thematic: 'purple-500',
    structural: 'green-500',
    contradiction: 'red-500',
    emotional: 'pink-500',
    methodological: 'orange-500',
    temporal: 'yellow-500'
  }
  
  // Empty state when no connections match filters
  if (filteredConnections.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No connections match filters
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Try adjusting engine weights or lowering strength threshold
        </p>
      </div>
    )
  }
  
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {Object.entries(groupedConnections).map(([engineType, connections]) => (
          <CollapsibleSection
            key={engineType}
            title={engineLabels[engineType as SynthesisEngine]}
            count={connections.length}
            color={engineColors[engineType as SynthesisEngine]}
            defaultOpen={true}
          >
            <AnimatePresence mode="popLayout">
              <div className="space-y-2">
                {connections.map(connection => (
                  <motion.div
                    key={connection.id}
                    layout // Enable automatic layout animation
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{
                      layout: { type: 'spring', damping: 25, stiffness: 300 },
                      opacity: { duration: 0.2 },
                      y: { duration: 0.2 }
                    }}
                  >
                    <ConnectionCard
                      connection={connection}
                      documentId={documentId}
                      isActive={activeConnectionId === connection.id}
                      onClick={() => setActiveConnectionId(connection.id)}
                    />
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          </CollapsibleSection>
        ))}
        
        {filteredConnections.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-8 text-center"
          >
            <p className="text-sm text-muted-foreground">
              No connections match filters
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Try adjusting engine weights or lowering strength threshold
            </p>
          </motion.div>
        )}
      </div>
    </ScrollArea>
  )
}