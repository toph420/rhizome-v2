'use client'

import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useDebounce } from '@/hooks/useDebounce'
import { createClient } from '@/lib/supabase/client'
import { ConnectionCard } from './ConnectionCard'
import { CollapsibleSection } from './CollapsibleSection'
import type { SynthesisEngine } from '@/types/annotations'

/**
 * Real connection interface from database (chunk_connections table).
 */
interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  connection_type: SynthesisEngine
  strength: number
  auto_detected: boolean
  discovered_at: string
  metadata: {
    explanation?: string
    target_document_title?: string
    target_snippet?: string
    [key: string]: unknown
  }
}

interface ConnectionsListProps {
  documentId: string
  visibleChunkIds: string[]  // NEW: From Phase 2 VirtualizedReader viewport tracking
}

/**
 * Displays connections for visible chunks with debounced fetching.
 * Re-ranks connections in real-time based on weight tuning (<100ms target).
 *
 * **Performance Critical**:
 * - Debounced fetching prevents 60 queries/second during scrolling
 * - Runtime type validation filters invalid engine types
 * - Re-ranking uses useMemo for optimized filtering/weighting/sorting
 *
 * **Data Flow**:
 * 1. VirtualizedReader tracks visible chunks → visibleChunkIds
 * 2. useDebounce delays database query until scrolling pauses (300ms)
 * 3. Fetch connections for visible chunks from chunk_connections table
 * 4. Filter by enabled engines + strength threshold
 * 5. Apply weight multiplier and sort by weighted strength
 * 6. Group by engine type for collapsible sections
 *
 * @param props - Component props
 * @param props.documentId - Current document ID for navigation context
 * @param props.visibleChunkIds - Array of chunk IDs currently in viewport
 * @returns Connections list component with grouped sections
 */
export function ConnectionsList({ documentId, visibleChunkIds }: ConnectionsListProps) {
  const { weights, enabledEngines, strengthThreshold } = useAnnotationStore()
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(false)

  // Debounce visible chunk IDs to prevent database hammering during scroll
  // Without this: 60fps scrolling = 60 queries/second
  // With 300ms debounce: Query fires only when scrolling pauses
  const debouncedChunkIds = useDebounce(visibleChunkIds, 300)

  // Fetch connections for visible chunks (debounced)
  useEffect(() => {
    async function fetchConnections() {
      console.log('[ConnectionsList] Fetching connections for chunks:', debouncedChunkIds)

      if (debouncedChunkIds.length === 0) {
        console.log('[ConnectionsList] No visible chunks, clearing connections')
        setConnections([])
        return
      }

      setLoading(true)
      const supabase = createClient()

      try {
        const { data, error } = await supabase
          .from('connections')
          .select('*')
          .in('source_chunk_id', debouncedChunkIds)
          .order('strength', { ascending: false })
          .limit(100)

        if (error) {
          console.error('[ConnectionsList] Failed to fetch connections:', error)
          setConnections([])
        } else {
          console.log('[ConnectionsList] Fetched connections:', data?.length || 0, 'connections')
          setConnections(data || [])
        }
      } catch (err) {
        console.error('[ConnectionsList] Unexpected error:', err)
        setConnections([])
      } finally {
        setLoading(false)
      }
    }

    fetchConnections()
  }, [debouncedChunkIds])

  // Filter and weight connections with runtime type validation
  // Re-ranking happens instantly without refetching (performance target: <100ms)
  const filteredConnections = useMemo(() => {
    const startTime = performance.now()

    // Runtime validation: Only allow valid engine types from worker
    // This safety net prevents crashes if database contains invalid engine names
    const validEngines = new Set<SynthesisEngine>([
      'semantic_similarity',
      'thematic_bridge',
      'contradiction_detection'
    ])

    // Single-pass filter and map (O(n)) - optimized for performance
    const result = connections
      .filter(c => validEngines.has(c.connection_type))  // Runtime type validation
      .filter(c => enabledEngines.has(c.connection_type))  // User-enabled engines
      .filter(c => c.strength >= strengthThreshold)        // Strength threshold
      .map(c => ({
        ...c,
        weightedStrength: c.strength * (weights[c.connection_type] || 0)  // Apply weight multiplier
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength)  // Sort by weighted score

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
  }, [connections, weights, enabledEngines, strengthThreshold])  // Minimize re-computation

  // Group connections by engine type for sectioned display
  const groupedConnections = useMemo(() => {
    return filteredConnections.reduce((acc, connection) => {
      if (!acc[connection.connection_type]) {
        acc[connection.connection_type] = []
      }
      acc[connection.connection_type].push(connection)
      return acc
    }, {} as Record<string, typeof filteredConnections>)
  }, [filteredConnections])

  // Engine type labels mapping for display (3-engine system)
  const engineLabels: Record<SynthesisEngine, string> = {
    semantic_similarity: 'Semantic Similarity',
    thematic_bridge: 'Thematic Bridges',
    contradiction_detection: 'Contradictions',
  }

  // Engine colors for visual distinction (3-engine system)
  const engineColors: Record<SynthesisEngine, string> = {
    semantic_similarity: 'blue-500',
    thematic_bridge: 'purple-500',
    contradiction_detection: 'red-500',
  }

  // Loading state
  if (loading && connections.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Loading connections...</p>
      </div>
    )
  }

  // Empty state when no connections match filters
  if (filteredConnections.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {visibleChunkIds.length === 0
            ? 'No chunks visible in viewport'
            : connections.length === 0
            ? 'No connections found for visible chunks'
            : 'No connections match current filters'}
        </p>
        {connections.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Try adjusting engine weights or lowering strength threshold
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {Object.entries(groupedConnections).map(([engineType, conns]) => (
        <CollapsibleSection
          key={engineType}
          title={engineLabels[engineType as SynthesisEngine]}
          count={conns.length}
          color={engineColors[engineType as SynthesisEngine]}
          defaultOpen={true}
        >
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {conns.map(connection => (
                <motion.div
                  key={connection.id}
                  layout  // Enable automatic layout animation
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
    </div>
  )
}
