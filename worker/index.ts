import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { processDocumentHandler } from './handlers/process-document.js'
import { detectConnectionsHandler } from './handlers/detect-connections.js'
import { syncFromObsidian } from './handlers/obsidian-sync.js'
import { reprocessDocument } from './handlers/reprocess-document.js'
import { getUserFriendlyError } from './lib/errors.js'
import { startAnnotationExportCron } from './jobs/export-annotations.js'

// ES modules compatibility: get __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from parent .env.local
config({ path: resolve(__dirname, '../.env.local') })

const JOB_HANDLERS: Record<string, (supabase: any, job: any) => Promise<void>> = {
  'process_document': processDocumentHandler,
  'detect-connections': detectConnectionsHandler,
  'reprocess-document': async (supabase: any, job: any) => {
    const { documentId } = job.input_data
    const results = await reprocessDocument(documentId, supabase)

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: results
      })
      .eq('id', job.id)
  },
  'obsidian-sync': async (supabase: any, job: any) => {
    const { documentId, userId } = job.input_data
    const result = await syncFromObsidian(documentId, userId)

    if (!result.success) {
      throw new Error(result.error || 'Sync failed')
    }

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: { changed: result.changed, recovery: result.recovery }
      })
      .eq('id', job.id)
  },
}

let isShuttingDown = false

async function processNextJob() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Query for jobs that need processing:
  // 1. pending jobs
  // 2. failed jobs ready for retry
  // 3. processing jobs that have been stuck for >30 minutes (stale)
  // Note: 30-minute timeout allows large documents (500+ pages) to complete
  // Jobs send heartbeats every 5 minutes to reset started_at timestamp
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  
  // First try to get pending or retry-ready failed jobs
  let { data: jobs, error: queryError } = await supabase
    .from('background_jobs')
    .select('*')
    .or('status.eq.pending,and(status.eq.failed,next_retry_at.lte.now())')
    .order('created_at', { ascending: true })
    .limit(1)
  
  console.log('Query for pending jobs:', { found: jobs?.length || 0, error: queryError })
  
  // If none found, look for stale processing jobs
  if (!jobs || jobs.length === 0) {
    const result = await supabase
      .from('background_jobs')
      .select('*')
      .eq('status', 'processing')
      .lt('started_at', thirtyMinutesAgo)
      .order('created_at', { ascending: true })
      .limit(1)
    jobs = result.data
  }
  
  const job = jobs && jobs.length > 0 ? jobs[0] : null

  if (!job) {
    return
  }

  const isStaleJob = job.status === 'processing'
  if (isStaleJob) {
    console.log(`⚠️  Recovering stale job ${job.id} (stuck for ${Math.round((Date.now() - new Date(job.started_at).getTime()) / 60000)} minutes)`)
  }
  
  console.log(`📋 Processing job ${job.id} (${job.job_type})`)

  await supabase
    .from('background_jobs')
    .update({ 
      status: 'processing',
      started_at: new Date().toISOString()
    })
    .eq('id', job.id)

  const handler = JOB_HANDLERS[job.job_type as keyof typeof JOB_HANDLERS]
  if (!handler) {
    console.error(`Unknown job type: ${job.job_type}`)
    await markJobFailed(supabase, job.id, 'Unknown job type')
    return
  }

  try {
    await handler(supabase, job)
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error)
    await handleJobError(supabase, job, error as Error)
  }
}

async function handleJobError(supabase: any, job: any, error: Error) {
  const isTransient = isTransientError(error)
  const canRetry = job.retry_count < job.max_retries
  const friendlyError = getUserFriendlyError(error)
  const errorMessage = error instanceof Error ? error.message : String(error)

  if (isTransient && canRetry) {
    const delayMs = 5000 * Math.pow(5, job.retry_count)
    const nextRetry = new Date(Date.now() + delayMs)

    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        retry_count: job.retry_count + 1,
        next_retry_at: nextRetry.toISOString(),
        last_error: friendlyError,
        error_message: errorMessage  // Add detailed error message for debugging
      })
      .eq('id', job.id)

    console.log(`Job ${job.id} scheduled for retry at ${nextRetry}`)
  } else {
    await markJobFailed(supabase, job.id, friendlyError, errorMessage)
  }
}

function isTransientError(error: Error): boolean {
  const transientPatterns = [
    'rate limit',
    'timeout',
    'unavailable',
    'ECONNRESET',
    '429',
    '503',
    '504'
  ]
  return transientPatterns.some(pattern => 
    error.message.toLowerCase().includes(pattern.toLowerCase())
  )
}

async function markJobFailed(supabase: any, jobId: string, error: string, errorMessage?: string) {
  await supabase
    .from('background_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      last_error: error,
      error_message: errorMessage || error  // Use detailed message if available, fallback to friendly error
    })
    .eq('id', jobId)
}

process.on('SIGINT', () => {
  console.log('\n🛑 Graceful shutdown initiated...')
  isShuttingDown = true
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Graceful shutdown initiated...')
  isShuttingDown = true
})

async function main() {
  console.log('🚀 Background worker started')

  // Start annotation export cron job (runs hourly)
  startAnnotationExportCron()
  console.log('✅ Annotation export cron started (runs hourly)')

  while (!isShuttingDown) {
    try {
      await processNextJob()
    } catch (error) {
      console.error('Worker error:', error)
    }

    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  console.log('✅ Worker shut down cleanly')
  process.exit(0)
}

main()