import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Poll for job completion
 * @param supabase - Supabase client
 * @param jobId - Job ID to poll
 * @param maxAttempts - Maximum polling attempts (default: 60 = 2 minutes)
 * @param intervalMs - Polling interval in ms (default: 2000 = 2s)
 */
async function pollForJobCompletion(
  supabase: any,
  jobId: string,
  maxAttempts = 60,
  intervalMs = 2000
): Promise<any> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: job } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (!job) {
      throw new Error('Job not found')
    }

    if (job.status === 'completed') {
      return job.output_data
    }

    if (job.status === 'failed') {
      throw new Error(job.last_error || 'Job failed')
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error('Job timeout - export took too long')
}

/**
 * POST /api/obsidian/export
 * Export document to Obsidian vault
 *
 * Creates background job and waits for worker to complete the export
 */
export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json()

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const devUserId = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000'

    // Create background job for obsidian export
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'obsidian-export',
        status: 'pending',
        user_id: devUserId,
        input_data: { documentId, userId: devUserId },
        max_retries: 2
      })
      .select()
      .single()

    if (jobError) {
      throw new Error(`Failed to create export job: ${jobError.message}`)
    }

    console.log(`[API] Created obsidian-export job ${job.id}`)

    // Poll for job completion (max 2 minutes)
    const result = await pollForJobCompletion(supabase, job.id, 60, 2000)

    return NextResponse.json({
      success: true,
      uri: result.uri,
      path: result.path
    })

  } catch (error) {
    console.error('[API] Obsidian export failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    )
  }
}
