#!/usr/bin/env node
/**
 * Check if docling.md files exist in Storage for recent documents
 * Usage: node scripts/check-docling-files.js [document_id]
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDoclingFiles(documentId) {
  // Get document info
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, title, source_type, created_at')
    .eq('id', documentId)
    .single()

  if (docError) {
    console.error('Document not found:', docError)
    return
  }

  console.log('\n📄 Document Info:')
  console.log(`  ID: ${doc.id}`)
  console.log(`  Title: ${doc.title}`)
  console.log(`  Type: ${doc.source_type}`)
  console.log(`  Created: ${new Date(doc.created_at).toLocaleString()}`)

  // Check for docling.md in Storage
  const storagePath = `${doc.id}/docling.md`

  console.log('\n🔍 Checking Storage:')
  console.log(`  Path: documents/${storagePath}`)

  const { data: files, error: listError } = await supabase.storage
    .from('documents')
    .list(doc.id, {
      search: 'docling.md'
    })

  if (listError) {
    console.error('  ❌ Error checking Storage:', listError)
    return
  }

  const doclingFile = files?.find(f => f.name === 'docling.md')

  if (doclingFile) {
    console.log('  ✅ docling.md EXISTS')
    console.log(`  Size: ${(doclingFile.metadata?.size / 1024).toFixed(2)} KB`)
    console.log(`  Updated: ${new Date(doclingFile.updated_at).toLocaleString()}`)
  } else {
    console.log('  ❌ docling.md NOT FOUND')
    console.log('  Available files:', files?.map(f => f.name).join(', ') || 'none')
  }
}

async function checkRecentDocuments() {
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, title, source_type, created_at')
    .eq('source_type', 'pdf')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error fetching documents:', error)
    return
  }

  console.log('\n📚 Recent PDF Documents:')
  console.log('─'.repeat(80))

  for (const doc of docs) {
    const { data: files } = await supabase.storage
      .from('documents')
      .list(doc.id, { search: 'docling.md' })

    const hasDocling = files?.some(f => f.name === 'docling.md')

    console.log(`${hasDocling ? '✅' : '❌'} ${doc.title}`)
    console.log(`   ID: ${doc.id}`)
    console.log(`   Created: ${new Date(doc.created_at).toLocaleString()}`)
    console.log()
  }
}

// Main
const documentId = process.argv[2]

if (documentId) {
  checkDoclingFiles(documentId)
} else {
  console.log('Checking recent PDF documents...\n')
  checkRecentDocuments()
}
