/**
 * Zotero Import Handler
 * 
 * Imports annotations from Zotero and converts to Rhizome format.
 * Reuses Readwise import logic for fuzzy matching and ECS entity creation.
 */

import { ZoteroClient, mapZoteroColor, formatCreators, type ZoteroAnnotation } from '../lib/zotero-api-client.js'
import { importReadwiseHighlights, type ReadwiseHighlight, type ImportResults } from './readwise-import.js'
import { createClient } from '@supabase/supabase-js'

/**
 * Import annotations from Zotero for a specific document
 * 
 * @param rhizomeDocumentId - Target document in Rhizome
 * @param zoteroItemKey - Parent item key in Zotero (the PDF attachment)
 * @returns Import statistics
 */
export async function importFromZotero(
  rhizomeDocumentId: string,
  zoteroItemKey: string
): Promise<ImportResults> {
  console.log(`[Zotero Import] Starting import for Zotero item ${zoteroItemKey}`)
  
  const zotero = new ZoteroClient()
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  try {
    // 1. Fetch item metadata from Zotero
    console.log(`[Zotero Import] Fetching item metadata...`)
    const item = await zotero.getItem(zoteroItemKey)
    console.log(`[Zotero Import] Found: "${item.title}" by ${formatCreators(item.creators)}`)
    
    // 2. Fetch all annotations for this item
    console.log(`[Zotero Import] Fetching annotations...`)
    const annotations = await zotero.getAnnotations(zoteroItemKey)
    console.log(`[Zotero Import] Found ${annotations.length} annotations`)
    
    // 3. Filter to only highlights (skip note-only and images)
    const highlights = annotations.filter(a => {
      // Must be highlight type
      if (a.annotationType !== 'highlight') {
        console.log(`[Zotero Import] ⊘ Skipping ${a.annotationType}: "${a.annotationText?.slice(0, 50) || 'no text'}..."`)
        return false
      }
      
      // Must have text
      if (!a.annotationText || a.annotationText.trim().length < 10) {
        console.log(`[Zotero Import] ⊘ Skipping short/empty highlight`)
        return false
      }
      
      return true
    })
    
    console.log(`[Zotero Import] Filtered to ${highlights.length} text highlights\n`)
    
    if (highlights.length === 0) {
      console.log('[Zotero Import] No highlights to import')
      return {
        imported: 0,
        needsReview: [],
        failed: []
      }
    }
    
    // 4. Update document metadata with Zotero source info
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        metadata: {
          source: 'zotero',
          zotero_item_key: zoteroItemKey,
          zotero_title: item.title,
          zotero_creators: formatCreators(item.creators),
          total_pages: item.numPages
        }
      })
      .eq('id', rhizomeDocumentId)
    
    if (updateError) {
      console.warn('[Zotero Import] Failed to update document metadata:', updateError)
      // Continue anyway - not critical
    }
    
    // 5. Convert to ReadwiseHighlight format
    const readwiseHighlights: ReadwiseHighlight[] = highlights.map(a => ({
      text: a.annotationText,
      note: a.annotationComment || undefined,
      color: mapZoteroColor(a.annotationColor),
      location: a.annotationPageLabel ? parseInt(a.annotationPageLabel) : undefined,
      highlighted_at: a.dateAdded,
      // Store Zotero metadata
      book_id: zoteroItemKey,
      title: item.title,
      author: formatCreators(item.creators)
    }))
    
    // 6. Reuse existing Readwise import logic!
    // This handles:
    // - Exact text matching
    // - Fuzzy matching with chunk boundaries
    // - ECS entity creation
    // - import_pending table for review
    console.log('[Zotero Import] Converting to Rhizome annotations...\n')
    const results = await importReadwiseHighlights(rhizomeDocumentId, readwiseHighlights)
    
    console.log('\n[Zotero Import] Import complete!')
    console.log(`  ✓ Imported: ${results.imported}`)
    console.log(`  ? Needs Review: ${results.needsReview.length}`)
    console.log(`  ✗ Failed: ${results.failed.length}`)
    
    const total = results.imported + results.needsReview.length + results.failed.length
    if (total > 0) {
      const successRate = (results.imported / total * 100).toFixed(1)
      console.log(`  Success Rate: ${successRate}%`)
    }
    
    return results
    
  } catch (error) {
    console.error('[Zotero Import] Import failed:', error)
    throw error
  }
}

/**
 * List all items in user's Zotero library (for debugging)
 */
export async function listZoteroItems(limit = 50) {
  const zotero = new ZoteroClient()
  const items = await zotero.getAllItems(limit)
  
  console.log(`\n[Zotero] Found ${items.length} items in library:\n`)
  
  items.forEach(item => {
    console.log(`${item.key}: ${item.title}`)
    console.log(`  Type: ${item.itemType}`)
    if (item.creators.length > 0) {
      console.log(`  Authors: ${formatCreators(item.creators)}`)
    }
    if (item.numPages) {
      console.log(`  Pages: ${item.numPages}`)
    }
    console.log('')
  })
  
  return items
}