#!/usr/bin/env node
/**
 * Diagnose why charspan search isn't activating
 *
 * Checks:
 * 1. Does docling.md exist in Storage?
 * 2. Do chunks have charspan values?
 * 3. Is charspan data valid?
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function diagnoseCharspan(documentId) {
  console.log('🔍 Diagnosing Charspan Search\n')
  console.log('Document ID:', documentId)
  console.log('─'.repeat(80))

  // 1. Check document exists
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, title, source_type, processing_status')
    .eq('id', documentId)
    .single()

  if (docError) {
    console.error('❌ Document not found:', docError.message)
    return
  }

  console.log('\n📄 Document Info:')
  console.log(`  Title: ${doc.title}`)
  console.log(`  Type: ${doc.source_type}`)
  console.log(`  Status: ${doc.processing_status}`)

  // 2. Check docling.md exists
  console.log('\n📦 Storage Check:')

  const { data: files, error: listError } = await supabase.storage
    .from('documents')
    .list(documentId)

  if (listError) {
    console.error('  ❌ Error listing files:', listError.message)
    return
  }

  const doclingFile = files?.find(f => f.name === 'docling.md')
  const cleanedFile = files?.find(f => f.name === 'cleaned.md')

  console.log(`  docling.md: ${doclingFile ? '✅ EXISTS' : '❌ MISSING'}`)
  if (doclingFile) {
    console.log(`    Size: ${(doclingFile.metadata?.size / 1024).toFixed(2)} KB`)
  }

  console.log(`  cleaned.md: ${cleanedFile ? '✅ EXISTS' : '❌ MISSING'}`)
  if (cleanedFile) {
    console.log(`    Size: ${(cleanedFile.metadata?.size / 1024).toFixed(2)} KB`)
  }

  // 3. Check chunks have charspan
  console.log('\n🧩 Chunks Check:')

  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('id, chunk_index, charspan, content')
    .eq('document_id', documentId)
    .order('chunk_index')
    .limit(10)

  if (chunksError) {
    console.error('  ❌ Error fetching chunks:', chunksError.message)
    return
  }

  const withCharspan = chunks.filter(c => c.charspan)
  const total = chunks.length
  const coverage = total > 0 ? ((withCharspan.length / total) * 100).toFixed(1) : 0

  console.log(`  Total chunks (first 10): ${total}`)
  console.log(`  With charspan: ${withCharspan.length}/${total} (${coverage}%)`)

  if (withCharspan.length > 0) {
    console.log('\n  Sample charspan values:')
    withCharspan.slice(0, 3).forEach(chunk => {
      const charspanStr = chunk.charspan ? `[${chunk.charspan[0]}, ${chunk.charspan[1]})` : 'null'
      console.log(`    Chunk ${chunk.chunk_index}: ${charspanStr}`)
      console.log(`      Content preview: "${chunk.content.substring(0, 50)}..."`)
    })
  } else {
    console.log('  ❌ No chunks have charspan data')
  }

  // 4. Verify charspan format
  if (withCharspan.length > 0) {
    console.log('\n✓ Charspan Format Check:')
    const validCharspans = withCharspan.filter(c => {
      if (!c.charspan) return false
      if (!Array.isArray(c.charspan)) return false
      if (c.charspan.length !== 2) return false
      if (typeof c.charspan[0] !== 'number') return false
      if (typeof c.charspan[1] !== 'number') return false
      if (c.charspan[0] >= c.charspan[1]) return false
      return true
    })

    console.log(`  Valid format: ${validCharspans.length}/${withCharspan.length}`)

    if (validCharspans.length < withCharspan.length) {
      console.log('  ⚠️ Some charspans have invalid format')
    }
  }

  // 5. Check if document needs reprocessing
  console.log('\n📊 Summary:')

  const issues = []

  if (!doclingFile) {
    issues.push('docling.md missing from Storage')
  }

  if (withCharspan.length === 0) {
    issues.push('Chunks missing charspan values')
  }

  if (withCharspan.length > 0 && withCharspan.length < total) {
    issues.push(`Only ${coverage}% chunks have charspan (should be 100%)`)
  }

  if (issues.length === 0) {
    console.log('  ✅ All infrastructure looks good!')
    console.log('\n💡 If charspan search still not working, check:')
    console.log('     1. Is doclingMarkdown being loaded in Reader page?')
    console.log('     2. Is it being passed to PDFViewer component?')
    console.log('     3. Is it being passed to calculateMarkdownOffsets()?')
    console.log('\n🔧 Debug in browser console:')
    console.log('     // Check if doclingMarkdown is loaded')
    console.log('     console.log(window.doclingMarkdown)')
  } else {
    console.log('  ❌ Issues found:')
    issues.forEach(issue => {
      console.log(`     • ${issue}`)
    })
    console.log('\n🔧 Fix: Reprocess document to regenerate with Phase 1A code')
    console.log('     Admin Panel → Connections → Find document → Reprocess')
  }

  console.log('\n' + '─'.repeat(80))
}

// Main
const documentId = process.argv[2]

if (!documentId) {
  console.error('Usage: node scripts/diagnose-charspan.js <document-id>')
  process.exit(1)
}

diagnoseCharspan(documentId)
