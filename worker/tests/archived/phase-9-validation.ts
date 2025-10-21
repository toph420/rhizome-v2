/**
 * Phase 9: Confidence UI - Validation Script
 *
 * Validates that all Phase 9 components and integrations are correctly implemented:
 * - ChunkQualityPanel displays chunk stats
 * - Quality tab integrated into RightPanel
 * - Inline tooltips show confidence indicators
 */

import * as fs from 'fs'
import * as path from 'path'

interface ValidationResult {
  phase: string
  totalChecks: number
  passed: number
  failed: number
  checks: Array<{
    name: string
    passed: boolean
    details?: string
  }>
}

function checkFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), '..', filePath))
  } catch {
    return false
  }
}

function checkFileContains(filePath: string, patterns: string[]): { found: number; missing: string[] } {
  try {
    const fullPath = path.join(process.cwd(), '..', filePath)
    const content = fs.readFileSync(fullPath, 'utf-8')
    const missing: string[] = []

    patterns.forEach(pattern => {
      if (!content.includes(pattern)) {
        missing.push(pattern)
      }
    })

    return { found: patterns.length - missing.length, missing }
  } catch (error) {
    return { found: 0, missing: patterns }
  }
}

function runValidation(): ValidationResult {
  const result: ValidationResult = {
    phase: 'Phase 9: Confidence UI',
    totalChecks: 0,
    passed: 0,
    failed: 0,
    checks: []
  }

  // Task 28: ChunkQualityPanel Component
  console.log('Validating Task 28: ChunkQualityPanel Component...')

  // Check if ChunkQualityPanel exists
  const qualityPanelExists = checkFileExists('src/components/sidebar/ChunkQualityPanel.tsx')
  result.checks.push({
    name: 'ChunkQualityPanel component exists',
    passed: qualityPanelExists,
    details: qualityPanelExists ? 'File found' : 'File not found'
  })
  result.totalChecks++
  if (qualityPanelExists) result.passed++
  else result.failed++

  // Check ChunkQualityPanel implementation
  const qualityPanelPatterns = [
    'useChunkStats',
    'useSyntheticChunks',
    'StatCard',
    'Accordion',
    'confidence',
    'handleValidateChunk',
    'handleShowInDocument'
  ]
  const qualityPanelCheck = checkFileContains('src/components/sidebar/ChunkQualityPanel.tsx', qualityPanelPatterns)
  result.checks.push({
    name: 'ChunkQualityPanel has required patterns',
    passed: qualityPanelCheck.missing.length === 0,
    details: qualityPanelCheck.missing.length === 0
      ? `All ${qualityPanelPatterns.length} patterns found`
      : `Missing: ${qualityPanelCheck.missing.join(', ')}`
  })
  result.totalChecks++
  if (qualityPanelCheck.missing.length === 0) result.passed++
  else result.failed++

  // Check custom hooks
  const chunkStatsHookExists = checkFileExists('src/hooks/use-chunk-stats.ts')
  result.checks.push({
    name: 'useChunkStats hook exists',
    passed: chunkStatsHookExists,
    details: chunkStatsHookExists ? 'File found' : 'File not found'
  })
  result.totalChecks++
  if (chunkStatsHookExists) result.passed++
  else result.failed++

  const syntheticChunksHookExists = checkFileExists('src/hooks/use-synthetic-chunks.ts')
  result.checks.push({
    name: 'useSyntheticChunks hook exists',
    passed: syntheticChunksHookExists,
    details: syntheticChunksHookExists ? 'File found' : 'File not found'
  })
  result.totalChecks++
  if (syntheticChunksHookExists) result.passed++
  else result.failed++

  // Task 29: RightPanel Integration
  console.log('Validating Task 29: RightPanel Integration...')

  // Check RightPanel modifications
  const rightPanelPatterns = [
    "'quality'",
    "CheckCircle",
    "ChunkQualityPanel",
    "activeTab === 'quality'",
    "grid-cols-7"
  ]
  const rightPanelCheck = checkFileContains('src/components/sidebar/RightPanel.tsx', rightPanelPatterns)
  result.checks.push({
    name: 'RightPanel has Quality tab integration',
    passed: rightPanelCheck.missing.length === 0,
    details: rightPanelCheck.missing.length === 0
      ? `All ${rightPanelPatterns.length} patterns found`
      : `Missing: ${rightPanelCheck.missing.join(', ')}`
  })
  result.totalChecks++
  if (rightPanelCheck.missing.length === 0) result.passed++
  else result.failed++

  // Task 30: Inline Tooltips
  console.log('Validating Task 30: Inline Tooltips...')

  // Check ChunkMetadataIcon enhancements
  const metadataIconPatterns = [
    'position_confidence',
    'position_method',
    'position_validated',
    'getConfidenceColor',
    'AlertTriangle',
    'positionConfidence',
    'positionMethod'
  ]
  const metadataIconCheck = checkFileContains('src/components/reader/ChunkMetadataIcon.tsx', metadataIconPatterns)
  result.checks.push({
    name: 'ChunkMetadataIcon has confidence indicators',
    passed: metadataIconCheck.missing.length === 0,
    details: metadataIconCheck.missing.length === 0
      ? `All ${metadataIconPatterns.length} patterns found`
      : `Missing: ${metadataIconCheck.missing.join(', ')}`
  })
  result.totalChecks++
  if (metadataIconCheck.missing.length === 0) result.passed++
  else result.failed++

  // Check Chunk type definition updated
  const chunkTypePatterns = [
    'position_confidence',
    'position_method',
    'position_validated',
    'page_start',
    'page_end',
    'section_marker'
  ]
  const chunkTypeCheck = checkFileContains('src/types/annotations.ts', chunkTypePatterns)
  result.checks.push({
    name: 'Chunk type includes local pipeline fields',
    passed: chunkTypeCheck.missing.length === 0,
    details: chunkTypeCheck.missing.length === 0
      ? `All ${chunkTypePatterns.length} fields defined`
      : `Missing: ${chunkTypeCheck.missing.join(', ')}`
  })
  result.totalChecks++
  if (chunkTypeCheck.missing.length === 0) result.passed++
  else result.failed++

  // Check UI components installed
  const accordionExists = checkFileExists('src/components/ui/accordion.tsx')
  result.checks.push({
    name: 'Accordion component installed',
    passed: accordionExists,
    details: accordionExists ? 'Shadcn/ui component found' : 'Component not found'
  })
  result.totalChecks++
  if (accordionExists) result.passed++
  else result.failed++

  const skeletonExists = checkFileExists('src/components/ui/skeleton.tsx')
  result.checks.push({
    name: 'Skeleton component installed',
    passed: skeletonExists,
    details: skeletonExists ? 'Shadcn/ui component found' : 'Component not found'
  })
  result.totalChecks++
  if (skeletonExists) result.passed++
  else result.failed++

  return result
}

function printResults(result: ValidationResult) {
  console.log('\n' + '='.repeat(70))
  console.log(`${result.phase} Validation`)
  console.log('='.repeat(70))
  console.log(`Total tests: ${result.totalChecks}`)
  console.log(`Passed: ${result.passed} ✅`)
  console.log(`Failed: ${result.failed} ${result.failed > 0 ? '❌' : ''}`)
  console.log('='.repeat(70))

  console.log('\nDetailed Results:')
  result.checks.forEach((check, index) => {
    const status = check.passed ? '✅' : '❌'
    console.log(`${status} ${index + 1}. ${check.name}`)
    if (check.details) {
      console.log(`   ${check.details}`)
    }
  })

  console.log('\n' + '='.repeat(70))
  if (result.failed === 0) {
    console.log('✅ Phase 9 validation PASSED - All tests successful!')
  } else {
    console.log(`❌ Phase 9 validation FAILED - ${result.failed} tests failed`)
    console.log('Please review the failures above and fix any issues.')
  }
  console.log('='.repeat(70) + '\n')
}

// Run validation
const result = runValidation()
printResults(result)

// Exit with appropriate code
process.exit(result.failed > 0 ? 1 : 0)
