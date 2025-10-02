#!/usr/bin/env tsx
/**
 * AI Metadata Quality Benchmark (Task T-012)
 *
 * Measures and validates AI metadata extraction quality across different content types.
 * Tests emotional polarity accuracy, concept extraction precision, and cross-processor
 * consistency.
 *
 * Quality Targets (from Task T-012):
 * - Emotional polarity accuracy: ±0.2 range
 * - Primary emotion classification: >80% accuracy
 * - Concept extraction precision: >85%
 * - Concept importance correlation: >0.7
 * - Cross-processor schema consistency: 100%
 */

import { performance } from 'perf_hooks'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch'
import type { AIChunkMetadata } from '../types/ai-metadata'

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

/**
 * Test sample with expected metadata characteristics
 */
interface QualityTestSample {
  content: string
  category: 'technical' | 'narrative' | 'academic' | 'mixed'
  expectedPolarity: {
    value: number
    tolerance: number
  }
  expectedEmotion: string
  expectedConcepts: string[]
  expectedDomain?: string
}

/**
 * Quality metrics for a test run
 */
interface QualityMetrics {
  sample: string
  polarityAccuracy: number      // 0-1, closeness to expected
  emotionCorrect: boolean
  conceptPrecision: number      // 0-1, % of extracted concepts that are correct
  conceptRecall: number         // 0-1, % of expected concepts found
  domainCorrect: boolean
  schemaValid: boolean
  extractionTime: number        // ms
}

/**
 * Test samples with known characteristics
 */
const TEST_SAMPLES: QualityTestSample[] = [
  {
    content: `# Breakthrough in Quantum Computing\n\nScientists have achieved an amazing milestone in quantum computing, demonstrating exceptional performance improvements. This revolutionary advancement opens exciting new possibilities for innovation. The team celebrates this remarkable success that promises to transform the field.`,
    category: 'technical',
    expectedPolarity: { value: 0.7, tolerance: 0.2 },
    expectedEmotion: 'joy',
    expectedConcepts: ['quantum computing', 'breakthrough', 'performance', 'innovation'],
    expectedDomain: 'technical'
  },
  {
    content: `# Critical Security Vulnerability Discovered\n\nExperts warn of a dangerous security flaw that threatens user data integrity. The alarming vulnerability poses serious risks and requires immediate action. Security researchers express grave concerns about potential catastrophic failures.`,
    category: 'technical',
    expectedPolarity: { value: -0.7, tolerance: 0.2 },
    expectedEmotion: 'fear',
    expectedConcepts: ['security', 'vulnerability', 'threat', 'risk'],
    expectedDomain: 'technical'
  },
  {
    content: `# API Documentation Reference\n\nThe service provides standard REST endpoints for data access. Authentication uses Bearer tokens in the Authorization header. Response codes follow HTTP conventions: 200 for success, 400 for bad requests, 500 for server errors.`,
    category: 'technical',
    expectedPolarity: { value: 0.0, tolerance: 0.3 },
    expectedEmotion: 'neutral',
    expectedConcepts: ['API', 'authentication', 'REST', 'HTTP'],
    expectedDomain: 'technical'
  },
  {
    content: `# Machine Learning Fundamentals\n\nMachine learning algorithms process data through neural networks to identify patterns. Deep learning models use multiple layers for feature extraction. Training requires large datasets and significant computational resources. Key concepts include supervised learning, unsupervised learning, and reinforcement learning.`,
    category: 'academic',
    expectedPolarity: { value: 0.0, tolerance: 0.3 },
    expectedEmotion: 'neutral',
    expectedConcepts: ['machine learning', 'neural networks', 'deep learning', 'training', 'supervised learning'],
    expectedDomain: 'academic'
  },
  {
    content: `# Climate Change Impact\n\nGlobal warming affects ecosystems worldwide through rising temperatures. Carbon emissions contribute to greenhouse gas accumulation. Renewable energy solutions offer sustainable alternatives to fossil fuels. Conservation efforts focus on biodiversity protection and ecosystem restoration.`,
    category: 'academic',
    expectedPolarity: { value: -0.3, tolerance: 0.3 },
    expectedEmotion: 'concern',
    expectedConcepts: ['climate change', 'global warming', 'emissions', 'renewable energy', 'conservation'],
    expectedDomain: 'environmental'
  },
  {
    content: `The journey through the misty forest filled her with wonder. Each step revealed new mysteries, and the ancient trees seemed to whisper forgotten secrets. A sense of magic permeated the air, transforming the ordinary path into an extraordinary adventure.`,
    category: 'narrative',
    expectedPolarity: { value: 0.5, tolerance: 0.3 },
    expectedEmotion: 'wonder',
    expectedConcepts: ['journey', 'forest', 'mystery', 'magic', 'adventure'],
    expectedDomain: 'narrative'
  }
]

