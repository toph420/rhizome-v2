'use client'

import { useEffect, useState } from 'react'
import { reprocessConnections, type ReprocessMode, type EngineType } from '@/app/actions/documents'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/rhizome/label'
import { RadioGroup, RadioGroupItem } from '@/components/rhizome/radio-group'
import { Checkbox } from '@/components/rhizome/checkbox'
import { Progress } from '@/components/rhizome/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/rhizome/select'
import { Loader2, Play, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { serializeSupabaseError, getErrorMessage } from '@/lib/supabase/error-helpers'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/rhizome/tooltip'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'

// Types for document with connection stats
interface DocumentWithStats {
  id: string
  title: string
  chunkCount: number
  connectionCount: number
  validatedConnectionCount: number
}

// Engine info for UI display
const ENGINE_INFO = {
  semantic_similarity: {
    name: 'Semantic Similarity',
    description: 'Embeddings-based, fast, free',
    estimateMs: 200, // ms per chunk
    estimateCost: 0,
  },
  contradiction_detection: {
    name: 'Contradiction Detection',
    description: 'Metadata-based, fast, free',
    estimateMs: 50,
    estimateCost: 0,
  },
  thematic_bridge: {
    name: 'Thematic Bridge',
    description: 'AI-powered, slower, costs $0.20',
    estimateMs: 500,
    estimateCost: 0.20,
  },
} as const

// Mode info for UI display
const MODE_INFO = {
  all: {
    name: 'Reprocess All',
    description: 'Delete all connections and regenerate from scratch',
    warning: 'This will delete ALL connections including validated ones',
  },
  add_new: {
    name: 'Add New',
    description: 'Keep existing, add connections to newer documents',
    warning: null,
  },
  smart: {
    name: 'Smart Mode',
    description: 'Preserve user-validated connections, update the rest',
    warning: null,
  },
} as const

export function ConnectionsTab() {
  // Use Zustand store for job tracking
  const { jobs, registerJob, updateJob, activeJobs } = useBackgroundJobsStore()

  // Form state
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [mode, setMode] = useState<ReprocessMode>('smart')
  const [engines, setEngines] = useState<EngineType[]>([
    'semantic_similarity',
    'contradiction_detection',
    'thematic_bridge',
  ])
  const [preserveValidated, setPreserveValidated] = useState(true)
  const [backupFirst, setBackupFirst] = useState(true)

  // UI state
  const [documents, setDocuments] = useState<DocumentWithStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Track current reprocessing job
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [jobResult, setJobResult] = useState<any>(null)

  // Derived state: processing indicator
  const processing = !!currentJobId

  // Load documents on mount
  useEffect(() => {
    loadDocuments()
  }, [])

  // Watch for job completion
  useEffect(() => {
    if (!currentJobId) return

    const job = jobs.get(currentJobId)
    if (!job) return

    if (job.status === 'completed') {
      setMessage('Reprocessing completed successfully!')
      setJobResult(job.result)
      setCurrentJobId(null)
      // Reload documents to update connection counts
      loadDocuments()
    } else if (job.status === 'failed') {
      setError(job.error || 'Job failed')
      setCurrentJobId(null)
    }
  }, [currentJobId, jobs])

  const loadDocuments = async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Get all completed documents
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, title')
        .eq('processing_status', 'completed')
        .order('created_at', { ascending: false })

      if (docsError) throw docsError

      // For each document, count chunks and connections
      const transformed: DocumentWithStats[] = await Promise.all(
        (docs || []).map(async (doc: any) => {
          // Count chunks
          const { count: chunkCount } = await supabase
            .from('chunks')
            .select('*', { count: 'exact', head: true })
            .eq('document_id', doc.id)

          // Use RPC function to count connections efficiently (avoids URL length issues)
          const { data: connectionStats, error: statsError } = await supabase
            .rpc('count_connections_for_document', { doc_id: doc.id })

          if (statsError) {
            console.error('Failed to count connections:', statsError)
          }

          const stats = connectionStats?.[0] || { total_connections: 0, validated_connections: 0 }

          return {
            id: doc.id,
            title: doc.title,
            chunkCount: chunkCount || 0,
            connectionCount: Number(stats.total_connections) || 0,
            validatedConnectionCount: Number(stats.validated_connections) || 0,
          }
        })
      )

      setDocuments(transformed)

      // Select first document if none selected
      if (!selectedDocId && transformed.length > 0) {
        setSelectedDocId(transformed[0].id)
      }
    } catch (err) {
      console.error('Failed to load documents:', serializeSupabaseError(err))
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const selectedDoc = documents.find((d) => d.id === selectedDocId)

  // Calculate estimate based on selections
  const calculateEstimate = () => {
    if (!selectedDoc) return { timeMinutes: 0, cost: 0 }

    const chunkCount = selectedDoc.chunkCount

    // Calculate time
    let totalMs = 0
    engines.forEach((engine) => {
      totalMs += ENGINE_INFO[engine].estimateMs * chunkCount
    })
    const timeMinutes = Math.ceil(totalMs / 60000)

    // Calculate cost
    let totalCost = 0
    engines.forEach((engine) => {
      totalCost += ENGINE_INFO[engine].estimateCost
    })

    return { timeMinutes, cost: totalCost }
  }

  const estimate = calculateEstimate()

  const handleReprocess = async () => {
    if (!selectedDocId) {
      setError('Please select a document')
      return
    }

    if (engines.length === 0) {
      setError('Please select at least one engine')
      return
    }

    // Confirm destructive operation
    if (mode === 'all') {
      const confirmed = confirm(
        'This will DELETE ALL connections (including validated ones) and regenerate from scratch. Continue?'
      )
      if (!confirmed) return
    }

    setError(null)
    setMessage(null)
    setJobResult(null)

    try {
      const result = await reprocessConnections(selectedDocId, {
        mode,
        engines,
        preserveValidated: mode === 'smart' ? preserveValidated : undefined,
        backupFirst: mode === 'smart' ? backupFirst : undefined,
      })

      if (!result.success) {
        setError(result.error || 'Failed to start reprocessing')
        return
      }

      // Register job with store
      const selectedDoc = documents.find(d => d.id === selectedDocId)
      registerJob(result.jobId!, 'reprocess_connections', {
        documentId: selectedDocId,
        title: selectedDoc?.title || 'Unknown'
      })

      setCurrentJobId(result.jobId!)
      setMessage('Reprocessing started...')
    } catch (err) {
      console.error('Reprocess error:', err)
      setError(err instanceof Error ? err.message : 'Failed to start reprocessing')
    }
  }

  const toggleEngine = (engine: EngineType) => {
    setEngines((prev) =>
      prev.includes(engine) ? prev.filter((e) => e !== engine) : [...prev, engine]
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Reprocess Connections</h3>
        <p className="text-sm text-muted-foreground">
          Update connections with Smart Mode and engine selection
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-2 border border-red-200 rounded-lg p-4 bg-red-50">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {message && !error && (
        <div className="flex items-center gap-2 border border-green-200 rounded-lg p-4 bg-green-50">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{message}</p>
        </div>
      )}

      {/* Main Form */}
      {!loading && documents.length > 0 && (
        <div className="border rounded-lg p-6 space-y-6">
          {/* Document Selector */}
          <div className="space-y-2">
            <Label htmlFor="document">Document</Label>
            <Select value={selectedDocId || undefined} onValueChange={setSelectedDocId}>
              <SelectTrigger id="document">
                <SelectValue placeholder="Select a document" />
              </SelectTrigger>
              <SelectContent>
                {documents.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current Stats */}
          {selectedDoc && (
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-2xl font-bold">{selectedDoc.chunkCount}</div>
                <div className="text-sm text-muted-foreground">Chunks</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-2xl font-bold">{selectedDoc.connectionCount}</div>
                <div className="text-sm text-muted-foreground">Total Connections</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">
                  {selectedDoc.validatedConnectionCount}
                </div>
                <div className="text-sm text-muted-foreground">User-Validated</div>
              </div>
            </div>
          )}

          {/* Reprocess Mode */}
          <div className="space-y-3">
            <Label>Reprocess Mode</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as ReprocessMode)}>
              {(['all', 'add_new', 'smart'] as const).map((m) => (
                <div key={m} className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value={m} id={m} disabled={processing} />
                    <Label htmlFor={m} className="flex items-center gap-1 cursor-pointer font-medium">
                      {MODE_INFO[m].name}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{MODE_INFO[m].description}</p>
                          {MODE_INFO[m].warning && (
                            <p className="mt-1 font-semibold text-orange-600">Warning: {MODE_INFO[m].warning}</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">
                    {MODE_INFO[m].description}
                  </p>
                  {MODE_INFO[m].warning && mode === m && (
                    <div className="flex items-start gap-2 ml-6 p-3 border border-orange-200 rounded bg-orange-50">
                      <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-orange-800">{MODE_INFO[m].warning}</p>
                    </div>
                  )}
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Engines to Run */}
          <div className="space-y-3">
            <Label>Engines to Run</Label>
            <div className="space-y-3">
              {(['semantic_similarity', 'contradiction_detection', 'thematic_bridge'] as const).map(
                (engine) => (
                  <div key={engine} className="flex items-start space-x-3">
                    <Checkbox
                      id={engine}
                      checked={engines.includes(engine)}
                      onCheckedChange={() => toggleEngine(engine)}
                      disabled={processing}
                    />
                    <div className="space-y-1">
                      <Label htmlFor={engine} className="flex items-center gap-1 cursor-pointer font-medium">
                        {ENGINE_INFO[engine].name}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="size-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p><strong>{ENGINE_INFO[engine].name}</strong>: {ENGINE_INFO[engine].description}</p>
                            <p className="mt-1">Estimate: ~{ENGINE_INFO[engine].estimateMs}ms per chunk{ENGINE_INFO[engine].estimateCost > 0 ? `, costs $${ENGINE_INFO[engine].estimateCost.toFixed(2)}` : ', free'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {ENGINE_INFO[engine].description}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
            {engines.length === 0 && (
              <p className="text-sm text-red-600">At least one engine is required</p>
            )}
          </div>

          {/* Smart Mode Options */}
          {mode === 'smart' && (
            <div className="space-y-3 border-t pt-4">
              <Label>Smart Mode Options</Label>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="preserve-validated"
                    checked={preserveValidated}
                    onCheckedChange={(checked) => setPreserveValidated(!!checked)}
                    disabled={processing}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="preserve-validated" className="flex items-center gap-1 cursor-pointer font-medium">
                      Preserve user-validated connections
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Keeps connections you've manually reviewed and validated. Only non-validated connections will be deleted and regenerated.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Keep connections you've manually validated
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="backup-first"
                    checked={backupFirst}
                    onCheckedChange={(checked) => setBackupFirst(!!checked)}
                    disabled={processing}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="backup-first" className="flex items-center gap-1 cursor-pointer font-medium">
                      Save backup before reprocessing
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Saves validated connections to Storage as a JSON file before making any changes. Provides extra safety for recovery.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Create Storage backup of validated connections
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Estimate */}
          {selectedDoc && engines.length > 0 && (
            <div className="flex items-start gap-2 p-4 border rounded-lg bg-muted/50">
              <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Estimated</p>
                <p className="text-sm text-muted-foreground">
                  ~{estimate.timeMinutes} minute{estimate.timeMinutes !== 1 ? 's' : ''},{' '}
                  {estimate.cost > 0 ? `$${estimate.cost.toFixed(2)}` : 'free'}
                </p>
              </div>
            </div>
          )}

          {/* Progress */}
          {currentJobId && jobs.get(currentJobId) && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{jobs.get(currentJobId)?.details || 'Processing...'}</span>
                  <span className="text-muted-foreground">{jobs.get(currentJobId)?.progress || 0}%</span>
                </div>
                <Progress value={jobs.get(currentJobId)?.progress || 0} className="h-2" />
              </div>
            </div>
          )}

          {/* Results */}
          {jobResult && !currentJobId && (
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-medium">Results</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <div className="text-lg font-bold">{jobResult.connectionsBefore || 0}</div>
                  <div className="text-sm text-muted-foreground">Connections Before</div>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-lg font-bold text-green-600">
                    {jobResult.connectionsAfter || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Connections After</div>
                </div>
              </div>

              {jobResult.validatedPreserved !== undefined && (
                <div className="p-3 border rounded-lg bg-blue-50">
                  <p className="text-sm text-blue-800">
                    <strong>{jobResult.validatedPreserved}</strong> validated connections preserved
                  </p>
                </div>
              )}

              {jobResult.byEngine && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Connections by Engine:</p>
                  {Object.entries(jobResult.byEngine).map(([engine, count]) => (
                    <div key={engine} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {ENGINE_INFO[engine as EngineType]?.name || engine}
                      </span>
                      <span className="font-medium">{count as number}</span>
                    </div>
                  ))}
                </div>
              )}

              {jobResult.backupPath && (
                <div className="p-3 border rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">
                    Backup saved: <code className="text-xs">{jobResult.backupPath}</code>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleReprocess}
                  disabled={!selectedDocId || engines.length === 0 || !!currentJobId}
                  className="flex-1"
                >
                  {currentJobId ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reprocessing...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Start Reprocessing
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Begin reprocessing connections with selected mode and engines</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMode('smart')
                    setEngines(['semantic_similarity', 'contradiction_detection', 'thematic_bridge'])
                    setPreserveValidated(true)
                    setBackupFirst(true)
                    setError(null)
                    setMessage(null)
                    setJobResult(null)
                  }}
                  disabled={!!currentJobId}
                >
                  Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reset all options to recommended defaults (Smart Mode, all engines)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && documents.length === 0 && (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            No processed documents found. Process a document first to reprocess connections.
          </p>
        </div>
      )}
      </div>
    </TooltipProvider>
  )
}
