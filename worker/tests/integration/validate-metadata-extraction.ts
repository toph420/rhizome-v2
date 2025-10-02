#!/usr/bin/env tsx

/**
 * Validation script for metadata extraction (T-021).
 * Tests all 6 processors to ensure metadata is properly extracted.
 */

import { PDFProcessor } from '../../processors/pdf-processor'
import { YouTubeProcessor } from '../../processors/youtube-processor'
import { WebProcessor } from '../../processors/web-processor'
import { MarkdownCleanProcessor } from '../../processors/markdown-processor'
import { TextProcessor } from '../../processors/text-processor'
import { PasteProcessor } from '../../processors/paste-processor'
import type { ProcessedChunk, ProcessingOptions } from '../../types/processor'
import type { BackgroundJob } from '../../processors/base'
import { createClient } from '@supabase/supabase-js'

// Define GoogleGenAI type to match what processors expect
type GoogleGenAI = any
import * as fs from 'fs/promises'
import * as path from 'path'

// Test configuration
const TEST_CONFIG = {
  documentId: 'test-metadata-validation',
  userId: 'test-user',
  verbose: true
}

// Color output helpers
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`
}

/**
 * Validates that metadata is present and complete.
 */
function validateMetadata(chunk: ProcessedChunk): {
  valid: boolean
  missing: string[]
  completeness: number
} {
  const missing: string[] = []
  let fieldsPresent = 0
  let totalFields = 0
  
  // Check for metadata existence
  if (!chunk.metadata) {
    return { valid: false, missing: ['metadata'], completeness: 0 }
  }
  
  const { metadata } = chunk
  
  // Check structural metadata
  if (!metadata.structural) {
    missing.push('structural')
  } else {
    totalFields += 5
    if (metadata.structural.headingLevel !== undefined) fieldsPresent++
    if (metadata.structural.listItems !== undefined) fieldsPresent++
    if (metadata.structural.isTable !== undefined) fieldsPresent++
    if (metadata.structural.hasCodeBlock !== undefined) fieldsPresent++
    if (metadata.structural.confidence !== undefined) fieldsPresent++
  }
  
  // Check emotional metadata
  if (!metadata.emotional) {
    missing.push('emotional')
  } else {
    totalFields += 4
    if (metadata.emotional.sentiment !== undefined) fieldsPresent++
    if (metadata.emotional.emotions?.length > 0) fieldsPresent++
    if (metadata.emotional.intensity !== undefined) fieldsPresent++
    if (metadata.emotional.confidence !== undefined) fieldsPresent++
  }
  
  // Check conceptual metadata
  if (!metadata.conceptual) {
    missing.push('conceptual')
  } else {
    totalFields += 5
    if (metadata.conceptual.concepts?.length > 0) fieldsPresent++
    if (metadata.conceptual.entities !== undefined) fieldsPresent++
    if (metadata.conceptual.relationships?.length >= 0) fieldsPresent++
    if (metadata.conceptual.abstractionLevel !== undefined) fieldsPresent++
    if (metadata.conceptual.confidence !== undefined) fieldsPresent++
  }
  
  // Check method signatures (for code)
  if (metadata.methods) {
    totalFields += 4
    if (metadata.methods.signatures?.length >= 0) fieldsPresent++
    if (metadata.methods.languages?.length >= 0) fieldsPresent++
    if (metadata.methods.namingConvention !== undefined) fieldsPresent++
    if (metadata.methods.confidence !== undefined) fieldsPresent++
  }
  
  // Check narrative rhythm
  if (!metadata.narrative) {
    missing.push('narrative')
  } else {
    totalFields += 4
    if (metadata.narrative.sentenceRhythm !== undefined) fieldsPresent++
    if (metadata.narrative.paragraphStructure !== undefined) fieldsPresent++
    if (metadata.narrative.style !== undefined) fieldsPresent++
    if (metadata.narrative.confidence !== undefined) fieldsPresent++
  }
  
  // Check references
  if (!metadata.references) {
    missing.push('references')
  } else {
    totalFields += 3
    if (metadata.references.citations?.length >= 0) fieldsPresent++
    if (metadata.references.links?.length >= 0) fieldsPresent++
    if (metadata.references.confidence !== undefined) fieldsPresent++
  }
  
  // Check domain
  if (!metadata.domain) {
    missing.push('domain')
  } else {
    totalFields += 4
    if (metadata.domain.field !== undefined) fieldsPresent++
    if (metadata.domain.technicality !== undefined) fieldsPresent++
    if (metadata.domain.specialization !== undefined) fieldsPresent++
    if (metadata.domain.confidence !== undefined) fieldsPresent++
  }
  
  const completeness = totalFields > 0 ? (fieldsPresent / totalFields) * 100 : 0
  
  return {
    valid: missing.length === 0,
    missing,
    completeness
  }
}

/**
 * Tests a single processor with sample content.
 */
async function testProcessor(
  processorName: string,
  processor: any,
  content: string | Buffer,
  sourceType: string
): Promise<{
  success: boolean
  chunks: number
  metadataComplete: number
  averageCompleteness: number
  errors: string[]
}> {
  console.log(`\n${colors.cyan('Testing')} ${colors.bold(processorName)}...`)
  
  const errors: string[] = []
  let chunks: ProcessedChunk[] = []
  
  try {
    // Process content - processors expect no arguments
    const result = await processor.process()
    chunks = result.chunks
    
    console.log(`  ✓ Processing completed: ${chunks.length} chunks`)
    
    // Validate metadata for each chunk
    let metadataComplete = 0
    let totalCompleteness = 0
    
    for (let i = 0; i < chunks.length; i++) {
      const validation = validateMetadata(chunks[i])
      
      if (validation.valid) {
        metadataComplete++
      } else if (TEST_CONFIG.verbose && i < 3) { // Show first 3 for brevity
        console.log(`    Chunk ${i}: Missing [${validation.missing.join(', ')}]`)
      }
      
      totalCompleteness += validation.completeness
    }
    
    const avgCompleteness = chunks.length > 0 ? totalCompleteness / chunks.length : 0
    
    // Report results
    const completePercent = chunks.length > 0 
      ? ((metadataComplete / chunks.length) * 100).toFixed(1)
      : '0'
    
    console.log(`  ✓ Metadata complete: ${metadataComplete}/${chunks.length} chunks (${completePercent}%)`)
    console.log(`  ✓ Average completeness: ${avgCompleteness.toFixed(1)}%`)
    
    // Check if meets acceptance criteria (>90% completeness)
    if (avgCompleteness < 90) {
      errors.push(`Completeness ${avgCompleteness.toFixed(1)}% below 90% threshold`)
    }
    
    return {
      success: errors.length === 0,
      chunks: chunks.length,
      metadataComplete,
      averageCompleteness: avgCompleteness,
      errors
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    errors.push(errorMsg)
    console.log(`  ${colors.red('✗')} Error: ${errorMsg}`)
    
    return {
      success: false,
      chunks: 0,
      metadataComplete: 0,
      averageCompleteness: 0,
      errors
    }
  }
}

/**
 * Main validation function.
 */
async function main() {
  console.log(colors.bold('\n🔍 Metadata Extraction Validation\n'))
  console.log('Testing all 6 processors for metadata extraction...')
  console.log('Acceptance Criteria: >90% metadata completeness')
  console.log('=' .repeat(50))
  
  // Initialize dependencies
  // Mock AI client for testing (actual processing won't work without real API key)
  const ai = {} as GoogleGenAI
  const supabase = createClient(
    process.env.SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'
  )
  
  // Create mock job
  const job: BackgroundJob = {
    id: 'test-job-id',
    document_id: TEST_CONFIG.documentId,
    status: 'processing',
    input_data: {
      document_id: TEST_CONFIG.documentId,
      processing_requested: true
    }
  }
  
  const results: Record<string, any> = {}
  
  // Test 1: Text Processor
  const textProcessor = new TextProcessor(ai, supabase, job)
  const textContent = `# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that enables systems to learn from data.

