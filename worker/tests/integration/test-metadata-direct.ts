#!/usr/bin/env tsx

/**
 * Direct test of metadata extraction without processor overhead.
 * Tests the metadata extraction pipeline directly.
 */

import { extractMetadata } from '../../lib/metadata-extractor'
import type { ProcessedChunk } from '../../types/processor'
import type { ChunkMetadata } from '../../types/metadata'

// Color output helpers
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`
}

// Test chunks with various content types
const testChunks: ProcessedChunk[] = [
  {
    content: `# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that enables systems to learn from data.

## Key Concepts

1. Supervised Learning - Learning from labeled examples
2. Unsupervised Learning - Finding patterns in unlabeled data  
3. Reinforcement Learning - Learning through rewards and penalties

The field has grown rapidly since 2010, with applications in healthcare, finance, and technology.`,
    chunkIndex: 0,
    startOffset: 0,
    endOffset: 300,
    documentId: 'test-doc',
    themes: ['machine learning', 'AI', 'data science']
  },
  {
    content: `## Code Example

Here's a simple Python function to calculate accuracy:

\`\`\`python
def calculate_accuracy(predictions, labels):
    correct = sum(p == l for p, l in zip(predictions, labels))
    return correct / len(labels) * 100
\`\`\`

This function compares predictions with ground truth labels.`,
    chunkIndex: 1,
    startOffset: 301,
    endOffset: 600,
    documentId: 'test-doc',
    themes: ['programming', 'metrics']
  },
  {
    content: `The implications are profound. As noted by Turing (1950), "We can only see a short distance ahead, but we can see plenty there that needs to be done."

This prescient observation continues to guide AI research today. The challenges include:

- Ethical considerations
- Data privacy concerns
- Computational requirements
- Interpretability of models`,
    chunkIndex: 2,
    startOffset: 601,
    endOffset: 900,
    documentId: 'test-doc',
    themes: ['ethics', 'challenges', 'history']
  }
]

/**
 * Validates metadata completeness.
 */
function validateMetadata(metadata: ChunkMetadata | undefined): {
  isComplete: boolean
  score: number
  missing: string[]
} {
  if (!metadata) {
    return { isComplete: false, score: 0, missing: ['all metadata'] }
  }

  const missing: string[] = []
  let fieldsChecked = 0
  let fieldsPresent = 0

  // Check each metadata type
  const checks = [
    { name: 'structural', obj: metadata.structural },
    { name: 'emotional', obj: metadata.emotional },
    { name: 'conceptual', obj: metadata.conceptual },
    { name: 'narrative', obj: metadata.narrative },
    { name: 'references', obj: metadata.references },
    { name: 'domain', obj: metadata.domain }
  ]

  for (const { name, obj } of checks) {
    fieldsChecked++
    if (!obj) {
      missing.push(name)
    } else {
      fieldsPresent++
      
      // Check for confidence scores
      if ('confidence' in obj) {
        fieldsChecked++
        if (typeof obj.confidence === 'number' && obj.confidence > 0) {
          fieldsPresent++
        } else {
          missing.push(`${name}.confidence`)
        }
      }
    }
  }

  // Method signatures are optional (only for code)
  if (metadata.methods) {
    fieldsChecked++
    fieldsPresent++
  }

  const score = fieldsChecked > 0 ? (fieldsPresent / fieldsChecked) * 100 : 0
  const isComplete = missing.length === 0 && score >= 90

  return { isComplete, score, missing }
}

/**
 * Main test function.
 */
async function main() {
  console.log(colors.bold('\n🔬 Direct Metadata Extraction Test\n'))
  console.log('Testing metadata extraction pipeline directly...')
  console.log('=' .repeat(50))

  let totalScore = 0
  let completeCount = 0

  for (let i = 0; i < testChunks.length; i++) {
    const chunk = testChunks[i]
    console.log(`\n${colors.cyan(`Test Chunk ${i + 1}:`)} "${chunk.content.substring(0, 50)}..."`)
    
    try {
      // Extract metadata
      console.log('  Extracting metadata...')
      const startTime = Date.now()
      const metadata = await extractMetadata(chunk, {
        skipMetadataExtraction: false,
        aiClient: null // Will use mock extraction
      } as any)
      const elapsed = Date.now() - startTime
      
      // Add metadata to chunk
      chunk.metadata = metadata

      // Validate
      const validation = validateMetadata(metadata)
      totalScore += validation.score
      if (validation.isComplete) completeCount++

      // Report
      const status = validation.isComplete ? colors.green('✓') : colors.yellow('⚠')
      console.log(`  ${status} Completeness: ${validation.score.toFixed(1)}% (${elapsed}ms)`)
      
      if (!validation.isComplete && validation.missing.length > 0) {
        console.log(`  Missing: ${validation.missing.join(', ')}`)
      }

      // Show sample metadata
      if (metadata) {
        console.log(`  Sample fields:`)
        if (metadata.structural) {
          console.log(`    - Headings: ${metadata.structural.headingLevel || 'none'}`)
          console.log(`    - Lists: ${metadata.structural.listItems || 0}`)
        }
        if (metadata.emotional) {
          console.log(`    - Sentiment: ${metadata.emotional.sentiment || 'neutral'}`)
        }
        if (metadata.conceptual?.concepts?.length) {
          const concepts = metadata.conceptual.concepts.slice(0, 3).map(c => c.text)
          console.log(`    - Concepts: ${concepts.join(', ')}`)
        }
        if (metadata.domain) {
          console.log(`    - Domain: ${metadata.domain.field || 'general'}`)
        }
      }

    } catch (error) {
      console.log(`  ${colors.red('✗')} Error: ${error instanceof Error ? error.message : error}`)
    }
  }

  // Summary
  console.log('\n' + '=' .repeat(50))
  console.log(colors.bold('\n📊 Test Summary\n'))
  
  const avgScore = testChunks.length > 0 ? totalScore / testChunks.length : 0
  const passRate = (completeCount / testChunks.length * 100).toFixed(1)
  
  console.log(`Average Completeness: ${avgScore.toFixed(1)}%`)
  console.log(`Complete Chunks: ${completeCount}/${testChunks.length} (${passRate}%)`)
  
  // Check acceptance criteria
  const passed = avgScore >= 90
  if (passed) {
    console.log(colors.green('\n✅ PASSED: Metadata extraction meets 90% completeness target!'))
  } else {
    console.log(colors.red(`\n❌ FAILED: Completeness ${avgScore.toFixed(1)}% is below 90% target`))
  }

  // Performance notes
  console.log(colors.cyan('\n📝 Notes:'))
  console.log('- This test uses the extraction pipeline directly')
  console.log('- Real processing would use Gemini AI for better quality')
  console.log('- Target: <400ms per chunk extraction')

  process.exit(passed ? 0 : 1)
}

// Run test
main().catch(error => {
  console.error(colors.red('\n❌ Test failed:'), error)
  process.exit(1)
})