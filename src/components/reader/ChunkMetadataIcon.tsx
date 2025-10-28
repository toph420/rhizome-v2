'use client'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/rhizome/hover-card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Input } from '@/components/rhizome/input'
import { Textarea } from '@/components/rhizome/textarea'
import { Slider } from '@/components/rhizome/slider'
import { Info, TrendingUp, CheckCircle, AlertTriangle, Link2, Loader2, Sparkles, X, Plus, Pencil } from 'lucide-react'
import type { Chunk } from '@/types/annotations'
import { useState, useRef, useEffect } from 'react'
import { detectConnectionsForChunks } from '@/app/actions/connections'
import { enrichChunksForDocument, enrichAndConnectChunks } from '@/app/actions/enrichments'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { useReaderStore } from '@/stores/reader-store'
import { useChunkStore } from '@/stores/chunk-store'
import type { ChunkMetadata } from '@/stores/chunk-store'

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

  // Inline editing states
  const [editingThemes, setEditingThemes] = useState(false)
  const [editingImportance, setEditingImportance] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [editingDomain, setEditingDomain] = useState(false)
  const [newTheme, setNewTheme] = useState('')
  const [tempThemes, setTempThemes] = useState<string[]>([])
  const [tempImportance, setTempImportance] = useState(0)
  const [tempSummary, setTempSummary] = useState('')
  const [tempDomain, setTempDomain] = useState('')

  const themeInputRef = useRef<HTMLInputElement>(null)
  const summaryRef = useRef<HTMLTextAreaElement>(null)
  const domainInputRef = useRef<HTMLInputElement>(null)

  const { registerJob } = useBackgroundJobsStore()
  const { updateChunkMetadata } = useChunkStore()

  // Read fresh chunk data from store (updates when enrichment completes)
  const storeChunks = useReaderStore(state => state.chunks)
  // Use store chunk if available (has latest enrichment data), fall back to prop
  // Type cast needed because ReaderStore.Chunk and annotations.Chunk are different types
  const freshChunk = (storeChunks.find(c => c.id === chunk.id) as Chunk | undefined) || chunk

  // Debug: Log enrichment status changes
  useEffect(() => {
    const storeChunk = storeChunks.find(c => c.id === chunk.id)
    console.log(`[ChunkMetadataIcon c${chunkIndex}] freshChunkEnriched=${freshChunk.enrichments_detected}, propEnriched=${chunk.enrichments_detected}, storeHas=${!!storeChunk}, storeEnriched=${storeChunk?.enrichments_detected}`)
  }, [freshChunk.enrichments_detected, storeChunks.length, chunkIndex, chunk.id, chunk.enrichments_detected])

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

  // Inline editing handlers
  const handleSaveThemes = async () => {
    try {
      await updateChunkMetadata(chunk.id, { themes: tempThemes })
      setEditingThemes(false)
    } catch (error) {
      console.error('[ChunkMetadataIcon] Failed to save themes:', error)
    }
  }

  const handleSaveImportance = async () => {
    try {
      await updateChunkMetadata(chunk.id, { importance_score: tempImportance })
      setEditingImportance(false)
    } catch (error) {
      console.error('[ChunkMetadataIcon] Failed to save importance:', error)
    }
  }

  const handleSaveSummary = async () => {
    try {
      await updateChunkMetadata(chunk.id, {
        // Summary might need to be stored differently - check your schema
        themes: metadata.themes, // Preserve other fields
      })
      setEditingSummary(false)
    } catch (error) {
      console.error('[ChunkMetadataIcon] Failed to save summary:', error)
    }
  }

  const handleSaveDomain = async () => {
    try {
      await updateChunkMetadata(chunk.id, {
        domain_metadata: {
          primaryDomain: tempDomain,
          confidence: 'medium'
        }
      })
      setEditingDomain(false)
    } catch (error) {
      console.error('[ChunkMetadataIcon] Failed to save domain:', error)
    }
  }

  const handleAddTheme = () => {
    if (newTheme.trim() && !tempThemes.includes(newTheme.trim())) {
      setTempThemes([...tempThemes, newTheme.trim()])
      setNewTheme('')
    }
  }

  const handleRemoveTheme = (theme: string) => {
    setTempThemes(tempThemes.filter(t => t !== theme))
  }

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingThemes && themeInputRef.current) {
      themeInputRef.current.focus()
    }
  }, [editingThemes])

  useEffect(() => {
    if (editingSummary && summaryRef.current) {
      summaryRef.current.focus()
    }
  }, [editingSummary])

  useEffect(() => {
    if (editingDomain && domainInputRef.current) {
      domainInputRef.current.focus()
    }
  }, [editingDomain])

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

  // Debug: Log metadata when button state might change
  useEffect(() => {
    if (!metadata.connectionsDetected) {
      console.log(`[ChunkMetadataIcon c${chunkIndex}] DetectBtn: enriched=${metadata.enrichmentsDetected}, disabled=${!metadata.enrichmentsDetected}, connected=${metadata.connectionsDetected}`)
    }
  }, [metadata.enrichmentsDetected, metadata.connectionsDetected, chunkIndex])

  // Use em-based positioning for better text alignment (scales with font size)
  // Default: top-[0.375em] aligns roughly with first line of text
  const defaultStyle = { top: '0.375em', ...style }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button
          className={`absolute left-0 -ml-12 w-10 h-10 rounded-sm border-2 border-border bg-main shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none transition-all flex items-center justify-center ${
            alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={defaultStyle}
        >
          <Info className="h-4 w-4 text-main-foreground" />
        </button>
      </HoverCardTrigger>

      <HoverCardContent side="left" className="w-96">
        <div className="space-y-3">
          {/* Chunk Index & ID */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-mono text-xs">
                c{chunkIndex}
              </Badge>
              {metadata.importanceScore > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>Importance: {Math.round(metadata.importanceScore * 100)}%</span>
                </div>
              )}
            </div>
            {/* Short chunk ID for spark references */}
            <div className="text-xs">
              <span className="text-muted-foreground">Short ID:</span>{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                /c{chunkIndex}
              </code>
              <span className="text-muted-foreground ml-2">or</span>{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                /{chunkIndex}
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

          {/* Importance Score - Click to edit */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium mb-1.5 flex items-center justify-between">
              <span>Importance Score</span>
              {!editingImportance && (
                <button
                  onClick={() => {
                    setTempImportance(metadata.importanceScore)
                    setEditingImportance(true)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
            {editingImportance ? (
              <div className="space-y-2">
                <Slider
                  value={[tempImportance]}
                  onValueChange={(v) => setTempImportance(v[0])}
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground text-center">{Math.round(tempImportance * 100)}%</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveImportance} className="h-6 text-xs">
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingImportance(false)} className="h-6 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p
                className="text-sm cursor-pointer hover:text-foreground"
                onClick={() => {
                  setTempImportance(metadata.importanceScore)
                  setEditingImportance(true)
                }}
              >
                {Math.round(metadata.importanceScore * 100)}%
              </p>
            )}
          </div>

          {/* Themes - Click to edit */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium mb-1.5 flex items-center justify-between">
              <span>Themes</span>
              {!editingThemes && metadata.themes.length > 0 && (
                <button
                  onClick={() => {
                    setTempThemes([...metadata.themes])
                    setEditingThemes(true)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
            {editingThemes ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1 mb-2">
                  {tempThemes.map((theme, i) => (
                    <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1">
                      {theme}
                      <button onClick={() => handleRemoveTheme(theme)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    ref={themeInputRef}
                    value={newTheme}
                    onChange={(e) => setNewTheme(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddTheme()
                      }
                    }}
                    placeholder="Add theme..."
                    className="h-6 text-xs"
                  />
                  <Button size="sm" onClick={handleAddTheme} className="h-6 text-xs px-2">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveThemes} className="h-6 text-xs">
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingThemes(false)} className="h-6 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : metadata.themes.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {metadata.themes.map((theme, i) => (
                  <Badge key={i} variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80"
                    onClick={() => {
                      setTempThemes([...metadata.themes])
                      setEditingThemes(true)
                    }}
                  >
                    {theme}
                  </Badge>
                ))}
              </div>
            ) : (
              <button
                onClick={() => {
                  setTempThemes([])
                  setEditingThemes(true)
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Click to add themes...
              </button>
            )}
          </div>

          {/* Domain - Click to edit */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium mb-1.5 flex items-center justify-between">
              <span>Domain</span>
              {!editingDomain && metadata.domain && (
                <button
                  onClick={() => {
                    setTempDomain(metadata.domain || '')
                    setEditingDomain(true)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
            {editingDomain ? (
              <div className="space-y-2">
                <Input
                  ref={domainInputRef}
                  value={tempDomain}
                  onChange={(e) => setTempDomain(e.target.value)}
                  className="h-7 text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveDomain} className="h-6 text-xs">
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingDomain(false)} className="h-6 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : metadata.domain ? (
              <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent"
                onClick={() => {
                  setTempDomain(metadata.domain || '')
                  setEditingDomain(true)
                }}
              >
                {metadata.domain}
              </Badge>
            ) : (
              <button
                onClick={() => {
                  setTempDomain('')
                  setEditingDomain(true)
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Click to add domain...
              </button>
            )}
          </div>

          {/* Concepts (read-only display) */}
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

          {/* Summary - Click to edit */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium mb-1.5 flex items-center justify-between">
              <span>Summary</span>
              {!editingSummary && metadata.summary && (
                <button
                  onClick={() => {
                    setTempSummary(metadata.summary || '')
                    setEditingSummary(true)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
            {editingSummary ? (
              <div className="space-y-2">
                <Textarea
                  ref={summaryRef}
                  value={tempSummary}
                  onChange={(e) => setTempSummary(e.target.value)}
                  className="text-xs min-h-[60px]"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveSummary} className="h-6 text-xs">
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingSummary(false)} className="h-6 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : metadata.summary ? (
              <p
                className="text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => {
                  setTempSummary(metadata.summary || '')
                  setEditingSummary(true)
                }}
              >
                {metadata.summary}
              </p>
            ) : (
              <button
                onClick={() => {
                  setTempSummary('')
                  setEditingSummary(true)
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Click to add summary...
              </button>
            )}
          </div>

          {/* Emotional Polarity (read-only display) */}
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

            {!metadata.connectionsDetected && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={handleDetectConnections}
                disabled={isDetecting || !metadata.enrichmentsDetected}
                title={!metadata.enrichmentsDetected ? 'Enrich chunk first before detecting connections' : 'Detect connections for this chunk'}
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
