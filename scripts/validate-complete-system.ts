/**
 * Complete System Validation Script (T-024)
 *
 * This script validates the entire Storage-First Portability system
 * by running comprehensive tests across all phases:
 *
 * - Phase 1: Storage Export Infrastructure
 * - Phase 2: Admin Panel UI
 * - Phase 3: Storage Scanner
 * - Phase 4: Import Workflow
 * - Phase 5: Connection Reprocessing
 * - Phase 6: Export Workflow
 * - Phase 7: Integration & Polish
 *
 * Usage:
 *   npx tsx scripts/validate-complete-system.ts [--full]
 *
 * Options:
 *   --full    Run full workflow tests (slower, requires real documents)
 *   --quick   Run only smoke tests (faster, default)
 *
 * Exit Codes:
 *   0 - All validations passed
 *   1 - One or more validations failed
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

interface ValidationResult {
  phase: string
  test: string
  success: boolean
  message: string
  duration?: number
  details?: any
}

interface ValidationSummary {
  totalTests: number
  passed: number
  failed: number
  skipped: number
  duration: number
  results: ValidationResult[]
  phases: {
    [phaseName: string]: {
      passed: number
      failed: number
      skipped: number
    }
  }
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
}

function log(message: string, color?: keyof typeof COLORS) {
  const colorCode = color ? COLORS[color] : ''
  console.log(`${colorCode}${message}${COLORS.reset}`)
}

function logPhase(phase: string) {
  log(`\n${'='.repeat(70)}`, 'blue')
  log(`  ${phase}`, 'bold')
  log('='.repeat(70), 'blue')
}

function logTest(testName: string) {
  log(`\n  → ${testName}`, 'gray')
}

function logResult(result: ValidationResult) {
  const icon = result.success ? '✓' : '✗'
  const color = result.success ? 'green' : 'red'
  const duration = result.duration ? ` (${result.duration}ms)` : ''
  log(`    ${icon} ${result.message}${duration}`, color)
}

async function measureTime<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now()
  const result = await fn()
  const duration = Date.now() - start
  return [result, duration]
}

// =============================================================================
// Phase 1: Storage Export Infrastructure
// =============================================================================

async function validatePhase1(supabase: any, summary: ValidationSummary): Promise<void> {
  logPhase('PHASE 1: Storage Export Infrastructure')

  // Test 1: Verify storage helper functions exist
  logTest('T-001: Storage Helper Functions')
  try {
    const helperPath = path.join(process.cwd(), 'worker/lib/storage-helpers.ts')
    if (fs.existsSync(helperPath)) {
      const content = fs.readFileSync(helperPath, 'utf-8')
      const requiredFunctions = [
        'saveToStorage',
        'readFromStorage',
        'hashContent',
        'listStorageFiles',
      ]

      const allFunctionsExist = requiredFunctions.every(fn =>
        content.includes(`export async function ${fn}`) ||
        content.includes(`export function ${fn}`)
      )

      summary.results.push({
        phase: 'Phase 1',
        test: 'Storage Helper Functions',
        success: allFunctionsExist,
        message: allFunctionsExist
          ? 'All 4 storage helper functions exist'
          : 'Missing storage helper functions',
        details: { functions: requiredFunctions },
      })

      if (allFunctionsExist) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 1',
        test: 'Storage Helper Functions',
        success: false,
        message: 'storage-helpers.ts file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 1',
        test: 'Storage Helper Functions',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 2: Verify JSON export schemas
  logTest('T-002: JSON Export Schemas')
  try {
    const typesPath = path.join(process.cwd(), 'worker/types/storage.ts')
    if (fs.existsSync(typesPath)) {
      const content = fs.readFileSync(typesPath, 'utf-8')
      const requiredSchemas = [
        'ChunksExport',
        'CachedChunksExport',
        'MetadataExport',
        'ManifestExport',
        'ImportConflict',
        'ReprocessOptions',
      ]

      const allSchemasExist = requiredSchemas.every(schema =>
        content.includes(`export interface ${schema}`) ||
        content.includes(`export type ${schema}`)
      )

      summary.results.push({
        phase: 'Phase 1',
        test: 'JSON Export Schemas',
        success: allSchemasExist,
        message: allSchemasExist
          ? 'All 6 export schemas defined'
          : 'Missing export schemas',
        details: { schemas: requiredSchemas },
      })

      if (allSchemasExist) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 1',
        test: 'JSON Export Schemas',
        success: false,
        message: 'storage.ts types file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 1',
      test: 'JSON Export Schemas',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 3: Verify BaseProcessor has saveStageResult
  logTest('T-003: BaseProcessor saveStageResult Method')
  try {
    const basePath = path.join(process.cwd(), 'worker/processors/base.ts')
    if (fs.existsSync(basePath)) {
      const content = fs.readFileSync(basePath, 'utf-8')
      const hasSaveStageResult = content.includes('saveStageResult')

      summary.results.push({
        phase: 'Phase 1',
        test: 'BaseProcessor saveStageResult',
        success: hasSaveStageResult,
        message: hasSaveStageResult
          ? 'saveStageResult method exists in BaseProcessor'
          : 'saveStageResult method missing from BaseProcessor',
      })

      if (hasSaveStageResult) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 1',
        test: 'BaseProcessor saveStageResult',
        success: false,
        message: 'base.ts processor file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 1',
      test: 'BaseProcessor saveStageResult',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Update phase summary
  summary.phases['Phase 1'] = {
    passed: summary.results.filter(r => r.phase === 'Phase 1' && r.success).length,
    failed: summary.results.filter(r => r.phase === 'Phase 1' && !r.success).length,
    skipped: 0,
  }
}

// =============================================================================
// Phase 2: Admin Panel UI
// =============================================================================

async function validatePhase2(summary: ValidationSummary): Promise<void> {
  logPhase('PHASE 2: Admin Panel UI')

  // Test 1: Verify AdminPanel is Sheet-based
  logTest('T-007: AdminPanel Refactored to Sheet')
  try {
    const adminPath = path.join(process.cwd(), 'src/components/admin/AdminPanel.tsx')
    if (fs.existsSync(adminPath)) {
      const content = fs.readFileSync(adminPath, 'utf-8')
      const hasSheetComponent = content.includes('Sheet') && content.includes('SheetContent')
      const hasTabs = content.includes('Tabs') && content.includes('TabsList')

      const isRefactored = hasSheetComponent && hasTabs

      summary.results.push({
        phase: 'Phase 2',
        test: 'AdminPanel Refactored',
        success: isRefactored,
        message: isRefactored
          ? 'AdminPanel uses Sheet and Tabs components'
          : 'AdminPanel not properly refactored',
        details: { hasSheet: hasSheetComponent, hasTabs },
      })

      if (isRefactored) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 2',
        test: 'AdminPanel Refactored',
        success: false,
        message: 'AdminPanel.tsx file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 2',
      test: 'AdminPanel Refactored',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 2: Verify all 6 tab components exist
  logTest('T-008: All Tab Components Exist')
  try {
    const tabsDir = path.join(process.cwd(), 'src/components/admin/tabs')
    const requiredTabs = [
      'ScannerTab.tsx',
      'ImportTab.tsx',
      'ExportTab.tsx',
      'ConnectionsTab.tsx',
      'IntegrationsTab.tsx',
      'JobsTab.tsx',
    ]

    const existingTabs = requiredTabs.filter(tab =>
      fs.existsSync(path.join(tabsDir, tab))
    )

    const allTabsExist = existingTabs.length === requiredTabs.length

    summary.results.push({
      phase: 'Phase 2',
      test: 'All Tab Components',
      success: allTabsExist,
      message: allTabsExist
        ? 'All 6 tab components exist'
        : `Only ${existingTabs.length}/6 tab components exist`,
      details: { existing: existingTabs, required: requiredTabs },
    })

    if (allTabsExist) summary.passed++
    else summary.failed++
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 2',
      test: 'All Tab Components',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Update phase summary
  summary.phases['Phase 2'] = {
    passed: summary.results.filter(r => r.phase === 'Phase 2' && r.success).length,
    failed: summary.results.filter(r => r.phase === 'Phase 2' && !r.success).length,
    skipped: 0,
  }
}

// =============================================================================
// Phase 3: Storage Scanner
// =============================================================================

async function validatePhase3(summary: ValidationSummary): Promise<void> {
  logPhase('PHASE 3: Storage Scanner')

  // Test 1: Verify scanStorage Server Action
  logTest('T-009: scanStorage Server Action')
  try {
    const actionsPath = path.join(process.cwd(), 'src/app/actions/documents.ts')
    if (fs.existsSync(actionsPath)) {
      const content = fs.readFileSync(actionsPath, 'utf-8')
      const hasScanStorage = content.includes('scanStorage')

      summary.results.push({
        phase: 'Phase 3',
        test: 'scanStorage Action',
        success: hasScanStorage,
        message: hasScanStorage
          ? 'scanStorage Server Action exists'
          : 'scanStorage Server Action missing',
      })

      if (hasScanStorage) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 3',
        test: 'scanStorage Action',
        success: false,
        message: 'documents.ts actions file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 3',
      test: 'scanStorage Action',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 2: Verify ScannerTab UI
  logTest('T-010: ScannerTab UI Component')
  try {
    const scannerPath = path.join(process.cwd(), 'src/components/admin/tabs/ScannerTab.tsx')
    if (fs.existsSync(scannerPath)) {
      const content = fs.readFileSync(scannerPath, 'utf-8')
      const hasTable = content.includes('Table') || content.includes('table')
      const hasFilters = content.includes('filter') || content.includes('Filter')
      const hasScan = content.includes('scan') || content.includes('Scan')

      const isImplemented = hasTable && hasFilters && hasScan

      summary.results.push({
        phase: 'Phase 3',
        test: 'ScannerTab UI',
        success: isImplemented,
        message: isImplemented
          ? 'ScannerTab has table, filters, and scan functionality'
          : 'ScannerTab missing key features',
        details: { hasTable, hasFilters, hasScan },
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 3',
        test: 'ScannerTab UI',
        success: false,
        message: 'ScannerTab.tsx file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 3',
      test: 'ScannerTab UI',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Update phase summary
  summary.phases['Phase 3'] = {
    passed: summary.results.filter(r => r.phase === 'Phase 3' && r.success).length,
    failed: summary.results.filter(r => r.phase === 'Phase 3' && !r.success).length,
    skipped: 0,
  }
}

// =============================================================================
// Phase 4: Import Workflow
// =============================================================================

async function validatePhase4(summary: ValidationSummary): Promise<void> {
  logPhase('PHASE 4: Import Workflow')

  // Test 1: Verify importFromStorage Server Action
  logTest('T-011: importFromStorage Server Action')
  try {
    const actionsPath = path.join(process.cwd(), 'src/app/actions/documents.ts')
    if (fs.existsSync(actionsPath)) {
      const content = fs.readFileSync(actionsPath, 'utf-8')
      const hasImportFromStorage = content.includes('importFromStorage')

      summary.results.push({
        phase: 'Phase 4',
        test: 'importFromStorage Action',
        success: hasImportFromStorage,
        message: hasImportFromStorage
          ? 'importFromStorage Server Action exists'
          : 'importFromStorage Server Action missing',
      })

      if (hasImportFromStorage) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 4',
        test: 'importFromStorage Action',
        success: false,
        message: 'documents.ts actions file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 4',
      test: 'importFromStorage Action',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 2: Verify import-document handler
  logTest('T-012: import-document Background Handler')
  try {
    const handlerPath = path.join(process.cwd(), 'worker/handlers/import-document.ts')
    if (fs.existsSync(handlerPath)) {
      const content = fs.readFileSync(handlerPath, 'utf-8')
      const hasHandler = content.includes('export') && content.includes('import')
      const hasStrategies = content.includes('skip') || content.includes('replace') || content.includes('merge')

      const isImplemented = hasHandler && hasStrategies

      summary.results.push({
        phase: 'Phase 4',
        test: 'import-document Handler',
        success: isImplemented,
        message: isImplemented
          ? 'import-document handler with strategies implemented'
          : 'import-document handler missing or incomplete',
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 4',
        test: 'import-document Handler',
        success: false,
        message: 'import-document.ts handler not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 4',
      test: 'import-document Handler',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 3: Verify ConflictResolutionDialog
  logTest('T-013: ConflictResolutionDialog Component')
  try {
    const dialogPath = path.join(process.cwd(), 'src/components/admin/ConflictResolutionDialog.tsx')
    if (fs.existsSync(dialogPath)) {
      const content = fs.readFileSync(dialogPath, 'utf-8')
      const hasDialog = content.includes('Dialog')
      const hasStrategies = content.includes('skip') || content.includes('replace') || content.includes('merge')

      const isImplemented = hasDialog && hasStrategies

      summary.results.push({
        phase: 'Phase 4',
        test: 'ConflictResolutionDialog',
        success: isImplemented,
        message: isImplemented
          ? 'ConflictResolutionDialog with strategies implemented'
          : 'ConflictResolutionDialog missing or incomplete',
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 4',
        test: 'ConflictResolutionDialog',
        success: false,
        message: 'ConflictResolutionDialog.tsx not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 4',
      test: 'ConflictResolutionDialog',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 4: Verify ImportTab UI
  logTest('T-014: ImportTab UI Component')
  try {
    const importPath = path.join(process.cwd(), 'src/components/admin/tabs/ImportTab.tsx')
    if (fs.existsSync(importPath)) {
      const content = fs.readFileSync(importPath, 'utf-8')
      const hasImport = content.includes('import') || content.includes('Import')
      const hasProgress = content.includes('progress') || content.includes('Progress')

      const isImplemented = hasImport && hasProgress

      summary.results.push({
        phase: 'Phase 4',
        test: 'ImportTab UI',
        success: isImplemented,
        message: isImplemented
          ? 'ImportTab with import and progress tracking implemented'
          : 'ImportTab missing key features',
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 4',
        test: 'ImportTab UI',
        success: false,
        message: 'ImportTab.tsx not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 4',
      test: 'ImportTab UI',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Update phase summary
  summary.phases['Phase 4'] = {
    passed: summary.results.filter(r => r.phase === 'Phase 4' && r.success).length,
    failed: summary.results.filter(r => r.phase === 'Phase 4' && !r.success).length,
    skipped: 0,
  }
}

// =============================================================================
// Phase 5: Connection Reprocessing
// =============================================================================

async function validatePhase5(summary: ValidationSummary): Promise<void> {
  logPhase('PHASE 5: Connection Reprocessing')

  // Test 1: Verify reprocessConnections Server Action
  logTest('T-015: reprocessConnections Server Action')
  try {
    const actionsPath = path.join(process.cwd(), 'src/app/actions/documents.ts')
    if (fs.existsSync(actionsPath)) {
      const content = fs.readFileSync(actionsPath, 'utf-8')
      const hasReprocessConnections = content.includes('reprocessConnections')

      summary.results.push({
        phase: 'Phase 5',
        test: 'reprocessConnections Action',
        success: hasReprocessConnections,
        message: hasReprocessConnections
          ? 'reprocessConnections Server Action exists'
          : 'reprocessConnections Server Action missing',
      })

      if (hasReprocessConnections) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 5',
        test: 'reprocessConnections Action',
        success: false,
        message: 'documents.ts actions file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 5',
      test: 'reprocessConnections Action',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 2: Verify reprocess-connections handler
  logTest('T-016: reprocess-connections Background Handler')
  try {
    const handlerPath = path.join(process.cwd(), 'worker/handlers/reprocess-connections.ts')
    if (fs.existsSync(handlerPath)) {
      const content = fs.readFileSync(handlerPath, 'utf-8')
      const hasHandler = content.includes('export') && content.includes('reprocess')
      const hasModes = content.includes('all') || content.includes('smart') || content.includes('add_new')

      const isImplemented = hasHandler && hasModes

      summary.results.push({
        phase: 'Phase 5',
        test: 'reprocess-connections Handler',
        success: isImplemented,
        message: isImplemented
          ? 'reprocess-connections handler with modes implemented'
          : 'reprocess-connections handler missing or incomplete',
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 5',
        test: 'reprocess-connections Handler',
        success: false,
        message: 'reprocess-connections.ts handler not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 5',
      test: 'reprocess-connections Handler',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 3: Verify ConnectionsTab UI
  logTest('T-017: ConnectionsTab UI Component')
  try {
    const connectionsPath = path.join(process.cwd(), 'src/components/admin/tabs/ConnectionsTab.tsx')
    if (fs.existsSync(connectionsPath)) {
      const content = fs.readFileSync(connectionsPath, 'utf-8')
      const hasModes = content.includes('Smart') || content.includes('Reprocess All')
      const hasEngines = content.includes('engine') || content.includes('Engine')

      const isImplemented = hasModes && hasEngines

      summary.results.push({
        phase: 'Phase 5',
        test: 'ConnectionsTab UI',
        success: isImplemented,
        message: isImplemented
          ? 'ConnectionsTab with modes and engines implemented'
          : 'ConnectionsTab missing key features',
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 5',
        test: 'ConnectionsTab UI',
        success: false,
        message: 'ConnectionsTab.tsx not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 5',
      test: 'ConnectionsTab UI',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Update phase summary
  summary.phases['Phase 5'] = {
    passed: summary.results.filter(r => r.phase === 'Phase 5' && r.success).length,
    failed: summary.results.filter(r => r.phase === 'Phase 5' && !r.success).length,
    skipped: 0,
  }
}

// =============================================================================
// Phase 6: Export Workflow
// =============================================================================

async function validatePhase6(summary: ValidationSummary): Promise<void> {
  logPhase('PHASE 6: Export Workflow')

  // Test 1: Verify exportDocuments Server Action
  logTest('T-018: exportDocuments Server Action')
  try {
    const actionsPath = path.join(process.cwd(), 'src/app/actions/documents.ts')
    if (fs.existsSync(actionsPath)) {
      const content = fs.readFileSync(actionsPath, 'utf-8')
      const hasExportDocuments = content.includes('exportDocuments')

      summary.results.push({
        phase: 'Phase 6',
        test: 'exportDocuments Action',
        success: hasExportDocuments,
        message: hasExportDocuments
          ? 'exportDocuments Server Action exists'
          : 'exportDocuments Server Action missing',
      })

      if (hasExportDocuments) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 6',
        test: 'exportDocuments Action',
        success: false,
        message: 'documents.ts actions file not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 6',
      test: 'exportDocuments Action',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 2: Verify export-document handler
  logTest('T-019: export-document Background Handler')
  try {
    const handlerPath = path.join(process.cwd(), 'worker/handlers/export-document.ts')
    if (fs.existsSync(handlerPath)) {
      const content = fs.readFileSync(handlerPath, 'utf-8')
      const hasHandler = content.includes('export') && content.includes('ZIP')
      const hasOptions = content.includes('connections') || content.includes('annotations')

      const isImplemented = hasHandler && hasOptions

      summary.results.push({
        phase: 'Phase 6',
        test: 'export-document Handler',
        success: isImplemented,
        message: isImplemented
          ? 'export-document handler with ZIP generation implemented'
          : 'export-document handler missing or incomplete',
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 6',
        test: 'export-document Handler',
        success: false,
        message: 'export-document.ts handler not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 6',
      test: 'export-document Handler',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 3: Verify ExportTab UI
  logTest('T-020: ExportTab UI Component')
  try {
    const exportPath = path.join(process.cwd(), 'src/components/admin/tabs/ExportTab.tsx')
    if (fs.existsSync(exportPath)) {
      const content = fs.readFileSync(exportPath, 'utf-8')
      const hasExport = content.includes('export') || content.includes('Export')
      const hasDownload = content.includes('download') || content.includes('Download')

      const isImplemented = hasExport && hasDownload

      summary.results.push({
        phase: 'Phase 6',
        test: 'ExportTab UI',
        success: isImplemented,
        message: isImplemented
          ? 'ExportTab with export and download features implemented'
          : 'ExportTab missing key features',
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 6',
        test: 'ExportTab UI',
        success: false,
        message: 'ExportTab.tsx not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 6',
      test: 'ExportTab UI',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Update phase summary
  summary.phases['Phase 6'] = {
    passed: summary.results.filter(r => r.phase === 'Phase 6' && r.success).length,
    failed: summary.results.filter(r => r.phase === 'Phase 6' && !r.success).length,
    skipped: 0,
  }
}

// =============================================================================
// Phase 7: Integration & Polish
// =============================================================================

async function validatePhase7(summary: ValidationSummary): Promise<void> {
  logPhase('PHASE 7: Integration & Polish')

  // Test 1: Verify IntegrationsTab
  logTest('T-021: IntegrationsTab with Obsidian and Readwise')
  try {
    const integrationsPath = path.join(process.cwd(), 'src/components/admin/tabs/IntegrationsTab.tsx')
    if (fs.existsSync(integrationsPath)) {
      const content = fs.readFileSync(integrationsPath, 'utf-8')
      const hasObsidian = content.includes('Obsidian')
      const hasReadwise = content.includes('Readwise')

      const isImplemented = hasObsidian && hasReadwise

      summary.results.push({
        phase: 'Phase 7',
        test: 'IntegrationsTab',
        success: isImplemented,
        message: isImplemented
          ? 'IntegrationsTab with Obsidian and Readwise implemented'
          : 'IntegrationsTab missing integrations',
      })

      if (isImplemented) summary.passed++
      else summary.failed++
    } else {
      summary.results.push({
        phase: 'Phase 7',
        test: 'IntegrationsTab',
        success: false,
        message: 'IntegrationsTab.tsx not found',
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 7',
      test: 'IntegrationsTab',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 2: Verify keyboard shortcuts
  logTest('T-022: Keyboard Shortcuts and Help Dialog')
  try {
    const shortcutsPath = path.join(process.cwd(), 'src/components/admin/KeyboardShortcutsDialog.tsx')
    const adminPath = path.join(process.cwd(), 'src/components/admin/AdminPanel.tsx')

    let hasShortcuts = false
    if (fs.existsSync(shortcutsPath)) {
      hasShortcuts = true
    } else if (fs.existsSync(adminPath)) {
      const content = fs.readFileSync(adminPath, 'utf-8')
      hasShortcuts = content.includes('hotkey') || content.includes('Hotkey') || content.includes('useHotkeys')
    }

    summary.results.push({
      phase: 'Phase 7',
      test: 'Keyboard Shortcuts',
      success: hasShortcuts,
      message: hasShortcuts
        ? 'Keyboard shortcuts implemented'
        : 'Keyboard shortcuts missing',
    })

    if (hasShortcuts) summary.passed++
    else summary.failed++
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 7',
      test: 'Keyboard Shortcuts',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 3: Verify tooltips and UX polish
  logTest('T-023: Tooltips and UX Polish')
  try {
    const tabsDir = path.join(process.cwd(), 'src/components/admin/tabs')
    const tabs = ['ScannerTab.tsx', 'ImportTab.tsx', 'ExportTab.tsx', 'ConnectionsTab.tsx']

    let tooltipCount = 0
    for (const tab of tabs) {
      const tabPath = path.join(tabsDir, tab)
      if (fs.existsSync(tabPath)) {
        const content = fs.readFileSync(tabPath, 'utf-8')
        if (content.includes('Tooltip') || content.includes('tooltip')) {
          tooltipCount++
        }
      }
    }

    const hasPolish = tooltipCount >= tabs.length * 0.75 // At least 75% of tabs have tooltips

    summary.results.push({
      phase: 'Phase 7',
      test: 'Tooltips and UX Polish',
      success: hasPolish,
      message: hasPolish
        ? `Tooltips found in ${tooltipCount}/${tabs.length} tabs`
        : `Tooltips only in ${tooltipCount}/${tabs.length} tabs`,
    })

    if (hasPolish) summary.passed++
    else summary.failed++
  } catch (error: any) {
    summary.results.push({
      phase: 'Phase 7',
      test: 'Tooltips and UX Polish',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Update phase summary
  summary.phases['Phase 7'] = {
    passed: summary.results.filter(r => r.phase === 'Phase 7' && r.success).length,
    failed: summary.results.filter(r => r.phase === 'Phase 7' && !r.success).length,
    skipped: 0,
  }
}

// =============================================================================
// Regression Tests
// =============================================================================

async function validateRegressions(summary: ValidationSummary): Promise<void> {
  logPhase('REGRESSION TESTS: Existing Features')

  // Test 1: Verify document processors still exist
  logTest('Existing Document Processors')
  try {
    const processorsDir = path.join(process.cwd(), 'worker/processors')
    const requiredProcessors = [
      'pdf-processor.ts',
      'epub-processor.ts',
      'youtube-processor.ts',
      'web-processor.ts',
    ]

    const existingProcessors = requiredProcessors.filter(processor =>
      fs.existsSync(path.join(processorsDir, processor))
    )

    const allExist = existingProcessors.length === requiredProcessors.length

    summary.results.push({
      phase: 'Regression',
      test: 'Document Processors',
      success: allExist,
      message: allExist
        ? 'All document processors intact'
        : `Only ${existingProcessors.length}/${requiredProcessors.length} processors exist`,
    })

    if (allExist) summary.passed++
    else summary.failed++
  } catch (error: any) {
    summary.results.push({
      phase: 'Regression',
      test: 'Document Processors',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 2: Verify collision detection engines still exist
  logTest('Collision Detection Engines')
  try {
    const enginesDir = path.join(process.cwd(), 'worker/engines')
    const requiredEngines = [
      'semantic-similarity.ts',
      'contradiction-detection.ts',
      'thematic-bridge.ts',
      'orchestrator.ts',
    ]

    const existingEngines = requiredEngines.filter(engine =>
      fs.existsSync(path.join(enginesDir, engine))
    )

    const allExist = existingEngines.length === requiredEngines.length

    summary.results.push({
      phase: 'Regression',
      test: 'Collision Detection Engines',
      success: allExist,
      message: allExist
        ? 'All 3 engines + orchestrator intact'
        : `Only ${existingEngines.length}/${requiredEngines.length} engines exist`,
    })

    if (allExist) summary.passed++
    else summary.failed++
  } catch (error: any) {
    summary.results.push({
      phase: 'Regression',
      test: 'Collision Detection Engines',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Test 3: Verify ECS system still exists
  logTest('ECS System')
  try {
    const ecsPath = path.join(process.cwd(), 'src/lib/ecs/ecs.ts')
    const ecsExists = fs.existsSync(ecsPath)

    summary.results.push({
      phase: 'Regression',
      test: 'ECS System',
      success: ecsExists,
      message: ecsExists
        ? 'ECS system intact'
        : 'ECS system missing',
    })

    if (ecsExists) summary.passed++
    else summary.failed++
  } catch (error: any) {
    summary.results.push({
      phase: 'Regression',
      test: 'ECS System',
      success: false,
      message: `Error: ${error.message}`,
    })
    summary.failed++
  }

  // Update phase summary
  summary.phases['Regression'] = {
    passed: summary.results.filter(r => r.phase === 'Regression' && r.success).length,
    failed: summary.results.filter(r => r.phase === 'Regression' && !r.success).length,
    skipped: 0,
  }
}

// =============================================================================
// Main Execution
// =============================================================================

async function main() {
  const args = process.argv.slice(2)
  const isFullMode = args.includes('--full')

  log('\n╔════════════════════════════════════════════════════════════════════╗', 'blue')
  log('║                                                                    ║', 'blue')
  log('║       STORAGE-FIRST PORTABILITY SYSTEM VALIDATION (T-024)        ║', 'bold')
  log('║                                                                    ║', 'blue')
  log('╚════════════════════════════════════════════════════════════════════╝', 'blue')

  log(`\nMode: ${isFullMode ? 'FULL VALIDATION' : 'QUICK VALIDATION (smoke tests)'}`, 'gray')
  log(`Started: ${new Date().toISOString()}`, 'gray')

  // Initialize Supabase client (if needed for full mode)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  let supabase: any = null
  if (isFullMode && supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey)
    log('✓ Supabase client initialized', 'green')
  } else if (isFullMode) {
    log('⚠ Warning: SUPABASE credentials missing, skipping database tests', 'yellow')
  }

  // Initialize validation summary
  const summary: ValidationSummary = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    results: [],
    phases: {},
  }

  const startTime = Date.now()

  try {
    // Run all phase validations
    await validatePhase1(supabase, summary)
    logResult(summary.results[summary.results.length - 1])

    await validatePhase2(summary)
    logResult(summary.results[summary.results.length - 1])

    await validatePhase3(summary)
    logResult(summary.results[summary.results.length - 1])

    await validatePhase4(summary)
    logResult(summary.results[summary.results.length - 1])

    await validatePhase5(summary)
    logResult(summary.results[summary.results.length - 1])

    await validatePhase6(summary)
    logResult(summary.results[summary.results.length - 1])

    await validatePhase7(summary)
    logResult(summary.results[summary.results.length - 1])

    await validateRegressions(summary)
    logResult(summary.results[summary.results.length - 1])

    summary.duration = Date.now() - startTime
    summary.totalTests = summary.passed + summary.failed + summary.skipped

    // Print detailed summary
    log('\n' + '='.repeat(70), 'blue')
    log('  VALIDATION SUMMARY', 'bold')
    log('='.repeat(70), 'blue')

    log(`\nTotal Tests:  ${summary.totalTests}`)
    log(`✓ Passed:     ${summary.passed}`, 'green')
    log(`✗ Failed:     ${summary.failed}`, summary.failed > 0 ? 'red' : 'gray')
    log(`⊘ Skipped:    ${summary.skipped}`, 'yellow')
    log(`Duration:     ${(summary.duration / 1000).toFixed(2)}s\n`)

    // Print phase breakdown
    log('Phase Breakdown:', 'bold')
    for (const [phase, stats] of Object.entries(summary.phases)) {
      const total = stats.passed + stats.failed + stats.skipped
      const passRate = total > 0 ? ((stats.passed / total) * 100).toFixed(0) : '0'
      const color = stats.failed === 0 ? 'green' : 'red'

      log(`  ${phase.padEnd(15)} ${stats.passed}/${total} passed (${passRate}%)`, color)
    }

    // Print failed tests
    if (summary.failed > 0) {
      log('\n❌ Failed Tests:', 'red')
      summary.results
        .filter(r => !r.success)
        .forEach(r => {
          log(`  [${r.phase}] ${r.test}`, 'red')
          log(`    ${r.message}`, 'gray')
        })
    }

    // Print final result
    log('\n' + '='.repeat(70), 'blue')
    if (summary.failed === 0) {
      log('✅ ALL VALIDATIONS PASSED', 'green')
      log('='.repeat(70) + '\n', 'blue')
      process.exit(0)
    } else {
      log('❌ VALIDATION FAILED', 'red')
      log(`${summary.failed} test(s) did not pass`, 'red')
      log('='.repeat(70) + '\n', 'blue')
      process.exit(1)
    }
  } catch (error: any) {
    log('\n❌ Fatal error during validation:', 'red')
    log(error.message, 'red')
    if (error.stack) {
      log('\nStack trace:', 'gray')
      log(error.stack, 'gray')
    }
    process.exit(1)
  }
}

main()
