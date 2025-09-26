'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProcessingStore } from '@/stores/processing-store'
import { retryProcessing } from '@/app/actions/documents'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, XCircle, RefreshCw, X } from 'lucide-react'

/**
 * Bottom dock showing document processing status with real-time updates.
 * Subscribes to Supabase Realtime for processing status changes.
 * @returns Processing dock component.
 */
export function ProcessingDock() {
  const { jobs, addJob, updateJob, removeJob, clearCompleted } = useProcessingStore()
  
  useEffect(() => {
    const supabase = createClient()
    
    const channel = supabase
      .channel('document-processing')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents'
        },
        (payload) => {
          const doc = payload.new as Record<string, unknown>
          
          const existingJob = jobs.find(j => j.documentId === doc.id)
          
          if (existingJob) {
            updateJob(existingJob.id, {
              status: doc.processing_status,
              error: doc.processing_error,
              completedAt: doc.processing_completed_at ? new Date(doc.processing_completed_at) : undefined
            })
          } else if (doc.processing_status === 'processing' || doc.processing_status === 'embedding') {
            addJob({
              id: crypto.randomUUID(),
              documentId: doc.id,
              title: doc.title,
              status: doc.processing_status,
              progress: 0,
              startedAt: new Date(doc.processing_started_at)
            })
          }
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobs, addJob, updateJob])
  
  /**
   * Handles retry for failed processing jobs.
   * @param documentId - Document ID to retry.
   */
  const handleRetry = async (documentId: string) => {
    await retryProcessing(documentId)
  }
  
  if (jobs.length === 0) return null
  
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-background shadow-lg">
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Processing Documents</h3>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCompleted}
              disabled={!jobs.some(j => j.status === 'completed')}
            >
              Clear Completed
            </Button>
          </div>
        </div>
        
        <div className="space-y-2">
          {jobs.map(job => (
            <Card key={job.id} className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {job.status === 'processing' || job.status === 'embedding' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : job.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : job.status === 'failed' ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : null}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{job.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.status === 'processing' && 'Extracting content...'}
                    {job.status === 'embedding' && 'Generating embeddings...'}
                    {job.status === 'completed' && 'Processing complete'}
                    {job.status === 'failed' && (job.error || 'Processing failed')}
                  </p>
                </div>
                
                <div className="flex-shrink-0 flex gap-2">
                  {job.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry(job.documentId)}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Retry
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeJob(job.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}