/**
 * Validates AIChunkMetadata schema completeness
 */
function validateMetadataSchema(metadata: any): boolean {
  try {
    // Required top-level fields
    if (!metadata.themes || !Array.isArray(metadata.themes)) return false
    if (!metadata.concepts || !Array.isArray(metadata.concepts)) return false
    if (typeof metadata.importance !== 'number') return false
    if (!metadata.emotional || typeof metadata.emotional !== 'object') return false

    // Concepts structure
    for (const concept of metadata.concepts) {
      if (typeof concept.text !== 'string') return false
      if (typeof concept.importance !== 'number') return false
      if (concept.importance < 0 || concept.importance > 1) return false
    }

    // Importance range
    if (metadata.importance < 0 || metadata.importance > 1) return false

    // Emotional metadata structure
    if (typeof metadata.emotional.polarity !== 'number') return false
    if (metadata.emotional.polarity < -1 || metadata.emotional.polarity > 1) return false
    if (typeof metadata.emotional.primaryEmotion !== 'string') return false
    if (typeof metadata.emotional.intensity !== 'number') return false
    if (metadata.emotional.intensity < 0 || metadata.emotional.intensity > 1) return false

    return true
  } catch (error) {
    return false
  }
}

/**
 * Calculate polarity accuracy (0-1 scale)
 */
function calculatePolarityAccuracy(actual: number, expected: number, tolerance: number): number {
  const difference = Math.abs(actual - expected)
  if (difference <= tolerance) {
    return 1.0 - (difference / tolerance)
  }
  return 0
}

/**
 * Calculate concept precision and recall
 */
function calculateConceptMetrics(
  extracted: string[],
  expected: string[]
): { precision: number; recall: number } {
  if (extracted.length === 0) {
    return { precision: 0, recall: 0 }
  }

  const extractedLower = extracted.map(c => c.toLowerCase())
  const expectedLower = expected.map(c => c.toLowerCase())

  // Count matches (using substring matching for flexibility)
  const truePositives = extractedLower.filter(e =>
    expectedLower.some(exp => e.includes(exp) || exp.includes(e))
  ).length

  const precision = truePositives / extracted.length
  const recall = truePositives / expected.length

  return { precision, recall }
}

/**
 * Test metadata quality for a single sample
 */
