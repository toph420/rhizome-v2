import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/obsidian/sync-async
 * Async version: Create job and return immediately
 * Client polls /api/obsidian/status/:jobId for progress
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

    const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID || process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000'

    // Create background job
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'obsidian-sync',
        status: 'pending',
        user_id: devUserId,
        input_data: { documentId, userId: devUserId },
        max_retries: 3
      })
      .select()
      .single()

    if (jobError) {
      throw new Error(`Failed to create sync job: ${jobError.message}`)
    }

    console.log(`[API] Created async obsidian-sync job ${job.id}`)

    // Return immediately with job ID
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Sync started - poll /api/obsidian/status/:jobId for progress'
    })

  } catch (error) {
    console.error('[API] Obsidian sync failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
