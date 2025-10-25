'use client'

import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useConnectionStore } from '@/stores/connection-store'
import { useDebounce } from '@/hooks/useDebounce'
import { getConnectionsForChunks } from '@/app/actions/connections'
import { ConnectionCard } from '@/components/rhizome/connection-card'
import { CollapsibleSection } from './CollapsibleSection'
import type { SynthesisEngine } from '@/types/annotations'

/**
 * Real connection interface from database (connections table).
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
  onNavigateToChunk?: (chunkId: string) => void
  onConnectionsChange?: (connections: Array<{
    id: string
    source_chunk_id: string
    target_chunk_id: string
    strength: number
  }>) => void
  onActiveConnectionCountChange?: (count: number) => void
}

/**
 * Displays connections for visible chunks using Pattern 2 (Server Action + Zustand).
 *
 * **Pattern 2: Client-Fetched with Zustand** ✅
 * - Server Action enforces RLS and authentication
 * - Zustand store handles filtering, weighting, sorting
 * - Store automatically applies filters when weights/thresholds change
 *
 * **Data Flow**:
 * 1. VirtualizedReader tracks visible chunks → visibleChunkIds
 * 2. useDebounce delays query until scrolling pauses (300ms)
 * 3. Call Server Action getConnectionsForChunks()
 * 4. Store in Zustand via setConnections() (auto-calls applyFilters())
 * 5. Use filteredConnections from store (pre-computed)
 * 6. Group by engine type for collapsible sections
 *
 * **Performance**:
 * - Debounced fetching prevents 60 queries/second during scrolling
 * - Store handles filtering/weighting/sorting (no useMemo needed)
 * - Re-ranking happens automatically when weights change
 *
 * @param props - Component props
 * @param props.documentId - Current document ID for navigation context
 * @param props.visibleChunkIds - Array of chunk IDs currently in viewport
 * @returns Connections list component with grouped sections
 */
export function ConnectionsList({
  documentId,
  visibleChunkIds,
  onNavigateToChunk,
  onConnectionsChange,
  onActiveConnectionCountChange
}: ConnectionsListProps) {
  // Pattern 2: Use store for connections state and filtering
  const { setConnections, filteredConnections } = useConnectionStore()
  const connections = useConnectionStore(state => state.connections)

  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Debounce visible chunk IDs to prevent database hammering during scroll
  // Without this: 60fps scrolling = 60 queries/second
  // With 300ms debounce: Query fires only when scrolling pauses
  const debouncedChunkIds = useDebounce(visibleChunkIds, 300)

  // Stable reference to prevent infinite loops - only update when IDs actually change
  const stableChunkIds = useMemo(() => debouncedChunkIds, [JSON.stringify(debouncedChunkIds)])

  // Fetch connections for visible chunks (debounced)
  // Pattern 2: Call Server Action → Store in Zustand
  useEffect(() => {
    async function fetchConnections() {
      console.log('[ConnectionsList] Fetching connections for chunks:', stableChunkIds)

      setLoading(true)

      try {
        // Call Server Action (enforces RLS, proper authentication)
        const data = await getConnectionsForChunks(stableChunkIds)
        console.log('[ConnectionsList] Fetched connections:', data.length, 'connections')

        // Store in Zustand (automatically calls applyFilters())
        setConnections(data)
      } catch (err) {
        console.error('[ConnectionsList] Unexpected error:', err)
        setConnections([])
      } finally {
        setLoading(false)
      }
    }

    fetchConnections()
  }, [stableChunkIds, setConnections])

  // Notify parent when connections change (for heatmap)
  useEffect(() => {
    if (onConnectionsChange) {
      // Map to simpler format for heatmap
      const simplifiedConnections = connections.map(c => ({
        id: c.id,
        source_chunk_id: c.source_chunk_id,
        target_chunk_id: c.target_chunk_id,
        strength: c.strength
      }))
      onConnectionsChange(simplifiedConnections)
    }

    // Notify parent of active connection count
    if (onActiveConnectionCountChange) {
      onActiveConnectionCountChange(filteredConnections.length)
    }
  }, [connections, filteredConnections, onConnectionsChange, onActiveConnectionCountChange])

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
    const validChunkIds = visibleChunkIds.filter(id => id !== 'no-chunk')

    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {validChunkIds.length === 0
            ? 'No semantic metadata available for this section'
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
                    onNavigateToChunk={onNavigateToChunk}
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
