'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Edit
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChunkStore } from '@/stores/chunk-store'
import type { ChunkListItem, ChunkDetailed, ChunkMetadata } from '@/stores/chunk-store'
import { detectBatchChunkConnections } from '@/app/actions/chunks'
import { toast } from 'sonner'
import { ChunkMetadataEditor } from './chunk-metadata-editor'

interface ChunkCardProps {
  chunk: ChunkListItem
  documentId: string
  isActive: boolean
  isSelected: boolean
  mode: 'compact' | 'detailed'
  onClick: () => void
  onToggleMode?: () => void
}

/**
 * Feature-rich ChunkCard component for chunk browsing and selection.
 *
 * Following the domain component pattern:
 * - Self-contained state management (no prop drilling)
 * - Server action integration (detection)
 * - Keyboard shortcuts when active (d/space/enter)
 * - Two view modes (compact/detailed) with lazy loading
 * - Optimistic updates for selection
 */
export function ChunkCard({
  chunk,
  documentId,
  isActive,
  isSelected,
  mode,
  onClick,
  onToggleMode
}: ChunkCardProps) {
  const [isDetecting, setIsDetecting] = useState(false)
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)
  const [isSavingMetadata, setIsSavingMetadata] = useState(false)

  const {
    toggleSelection,
    detailedChunks,
    loadingDetailed,
    loadDetailedChunk,
    updateChunkMetadata
  } = useChunkStore()

  const detailedChunk = detailedChunks.get(chunk.id)
  const isLoadingDetails = loadingDetailed.has(chunk.id)

  // Handle single chunk detection
  const handleDetect = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDetecting(true)

    try {
      const result = await detectBatchChunkConnections(documentId, [chunk.id])
      toast.success('Detection started', {
        description: 'Check ProcessingDock for progress'
      })
    } catch (error) {
      console.error('[ChunkCard] Detection failed:', error)
      toast.error('Failed to start detection')
    } finally {
      setIsDetecting(false)
    }
  }, [documentId, chunk.id])

  // Handle metadata save
  const handleSaveMetadata = useCallback(async (metadata: Partial<ChunkMetadata>) => {
    setIsSavingMetadata(true)
    try {
      await updateChunkMetadata(chunk.id, metadata)
      setIsEditingMetadata(false)
    } catch (error) {
      console.error('[ChunkCard] Failed to save metadata:', error)
      // Error already shown by store
    } finally {
      setIsSavingMetadata(false)
    }
  }, [chunk.id, updateChunkMetadata])

  // Handle selection toggle
  const handleToggleSelection = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    toggleSelection(chunk.id)
  }, [chunk.id, toggleSelection])

  // Load detailed data when switching to detailed mode
  useEffect(() => {
    if (mode === 'detailed' && !detailedChunk && !isLoadingDetails) {
      loadDetailedChunk(chunk.id)
    }
  }, [mode, chunk.id, detailedChunk, isLoadingDetails, loadDetailedChunk])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return // Don't trigger in input fields
      }

      switch(e.key.toLowerCase()) {
        case 'd':
          e.preventDefault()
          if (!chunk.connections_detected) {
            handleDetect(new MouseEvent('click') as any)
          }
          break
        case ' ':
        case 'enter':
          e.preventDefault()
          toggleSelection(chunk.id)
          break
        case 'e':
          e.preventDefault()
          if (onToggleMode) {
            onToggleMode()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, chunk.id, chunk.connections_detected, handleDetect, toggleSelection, onToggleMode])

  // Compact mode: Simple preview card
  if (mode === 'compact') {
    return (
      <Card
        className={cn(
          "cursor-pointer transition-all",
          isActive && "ring-2 ring-primary",
          isSelected && "bg-accent/20"
        )}
        onClick={onClick}
      >
        <CardContent className="p-3 flex items-start gap-3">
          {/* Selection checkbox */}
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleSelection(chunk.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
          />

          {/* Chunk info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                #{chunk.chunk_index}
              </Badge>

              {chunk.connections_detected ? (
                <Badge variant="success" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Detected
                </Badge>
              ) : (
                <Badge variant="warning" className="text-xs">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Not scanned
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2">
              {chunk.preview}
            </p>
          </div>

          {/* Quick actions */}
          {!chunk.connections_detected && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDetect}
              disabled={isDetecting}
              className="flex-shrink-0"
            >
              {isDetecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  // Detailed mode: Full chunk details with metadata
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        isActive && "ring-2 ring-primary",
        isSelected && "bg-accent/20"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelection(chunk.id)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1"
            />

            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">
                  Chunk #{chunk.chunk_index}
                </Badge>

                {chunk.connections_detected ? (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {detailedChunk?.connection_count || 0} connections
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Not scanned
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              if (onToggleMode) onToggleMode()
            }}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoadingDetails ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Loading details...</span>
          </div>
        ) : detailedChunk ? (
          <>
            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Words:</span>{' '}
                <span className="font-medium">{detailedChunk.word_count}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tokens:</span>{' '}
                <span className="font-medium">{detailedChunk.token_count}</span>
              </div>
              {detailedChunk.page_start && (
                <div>
                  <span className="text-muted-foreground">Pages:</span>{' '}
                  <span className="font-medium">
                    {detailedChunk.page_start}
                    {detailedChunk.page_end !== detailedChunk.page_start &&
                      `-${detailedChunk.page_end}`}
                  </span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Chunker:</span>{' '}
                <span className="font-medium text-xs">{detailedChunk.chunker_type}</span>
              </div>
            </div>

            {/* Heading path */}
            {detailedChunk.heading_path && detailedChunk.heading_path.length > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground">Path:</span>{' '}
                <span className="font-medium">
                  {detailedChunk.heading_path.join(' > ')}
                </span>
              </div>
            )}

            {/* Themes */}
            {detailedChunk.themes && detailedChunk.themes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {detailedChunk.themes.map((theme, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {theme}
                  </Badge>
                ))}
              </div>
            )}

            {/* Content preview */}
            <div className="border-l-2 border-border pl-3 py-2">
              <p className="text-sm text-muted-foreground line-clamp-4">
                {detailedChunk.content.slice(0, 300)}
                {detailedChunk.content.length > 300 && '...'}
              </p>
            </div>

            {/* Quality indicators */}
            {(detailedChunk.position_confidence || detailedChunk.metadata_confidence) && (
              <div className="flex gap-2 text-xs">
                {detailedChunk.position_confidence && (
                  <Badge variant="outline">
                    Pos: {detailedChunk.position_confidence}
                  </Badge>
                )}
                {detailedChunk.metadata_confidence && (
                  <Badge variant="outline">
                    Meta: {detailedChunk.metadata_confidence}
                  </Badge>
                )}
              </div>
            )}

            {/* Metadata Editor */}
            {isEditingMetadata ? (
              <ChunkMetadataEditor
                metadata={{
                  themes: detailedChunk.themes,
                  importance_score: detailedChunk.importance_score,
                  domain_metadata: detailedChunk.domain_metadata,
                  emotional_metadata: detailedChunk.emotional_metadata,
                  conceptual_metadata: detailedChunk.conceptual_metadata
                }}
                onSave={handleSaveMetadata}
                onCancel={() => setIsEditingMetadata(false)}
                isSaving={isSavingMetadata}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditingMetadata(true)}
                className="w-full"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Metadata
              </Button>
            )}

            {/* Detection action */}
            {!chunk.connections_detected && (
              <Button
                onClick={handleDetect}
                disabled={isDetecting}
                className="w-full"
                size="sm"
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Detecting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Detect Connections
                  </>
                )}
              </Button>
            )}

            {/* Detection timestamp */}
            {detailedChunk.connections_detected_at && (
              <p className="text-xs text-muted-foreground text-center">
                Detected {new Date(detailedChunk.connections_detected_at).toLocaleDateString()}
              </p>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-4">
            Failed to load details
          </div>
        )}
      </CardContent>
    </Card>
  )
}
