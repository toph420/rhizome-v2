/**
 * Manual Validation Script for Storage Export (T-006)
 *
 * Usage:
 *   npx tsx scripts/validate-storage-export.ts <document_id> <user_id> [mode]
 *
 * Examples:
 *   npx tsx scripts/validate-storage-export.ts doc-123 user-456 cloud
 *   npx tsx scripts/validate-storage-export.ts doc-789 user-456 local
 *
 * This script validates:
 * - All expected files exist in Storage
 * - JSON files conform to TypeScript schemas
 * - manifest.json has accurate file inventory
 * - cached_chunks.json exists in LOCAL mode
 * - Schema version fields are correct
 */

import { createClient } from '@supabase/supabase-js'
import type {
  ChunksExport,
  CachedChunksExport,
  ManifestExport,
  MetadataExport
} from '../types/storage'
import { readFromStorage, hashContent } from '../lib/storage-helpers'

interface ValidationResult {
  success: boolean
  message: string
  details?: any
}

interface ValidationSummary {
  passed: number
  failed: number
  warnings: number
  results: ValidationResult[]
}

async function validateStorageExport(
  documentId: string,
  userId: string,
  mode: 'local' | 'cloud' = 'cloud'
): Promise<ValidationSummary> {
  const summary: ValidationSummary = {
    passed: 0,
    failed: 0,
    warnings: 0,
    results: []
  }

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    summary.results.push({
      success: false,
      message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    })
    summary.failed++
    return summary
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const storagePath = `${userId}/${documentId}`

  console.log(`\n📋 Validating Storage Export for Document: ${documentId}`)
  console.log(`📁 Storage Path: ${storagePath}`)
  console.log(`🔧 Processing Mode: ${mode.toUpperCase()}\n`)

  // Define expected files
  const expectedFiles = {
    required: ['chunks.json', 'markdown.json', 'manifest.json'],
    localOnly: mode === 'local' ? ['cached_chunks.json', 'metadata.json'] : []
  }

  const allExpectedFiles = [...expectedFiles.required, ...expectedFiles.localOnly]

  // 1. Validate file existence
  console.log('✓ Step 1: Checking file existence...')
  for (const filename of allExpectedFiles) {
    try {
      const data = await readFromStorage(supabase, `${storagePath}/${filename}`)
      summary.results.push({
        success: true,
        message: `✓ ${filename} exists`,
        details: { size: JSON.stringify(data).length }
      })
      summary.passed++
    } catch (error: any) {
      summary.results.push({
        success: false,
        message: `✗ ${filename} missing: ${error.message}`
      })
      summary.failed++
    }
  }

  // 2. Validate chunks.json schema
  console.log('\n✓ Step 2: Validating chunks.json schema...')
  try {
    const chunksData = await readFromStorage<ChunksExport>(supabase, `${storagePath}/chunks.json`)

    // Validate required fields
    const validations = [
      { field: 'version', value: chunksData.version, expected: '1.0' },
      { field: 'document_id', value: chunksData.document_id, expected: documentId },
      { field: 'processing_mode', value: chunksData.processing_mode, expected: mode },
      { field: 'created_at', value: chunksData.created_at, type: 'iso-date' },
      { field: 'chunks', value: chunksData.chunks, type: 'array' }
    ]

    for (const validation of validations) {
      if (validation.type === 'iso-date') {
        const isValid = /^\d{4}-\d{2}-\d{2}T/.test(validation.value as string)
        if (isValid) {
          summary.results.push({
            success: true,
            message: `✓ chunks.json: ${validation.field} is valid ISO date`
          })
          summary.passed++
        } else {
          summary.results.push({
            success: false,
            message: `✗ chunks.json: ${validation.field} is not valid ISO date`
          })
          summary.failed++
        }
      } else if (validation.type === 'array') {
        const isValid = Array.isArray(validation.value)
        if (isValid) {
          summary.results.push({
            success: true,
            message: `✓ chunks.json: ${validation.field} is array with ${(validation.value as any[]).length} items`
          })
          summary.passed++
        } else {
          summary.results.push({
            success: false,
            message: `✗ chunks.json: ${validation.field} is not an array`
          })
          summary.failed++
        }
      } else {
        if (validation.value === validation.expected) {
          summary.results.push({
            success: true,
            message: `✓ chunks.json: ${validation.field} = "${validation.value}"`
          })
          summary.passed++
        } else {
          summary.results.push({
            success: false,
            message: `✗ chunks.json: ${validation.field} = "${validation.value}", expected "${validation.expected}"`
          })
          summary.failed++
        }
      }
    }

    // Validate chunk structure
    if (chunksData.chunks.length > 0) {
      const chunk = chunksData.chunks[0]
      const chunkFields = ['content', 'chunk_index', 'themes', 'importance_score']

      for (const field of chunkFields) {
        if ((chunk as any)[field] !== undefined) {
          summary.results.push({
            success: true,
            message: `✓ chunks.json: chunk[0].${field} exists`
          })
          summary.passed++
        } else {
          summary.results.push({
            success: false,
            message: `✗ chunks.json: chunk[0].${field} missing`
          })
          summary.failed++
        }
      }

      // Validate importance_score range
      if (chunk.importance_score !== undefined) {
        const isValid = chunk.importance_score >= 0 && chunk.importance_score <= 1
        if (isValid) {
          summary.results.push({
            success: true,
            message: `✓ chunks.json: importance_score in valid range [0, 1]`
          })
          summary.passed++
        } else {
          summary.results.push({
            success: false,
            message: `✗ chunks.json: importance_score out of range: ${chunk.importance_score}`
          })
          summary.failed++
        }
      }

      // Check for excluded fields
      const excludedFields = ['id', 'embedding', 'document_id']
      for (const field of excludedFields) {
        if ((chunk as any)[field] === undefined) {
          summary.results.push({
            success: true,
            message: `✓ chunks.json: chunk[0].${field} correctly excluded`
          })
          summary.passed++
        } else {
          summary.results.push({
            success: false,
            message: `✗ chunks.json: chunk[0].${field} should be excluded (not portable)`
          })
          summary.failed++
        }
      }
    } else {
      summary.results.push({
        success: false,
        message: '✗ chunks.json: No chunks found'
      })
      summary.failed++
    }
  } catch (error: any) {
    summary.results.push({
      success: false,
      message: `✗ chunks.json validation failed: ${error.message}`
    })
    summary.failed++
  }

  // 3. Validate manifest.json
  console.log('\n✓ Step 3: Validating manifest.json...')
  try {
    const manifestData = await readFromStorage<ManifestExport>(supabase, `${storagePath}/manifest.json`)

    // Validate required fields
    if (manifestData.version === '1.0') {
      summary.results.push({
        success: true,
        message: '✓ manifest.json: version = "1.0"'
      })
      summary.passed++
    } else {
      summary.results.push({
        success: false,
        message: `✗ manifest.json: invalid version "${manifestData.version}"`
      })
      summary.failed++
    }

    // Validate files inventory
    const requiredFileEntries = ['source', 'content', 'chunks', 'metadata']
    for (const entry of requiredFileEntries) {
      if ((manifestData.files as any)[entry]) {
        const fileEntry = (manifestData.files as any)[entry]
        if (fileEntry.path && fileEntry.size !== undefined && fileEntry.hash) {
          summary.results.push({
            success: true,
            message: `✓ manifest.json: files.${entry} has path, size, hash`
          })
          summary.passed++
        } else {
          summary.results.push({
            success: false,
            message: `✗ manifest.json: files.${entry} missing required fields`
          })
          summary.failed++
        }
      } else {
        summary.results.push({
          success: false,
          message: `✗ manifest.json: files.${entry} missing`
        })
        summary.failed++
      }
    }

    // Validate chunks count
    if (manifestData.files.chunks.count !== undefined && manifestData.files.chunks.count > 0) {
      summary.results.push({
        success: true,
        message: `✓ manifest.json: chunks.count = ${manifestData.files.chunks.count}`
      })
      summary.passed++
    } else {
      summary.results.push({
        success: false,
        message: '✗ manifest.json: chunks.count missing or zero'
      })
      summary.failed++
    }

    // Validate processing costs
    const costFields = ['extraction', 'metadata', 'embeddings', 'connections', 'total']
    for (const field of costFields) {
      const value = (manifestData.processing_cost as any)[field]
      if (typeof value === 'number' && value >= 0) {
        summary.results.push({
          success: true,
          message: `✓ manifest.json: processing_cost.${field} = $${value.toFixed(2)}`
        })
        summary.passed++
      } else {
        summary.results.push({
          success: false,
          message: `✗ manifest.json: processing_cost.${field} invalid`
        })
        summary.failed++
      }
    }

    // Validate processing times
    const timeFields = ['extraction', 'cleanup', 'chunking', 'metadata', 'embeddings', 'total']
    for (const field of timeFields) {
      const value = (manifestData.processing_time as any)[field]
      if (typeof value === 'number' && value >= 0) {
        summary.results.push({
          success: true,
          message: `✓ manifest.json: processing_time.${field} = ${value}s`
        })
        summary.passed++
      } else {
        summary.results.push({
          success: false,
          message: `✗ manifest.json: processing_time.${field} invalid`
        })
        summary.failed++
      }
    }
  } catch (error: any) {
    summary.results.push({
      success: false,
      message: `✗ manifest.json validation failed: ${error.message}`
    })
    summary.failed++
  }

  // 4. Validate cached_chunks.json (LOCAL mode only)
  if (mode === 'local') {
    console.log('\n✓ Step 4: Validating cached_chunks.json (LOCAL mode)...')
    try {
      const cachedData = await readFromStorage<CachedChunksExport>(
        supabase,
        `${storagePath}/cached_chunks.json`
      )

      // Validate schema
      if (cachedData.version === '1.0') {
        summary.results.push({
          success: true,
          message: '✓ cached_chunks.json: version = "1.0"'
        })
        summary.passed++
      }

      if (cachedData.extraction_mode === 'pdf' || cachedData.extraction_mode === 'epub') {
        summary.results.push({
          success: true,
          message: `✓ cached_chunks.json: extraction_mode = "${cachedData.extraction_mode}"`
        })
        summary.passed++
      }

      // Validate markdown_hash format
      if (/^[a-f0-9]{64}$/.test(cachedData.markdown_hash)) {
        summary.results.push({
          success: true,
          message: '✓ cached_chunks.json: markdown_hash is valid SHA256'
        })
        summary.passed++
      } else {
        summary.results.push({
          success: false,
          message: '✗ cached_chunks.json: markdown_hash is not valid SHA256'
        })
        summary.failed++
      }

      // Validate chunks array
      if (Array.isArray(cachedData.chunks)) {
        summary.results.push({
          success: true,
          message: `✓ cached_chunks.json: chunks array with ${cachedData.chunks.length} items`
        })
        summary.passed++
      }

      // Validate structure
      if (cachedData.structure && Array.isArray(cachedData.structure.headings)) {
        summary.results.push({
          success: true,
          message: `✓ cached_chunks.json: structure.headings array with ${cachedData.structure.headings.length} items`
        })
        summary.passed++
      }

      if (cachedData.structure && typeof cachedData.structure.total_pages === 'number') {
        summary.results.push({
          success: true,
          message: `✓ cached_chunks.json: structure.total_pages = ${cachedData.structure.total_pages}`
        })
        summary.passed++
      }

      // Validate hash matches markdown
      try {
        const markdownData = await readFromStorage<{ content: string }>(
          supabase,
          `${storagePath}/markdown.json`
        )
        const actualHash = hashContent(markdownData.content)

        if (actualHash === cachedData.markdown_hash) {
          summary.results.push({
            success: true,
            message: '✓ cached_chunks.json: markdown_hash matches content'
          })
          summary.passed++
        } else {
          summary.results.push({
            success: false,
            message: '✗ cached_chunks.json: markdown_hash does NOT match content'
          })
          summary.failed++
        }
      } catch (error: any) {
        summary.results.push({
          success: false,
          message: `⚠ cached_chunks.json: could not verify markdown_hash: ${error.message}`
        })
        summary.warnings++
      }
    } catch (error: any) {
      summary.results.push({
        success: false,
        message: `✗ cached_chunks.json validation failed: ${error.message}`
      })
      summary.failed++
    }
  }

  return summary
}

