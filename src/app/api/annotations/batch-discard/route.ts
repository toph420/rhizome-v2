import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/annotations/batch-discard
 * Discard multiple annotations that failed recovery
 *
 * Body: { componentIds: string[] }
 *
 * Uses batch delete for performance
 */
export async function POST(request: NextRequest) {
  try {
    const { componentIds } = await request.json()

    if (!Array.isArray(componentIds) || componentIds.length === 0) {
      return NextResponse.json(
        { error: 'Component IDs array is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Batch delete using .in()
    const { error, data } = await supabase
      .from('components')
      .delete()
      .in('id', componentIds)
      .select('id')

    if (error) {
      console.error('[API] Batch discard failed:', error)
      return NextResponse.json(
        { error: 'Failed to discard annotations' },
        { status: 500 }
      )
    }

    console.log(`[API] ✅ Discarded ${data?.length || 0} annotations`)

    return NextResponse.json({
      success: true,
      deleted: data?.length || 0
    })

  } catch (error) {
    console.error('[API] Batch discard error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
