import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/obsidian/export
 * Export document to Obsidian vault
 *
 * Note: This is a placeholder for the Obsidian export functionality.
 * The actual implementation will be done when Obsidian integration is fully set up.
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

    // Get document info
    const { data: doc } = await supabase
      .from('documents')
      .select('title, markdown_path')
      .eq('id', documentId)
      .single()

    if (!doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Generate Obsidian URI
    // Format: obsidian://advanced-uri?vault=VaultName&filepath=path/to/file.md
    const vaultName = 'Tophs Vault' // TODO: Get from user settings
    const filePath = `rhizome/${doc.title}.md`
    const uri = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&filepath=${encodeURIComponent(filePath)}`

    return NextResponse.json({
      success: true,
      uri,
      path: filePath
    })

  } catch (error) {
    console.error('[API] Obsidian export failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    )
  }
}
