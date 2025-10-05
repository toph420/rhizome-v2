import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/annotations/discard
 * Discard a single annotation that failed recovery
 *
 * Body: { componentId: string }
 *
 * Marks as lost (recovery_method: 'lost', needs_review: false)
 */
export async function POST(request: NextRequest) {
  try {
    const { componentId } = await request.json()

    if (!componentId) {
      return NextResponse.json(
        { error: 'componentId is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Mark annotation as lost (don't delete - user might want to see what was lost)
    const { error } = await supabase
      .from('components')
      .update({
        recovery_method: 'lost',
        recovery_confidence: 0.0,
        needs_review: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', componentId)

    if (error) {
      console.error('[API] Failed to discard annotation:', error)
      return NextResponse.json(
        { error: 'Failed to discard annotation' },
        { status: 500 }
      )
    }

    console.log(`[API] ✅ Discarded annotation ${componentId}`)

    return NextResponse.json({
      success: true,
      componentId
    })

  } catch (error) {
    console.error('[API] Discard error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