// Main execution
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/validate-storage-export.ts <document_id> <user_id> [mode]')
    console.error('')
    console.error('Examples:')
    console.error('  npx tsx scripts/validate-storage-export.ts doc-123 user-456 cloud')
    console.error('  npx tsx scripts/validate-storage-export.ts doc-789 user-456 local')
    process.exit(1)
  }

  const documentId = args[0]
  const userId = args[1]
  const mode = (args[2] || 'cloud') as 'local' | 'cloud'

  if (mode !== 'local' && mode !== 'cloud') {
    console.error('Error: mode must be "local" or "cloud"')
    process.exit(1)
  }

  try {
    const summary = await validateStorageExport(documentId, userId, mode)

    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 VALIDATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`✓ Passed:   ${summary.passed}`)
    console.log(`✗ Failed:   ${summary.failed}`)
    console.log(`⚠ Warnings: ${summary.warnings}`)
    console.log('='.repeat(60))

    // Print failed results
    if (summary.failed > 0) {
      console.log('\n❌ Failed Validations:')
      summary.results
        .filter(r => !r.success)
        .forEach(r => console.log(`  ${r.message}`))
    }

    // Print warnings
    if (summary.warnings > 0) {
      console.log('\n⚠️  Warnings:')
      summary.results
        .filter(r => r.message.startsWith('⚠'))
        .forEach(r => console.log(`  ${r.message}`))
    }

    // Exit with appropriate code
    if (summary.failed > 0) {
      console.log('\n❌ Validation FAILED\n')
      process.exit(1)
    } else if (summary.warnings > 0) {
      console.log('\n⚠️  Validation PASSED with warnings\n')
      process.exit(0)
    } else {
      console.log('\n✅ Validation PASSED\n')
      process.exit(0)
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error during validation:', error.message)
    process.exit(1)
  }
}

main()