async function testSampleQuality(sample: QualityTestSample, realAI: boolean): Promise<QualityMetrics> {
  const startTime = performance.now()

  let metadata: AIChunkMetadata

  if (realAI) {
    // Use real AI extraction
    const chunks = await batchChunkAndExtractMetadata(sample.content, {
      apiKey: process.env.GOOGLE_AI_API_KEY,
      maxBatchSize: 100000
    })

    if (chunks.length === 0) {
      throw new Error('No chunks extracted')
    }

    metadata = chunks[0].metadata
  } else {
    // Mock metadata for testing
    metadata = {
      themes: sample.expectedConcepts.slice(0, 3),
      concepts: sample.expectedConcepts.map((text, i) => ({
        text,
        importance: 0.9 - (i * 0.1)
      })),
      importance: 0.8,
      summary: sample.content.substring(0, 100),
      domain: sample.expectedDomain,
      emotional: {
        polarity: sample.expectedPolarity.value,
        primaryEmotion: sample.expectedEmotion,
        intensity: Math.abs(sample.expectedPolarity.value)
      }
    }
  }

  const extractionTime = performance.now() - startTime

  // Calculate quality metrics
  const polarityAccuracy = calculatePolarityAccuracy(
    metadata.emotional.polarity,
    sample.expectedPolarity.value,
    sample.expectedPolarity.tolerance
  )

  const emotionCorrect = metadata.emotional.primaryEmotion.toLowerCase().includes(sample.expectedEmotion.toLowerCase()) ||
    sample.expectedEmotion.toLowerCase().includes(metadata.emotional.primaryEmotion.toLowerCase())

  const extractedConcepts = metadata.concepts.map(c => c.text)
  const { precision, recall } = calculateConceptMetrics(extractedConcepts, sample.expectedConcepts)

  const domainCorrect = sample.expectedDomain ?
    (metadata.domain?.toLowerCase() === sample.expectedDomain.toLowerCase() ||
      metadata.domain?.toLowerCase().includes(sample.expectedDomain.toLowerCase()) ||
      sample.expectedDomain.toLowerCase().includes(metadata.domain?.toLowerCase() || '')) :
    true

  const schemaValid = validateMetadataSchema(metadata)

  return {
    sample: sample.content.substring(0, 50) + '...',
    polarityAccuracy,
    emotionCorrect,
    conceptPrecision: precision,
    conceptRecall: recall,
    domainCorrect,
    schemaValid,
    extractionTime
  }
}

/**
 * Run quality benchmark suite
 */
