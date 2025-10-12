#!/usr/bin/env tsx
/**
 * Validate Chunk Matching for Local Pipeline
 * Checks that all Docling chunks were successfully matched
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function validateChunkMatching(documentId: string) {
  console.log(`\n📊 Validating chunk matching for document: ${documentId}\n`)

  // 1. Get document info
  const { data: doc } = await supabase
    .from('documents')
    .select('title, source_type, processing_status')
    .eq('id', documentId)
    .single()

  if (!doc) {
    console.error('❌ Document not found')
    process.exit(1)
  }

  console.log(`📄 Document: ${doc.title}`)
  console.log(`📁 Type: ${doc.source_type}`)
  console.log(`✓ Status: ${doc.processing_status}\n`)

  // 2. Get all chunks
  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('chunk_index')

  if (chunksError || !chunks) {
    console.error('❌ Failed to fetch chunks:', chunksError?.message)
    process.exit(1)
  }

  console.log(`✅ Found ${chunks.length} chunks in database\n`)

  // 3. Get background job metadata (contains Docling chunks count)
  const { data: jobs } = await supabase
    .from('background_jobs')
    .select('metadata')
    .eq('entity_id', documentId)
    .eq('job_type', 'process_document')
    .order('created_at', { ascending: false })
    .limit(1)

  const doclingChunksCount = jobs?.[0]?.metadata?.cached_extraction?.doclingChunks?.length || 0

  if (doclingChunksCount > 0) {
    console.log(`🔍 Docling extracted: ${doclingChunksCount} chunks`)
    console.log(`💾 Database contains: ${chunks.length} chunks`)

    if (chunks.length === doclingChunksCount) {
      console.log(`✅ MATCH: All Docling chunks were successfully matched!\n`)
    } else {
      console.log(`⚠️  MISMATCH: ${doclingChunksCount - chunks.length} chunks may be missing\n`)
    }
  }

  // 4. Analyze chunk quality
  const chunksByConfidence = chunks.reduce((acc, chunk) => {
    const conf = chunk.position_confidence || 'unknown'
    acc[conf] = (acc[conf] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log(`📊 Chunk Quality Distribution:`)
  Object.entries(chunksByConfidence)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([confidence, count]) => {
      const emoji = confidence === 'exact' ? '🎯' :
                    confidence === 'high' ? '✅' :
                    confidence === 'medium' ? '📍' :
                    confidence === 'synthetic' ? '⚠️' : '❓'
      const percentage = ((count / chunks.length) * 100).toFixed(1)
      console.log(`  ${emoji} ${confidence.padEnd(10)} ${count}/${chunks.length} (${percentage}%)`)
    })

  // 5. Check for synthetic chunks (needs validation)
  const syntheticChunks = chunks.filter(c => c.position_confidence === 'synthetic')
  if (syntheticChunks.length > 0) {
    console.log(`\n⚠️  Warning: ${syntheticChunks.length} synthetic chunks need user validation`)
    console.log(`   These chunks have interpolated positions and should be reviewed`)
  }

  // 6. Check chunk sizes
  const avgWordCount = chunks.reduce((sum, c) => sum + (c.word_count || 0), 0) / chunks.length
  const minWordCount = Math.min(...chunks.map(c => c.word_count || 0))
  const maxWordCount = Math.max(...chunks.map(c => c.word_count || 0))

  console.log(`\n📏 Chunk Size Statistics:`)
  console.log(`  Average: ${Math.round(avgWordCount)} words`)
  console.log(`  Range: ${minWordCount} - ${maxWordCount} words`)

  // 7. Check metadata extraction
  const chunksWithMetadata = chunks.filter(c => c.metadata_extracted_at !== null)
  console.log(`\n🏷️  Metadata Extraction:`)
  console.log(`  Enriched: ${chunksWithMetadata.length}/${chunks.length} chunks`)

  const hasEmbeddings = chunks.filter(c => c.embedding !== null).length
  console.log(`\n🧮 Embeddings:`)
  console.log(`  Generated: ${hasEmbeddings}/${chunks.length} chunks`)

  // 8. Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📋 VALIDATION SUMMARY`)
  console.log('='.repeat(60))

  const exactMatchRate = ((chunksByConfidence['exact'] || 0) / chunks.length * 100).toFixed(1)
  const syntheticRate = ((chunksByConfidence['synthetic'] || 0) / chunks.length * 100).toFixed(1)

  console.log(`✅ Total chunks: ${chunks.length}`)
  console.log(`🎯 Exact matches: ${exactMatchRate}%`)
  console.log(`⚠️  Synthetic: ${syntheticRate}%`)
  console.log(`🏷️  Metadata: ${chunksWithMetadata.length} chunks`)
  console.log(`🧮 Embeddings: ${hasEmbeddings} chunks`)

  if (doclingChunksCount > 0 && chunks.length === doclingChunksCount) {
    console.log(`\n🎉 SUCCESS: 100% chunk recovery achieved!`)
  } else if (doclingChunksCount > 0) {
    console.log(`\n⚠️  WARNING: Chunk count mismatch detected`)
  }

  console.log(`\n`)
}

// Get document ID from command line
const documentId = process.argv[2]

if (!documentId) {
  console.error('Usage: npx tsx validate-chunk-matching.ts <document-id>')
  process.exit(1)
}

validateChunkMatching(documentId).catch(console.error)
