#!/usr/bin/env npx tsx
/**
 * Manual Document Reprocessing Script
 * Triggers reprocessing for a specific document
 * Usage: npx tsx worker/scripts/manual-reprocess.ts <document-id>
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { reprocessDocument } from '../handlers/reprocess-document.js'

// Load environment variables from worker/.env
dotenv.config()

const documentId = process.argv[2]

if (!documentId) {
  console.error('Usage: npx tsx worker/scripts/manual-reprocess.ts <document-id>')
  process.exit(1)
}

console.log(`Starting manual reprocessing for document: ${documentId}`)

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

try {
  const result = await reprocessDocument(documentId, supabase)

  console.log('\n✅ Reprocessing complete!')
  console.log(`Execution time: ${(result.executionTime / 1000).toFixed(1)}s`)
  console.log(`Recovery rate: ${(result.recoveryRate * 100).toFixed(1)}%`)
  console.log(`Annotations:`)
  console.log(`  - Success: ${result.annotations.success.length}`)
  console.log(`  - Needs review: ${result.annotations.needsReview.length}`)
  console.log(`  - Lost: ${result.annotations.lost.length}`)
  console.log(`Connections:`)
  console.log(`  - Success: ${result.connections.success.length}`)
  console.log(`  - Needs review: ${result.connections.needsReview.length}`)
  console.log(`  - Lost: ${result.connections.lost.length}`)

  process.exit(0)
} catch (error) {
  console.error('\n❌ Reprocessing failed:', error)
  process.exit(1)
}
