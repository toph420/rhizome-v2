#!/usr/bin/env tsx
/**
 * CLI wrapper for reprocessing documents
 * Usage: npx tsx worker/scripts/reprocess-cli.ts <document-id>
 */

import { reprocessDocument } from '../handlers/reprocess-document.js'

const documentId = process.argv[2]

if (!documentId) {
  console.error('Usage: npx tsx worker/scripts/reprocess-cli.ts <document-id>')
  process.exit(1)
}

console.log(`🔄 Starting reprocessing for document: ${documentId}\n`)

try {
  const results = await reprocessDocument(documentId)

  console.log('\n✅ Reprocessing Complete!')
  console.log('========================\n')

  console.log('📊 Annotation Recovery:')
  console.log(`   Success: ${results.annotations.success.length}`)
  console.log(`   Needs Review: ${results.annotations.needsReview.length}`)
  console.log(`   Lost: ${results.annotations.lost.length}`)

  console.log('\n🔗 Connection Remapping:')
  console.log(`   Success: ${results.connections.success.length}`)
  console.log(`   Needs Review: ${results.connections.needsReview.length}`)
  console.log(`   Lost: ${results.connections.lost.length}`)

  console.log('\n📝 Next: Run verification script')
  console.log('   npx tsx worker/scripts/verify-remap-connections.ts\n')

  process.exit(0)
} catch (error) {
  console.error('\n❌ Reprocessing Failed:', error)
  process.exit(1)
}
