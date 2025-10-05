import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/obsidian/sync
 * Sync document from Obsidian vault with annotation recovery
 *
 * Note: The actual sync logic (file system access) lives in worker/handlers/obsidian-sync.ts
 * This API route creates a background job that the worker will process
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

    // Create background job for obsidian sync
    // The worker will pick this up and run the actual sync logic
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'obsidian-sync',
        status: 'pending',
        input_data: { documentId, userId: 'dev-user-123' },
        max_retries: 3
      })
      .select()
      .single()

    if (jobError) {
      throw new Error(`Failed to create sync job: ${jobError.message}`)
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Sync job created. Worker will process the Obsidian sync.'
    })

  } catch (error) {
    console.error('[API] Obsidian sync failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
