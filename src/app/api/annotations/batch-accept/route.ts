import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/annotations/batch-accept
 * Accept multiple fuzzy match suggestions at once
 *
 * Body: { matches: Array<{ componentId, suggestedMatch }> }
 *
 * Uses single supabase.upsert() for performance (not loop)
 */
export async function POST(request: NextRequest) {
  try {
    const { matches } = await request.json()

    if (!Array.isArray(matches) || matches.length === 0) {
      return NextResponse.json(
        { error: 'Matches array is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Prepare batch updates: update position data + needs_review: false
    const updates = matches.map((match) => ({
      id: match.componentId,
      data: {
        ...match.suggestedMatch,
        // Keep existing data, just update position fields
        startOffset: match.suggestedMatch.startOffset,
        endOffset: match.suggestedMatch.endOffset,
        originalText: match.suggestedMatch.text
      },
      needs_review: false,
      recovery_confidence: match.suggestedMatch.confidence,
      recovery_method: match.suggestedMatch.method,
      updated_at: new Date().toISOString()
    }))

    // OPTIMIZE: Single upsert not loop
    const { error, data } = await supabase
      .from('components')
      .upsert(updates, {
        onConflict: 'id',
        ignoreDuplicates: false
      })
      .select('id')

    if (error) {
      console.error('[API] Batch accept failed:', error)
      return NextResponse.json(
        { error: 'Failed to accept matches' },
        { status: 500 }
      )
    }

    console.log(`[API] ✅ Accepted ${data?.length || 0} annotations`)

    return NextResponse.json({
      success: true,
      updated: data?.length || 0
    })

  } catch (error) {
    console.error('[API] Batch accept error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
