#!/usr/bin/env tsx

/**
 * Test Script for Storage Scanner (T-009)
 *
 * Tests the scanStorage() Server Action against real Supabase data.
 *
 * Usage:
 *   npx tsx scripts/test-scan-storage.ts
 *
 * Prerequisites:
 *   - Supabase running locally (npx supabase start)
 *   - At least 1 processed document for testing
 */

import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client (service role for testing)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Test user ID (from dev environment)
const TEST_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000000'

/**
 * Inline implementation of scanStorage for testing
 * (mirrors the Server Action implementation)
 */
async function testScanStorage() {
  try {
    console.log(`\n📊 Testing Storage Scanner for user: ${TEST_USER_ID}\n`)

    // Step 1: List all document folders in Storage
    const { data: storageFolders, error: storageError } = await supabase.storage
      .from('documents')
      .list(TEST_USER_ID, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      })

    if (storageError) {
      console.error('❌ Storage list error:', storageError)
      return
    }

    // Step 2: Get all documents from Database
    const { data: dbDocuments, error: dbError } = await supabase
      .from('documents')
      .select('id, title, created_at')
      .eq('user_id', TEST_USER_ID)

    if (dbError) {
      console.error('❌ Database query error:', dbError)
      return
    }

    const dbDocsMap = new Map(
      (dbDocuments || []).map(doc => [doc.id, doc])
    )

    // Step 3: Process each Storage folder
    const results: Array<{
      documentId: string
      title: string
      storageFiles: string[]
      inDatabase: boolean
      chunkCount: number | null
      syncState: 'healthy' | 'missing_from_db' | 'missing_from_storage' | 'out_of_sync'
      createdAt: string | null
    }> = []

    const folders = (storageFolders || []).filter(item => !item.metadata)

    console.log(`✓ Found ${folders.length} folders in Storage`)
    console.log(`✓ Found ${dbDocuments?.length || 0} documents in Database\n`)

    for (const folder of folders) {
      const documentId = folder.name

      // List files in this document folder
      const { data: files, error: filesError } = await supabase.storage
        .from('documents')
        .list(`${TEST_USER_ID}/${documentId}`)

      if (filesError) {
        console.warn(`⚠️  Error listing files for ${documentId}:`, filesError.message)
        continue
      }

      const storageFiles = (files || [])
        .filter(f => f.metadata)
        .map(f => f.name)

      // Check if document exists in Database
      const dbDoc = dbDocsMap.get(documentId)
      const inDatabase = !!dbDoc

      // Get chunk count from Database
      let chunkCount: number | null = null
      if (inDatabase) {
        const { count, error: countError } = await supabase
          .from('chunks')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', documentId)

        if (!countError) {
          chunkCount = count
        }
      }

      // Read chunks.json from Storage to get Storage chunk count
      let storageChunkCount: number | null = null
      if (storageFiles.includes('chunks.json')) {
        try {
          const { data: signedUrlData, error: urlError } = await supabase.storage
            .from('documents')
            .createSignedUrl(`${TEST_USER_ID}/${documentId}/chunks.json`, 3600)

          if (!urlError && signedUrlData?.signedUrl) {
            const response = await fetch(signedUrlData.signedUrl)
            if (response.ok) {
              const chunksData = await response.json() as { chunks?: unknown[] }
              storageChunkCount = chunksData.chunks?.length || 0
            }
          }
        } catch (error) {
          console.warn(`⚠️  Failed to read chunks.json for ${documentId}`)
        }
      }

      // Calculate sync state
      let syncState: 'healthy' | 'missing_from_db' | 'missing_from_storage' | 'out_of_sync'

      if (!inDatabase && storageFiles.length > 0) {
        syncState = 'missing_from_db'
      } else if (inDatabase && storageFiles.length === 0) {
        syncState = 'missing_from_storage'
      } else if (inDatabase && storageChunkCount !== null && chunkCount !== null) {
        if (storageChunkCount === chunkCount) {
          syncState = 'healthy'
        } else {
          syncState = 'out_of_sync'
        }
      } else if (inDatabase && storageFiles.length > 0) {
        syncState = 'healthy'
      } else {
        continue
      }

      results.push({
        documentId,
        title: dbDoc?.title || `Unknown (${documentId.substring(0, 8)}...)`,
        storageFiles,
        inDatabase,
        chunkCount,
        syncState,
        createdAt: dbDoc?.created_at || null
      })
    }

    // Step 4: Check for documents in DB but not in Storage
    for (const dbDoc of (dbDocuments || [])) {
      if (results.some(r => r.documentId === dbDoc.id)) {
        continue
      }

      const { count: chunkCount } = await supabase
        .from('chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', dbDoc.id)

      results.push({
        documentId: dbDoc.id,
        title: dbDoc.title,
        storageFiles: [],
        inDatabase: true,
        chunkCount: chunkCount || 0,
        syncState: 'missing_from_storage',
        createdAt: dbDoc.created_at
      })
    }

    // Display results
    console.log(`📋 Scan Results (${results.length} documents):\n`)

    const stateEmoji = {
      'healthy': '✅',
      'missing_from_db': '🔴',
      'missing_from_storage': '⚠️',
      'out_of_sync': '🟡'
    }

    // Group by sync state
    const grouped = results.reduce((acc, doc) => {
      if (!acc[doc.syncState]) acc[doc.syncState] = []
      acc[doc.syncState].push(doc)
      return acc
    }, {} as Record<string, typeof results>)

    for (const [state, docs] of Object.entries(grouped)) {
      console.log(`${stateEmoji[state as keyof typeof stateEmoji]} ${state.toUpperCase()} (${docs.length}):`)
      for (const doc of docs) {
        const filesInfo = doc.storageFiles.length > 0
          ? `Storage: ${doc.storageFiles.length} files`
          : 'Storage: empty'
        const dbInfo = doc.inDatabase
          ? `DB: ${doc.chunkCount} chunks`
          : 'DB: not found'
        console.log(`   - ${doc.title} (${doc.documentId.substring(0, 8)}...)`)
        console.log(`     ${filesInfo}, ${dbInfo}`)
      }
      console.log()
    }

    // Summary stats
    console.log('📊 Summary:')
    console.log(`   Total documents analyzed: ${results.length}`)
    console.log(`   Healthy: ${grouped['healthy']?.length || 0}`)
    console.log(`   Missing from DB: ${grouped['missing_from_db']?.length || 0}`)
    console.log(`   Missing from Storage: ${grouped['missing_from_storage']?.length || 0}`)
    console.log(`   Out of sync: ${grouped['out_of_sync']?.length || 0}`)

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

// Run test
testScanStorage()
  .then(() => {
    console.log('\n✅ Test completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  })
