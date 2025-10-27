'use client'

import { motion } from 'framer-motion'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/rhizome/hover-card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Info, TrendingUp, CheckCircle, AlertTriangle, Link2, Loader2, Sparkles } from 'lucide-react'
import type { Chunk } from '@/types/annotations'
import { useState } from 'react'
import { detectConnectionsForChunks } from '@/app/actions/connections'
import { enrichChunksForDocument, enrichAndConnectChunks } from '@/app/actions/enrichments'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { useReaderStore } from '@/stores/reader-store'

interface ChunkMetadataIconProps {
  chunk: Chunk
  chunkIndex: number
  documentId: string  // For detection action
  documentTitle?: string  // NEW: For job display
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
export function ChunkMetadataIcon({ chunk, chunkIndex, documentId, documentTitle, alwaysVisible = false, style, textOffset }: ChunkMetadataIconProps) {
  const [isDetecting, setIsDetecting] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [isEnrichingAndConnecting, setIsEnrichingAndConnecting] = useState(false)
  const { registerJob } = useBackgroundJobsStore()

  // Read fresh chunk data from store (updates when enrichment completes)
  const storeChunks = useReaderStore(state => state.chunks)
  // Use store chunk if available (has latest enrichment data), fall back to prop
  // Type cast needed because ReaderStore.Chunk and annotations.Chunk are different types
  const freshChunk = (storeChunks.find(c => c.id === chunk.id) as Chunk | undefined) || chunk

  // Debug: Log when freshChunk has enrichment data
  if (freshChunk.enrichments_detected && !chunk.enrichments_detected) {
    console.log(`[ChunkMetadataIcon] Chunk ${chunkIndex} enrichment detected! Themes:`, freshChunk.themes)
  }

  // Format job title with document name
  const jobTitle = documentTitle ? `${documentTitle} - Chunk ${chunkIndex}` : `Chunk ${chunkIndex}`

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

  // Handler for enriching this specific chunk
  const handleEnrichChunk = async () => {
    setIsEnriching(true)
    try {
      const result = await enrichChunksForDocument(documentId, [chunk.id])
      if (result.success && result.jobId) {
        registerJob(result.jobId, 'enrich_chunks', {
          documentId,
          chunkIds: [chunk.id],
          title: jobTitle,
          showInDock: true  // ✅ Force show in ProcessingDock
        })
      }
    } catch (error) {
      console.error('Failed to enrich chunk:', error)
    } finally {
      setIsEnriching(false)
    }
  }

  // Handler for enriching AND connecting this chunk
  const handleEnrichAndConnect = async () => {
    setIsEnrichingAndConnecting(true)
    try {
      const result = await enrichAndConnectChunks(documentId, [chunk.id])
      if (result.success && result.jobId) {
        registerJob(result.jobId, 'enrich_and_connect', {
          documentId,
          chunkIds: [chunk.id],
          title: jobTitle,
          showInDock: true  // ✅ Force show in ProcessingDock
        })
      }
    } catch (error) {
      console.error('Failed to enrich and connect:', error)
    } finally {
      setIsEnrichingAndConnecting(false)
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
          title: jobTitle,
          showInDock: true  // ✅ Force show in ProcessingDock
        })
      }
    } catch (error) {
      console.error('Failed to detect connections:', error)
    } finally {
      setIsDetecting(false)
    }
  }

  // Extract metadata from chunk (now populated from database)
  // Use freshChunk to get the latest data after enrichment updates
  const metadata = {
    themes: freshChunk.themes || [],
    importanceScore: freshChunk.importance_score || 0,
    concepts: freshChunk.conceptual_metadata?.concepts?.slice(0, 5).map(c => c.text) || [],
    emotionalPolarity: getPolarity(freshChunk.emotional_metadata?.polarity),
    domain: freshChunk.domain_metadata?.primaryDomain,
    summary: freshChunk.summary,
    positionConfidence: freshChunk.position_confidence,
    positionMethod: freshChunk.position_method,
    positionValidated: freshChunk.position_validated,
    pageStart: freshChunk.page_start,
    pageEnd: freshChunk.page_end,
    sectionMarker: freshChunk.section_marker,
    // NEW: Connection detection status
    connectionsDetected: freshChunk.connections_detected,
    connectionsDetectedAt: freshChunk.connections_detected_at,
    detectionSkippedReason: freshChunk.detection_skipped_reason,
    // NEW: Enrichment status
    enrichmentsDetected: freshChunk.enrichments_detected,
    enrichmentsDetectedAt: freshChunk.enrichments_detected_at,
    enrichmentSkippedReason: freshChunk.enrichment_skipped_reason
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

          {/* Enrichment Status */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">Enrichment</span>
              </div>
              {metadata.enrichmentsDetected ? (
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Enriched
                </Badge>
              ) : metadata.enrichmentSkippedReason ? (
                <Badge variant="outline" className="text-xs">
                  Skipped ({metadata.enrichmentSkippedReason})
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Not enriched
                </Badge>
              )}
            </div>

            {metadata.enrichmentsDetectedAt && (
              <p className="text-xs text-muted-foreground mb-2">
                Enriched {new Date(metadata.enrichmentsDetectedAt).toLocaleDateString()}
              </p>
            )}

            {!metadata.enrichmentsDetected && (
              <div className="space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={handleEnrichChunk}
                  disabled={isEnriching || isEnrichingAndConnecting}
                >
                  {isEnriching ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Enriching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 mr-1" />
                      Enrich Chunk
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="default"
                  className="w-full text-xs"
                  onClick={handleEnrichAndConnect}
                  disabled={isEnriching || isEnrichingAndConnecting}
                >
                  {isEnrichingAndConnecting ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 mr-1" />
                      Enrich & Connect
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

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

            {!metadata.connectionsDetected && metadata.enrichmentsDetected && (
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
