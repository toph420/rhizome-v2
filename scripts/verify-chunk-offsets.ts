/**
 * Verify that chunk offsets match markdown content
 *
 * Usage: tsx scripts/verify-chunk-offsets.ts <document-id>
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

async function verifyOffsets(documentId: string) {
  console.log(`\n🔍 Verifying chunk offsets for document: ${documentId}\n`)

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

  console.log(`📄 Document: ${doc.title}`)
  console.log(`   Markdown available: ${doc.markdown_available}\n`)

  if (!doc.markdown_available) {
    console.error('❌ Markdown not available for this document')
    process.exit(1)
  }

  // Download markdown from storage
  const { data: markdownBlob, error: storageError } = await supabase.storage
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

  let totalMatches = 0
  let totalMismatches = 0

  // Verify each chunk
  for (const chunk of chunks as ChunkData[]) {
    const extracted = markdown.slice(chunk.start_offset, chunk.end_offset)
    const matches = extracted === chunk.content

    if (matches) {
      totalMatches++
    } else {
      totalMismatches++
    }

    const status = matches ? '✅' : '❌'
    const preview = extracted.slice(0, 80).replace(/\n/g, '\\n')

    console.log(`${status} Chunk ${chunk.chunk_index}`)
    console.log(`   Offsets: ${chunk.start_offset} → ${chunk.end_offset} (${chunk.end_offset - chunk.start_offset} chars)`)
    console.log(`   Matches: ${matches}`)
    console.log(`   Preview: "${preview}..."`)

    if (!matches) {
      const expectedPreview = chunk.content.slice(0, 80).replace(/\n/g, '\\n')
      console.log(`   ⚠️  EXPECTED: "${expectedPreview}..."`)
      console.log(`   Extracted length: ${extracted.length}`)
      console.log(`   Content length: ${chunk.content.length}`)
    }

    console.log('─'.repeat(80))
  }

  // Summary
  console.log(`\n📊 Summary:`)
  console.log(`   Total chunks: ${chunks.length}`)
  console.log(`   ✅ Matches: ${totalMatches}`)
  console.log(`   ❌ Mismatches: ${totalMismatches}`)
  console.log(`   Success rate: ${((totalMatches / chunks.length) * 100).toFixed(1)}%\n`)

  if (totalMismatches === 0) {
    console.log('✨ All chunk offsets are accurate! Safe to proceed with Phase 2.')
  } else {
    console.log('⚠️  Offset mismatches detected. Fix worker chunk generation before Phase 2.')
    process.exit(1)
  }
}

// Get document ID from command line
const documentId = process.argv[2]

if (!documentId) {
  console.error('Usage: tsx scripts/verify-chunk-offsets.ts <document-id>')
  console.error('Example: tsx scripts/verify-chunk-offsets.ts 3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff')
  process.exit(1)
}

verifyOffsets(documentId)
