'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { Input } from '@/components/rhizome/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/rhizome/select'
import { Loader2, Sparkles, X, Search, Filter } from 'lucide-react'
import { ChunkCard } from '@/components/rhizome/chunk-card'
import { useChunkStore } from '@/stores/chunk-store'
import { loadChunkMetadata, detectBatchChunkConnections } from '@/app/actions/chunks'
import { toast } from 'sonner'
import type { ChunkListItem } from '@/stores/chunk-store'

interface AllChunksViewProps {
  documentId: string
}

type FilterMode = 'all' | 'detected' | 'undetected'
type ViewMode = 'compact' | 'detailed'

export function AllChunksView({ documentId }: AllChunksViewProps) {
  const [chunks, setChunks] = useState<ChunkListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('compact')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)

  const {
    selectedChunks,
    selectMultiple,
    clearSelection,
    detectionStatus
  } = useChunkStore()

  // Load chunk metadata on mount
  useEffect(() => {
    loadChunkMetadata(documentId)
      .then(setChunks)
      .catch(err => {
        console.error('[AllChunksView] Failed to load chunks:', err)
        toast.error('Failed to load chunks')
      })
      .finally(() => setLoading(false))
  }, [documentId])

  // Sync detection status from store (updated by ChunkCard)
  const chunksWithStatus = useMemo(() => {
    return chunks.map(chunk => ({
      ...chunk,
      connections_detected: detectionStatus.get(chunk.id) ?? chunk.connections_detected
    }))
  }, [chunks, detectionStatus])

  // Filtered chunks based on filter mode and search
  const filteredChunks = useMemo(() => {
    let filtered = chunksWithStatus

    // Apply detection filter
    if (filterMode === 'detected') {
      filtered = filtered.filter(c => c.connections_detected)
    } else if (filterMode === 'undetected') {
      filtered = filtered.filter(c => !c.connections_detected)
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(c =>
        c.preview.toLowerCase().includes(query) ||
        c.chunk_index.toString().includes(query)
      )
    }

    return filtered
  }, [chunksWithStatus, filterMode, searchQuery])

  // Quick select actions
  const handleSelectAll = useCallback(() => {
    selectMultiple(filteredChunks.map(c => c.id))
  }, [filteredChunks, selectMultiple])

  const handleSelectUndetected = useCallback(() => {
    const undetected = filteredChunks
      .filter(c => !c.connections_detected)
      .map(c => c.id)
    selectMultiple(undetected)
  }, [filteredChunks, selectMultiple])

  const handleClearSelection = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  // Batch detection
  const handleBatchDetect = useCallback(async () => {
    const selectedIds = Array.from(selectedChunks)
    if (selectedIds.length === 0) {
      toast.error('No chunks selected')
      return
    }

    setIsDetecting(true)
    try {
      const result = await detectBatchChunkConnections(documentId, selectedIds)
      toast.success(`Detection started for ${result.chunkCount} chunks`, {
        description: 'Check ProcessingDock for progress'
      })
      clearSelection()
    } catch (error) {
      console.error('[AllChunksView] Batch detection failed:', error)
      toast.error('Failed to start detection')
    } finally {
      setIsDetecting(false)
    }
  }, [selectedChunks, documentId, clearSelection])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex(prev =>
            prev === null || prev >= filteredChunks.length - 1 ? 0 : prev + 1
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex(prev =>
            prev === null || prev <= 0 ? filteredChunks.length - 1 : prev - 1
          )
          break
        case 'Escape':
          e.preventDefault()
          setActiveIndex(null)
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [filteredChunks.length])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading chunks...</span>
      </div>
    )
  }

  const undetectedCount = filteredChunks.filter(c => !c.connections_detected).length
  const selectedCount = selectedChunks.size

  return (
    <div className="flex flex-col h-full">
      {/* Header with filters */}
      <div className="flex-shrink-0 p-4 space-y-3 border-b-2 border-border">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search chunks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filter and View controls */}
        <div className="flex gap-2">
          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Chunks</SelectItem>
              <SelectItem value="detected">Detected Only</SelectItem>
              <SelectItem value="undetected">Undetected Only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact View</SelectItem>
              <SelectItem value="detailed">Detailed View</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex gap-2">
            <Badge variant="outline">
              {filteredChunks.length} chunks
            </Badge>
            {undetectedCount > 0 && (
              <Badge variant="warning">
                {undetectedCount} undetected
              </Badge>
            )}
          </div>
          {selectedCount > 0 && (
            <Badge variant="secondary">
              {selectedCount} selected
            </Badge>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSelectAll}
          >
            Select All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSelectUndetected}
            disabled={undetectedCount === 0}
          >
            Select Undetected ({undetectedCount})
          </Button>
          {selectedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearSelection}
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Virtualized chunk list */}
      <div className="flex-1 overflow-hidden">
        <Virtuoso
          data={filteredChunks}
          itemContent={(index, chunk) => (
            <div className="p-2">
              <ChunkCard
                chunk={chunk}
                documentId={documentId}
                isActive={activeIndex === index}
                isSelected={selectedChunks.has(chunk.id)}
                mode={viewMode}
                onClick={() => setActiveIndex(index)}
                onToggleMode={() => setViewMode(prev => prev === 'compact' ? 'detailed' : 'compact')}
              />
            </div>
          )}
          overscan={5}
        />
      </div>

      {/* Floating action bar (when items selected) */}
      {selectedCount > 0 && (
        <div className="flex-shrink-0 p-4 border-t-2 border-border bg-background">
          <Button
            onClick={handleBatchDetect}
            disabled={isDetecting}
            className="w-full"
          >
            {isDetecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Detecting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Detect Connections ({selectedCount})
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
