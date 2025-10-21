'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SupabaseClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Eye, Loader2, Trash2, Pause, Play, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { deleteDocument } from '@/app/actions/delete-document'
import { exportToObsidian } from '@/app/actions/integrations'
import { continueDocumentProcessing, getJobStatus } from '@/app/actions/documents'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Document {
  id: string
  title: string
  processing_status: string
  processing_stage?: string
  review_stage?: 'docling_extraction' | 'ai_cleanup' | null
  created_at: string
  markdown_available: boolean
  embeddings_available: boolean
}

/**
 * DocumentList component displays user's documents with links to reader and preview.
 * @returns DocumentList component.
 */
export function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const { registerJob } = useBackgroundJobsStore()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    
    // Get user ID (dev mode or auth)
    const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID
    if (devUserId) {
      setUserId(devUserId)
      loadDocuments(supabase, devUserId)
    } else {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          setUserId(user.id)
          loadDocuments(supabase, user.id)
        } else {
          setLoading(false)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()

    // Subscribe to document changes (real-time)
    const channel = supabase
      .channel('document-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'documents',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        console.log('[DocumentList] Realtime update:', payload.eventType, payload.new)
        if (payload.eventType === 'INSERT') {
          setDocuments(prev => [payload.new as Document, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setDocuments(prev => prev.map(doc =>
            doc.id === (payload.new as Document).id ? payload.new as Document : doc
          ))
        } else if (payload.eventType === 'DELETE') {
          setDocuments(prev => prev.filter(doc => doc.id !== payload.old.id))
        }
      })
      .subscribe()

    // Fallback polling for processing documents (every 5 seconds)
    // In case realtime doesn't trigger for status updates
    const pollInterval = setInterval(async () => {
      const hasProcessing = documents.some(doc => doc.processing_status === 'processing')
      if (hasProcessing) {
        console.log('[DocumentList] Polling for processing updates...')
        const { data } = await supabase
          .from('documents')
          .select('id, title, processing_status, processing_stage, review_stage, created_at, markdown_available, embeddings_available')
          .eq('user_id', userId)
          .eq('processing_status', 'processing')

        if (data && data.length > 0) {
          // Check if any completed
          const completedDocs = documents.filter(doc =>
            doc.processing_status === 'processing' &&
            !data.find(d => d.id === doc.id)
          )

          if (completedDocs.length > 0) {
            console.log('[DocumentList] Documents completed, refreshing all...')
            loadDocuments(supabase, userId)
          }
        }
      }
    }, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [userId, documents])

  async function loadDocuments(supabase: SupabaseClient, userId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('documents')
      .select('id, title, processing_status, processing_stage, review_stage, created_at, markdown_available, embeddings_available')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (data) {
      setDocuments(data)
    }
    setLoading(false)
  }

  async function handleDelete(documentId: string, title: string) {
    if (!confirm(
      `⚠️ Delete "${title}"?\n\n` +
      `This will PERMANENTLY remove:\n` +
      `• Document and all chunks\n` +
      `• All annotations and highlights\n` +
      `• All flashcards\n` +
      `• All connections\n` +
      `• All storage files\n\n` +
      `This action cannot be undone!`
    )) {
      return
    }

    setDeleting(documentId)
    toast.info('Deleting document...', {
      description: 'Removing all data and files'
    })

    const result = await deleteDocument(documentId)

    if (result.success) {
      // Optimistically remove from UI immediately
      setDocuments(prev => prev.filter(doc => doc.id !== documentId))

      toast.success('Document deleted', {
        description: `"${title}" and all associated data removed`
      })

      // Refresh the list to ensure accuracy (especially for storage-only docs)
      if (userId) {
        const supabase = createClient()
        loadDocuments(supabase, userId)
      }
    } else {
      toast.error('Delete failed', {
        description: result.error || 'Unknown error'
      })
    }

    setDeleting(null)
  }

  async function openInObsidian(documentId: string) {
    try {
      setProcessing(documentId)
      toast.info('Exporting to Obsidian...', {
        description: 'Creating vault files'
      })

      const result = await exportToObsidian(documentId)

      if (!result.success) {
        throw new Error(result.error || 'Export failed')
      }

      // Note: Job-based export - URI will be in job output_data
      // For now, just show success. Real URI handling would require job polling
      toast.success('Export job created', {
        description: 'Document will be available in Obsidian shortly'
      })

      setProcessing(null)
    } catch (error) {
      setProcessing(null)
      toast.error('Failed to export to Obsidian', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  async function continueProcessing(documentId: string, skipAiCleanup: boolean = false) {
    setProcessing(documentId)

    try {
      // Start job using Server Action
      const result = await continueDocumentProcessing(documentId, skipAiCleanup)

      if (!result.success) {
        throw new Error(result.error || 'Failed to start processing')
      }

      const jobId = result.jobId

      // Register job with background-jobs store so it shows in ProcessingDock/Admin Panel
      const doc = documents.find(d => d.id === documentId)
      registerJob(jobId, 'continue_processing', {
        title: doc?.title,
        documentId
      })

      toast.info('Processing Started', {
        description: skipAiCleanup
          ? 'Chunking document (skipping AI cleanup) - this may take a few minutes'
          : 'Chunking document - this may take a few minutes'
      })

      // Poll for completion
      await pollJobStatus(jobId)

      toast.success('Processing Complete', {
        description: 'Document is ready to read'
      })

      // Refresh document list
      router.refresh()

    } catch (error) {
      toast.error('Processing Failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setProcessing(null)
    }
  }

  async function pollJobStatus(jobId: string): Promise<any> {
    const maxAttempts = 900 // 30 minutes
    const intervalMs = 2000 // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await getJobStatus(jobId)

      if (!result.success) {
        throw new Error(result.error || 'Failed to get job status')
      }

      if (result.status === 'completed') {
        return result.output_data
      }

      if (result.status === 'failed') {
        throw new Error(result.error || 'Job failed')
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new Error('Processing timeout - took too long')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" data-testid="library-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <Card data-testid="library-empty">
        <CardContent className="p-8 text-center text-muted-foreground">
          No documents yet. Upload one to get started!
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {documents.map((doc) => {
        const isCompleted = doc.processing_status === 'completed'
        const isProcessing = doc.processing_status === 'processing'
        const isFailed = doc.processing_status === 'failed'
        const isAwaitingReview = doc.processing_status === 'awaiting_manual_review'

        return (
          <Card key={doc.id} data-testid="document-card">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="truncate" data-testid="document-title">{doc.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Badge variant={
                      isCompleted ? 'default' :
                      isProcessing ? 'secondary' :
                      isFailed ? 'destructive' :
                      isAwaitingReview ? 'secondary' :
                      'outline'
                    } data-testid="status-badge">
                      {isAwaitingReview && <Pause className="h-3 w-3 mr-1" />}
                      {doc.processing_status}
                    </Badge>
                    {doc.processing_stage && (
                      <span className="text-xs">{doc.processing_stage}</span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2 ml-4">
                  {isCompleted && doc.markdown_available && (
                    <>
                      <Link href={`/documents/${doc.id}/preview`}>
                        <Button variant="outline" size="sm" data-testid="preview-button">
                          <Eye className="h-4 w-4 mr-2" />
                          Preview
                        </Button>
                      </Link>
                      <Link href={`/read/${doc.id}`}>
                        <Button size="sm" data-testid="read-button">
                          <FileText className="h-4 w-4 mr-2" />
                          Read
                        </Button>
                      </Link>
                    </>
                  )}
                  {isProcessing && (
                    <Button variant="outline" size="sm" disabled data-testid="processing-button">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing
                    </Button>
                  )}
                  {isAwaitingReview && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openInObsidian(doc.id)}
                        data-testid="review-obsidian-button"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Review in Obsidian
                      </Button>
                      {doc.review_stage === 'docling_extraction' ? (
                        // After Docling extraction: Offer two options
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => continueProcessing(doc.id, true)}
                            disabled={processing === doc.id}
                            data-testid="skip-ai-cleanup-button"
                          >
                            {processing === doc.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Skip AI Cleanup
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => continueProcessing(doc.id, false)}
                            disabled={processing === doc.id}
                            data-testid="continue-with-ai-button"
                          >
                            {processing === doc.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Continue with AI Cleanup
                          </Button>
                        </>
                      ) : (
                        // After AI cleanup: Just continue to chunking
                        <Button
                          size="sm"
                          onClick={() => continueProcessing(doc.id, false)}
                          disabled={processing === doc.id}
                          data-testid="continue-processing-button"
                        >
                          {processing === doc.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          Continue Processing
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id, doc.title)}
                    disabled={deleting === doc.id}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    data-testid="delete-button"
                  >
                    {deleting === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span data-testid="document-created">Created {new Date(doc.created_at).toLocaleDateString()}</span>
                {doc.markdown_available && (
                  <>
                    <span>•</span>
                    <span data-testid="markdown-available">✓ Markdown</span>
                  </>
                )}
                {doc.embeddings_available && (
                  <>
                    <span>•</span>
                    <span data-testid="embeddings-available">✓ Embeddings</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}