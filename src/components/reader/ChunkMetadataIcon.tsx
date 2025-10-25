'use client'

import { motion } from 'framer-motion'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/rhizome/hover-card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/ui/button'
import { Info, TrendingUp, CheckCircle, AlertTriangle, Link2, Loader2 } from 'lucide-react'
import type { Chunk } from '@/types/annotations'
import { useState } from 'react'
import { detectConnectionsForChunks } from '@/app/actions/connections'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'

interface ChunkMetadataIconProps {
  chunk: Chunk
  chunkIndex: number
  documentId: string  // NEW: For detection action
  alwaysVisible?: boolean
  style?: React.CSSProperties
  /** For accurate positioning based on text content */
  textOffset?: number
}

/**
 * Hoverable chunk metadata icon that appears in the left margin.
 * Shows chunk index, themes, importance score, and confidence indicators on hover.
 *
 * @param props - Component props
 * @param props.chunk - Chunk data with metadata
 * @param props.chunkIndex - Sequential chunk index
 * @param props.alwaysVisible - If true, icon is always visible (not just on hover)
 * @param props.style - Optional inline styles for positioning
 * @returns Hover card with chunk metadata
 */
export function ChunkMetadataIcon({ chunk, chunkIndex, documentId, alwaysVisible = false, style, textOffset }: ChunkMetadataIconProps) {
  const [isDetecting, setIsDetecting] = useState(false)
  const { registerJob } = useBackgroundJobsStore()

  // Helper function to determine polarity category
  const getPolarity = (polarity?: number): 'positive' | 'negative' | 'neutral' | null => {
    if (polarity === undefined || polarity === null) return null
    if (polarity > 0.2) return 'positive'
    if (polarity < -0.2) return 'negative'
    return 'neutral'
  }

  // Helper function for confidence badge color
  const getConfidenceColor = (confidence?: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (confidence) {
      case 'exact': return 'default'
      case 'high': return 'secondary'
      case 'medium': return 'outline'
      case 'synthetic': return 'destructive'
      default: return 'outline'
    }
  }

  // Handler for detecting connections for this specific chunk
  const handleDetectConnections = async () => {
    setIsDetecting(true)
    try {
      const result = await detectConnectionsForChunks(documentId, [chunk.id])
      if (result.success && result.jobId) {
        registerJob(result.jobId, 'detect_connections', {
          documentId,
          chunkIds: [chunk.id],
          title: `Chunk ${chunkIndex}`
        })
      }
    } catch (error) {
      console.error('Failed to detect connections:', error)
    } finally {
      setIsDetecting(false)
    }
  }

  // Extract metadata from chunk (now populated from database)
  const metadata = {
    themes: chunk.themes || [],
    importanceScore: chunk.importance_score || 0,
    concepts: chunk.conceptual_metadata?.concepts?.slice(0, 5).map(c => c.text) || [],
    emotionalPolarity: getPolarity(chunk.emotional_metadata?.polarity),
    domain: chunk.domain_metadata?.primaryDomain,
    summary: chunk.summary,
    positionConfidence: chunk.position_confidence,
    positionMethod: chunk.position_method,
    positionValidated: chunk.position_validated,
    pageStart: chunk.page_start,
    pageEnd: chunk.page_end,
    sectionMarker: chunk.section_marker,
    // NEW: Connection detection status
    connectionsDetected: chunk.connections_detected,
    connectionsDetectedAt: chunk.connections_detected_at,
    detectionSkippedReason: chunk.detection_skipped_reason
  }

  // Use em-based positioning for better text alignment (scales with font size)
  // Default: top-[0.375em] aligns roughly with first line of text
  const defaultStyle = { top: '0.375em', ...style }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <motion.button
          className={`absolute left-0 -ml-12 w-6 h-6 rounded-full bg-muted/50 hover:bg-primary/20 transition-colors flex items-center justify-center ${
            alwaysVisible ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={defaultStyle}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <Info className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </motion.button>
      </HoverCardTrigger>

      <HoverCardContent side="left" className="w-80">
        <div className="space-y-3">
          {/* Chunk Index & ID */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-mono text-xs">
                Chunk {chunkIndex}
              </Badge>
              {metadata.importanceScore > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>Importance: {Math.round(metadata.importanceScore * 100)}%</span>
                </div>
              )}
            </div>
            {/* Chunk ID for spark references */}
            <div className="text-xs">
              <span className="text-muted-foreground">ID:</span>{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                /chunk_{chunk.id.replace('chunk_', '')}
              </code>
            </div>
          </div>

          {/* Position Confidence (from local pipeline) */}
          {metadata.positionConfidence && (
            <div className="flex items-center justify-between border-t pt-2">
              <div className="flex items-center gap-2">
                {metadata.positionConfidence === 'synthetic' ? (
                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                ) : (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                )}
                <span className="text-xs font-medium">Quality</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={getConfidenceColor(metadata.positionConfidence)} className="text-xs">
                  {metadata.positionConfidence}
                </Badge>
                {metadata.positionValidated && (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                )}
              </div>
            </div>
          )}

          {/* Position Method & Location */}
          {(metadata.positionMethod || metadata.pageStart !== null || metadata.sectionMarker) && (
            <div className="text-xs space-y-1">
              {metadata.positionMethod && (
                <p><span className="text-muted-foreground">Method:</span> {metadata.positionMethod}</p>
              )}
              {metadata.pageStart !== null && (
                <p>
                  <span className="text-muted-foreground">Pages:</span>{' '}
                  {metadata.pageStart}
                  {metadata.pageEnd && metadata.pageEnd !== metadata.pageStart ? `-${metadata.pageEnd}` : ''}
                </p>
              )}
              {metadata.sectionMarker && (
                <p><span className="text-muted-foreground">Section:</span> {metadata.sectionMarker}</p>
              )}
            </div>
          )}

          {/* Themes */}
          {metadata.themes.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5">Themes</p>
              <div className="flex flex-wrap gap-1">
                {metadata.themes.map((theme, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {theme}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Concepts (when available) */}
          {metadata.concepts.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5">Concepts</p>
              <div className="flex flex-wrap gap-1">
                {metadata.concepts.map((concept: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {concept}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Summary (when available) */}
          {metadata.summary && (
            <div>
              <p className="text-xs font-medium mb-1.5">Summary</p>
              <p className="text-xs text-muted-foreground">{metadata.summary}</p>
            </div>
          )}

          {/* Domain (when available) */}
          {metadata.domain && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Domain:</span>
              <Badge variant="outline" className="text-xs">
                {metadata.domain}
              </Badge>
            </div>
          )}

          {/* Emotional Polarity (when available) */}
          {metadata.emotionalPolarity && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Tone:</span>
              <Badge
                variant={
                  metadata.emotionalPolarity === 'positive'
                    ? 'default'
                    : metadata.emotionalPolarity === 'negative'
                    ? 'destructive'
                    : 'secondary'
                }
                className="text-xs"
              >
                {metadata.emotionalPolarity}
              </Badge>
            </div>
          )}

          {/* Connection Detection Status */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">Connections</span>
              </div>
              {metadata.connectionsDetected ? (
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Detected
                </Badge>
              ) : metadata.detectionSkippedReason ? (
                <Badge variant="outline" className="text-xs">
                  Skipped ({metadata.detectionSkippedReason})
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Not detected
                </Badge>
              )}
            </div>

            {metadata.connectionsDetectedAt && (
              <p className="text-xs text-muted-foreground mb-2">
                Detected {new Date(metadata.connectionsDetectedAt).toLocaleDateString()}
              </p>
            )}

            {!metadata.connectionsDetected && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={handleDetectConnections}
                disabled={isDetecting}
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Detecting...
                  </>
                ) : (
                  <>
                    <Link2 className="h-3 w-3 mr-1" />
                    Detect Connections
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Placeholder message when no metadata */}
          {metadata.themes.length === 0 && metadata.concepts.length === 0 && !metadata.summary && (
            <p className="text-xs text-muted-foreground">
              Metadata extraction in progress...
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
