import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/connections/for-chunks
 *
 * Fetches connections for given chunk IDs.
 * Used by ReaderLayout to load connections when visible chunks change.
 *
 * Request body:
 * {
 *   chunkIds: string[]  // Array of chunk UUIDs
 * }
 *
 * Returns array of connections with metadata:
 * [
 *   {
 *     id: string
 *     source_chunk_id: string
 *     target_chunk_id: string
 *     connection_type: 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'
 *     strength: number (0-1)
 *     metadata: {
 *       explanation?: string
 *       target_document_title?: string
 *       target_snippet?: string
 *     }
 *   }
 * ]
 */
export async function POST(request: Request) {
  try {
    const { chunkIds } = await request.json()

    if (!chunkIds || !Array.isArray(chunkIds) || chunkIds.length === 0) {
      return NextResponse.json(
        { error: 'chunkIds array is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Query connections where source_chunk_id is in the visible chunks
    // Include target chunk metadata for display
    const { data: connections, error } = await supabase
      .from('connections')
      .select(`
        id,
        source_chunk_id,
        target_chunk_id,
        connection_type,
        strength,
        metadata,
        target_chunk:chunks!target_chunk_id (
          id,
          content,
          summary,
          document:documents!inner (
            id,
            title
          )
        )
      `)
      .in('source_chunk_id', chunkIds)
      .gte('strength', 0.5) // Only show decent connections
      .order('strength', { ascending: false })
      .limit(100) // Prevent overwhelming UI

    if (error) {
      console.error('[API] Failed to fetch connections:', error)
      return NextResponse.json(
        { error: 'Failed to fetch connections' },
        { status: 500 }
      )
    }

    // Transform to include target document info in metadata
    const enrichedConnections = connections?.map(conn => {
      // Supabase returns target_chunk as object (single relation)
      const targetChunk = conn.target_chunk as any
      const targetDoc = targetChunk?.document as any

      return {
        id: conn.id,
        source_chunk_id: conn.source_chunk_id,
        target_chunk_id: conn.target_chunk_id,
        connection_type: conn.connection_type,
        strength: conn.strength,
        metadata: {
          ...conn.metadata,
          target_document_title: targetDoc?.title,
          target_snippet: targetChunk?.summary || targetChunk?.content?.slice(0, 200)
        }
      }
    }) || []

    return NextResponse.json(enrichedConnections)

  } catch (error) {
    console.error('[API] Unexpected error fetching connections:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