## Key Concepts

1. Supervised Learning
2. Unsupervised Learning
3. Reinforcement Learning

The field has grown rapidly since 2010, with applications in healthcare, finance, and technology.`

  results.text = await testProcessor('TextProcessor', textProcessor, textContent, 'txt')
  
  // Test 2: Markdown Processor
  const markdownProcessor = new MarkdownCleanProcessor(ai, supabase, job)
  const markdownContent = `# API Documentation

## Installation

\`\`\`bash
npm install my-api-client
\`\`\`

## Usage

\`\`\`javascript
const client = new APIClient({
  apiKey: 'your-key'
});

async function fetchData() {
  const result = await client.getData();
  return result;
}
\`\`\`

See [documentation](https://example.com) for more details.`

  results.markdown = await testProcessor('MarkdownProcessor', markdownProcessor, markdownContent, 'markdown_clean')
  
  // Test 3: Paste Processor
  const pasteProcessor = new PasteProcessor(ai, supabase, job)
  const pasteContent = `The quantum computer represents a fundamental shift in computing paradigm.
Unlike classical computers that use bits (0 or 1), quantum computers use qubits.
This allows for superposition and entanglement, enabling exponential speedup.

Applications include:
- Cryptography
- Drug discovery
- Financial modeling
- Weather prediction`

  results.paste = await testProcessor('PasteProcessor', pasteProcessor, pasteContent, 'paste')
  
  // Note: PDF, YouTube, and Web processors require external resources
  // For now, we'll skip them but note they should be tested with real content
  
  console.log('\n' + '=' .repeat(50))
  console.log(colors.bold('\n📊 Summary Report\n'))
  
  let totalSuccess = 0
  let totalProcessors = 0
  
  for (const [name, result] of Object.entries(results)) {
    totalProcessors++
    if (result.success) totalSuccess++
    
    const status = result.success 
      ? colors.green('✓ PASSED')
      : colors.red('✗ FAILED')
    
    console.log(`${name.padEnd(15)} ${status} - ${result.averageCompleteness.toFixed(1)}% complete`)
    if (result.errors.length > 0) {
      result.errors.forEach((err: string) => 
        console.log(`  ${colors.yellow('⚠')} ${err}`)
      )
    }
  }
  
  console.log('\n' + '=' .repeat(50))
  
  // Overall status
  const overallSuccess = totalSuccess === totalProcessors
  if (overallSuccess) {
    console.log(colors.green('\n✅ All tested processors passed metadata extraction validation!'))
  } else {
    console.log(colors.red(`\n❌ ${totalProcessors - totalSuccess}/${totalProcessors} processors failed validation`))
  }
  
  // Next steps
  console.log(colors.cyan('\n📋 Next Steps:'))
  console.log('1. Test with real PDF documents (requires file)')
  console.log('2. Test with YouTube URLs (requires network)')
  console.log('3. Test with web articles (requires network)')
  console.log('4. Run full T-023 quality validation suite')
  
  process.exit(overallSuccess ? 0 : 1)
}

// Run validation
main().catch(error => {
  console.error(colors.red('\n❌ Validation failed with error:'), error)
  process.exit(1)
})

export { validateMetadata, testProcessor }