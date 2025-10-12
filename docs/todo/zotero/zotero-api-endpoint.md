/**
 * API Endpoint: Import Zotero Annotations
 * 
 * POST /api/documents/[id]/import-zotero
 * 
 * Triggers Zotero import for a document.
 * User provides Zotero item key via request body.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { importFromZotero } from '@/workers/handlers/zotero-import'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id
    const body = await request.json()
    const { zoteroItemKey } = body
    
    if (!zoteroItemKey) {
      return NextResponse.json(
        { error: 'zoteroItemKey is required' },
        { status: 400 }
      )
    }
    
    console.log(`[API] Zotero import requested for document ${documentId}`)
    console.log(`[API] Zotero item key: ${zoteroItemKey}`)
    
    // Verify document exists
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title')
      .eq('id', documentId)
      .single()
    
    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }
    
    // Trigger import
    const results = await importFromZotero(documentId, zoteroItemKey)
    
    return NextResponse.json({
      success: true,
      results: {
        imported: results.imported,
        needsReview: results.needsReview.length,
        failed: results.failed.length,
        // Include review items for frontend display
        reviewItems: results.needsReview.map(item => ({
          text: item.highlight.text.slice(0, 100),
          confidence: item.confidence,
          suggestedPosition: item.suggestedMatch.startOffset
        })),
        failedItems: results.failed.map(item => ({
          text: item.highlight.text.slice(0, 100),
          reason: item.reason
        }))
      }
    })
    
  } catch (error) {
    console.error('[API] Zotero import failed:', error)
    
    return NextResponse.json(
      {
        error: 'Import failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/documents/[id]/import-zotero
 * 
 * Check if document has Zotero metadata (for showing sync button state)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data: document, error } = await supabase
      .from('documents')
      .select('metadata')
      .eq('id', documentId)
      .single()
    
    if (error || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }
    
    const metadata = document.metadata as any
    const hasZoteroSource = metadata?.source === 'zotero'
    
    return NextResponse.json({
      hasZoteroMetadata: hasZoteroSource,
      zoteroItemKey: metadata?.zotero_item_key || null,
      zoteroTitle: metadata?.zotero_title || null
    })
    
  } catch (error) {
    console.error('[API] Failed to check Zotero metadata:', error)
    
    return NextResponse.json(
      { error: 'Failed to check metadata' },
      { status: 500 }
    )
  }
}