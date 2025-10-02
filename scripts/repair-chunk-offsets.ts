/**
 * Repair chunk offsets using fuzzy matching
 *
 * Finds where each chunk's content actually appears in the markdown
 * and updates the database with correct offsets.
 *
 * Usage: tsx scripts/repair-chunk-offsets.ts <document-id>
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface ChunkData {
  id: string
  chunk_index: number
  content: string
  start_offset: number
  end_offset: number
}

/**
 * Find where content appears in markdown using fuzzy matching
 */
function findContentOffset(markdown: string, content: string, searchStartHint: number = 0): {
  start: number
  end: number
  confidence: 'exact' | 'fuzzy' | 'failed'
} {
  // Try 1: Exact match
  const exactIndex = markdown.indexOf(content, searchStartHint)
  if (exactIndex !== -1) {
    return {
      start: exactIndex,
      end: exactIndex + content.length,
      confidence: 'exact'
    }
  }

  // Try 2: Fuzzy match (trimmed, normalized whitespace)
  const normalizedContent = content.trim().replace(/\s+/g, ' ')
  const normalizedMarkdown = markdown.replace(/\s+/g, ' ')

  const fuzzyIndex = normalizedMarkdown.indexOf(normalizedContent, searchStartHint)
  if (fuzzyIndex !== -1) {
    // Map back to original markdown position
    let originalIndex = 0
    let normalizedIndex = 0

    while (normalizedIndex < fuzzyIndex && originalIndex < markdown.length) {
      if (/\s/.test(markdown[originalIndex])) {
        originalIndex++
        if (/\s/.test(normalizedMarkdown[normalizedIndex])) {
          normalizedIndex++
        }
      } else {
        originalIndex++
        normalizedIndex++
      }
    }

    return {
      start: originalIndex,
      end: originalIndex + content.length,
      confidence: 'fuzzy'
    }
  }

  // Try 3: First 100 and last 100 chars (for chunks with minor differences)
  const contentStart = content.slice(0, 100).trim()
  const contentEnd = content.slice(-100).trim()

  const startIndex = markdown.indexOf(contentStart, searchStartHint)
  if (startIndex !== -1) {
    const endIndex = markdown.indexOf(contentEnd, startIndex)
    if (endIndex !== -1) {
      return {
        start: startIndex,
        end: endIndex + contentEnd.length,
        confidence: 'fuzzy'
      }
    }
  }

  return {
    start: -1,
    end: -1,
    confidence: 'failed'
  }
}

async function repairOffsets(documentId: string, dryRun: boolean = false) {
  console.log(`\n🔧 Repairing chunk offsets for document: ${documentId}`)
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}\n`)

  // Get document
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, title, storage_path, markdown_available')
    .eq('id', documentId)
    .single()

  if (docError || !doc) {
    console.error('❌ Document not found:', docError?.message)
    process.exit(1)
  }

  console.log(`📄 Document: ${doc.title}\n`)

  // Download markdown
  const { data: markdownBlob, error: storageError} = await supabase.storage
    .from('documents')
    .download(`${doc.storage_path}/content.md`)

  if (storageError || !markdownBlob) {
    console.error('❌ Failed to download markdown:', storageError?.message)
    process.exit(1)
  }

  const markdown = await markdownBlob.text()
  console.log(`📏 Markdown length: ${markdown.length} characters\n`)

  // Get chunks
  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('id, chunk_index, content, start_offset, end_offset')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })

  if (chunksError || !chunks) {
    console.error('❌ Failed to load chunks:', chunksError?.message)
    process.exit(1)
  }

  console.log(`📦 Found ${chunks.length} chunks\n`)
  console.log('─'.repeat(80))

  let repaired = 0
  let exact = 0
  let fuzzy = 0
  let failed = 0
  let searchHint = 0 // Hint for sequential search optimization

  // Process chunks sequentially (they should be in document order)
  for (const chunk of chunks as ChunkData[]) {
    const match = findContentOffset(markdown, chunk.content, searchHint)

    if (match.confidence === 'failed') {
      console.log(`❌ Chunk ${chunk.chunk_index}: Could not find content in markdown`)
      console.log(`   Content preview: "${chunk.content.slice(0, 80)}..."`)
      console.log(`   Tried search hint: ${searchHint}`)
      failed++
      console.log('─'.repeat(80))
      continue
    }

    const wasCorrect = match.start === chunk.start_offset && match.end === chunk.end_offset
    const statusIcon = wasCorrect ? '✅' : '🔧'
    const confidenceIcon = match.confidence === 'exact' ? '🎯' : '🔍'

    console.log(`${statusIcon} Chunk ${chunk.chunk_index} ${confidenceIcon} ${match.confidence.toUpperCase()}`)
    console.log(`   Old offsets: ${chunk.start_offset} → ${chunk.end_offset} (span: ${chunk.end_offset - chunk.start_offset})`)
    console.log(`   New offsets: ${match.start} → ${match.end} (span: ${match.end - match.start})`)
    console.log(`   Content length: ${chunk.content.length}`)

    if (!wasCorrect) {
      repaired++
      if (match.confidence === 'exact') exact++
      if (match.confidence === 'fuzzy') fuzzy++

      // Update database
      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('chunks')
          .update({
            start_offset: match.start,
            end_offset: match.end
          })
          .eq('id', chunk.id)

        if (updateError) {
          console.error(`   ❌ Failed to update: ${updateError.message}`)
        } else {
          console.log(`   ✅ Updated in database`)
        }
      } else {
        console.log(`   ℹ️  Would update (dry run mode)`)
      }
    }

    // Update search hint for next chunk (start after this chunk ends)
    searchHint = match.end

    console.log('─'.repeat(80))
  }

  // Summary
  console.log(`\n📊 Summary:`)
  console.log(`   Total chunks: ${chunks.length}`)
  console.log(`   🔧 Repaired: ${repaired}`)
  console.log(`   🎯 Exact matches: ${exact}`)
  console.log(`   🔍 Fuzzy matches: ${fuzzy}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   Success rate: ${(((chunks.length - failed) / chunks.length) * 100).toFixed(1)}%\n`)

  if (failed > 0) {
    console.log('⚠️  Some chunks could not be matched. Manual review needed.')
    if (!dryRun) {
      console.log('   Run verification script to see which chunks are still broken.')
    }
  } else if (repaired > 0) {
    console.log(`✨ Successfully repaired ${repaired} chunk offsets!`)
    if (dryRun) {
      console.log('   Re-run without --dry-run to apply changes.')
    } else {
      console.log('   Run verification script to confirm all offsets are now accurate.')
    }
  } else {
    console.log('✨ All chunk offsets were already accurate!')
  }
}

// Get document ID and mode from command line
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const documentId = args.find(arg => !arg.startsWith('--'))

if (!documentId) {
  console.error('Usage: tsx scripts/repair-chunk-offsets.ts <document-id> [--dry-run]')
  console.error('Example: tsx scripts/repair-chunk-offsets.ts 3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff')
  console.error('         tsx scripts/repair-chunk-offsets.ts 3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff --dry-run')
  process.exit(1)
}

repairOffsets(documentId, dryRun)
