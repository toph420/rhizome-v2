import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { appendFileSync } from 'fs'
import { processDocumentHandler } from './handlers/process-document.js'
import { detectConnectionsHandler } from './handlers/detect-connections.js'
import { syncFromObsidian, exportToObsidian } from './handlers/obsidian-sync.js'
import { reprocessDocument } from './handlers/reprocess-document.js'
import { continueProcessing } from './handlers/continue-processing.js'
import { importDocumentHandler } from './handlers/import-document.js'
import { reprocessConnectionsHandler } from './handlers/reprocess-connections.js'
import { exportDocumentHandler } from './handlers/export-document.js'
import { importReadwiseHighlights } from './handlers/readwise-import.js'
import { scanVaultHandler } from './handlers/scan-vault.js'
import { importFromVaultHandler } from './handlers/import-from-vault.js'
import { getUserFriendlyError } from './lib/errors.js'
import { startAnnotationExportCron } from './jobs/export-annotations.js'
import { retryLoop, classifyError, recordJobFailure } from './lib/retry-manager.js'
import { engineRegistry } from './engines/engine-registry.js'
import { registerAllEngines } from './engines/adapters.js'

// ES modules compatibility: get __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from parent .env.local
config({ path: resolve(__dirname, '../.env.local') })

// File logging setup
const LOG_FILE = resolve(__dirname, 'worker.log')
const originalConsoleLog = console.log
console.log = function(...args: any[]) {
  const timestamp = new Date().toISOString()
  const message = `[${timestamp}] ${args.join(' ')}\n`
  try {
    appendFileSync(LOG_FILE, message)
  } catch (e) {
    // Ignore file write errors
  }
  originalConsoleLog.apply(console, args)
}

const JOB_HANDLERS: Record<string, (supabase: any, job: any) => Promise<void>> = {
  'process_document': processDocumentHandler,
  'detect_connections': detectConnectionsHandler,
  'import_document': importDocumentHandler,
  'reprocess_connections': reprocessConnectionsHandler,
  'export_documents': exportDocumentHandler,
  'reprocess_document': async (supabase: any, job: any) => {
    const { documentId } = job.input_data
    const results = await reprocessDocument(documentId, supabase, job.id)  // Pass jobId for progress tracking

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: results,
        progress: { percent: 100, stage: 'complete', details: 'Reprocessing complete' }  // Ensure final progress is 100%
      })
      .eq('id', job.id)
  },
  'obsidian_export': async (supabase: any, job: any) => {
    const { documentId, userId } = job.input_data
    const result = await exportToObsidian(documentId, userId)

    if (!result.success) {
      throw new Error(result.error || 'Export failed')
    }

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: { uri: result.uri, path: result.path }
      })
      .eq('id', job.id)
  },
  'obsidian_sync': async (supabase: any, job: any) => {
    const { documentId, userId } = job.input_data
    const result = await syncFromObsidian(documentId, userId, job.id)  // Pass jobId for progress tracking

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
  'readwise_import': async (supabase: any, job: any) => {
    const { documentId, readwiseData } = job.input_data
    const results = await importReadwiseHighlights(documentId, readwiseData)

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: {
          imported: results.imported,
          needsReview: results.needsReview.length,
          failed: results.failed.length
        }
      })
      .eq('id', job.id)
  },
  'scan_vault': scanVaultHandler,
  'import_from_vault': importFromVaultHandler,
  'continue_processing': async (supabase: any, job: any) => {
    const { documentId, userId } = job.input_data
    const skipAiCleanup = (job.input_data as any).skipAiCleanup || false
    const chunkerStrategy = (job.input_data as any).chunkerStrategy || 'recursive'
    const result = await continueProcessing(documentId, userId, job.id, skipAiCleanup, chunkerStrategy)  // Pass jobId for progress tracking

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: { chunksCreated: result.chunksCreated },
        progress: { percent: 100, stage: 'complete', details: 'Chunking complete' }
      })
      .eq('id', job.id)
  },
  'export_vault_sparks': async (supabase: any, job: any) => {
    const { userId, vaultPath } = job.input_data

    const { exportSparksToVault } = await import('./lib/vault-export-sparks.js')
    const result = await exportSparksToVault(userId, vaultPath, supabase)

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: {
          success: true,
          sparksExported: result.exported,
          location: 'Rhizome/Sparks/'
        }
      })
      .eq('id', job.id)
  },
  'import_vault_sparks': async (supabase: any, job: any) => {
    const { userId, vaultPath } = job.input_data

    const { importSparksFromVault } = await import('./lib/vault-import-sparks.js')
    const result = await importSparksFromVault(vaultPath, userId, supabase)

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: {
          success: true,
          sparksImported: result.imported,
          errors: result.errors,
          location: 'Rhizome/Sparks/'
        }
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
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Check if job was cancelled
    if (errorMessage.includes('cancelled')) {
      console.log(`Job ${job.id} was cancelled - deleting job`)
      await supabase
        .from('background_jobs')
        .delete()
        .eq('id', job.id)
      return
    }

    console.error(`Job ${job.id} failed:`, error)
    await handleJobError(supabase, job, error as Error)
  }
}

async function handleJobError(supabase: any, job: any, error: Error) {
  // Use new retry manager for better error classification
  await recordJobFailure(supabase, job.id, error)
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

  // Initialize engine registry
  registerAllEngines(engineRegistry)
  console.log('✅ Engine registry initialized')

  // Start annotation export cron job (runs hourly)
  startAnnotationExportCron()
  console.log('✅ Annotation export cron started (runs hourly)')

  // Initialize retry loop counter (runs every 30s = 6 iterations * 5s)
  let retryLoopCounter = 0

  // Create Supabase client for retry loop
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  while (!isShuttingDown) {
    try {
      await processNextJob()
    } catch (error) {
      console.error('Worker error:', error)
    }

    // Check for retry-eligible jobs every 30 seconds
    retryLoopCounter++
    if (retryLoopCounter >= 6) {
      try {
        await retryLoop(supabase)
      } catch (error) {
        console.error('[RetryLoop] Error in retry loop:', error)
      }
      retryLoopCounter = 0
    }

    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  console.log('✅ Worker shut down cleanly')
  process.exit(0)
}

main()