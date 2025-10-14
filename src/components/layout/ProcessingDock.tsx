'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SupabaseClient } from '@supabase/supabase-js'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, CheckCircle2, XCircle, RefreshCw, X, Download, FileText, Database, Sparkles, type LucideIcon } from 'lucide-react'
import { cancelAndDeleteJob, clearCompletedJobs } from '@/app/actions/admin'

const STAGE_LABELS: Record<string, { icon: LucideIcon; label: string; substages?: Record<string, string> }> = {
  download: { 
    icon: Download, 
    label: '📥 Downloading',
    substages: {
      fetching: 'Retrieving from storage',
      complete: 'Download complete'
    }
  },
  extract: { 
    icon: Sparkles, 
    label: '🤖 AI Processing',
    substages: {
      preparing: 'Preparing document',
      reading: 'Reading text file',
      chunking: 'Breaking into semantic chunks',
      uploading: 'Uploading to Gemini',
      validating: 'Validating file',
      analyzing: 'AI analyzing document',
      complete: 'Extraction complete'
    }
  },
  save_markdown: { 
    icon: FileText, 
    label: '💾 Saving',
    substages: {
      uploading: 'Saving to storage',
      resuming: 'Resuming from checkpoint',
      complete: 'Markdown saved'
    }
  },
  embed: { 
    icon: Database, 
    label: '🧮 Embeddings',
    substages: {
      starting: 'Initializing',
      embedding: 'Generating vectors',
      storing: 'Saving to database'
    }
  },
  complete: {
    icon: CheckCircle2,
    label: '✅ Complete',
    substages: {
      done: 'All done!'
    }
  },
  reprocessing: {
    icon: RefreshCw,
    label: '🔄 Reprocessing',
    substages: {}
  },
  awaiting_manual_review: {
    icon: RefreshCw,
    label: '⏸️ Awaiting Review',
    substages: {
      waiting: 'Exported to Obsidian - edit when ready',
      ready: 'Click "Continue Processing" to resume'
    }
  },
  continue_processing: {
    icon: Sparkles,
    label: '▶️ Resuming',
    substages: {
      chunking: 'Creating semantic chunks',
      embedding: 'Generating embeddings',
      connections: 'Detecting connections'
    }
  }
}

interface Job {
  id: string
  entity_id: string
  job_type: string
  status: string
  progress: {
    percent?: number
    stage?: string
    substage?: string
    details?: string
    updated_at?: string
  }
  last_error: string | null
  input_data: {
    document_id?: string
  }
}

