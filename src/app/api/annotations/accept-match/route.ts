import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/annotations/accept-match
 * Accept a single fuzzy match suggestion
 *
 * Body: { componentId: string, suggestedMatch: FuzzyMatchResult }
 *
 * Uses read-merge-write pattern to preserve existing data (same as recover-annotations.ts)
 */
export async function POST(request: NextRequest) {
  try {
    const { componentId, suggestedMatch } = await request.json()

    if (!componentId || !suggestedMatch) {
      return NextResponse.json(
        { error: 'componentId and suggestedMatch are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 1. Fetch current component data for merging (read-merge-write pattern)
    const { data: component, error: fetchError } = await supabase
      .from('components')
      .select('data, chunk_ids')
      .eq('id', componentId)
      .single()

    if (fetchError || !component) {
      console.error('[API] Failed to fetch component:', fetchError)
      return NextResponse.json(
        { error: 'Component not found' },
        { status: 404 }
      )
    }

    // 2. Merge suggested match into existing data
    const updatedData = {
      ...component.data,
      startOffset: suggestedMatch.startOffset,
      endOffset: suggestedMatch.endOffset,
      originalText: suggestedMatch.text,
      textContext: {
        before: suggestedMatch.contextBefore || '',
        after: suggestedMatch.contextAfter || ''
      }
    }

    // 3. Calculate overlapping chunks for multi-chunk annotations
    // (This would require passing newChunks, but for now we'll skip this
    // as it's handled during recovery. Manual accept doesn't need to recalculate.)

    // 4. Update component with merged data + recovery metadata
    const { error: updateError } = await supabase
      .from('components')
      .update({
        data: updatedData,
        needs_review: false,
        recovery_confidence: suggestedMatch.confidence,
        recovery_method: suggestedMatch.method,
        updated_at: new Date().toISOString()
      })
      .eq('id', componentId)

    if (updateError) {
      console.error('[API] Failed to update component:', updateError)
      return NextResponse.json(
        { error: 'Failed to accept match' },
        { status: 500 }
      )
    }

    console.log(`[API] ✅ Accepted annotation ${componentId} (${(suggestedMatch.confidence * 100).toFixed(1)}%)`)

    return NextResponse.json({
      success: true,
      componentId
    })

  } catch (error) {
    console.error('[API] Accept match error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