async function runQualityBenchmark(realAI: boolean = false): Promise<void> {
  console.log(`${colors.bright}${colors.cyan}`)
  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║      AI Metadata Quality Benchmark (Task T-012)                 ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log(colors.reset)

  console.log(`${colors.gray}Mode: ${realAI ? 'Real AI' : 'Mock'} | Samples: ${TEST_SAMPLES.length}${colors.reset}\n`)

  const results: QualityMetrics[] = []

  for (let i = 0; i < TEST_SAMPLES.length; i++) {
    const sample = TEST_SAMPLES[i]

    console.log(`${colors.bright}Sample ${i + 1}/${TEST_SAMPLES.length}: ${sample.category}${colors.reset}`)
    console.log(`${colors.gray}${sample.content.substring(0, 60)}...${colors.reset}`)

    try {
      const metrics = await testSampleQuality(sample, realAI)
      results.push(metrics)

      // Display results
      console.log(`  ${colors.cyan}Schema:${colors.reset} ${metrics.schemaValid ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`)
      console.log(`  ${colors.cyan}Polarity:${colors.reset} ${(metrics.polarityAccuracy * 100).toFixed(0)}% accuracy`)
      console.log(`  ${colors.cyan}Emotion:${colors.reset} ${metrics.emotionCorrect ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`)
      console.log(`  ${colors.cyan}Concepts:${colors.reset} P=${(metrics.conceptPrecision * 100).toFixed(0)}% R=${(metrics.conceptRecall * 100).toFixed(0)}%`)
      console.log(`  ${colors.cyan}Domain:${colors.reset} ${metrics.domainCorrect ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`)
      console.log(`  ${colors.cyan}Time:${colors.reset} ${metrics.extractionTime.toFixed(0)}ms\n`)

    } catch (error) {
      console.log(`  ${colors.red}Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}\n`)
    }
  }

  // Calculate aggregate metrics
  const avgPolarityAccuracy = results.reduce((sum, r) => sum + r.polarityAccuracy, 0) / results.length
  const emotionAccuracy = results.filter(r => r.emotionCorrect).length / results.length
  const avgPrecision = results.reduce((sum, r) => sum + r.conceptPrecision, 0) / results.length
  const avgRecall = results.reduce((sum, r) => sum + r.conceptRecall, 0) / results.length
  const domainAccuracy = results.filter(r => r.domainCorrect).length / results.length
  const schemaValid = results.filter(r => r.schemaValid).length / results.length
  const avgTime = results.reduce((sum, r) => sum + r.extractionTime, 0) / results.length

  // Display summary
  console.log(`${colors.bright}${colors.blue}`)
  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║                     QUALITY SUMMARY                              ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log(colors.reset)

  const polarityStatus = avgPolarityAccuracy >= 0.8 ? `${colors.green}✓ PASS` : `${colors.red}✗ FAIL`
  const emotionStatus = emotionAccuracy >= 0.8 ? `${colors.green}✓ PASS` : `${colors.red}✗ FAIL`
  const precisionStatus = avgPrecision >= 0.85 ? `${colors.green}✓ PASS` : `${colors.red}✗ FAIL`
  const schemaStatus = schemaValid === 1.0 ? `${colors.green}✓ PASS` : `${colors.red}✗ FAIL`

  console.log(`${colors.cyan}Polarity Accuracy:${colors.reset}    ${(avgPolarityAccuracy * 100).toFixed(1)}% ${polarityStatus}${colors.reset} (target: 80%)`)
  console.log(`${colors.cyan}Emotion Accuracy:${colors.reset}     ${(emotionAccuracy * 100).toFixed(1)}% ${emotionStatus}${colors.reset} (target: 80%)`)
  console.log(`${colors.cyan}Concept Precision:${colors.reset}    ${(avgPrecision * 100).toFixed(1)}% ${precisionStatus}${colors.reset} (target: 85%)`)
  console.log(`${colors.cyan}Concept Recall:${colors.reset}       ${(avgRecall * 100).toFixed(1)}%`)
  console.log(`${colors.cyan}Domain Accuracy:${colors.reset}      ${(domainAccuracy * 100).toFixed(1)}%`)
  console.log(`${colors.cyan}Schema Validity:${colors.reset}      ${(schemaValid * 100).toFixed(1)}% ${schemaStatus}${colors.reset}`)
  console.log(`${colors.cyan}Avg Extraction Time:${colors.reset} ${avgTime.toFixed(0)}ms\n`)

  // Overall status
  const allPassed = avgPolarityAccuracy >= 0.8 &&
    emotionAccuracy >= 0.8 &&
    avgPrecision >= 0.85 &&
    schemaValid === 1.0

  if (allPassed) {
    console.log(`${colors.bright}${colors.green}✓ ALL QUALITY TARGETS MET${colors.reset}\n`)
  } else {
    console.log(`${colors.bright}${colors.yellow}⚠ SOME QUALITY TARGETS NOT MET${colors.reset}\n`)
  }

  // Detailed breakdown
  console.log(`${colors.gray}Detailed Results:${colors.reset}`)
  results.forEach((result, i) => {
    const sample = TEST_SAMPLES[i]
    console.log(`  ${i + 1}. ${sample.category}: ` +
      `P=${result.polarityAccuracy >= 0.8 ? colors.green : colors.yellow}${(result.polarityAccuracy * 100).toFixed(0)}%${colors.reset}, ` +
      `E=${result.emotionCorrect ? colors.green + '✓' : colors.yellow + '✗'}${colors.reset}, ` +
      `C=${result.conceptPrecision >= 0.85 ? colors.green : colors.yellow}${(result.conceptPrecision * 100).toFixed(0)}%${colors.reset}`)
  })

  console.log()
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2)
  const realAI = args.includes('--real-ai') || args.includes('--real')

  if (realAI && !process.env.GOOGLE_AI_API_KEY) {
    console.error(`${colors.red}Error: GOOGLE_AI_API_KEY environment variable required for real AI mode${colors.reset}`)
    process.exit(1)
  }

  try {
    await runQualityBenchmark(realAI)
  } catch (error) {
    console.error(`${colors.red}Benchmark failed:${colors.reset}`, error)
    process.exit(1)
  }
}

// Run if executed directly
const isDirectExecution = import.meta.url.endsWith(process.argv[1])
if (isDirectExecution) {
  main().catch(error => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error)
    process.exit(1)
  })
}