export function ProcessingDock() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [isClearingCompleted, setIsClearingCompleted] = useState(false)
  
  useEffect(() => {
    const supabase = createClient()
    
    // In dev mode, use hardcoded dev user ID
    const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID
    console.log('ProcessingDock: Dev user ID from env:', devUserId)
    
    if (devUserId) {
      console.log('ProcessingDock: Using dev user ID:', devUserId)
      setUserId(devUserId)
      loadInitialJobs(supabase, devUserId)
      return
    }
    
    // In production, use actual auth
    console.log('ProcessingDock: Checking auth...')
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        console.log('ProcessingDock: Using auth user ID:', user.id)
        setUserId(user.id)
        loadInitialJobs(supabase, user.id)
      } else {
        console.log('ProcessingDock: No authenticated user')
      }
    })
  }, [])
  
  useEffect(() => {
    if (!userId) return
    
    const supabase = createClient()
    
    const channel = supabase
      .channel('job-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'background_jobs',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        const job = payload.new as Job

        if (payload.eventType === 'INSERT') {
          // Deduplicate: only add if not already present (race with polling)
          setJobs(prev => {
            if (prev.some(j => j.id === job.id)) {
              return prev // Already exists, skip
            }
            return [...prev, job]
          })
        } else if (payload.eventType === 'UPDATE') {
          setJobs(prev => prev.map(j => j.id === job.id ? job : j))
        } else if (payload.eventType === 'DELETE') {
          setJobs(prev => prev.filter(j => j.id !== payload.old.id))
        }
      })
      .subscribe()
    
    // Polling fallback: Check for status updates every 5 seconds
    // This catches any updates missed by real-time subscriptions
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['pending', 'processing', 'completed', 'failed'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (data) {
        // Deduplicate by ID to prevent React key errors
        setJobs(prevJobs => {
          const jobMap = new Map(prevJobs.map(j => [j.id, j]))
          data.forEach(job => jobMap.set(job.id, job))
          return Array.from(jobMap.values())
        })
      }
    }, 5000)
    
    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [userId])
  
  async function loadInitialJobs(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'processing', 'completed', 'failed'])
      .order('created_at', { ascending: false })
      .limit(10) // Show last 10 jobs
    
    console.log('ProcessingDock: Loaded jobs for user', userId, ':', data)
    
    if (data) {
      setJobs(data)
    }
  }
  
  async function handleRetry(jobId: string) {
    const supabase = createClient()
    
    await supabase
      .from('background_jobs')
      .update({
        status: 'pending',
        retry_count: 0,
        next_retry_at: null,
        last_error: null
      })
      .eq('id', jobId)
  }
  
  async function removeJob(jobId: string) {
    const supabase = createClient()
    
    // Mark as deleting for UI feedback
    setDeletingIds(prev => new Set(prev).add(jobId))
    
    // Delete from database
    const { error } = await supabase
      .from('background_jobs')
      .delete()
      .eq('id', jobId)
    
    if (error) {
      console.error('Failed to delete job:', error)
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
      return
    }
    
    // Local state will be updated by realtime subscription
    // But update immediately for better UX
    setJobs(prev => prev.filter(j => j.id !== jobId))
    setDeletingIds(prev => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
  }
  
  async function clearCompleted() {
    setIsClearingCompleted(true)
    const result = await clearCompletedJobs()

    if (result.success) {
      setJobs(prev => prev.filter(j => j.status !== 'completed'))
    }

    setIsClearingCompleted(false)
  }

  async function handleCancelAndDelete(jobId: string) {
    // Mark as deleting for UI feedback
    setDeletingIds(prev => new Set(prev).add(jobId))

    const result = await cancelAndDeleteJob(jobId)

    if (result.success) {
      // Job will be removed by realtime subscription
      console.log('Cancelled and deleted job:', jobId)

      // Update local state immediately for better UX
      setJobs(prev => prev.filter(j => j.id !== jobId))
    }

    // Clear deleting state
    setDeletingIds(prev => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
  }
  
  const getJobTitle = (job: Job): string => {
    if (job.job_type === 'process_document') {
      const docId = job.input_data?.document_id?.slice(0, 8) || 'Unknown'
      return `Processing Document ${docId}...`
    }
    if (job.job_type === 'detect-connections') {
      const docId = job.input_data?.document_id?.slice(0, 8) || 'Unknown'
      return `Detecting Connections ${docId}...`
    }
    if (job.job_type === 'obsidian-sync') {
      return `Syncing from Obsidian`
    }
    if (job.job_type === 'obsidian-export') {
      return `Exporting to Obsidian`
    }
    return job.job_type
  }
  
  if (jobs.length === 0) return null

  const hasCompleted = jobs.some(j => j.status === 'completed')

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-background shadow-lg z-50">
        <div className="container mx-auto p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Processing Jobs</h3>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompleted}
                disabled={!hasCompleted || isClearingCompleted}
              >
                {isClearingCompleted && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Clear Completed
              </Button>
            </div>
          </div>
        
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {jobs.map(job => {
            const stage = job.progress?.stage || 'pending'
            const percent = job.progress?.percent || 0
            const stageInfo = STAGE_LABELS[stage]
            
            return (
              <Card key={job.id} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {job.status === 'processing' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : job.status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : job.status === 'failed' ? (
                      <XCircle className="h-5 w-5 text-destructive" />
                    ) : (
                      <Loader2 className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-medium truncate">{getJobTitle(job)}</p>
                      <span className="text-xs text-muted-foreground ml-2">
                        {stageInfo?.label || stage}
                      </span>
                    </div>
                    
                    {job.status === 'processing' && (
                      <div className="space-y-1">
                        {job.progress?.substage && (
                          <p className="text-xs text-muted-foreground">
                            {stageInfo?.substages?.[job.progress.substage] || job.progress.substage}
                          </p>
                        )}
                        {job.progress?.details && (
                          <p className="text-xs text-muted-foreground/70">
                            {job.progress.details}
                          </p>
                        )}
                        <Progress value={percent} className="h-2" />
                        <p className="text-xs text-muted-foreground">{percent}%</p>
                      </div>
                    )}
                    
                    {job.status === 'failed' && job.last_error && (
                      <p className="text-xs text-destructive">{job.last_error}</p>
                    )}
                    
                    {job.status === 'completed' && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-green-600">Processing complete</p>
                        {job.input_data.document_id && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => window.open(`/read/${job.input_data.document_id}`, '_blank')}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Read
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-shrink-0 flex gap-2">
                    {job.status === 'processing' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCancelAndDelete(job.id)}
                        disabled={deletingIds.has(job.id)}
                        title="Cancel and delete this job (stops within 10 seconds)"
                      >
                        {deletingIds.has(job.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {job.status === 'failed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(job.id)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    )}
                    {(job.status === 'completed' || job.status === 'failed') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeJob(job.id)}
                        disabled={deletingIds.has(job.id)}
                      >
                        {deletingIds.has(job.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}