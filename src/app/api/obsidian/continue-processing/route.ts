import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/obsidian/continue-processing
 * Resume chunking pipeline after manual markdown review
 *
 * Creates background job and returns immediately with jobId
 * Client should poll /api/obsidian/status/:jobId for progress
 */
export async function POST(request: NextRequest) {
  try {
    const { documentId, skipAiCleanup = false } = await request.json()

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

    // Verify document is in awaiting_manual_review status
    const { data: document } = await supabase
      .from('documents')
      .select('processing_status')
      .eq('id', documentId)
      .single()

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    if (document.processing_status !== 'awaiting_manual_review') {
      return NextResponse.json(
        { error: `Invalid document status: ${document.processing_status}. Expected: awaiting_manual_review` },
        { status: 400 }
      )
    }

    // Create background job for continue-processing
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'continue-processing',
        status: 'pending',
        user_id: devUserId,
        input_data: { documentId, userId: devUserId, skipAiCleanup },
        max_retries: 3
      })
      .select()
      .single()

    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`)
    }

    console.log(`[API] Created continue-processing job ${job.id}`)

    // Return immediately with job ID for client-side polling
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Processing started'
    })

  } catch (error) {
    console.error('[API] Continue processing failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to continue processing' },
      { status: 500 }
    )
  }
}
