/**
 * Phase 8: Review Checkpoints Validation
 *
 * Validates that manual review checkpoints are properly implemented in both processors.
 */

import fs from 'fs'
import path from 'path'

interface ValidationResult {
  name: string
  passed: boolean
  reason?: string
}

const results: ValidationResult[] = []

function validate(name: string, condition: boolean, reason?: string) {
  results.push({ name, passed: condition, reason })
  if (condition) {
    console.log(`✅ ${name}`)
  } else {
    console.log(`❌ ${name}${reason ? `: ${reason}` : ''}`)
  }
}

console.log('Phase 8: Review Checkpoints Validation')
console.log('=' + '='.repeat(50))

// 1. PDF Processor has reviewDoclingExtraction checkpoint
console.log('\n1. PDF Processor Checkpoint')
const pdfProcessorPath = path.join(process.cwd(), 'processors/pdf-processor.ts')
const pdfProcessorContent = fs.readFileSync(pdfProcessorPath, 'utf-8')

validate(
  'PDF processor checks reviewDoclingExtraction flag',
  /reviewDoclingExtraction.*?===.*?true/.test(pdfProcessorContent),
  'reviewDoclingExtraction check not found'
)

validate(
  'PDF processor pauses before AI cleanup',
  /Review.*?Docling extraction mode.*?pausing before AI cleanup/.test(pdfProcessorContent),
  'Docling review pause message not found'
)

validate(
  'PDF processor returns empty chunks on pause',
  /chunks:\s*\[\]/.test(pdfProcessorContent) && /No chunks.*will be created after review/.test(pdfProcessorContent),
  'Empty chunks return not found'
)

validate(
  'PDF processor has reviewBeforeChunking checkpoint',
  /reviewBeforeChunking/.test(pdfProcessorContent),
  'reviewBeforeChunking check not found'
)

// 2. EPUB Processor has reviewDoclingExtraction checkpoint
console.log('\n2. EPUB Processor Checkpoint')
const epubProcessorPath = path.join(process.cwd(), 'processors/epub-processor.ts')
const epubProcessorContent = fs.readFileSync(epubProcessorPath, 'utf-8')

validate(
  'EPUB processor checks reviewDoclingExtraction flag',
  /reviewDoclingExtraction.*?===.*?true/.test(epubProcessorContent),
  'reviewDoclingExtraction check not found'
)

validate(
  'EPUB processor pauses before AI cleanup',
  /Review.*?Docling extraction mode.*?pausing before AI cleanup/.test(epubProcessorContent),
  'Docling review pause message not found'
)

validate(
  'EPUB processor returns empty chunks on pause',
  /chunks:\s*\[\]/.test(epubProcessorContent) && /No chunks.*will be created after review/.test(epubProcessorContent),
  'Empty chunks return not found'
)

validate(
  'EPUB processor has reviewBeforeChunking checkpoint',
  /reviewBeforeChunking/.test(epubProcessorContent),
  'reviewBeforeChunking check not found'
)

// 3. Continue Processing Handler supports both review stages
console.log('\n3. Continue Processing Handler')
const continueProcessingPath = path.join(process.cwd(), 'handlers/continue-processing.ts')
const continueProcessingContent = fs.readFileSync(continueProcessingPath, 'utf-8')

validate(
  'Continue handler supports docling_extraction stage',
  /reviewStage === 'docling_extraction'/.test(continueProcessingContent),
  'docling_extraction stage handling not found'
)

validate(
  'Continue handler supports ai_cleanup stage',
  /reviewStage.*?as 'docling_extraction' \| 'ai_cleanup'/.test(continueProcessingContent),
  'ai_cleanup stage type not found'
)

validate(
  'Continue handler can skip AI cleanup',
  /skipAiCleanup/.test(continueProcessingContent),
  'skipAiCleanup parameter not found'
)

validate(
  'Continue handler runs AI cleanup when needed',
  /Running AI cleanup on Docling extraction/.test(continueProcessingContent),
  'AI cleanup execution not found'
)

validate(
  'Continue handler clears review_stage when continuing',
  /review_stage: null/.test(continueProcessingContent),
  'review_stage clearing not found'
)

// 4. Database Migration supports review_stage
console.log('\n4. Database Schema')
const migrationPath = path.join(process.cwd(), '../supabase/migrations/044_add_review_stage.sql')
const migrationExists = fs.existsSync(migrationPath)

validate(
  'Migration 044 exists',
  migrationExists,
  'Migration file not found'
)

if (migrationExists) {
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8')

  validate(
    'Migration adds review_stage column',
    /ADD COLUMN review_stage/.test(migrationContent),
    'review_stage column not found'
  )

  validate(
    'Migration has docling_extraction value',
    /docling_extraction/.test(migrationContent),
    'docling_extraction value not in CHECK constraint'
  )

  validate(
    'Migration has ai_cleanup value',
    /ai_cleanup/.test(migrationContent),
    'ai_cleanup value not in CHECK constraint'
  )

  validate(
    'Migration creates review_stage index',
    /idx_documents_review_stage/.test(migrationContent),
    'review_stage index not found'
  )
}

// 5. Process Document Handler handles review pauses
console.log('\n5. Process Document Handler')
const processDocPath = path.join(process.cwd(), 'handlers/process-document.ts')
const processDocContent = fs.readFileSync(processDocPath, 'utf-8')

validate(
  'Handler checks reviewDoclingExtraction flag',
  /reviewDoclingExtraction/.test(processDocContent),
  'reviewDoclingExtraction check not found'
)

validate(
  'Handler checks reviewBeforeChunking flag',
  /reviewBeforeChunking/.test(processDocContent),
  'reviewBeforeChunking check not found'
)

validate(
  'Handler sets review_stage in database',
  /review_stage: reviewStage/.test(processDocContent),
  'review_stage update not found'
)

validate(
  'Handler sets awaiting_manual_review status',
  /processing_status: 'awaiting_manual_review'/.test(processDocContent),
  'awaiting_manual_review status not found'
)

validate(
  'Handler exports to Obsidian for review',
  /exportToObsidian/.test(processDocContent),
  'Obsidian export not found'
)

// Summary
console.log('\n' + '='.repeat(50))
console.log('Summary:')
const passed = results.filter(r => r.passed).length
const total = results.length
console.log(`Passed: ${passed}/${total}`)

if (passed === total) {
  console.log('\n✅ Phase 8 validation PASSED - All checks successful!')
  process.exit(0)
} else {
  console.log(`\n❌ Phase 8 validation FAILED - ${total - passed} check(s) failed`)
  console.log('\nFailed checks:')
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  - ${r.name}${r.reason ? `: ${r.reason}` : ''}`)
  })
  process.exit(1)
}
