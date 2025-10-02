#!/usr/bin/env tsx
/**
 * Manually trigger connection detection for existing documents.
 * Use this to backfill connections for documents processed before the 3-engine system was added.
 *
 * Usage:
 *   npx tsx scripts/trigger-connection-detection.ts
 *   npx tsx scripts/trigger-connection-detection.ts --document-id=<uuid>
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Document {
  id: string
  user_id: string
  title: string
  processing_status: string
  embeddings_available: boolean
}

async function triggerDetection(documentId?: string) {
  console.log('🔍 Triggering connection detection for existing documents...\n')

  // Build query
  let query = supabase
    .from('documents')
    .select('id, user_id, title, processing_status, embeddings_available')
    .eq('embeddings_available', true)
    .in('processing_status', ['completed', 'complete'])

  // Filter by document ID if provided
  if (documentId) {
    query = query.eq('id', documentId)
  }

  const { data: docs, error: docsError } = await query

  if (docsError) {
    console.error('❌ Failed to fetch documents:', docsError)
    process.exit(1)
  }

  if (!docs || docs.length === 0) {
    console.log('📭 No eligible documents found')
    console.log('   Requirements: embeddings_available = true, processing_status = completed')
    process.exit(0)
  }

  console.log(`📚 Found ${docs.length} eligible document(s)\n`)

  let jobsCreated = 0
  let jobsSkipped = 0

  for (const doc of docs) {
    console.log(`📄 Processing: ${doc.title}`)
    console.log(`   ID: ${doc.id}`)

    // Count chunks for this document
    const { count, error: countError } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', doc.id)

    if (countError) {
      console.error(`   ❌ Failed to count chunks: ${countError.message}`)
      continue
    }

    if (!count || count < 2) {
      console.log(`   ⏭️  Skipped: Only ${count || 0} chunk(s) (need at least 2)`)
      jobsSkipped++
      continue
    }

    console.log(`   📊 Found ${count} chunks`)

    // Check if a detect-connections job already exists
    const { data: existingJobs } = await supabase
      .from('background_jobs')
      .select('id, status')
      .eq('job_type', 'detect-connections')
      .contains('input_data', { document_id: doc.id })

    if (existingJobs && existingJobs.length > 0) {
      const statuses = existingJobs.map(j => j.status).join(', ')
      console.log(`   ⚠️  Job already exists (status: ${statuses})`)
      jobsSkipped++
      continue
    }

    // Create detect-connections job
    const { error: insertError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: doc.user_id,  // Required field in background_jobs table
        job_type: 'detect-connections',
        status: 'pending',
        input_data: {
          document_id: doc.id,
          user_id: doc.user_id,
          chunk_count: count,
          trigger: 'manual-backfill'
        }
      })

    if (insertError) {
      console.error(`   ❌ Failed to create job: ${insertError.message}`)
      continue
    }

    console.log(`   ✅ Created detect-connections job`)
    jobsCreated++
    console.log()
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✨ Summary:`)
  console.log(`   Jobs created: ${jobsCreated}`)
  console.log(`   Jobs skipped: ${jobsSkipped}`)
  console.log(`   Total documents: ${docs.length}`)
  console.log()

  if (jobsCreated > 0) {
    console.log('🔄 Worker will process these jobs automatically')
    console.log('   Check worker logs: npm run dev:worker')
    console.log()
    console.log('📊 Monitor progress:')
    console.log('   psql postgresql://postgres:postgres@localhost:54322/postgres -c "SELECT job_type, status, COUNT(*) FROM background_jobs GROUP BY job_type, status;"')
    console.log()
    console.log('🔍 Check connections:')
    console.log('   psql postgresql://postgres:postgres@localhost:54322/postgres -c "SELECT connection_type, COUNT(*) FROM connections GROUP BY connection_type;"')
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const documentIdArg = args.find(arg => arg.startsWith('--document-id='))
const documentId = documentIdArg?.split('=')[1]

// Run
triggerDetection(documentId).catch(error => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
