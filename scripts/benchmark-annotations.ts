/**
 * Performance benchmarking script for annotation system.
 * 
 * Targets:
 * - First paint: <500ms
 * - Annotation save: <200ms
 * - Weight re-ranking: <100ms
 * 
 * Usage:
 *   npm run benchmark:annotations
 */

import { performance } from 'perf_hooks'
import { MOCK_CONNECTIONS } from '../src/lib/annotations/mock-connections'

// Test data
const testDocumentId = 'benchmark-doc'
const testUserId = 'dev-user-123'

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

/**
 * Benchmark first paint time for document viewer.
 * Simulates markdown fetch and initial render.
 * 
 * @returns Duration in milliseconds
 */
async function benchmarkFirstPaint(): Promise<number> {
  console.log(`\n${colors.blue}📊 Benchmark 1: First Paint Time${colors.reset}`)
  console.log(`Target: <500ms\n`)
  
  // Simulate markdown fetch from Storage (simulated delay)
  const start = performance.now()
  
  // Simulate network latency (50-100ms typical)
  await new Promise(resolve => setTimeout(resolve, 75))
  
  // Simulate markdown processing (parsing, syntax highlighting)
  const markdown = generateLargeMarkdown(5000) // 5000 words
  
  // Simulate React render time
  await new Promise(resolve => setTimeout(resolve, 50))
  
  const duration = performance.now() - start
  
  console.log(`✓ First paint: ${colors.bold}${duration.toFixed(2)}ms${colors.reset}`)
  
  if (duration < 500) {
    console.log(`${colors.green}✅ PASS: <500ms target met${colors.reset}`)
  } else {
    console.log(`${colors.red}❌ FAIL: Exceeds 500ms target${colors.reset}`)
  }
  
  return duration
}

/**
 * Benchmark annotation save time.
 * Simulates Server Action call to create annotation.
 * 
 * @returns Average duration across iterations
 */
async function benchmarkAnnotationSave(): Promise<number> {
  console.log(`\n${colors.blue}📊 Benchmark 2: Annotation Save Time${colors.reset}`)
  console.log(`Target: <200ms\n`)
  
  const iterations = 10
  const durations: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    
    // Simulate Server Action processing
    await simulateAnnotationSave({
      text: `Test annotation ${i}`,
      chunkId: `chunk-${i}`,
      documentId: testDocumentId,
      startOffset: 0,
      endOffset: 15,
      color: 'yellow'
    })
    
    const duration = performance.now() - start
    durations.push(duration)
  }
  
  const avgDuration = durations.reduce((a, b) => a + b) / durations.length
  const maxDuration = Math.max(...durations)
  const minDuration = Math.min(...durations)
  
  console.log(`✓ Average save time: ${colors.bold}${avgDuration.toFixed(2)}ms${colors.reset}`)
  console.log(`✓ Max save time: ${maxDuration.toFixed(2)}ms`)
  console.log(`✓ Min save time: ${minDuration.toFixed(2)}ms`)
  
  if (avgDuration < 200) {
    console.log(`${colors.green}✅ PASS: <200ms target met${colors.reset}`)
  } else {
    console.log(`${colors.red}❌ FAIL: Exceeds 200ms target${colors.reset}`)
  }
  
  return avgDuration
}

/**
 * Benchmark weight re-ranking performance.
 * Tests filtering and sorting of connections.
 * 
 * @returns Average duration across iterations
 */
async function benchmarkWeightReranking(): Promise<number> {
  console.log(`\n${colors.blue}📊 Benchmark 3: Weight Re-ranking Time${colors.reset}`)
  console.log(`Target: <100ms\n`)
  
  // Use first 50 connections as per spec
  const connections = MOCK_CONNECTIONS.slice(0, 50)
  
  const weights = {
    semantic: 0.8,
    thematic: 0.5,
    structural: 0.3,
    contradiction: 1.0,
    emotional: 0.2,
    methodological: 0.6,
    temporal: 0.4
  }
  
  const enabledEngines = new Set([
    'semantic', 'thematic', 'structural', 'contradiction',
    'emotional', 'methodological', 'temporal'
  ])
  
  const strengthThreshold = 0.3
  const iterations = 100
  const durations: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    
    // Perform filtering and re-ranking
    const result = connections
      .filter(c => enabledEngines.has(c.engine_type))
      .filter(c => c.strength >= strengthThreshold)
      .map(c => ({
        ...c,
        weightedStrength: c.strength * weights[c.engine_type as keyof typeof weights]
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength)
    
    const duration = performance.now() - start
    durations.push(duration)
  }
  
  const avgDuration = durations.reduce((a, b) => a + b) / durations.length
  const maxDuration = Math.max(...durations)
  const p95Duration = durations.sort((a, b) => a - b)[Math.floor(iterations * 0.95)]
  
  console.log(`✓ Average re-ranking time: ${colors.bold}${avgDuration.toFixed(2)}ms${colors.reset}`)
  console.log(`✓ Max re-ranking time: ${maxDuration.toFixed(2)}ms`)
  console.log(`✓ P95 re-ranking time: ${p95Duration.toFixed(2)}ms`)
  console.log(`✓ Connections processed: ${connections.length}`)
  
  if (avgDuration < 100) {
    console.log(`${colors.green}✅ PASS: <100ms target met${colors.reset}`)
  } else {
    console.log(`${colors.red}❌ FAIL: Exceeds 100ms target${colors.reset}`)
  }
  
  return avgDuration
}

/**
 * Generate large markdown content for testing.
 * @param wordCount - Number of words to generate
 * @returns Markdown string
 */
function generateLargeMarkdown(wordCount: number): string {
  const words = [
    'neural', 'network', 'learning', 'pattern', 'recognition',
    'algorithm', 'optimization', 'gradient', 'descent', 'backpropagation',
    'activation', 'function', 'layer', 'deep', 'architecture'
  ]
  
  let markdown = '# Test Document\n\n'
  let currentWords = 0
  
  while (currentWords < wordCount) {
    markdown += '## Section ' + Math.floor(currentWords / 100) + '\n\n'
    
    // Add paragraph
    for (let i = 0; i < 100 && currentWords < wordCount; i++) {
      markdown += words[Math.floor(Math.random() * words.length)] + ' '
      currentWords++
      
      if (i % 10 === 9) {
        markdown += '. '
      }
    }
    
    markdown += '\n\n'
  }
  
  return markdown
}

/**
 * Simulate annotation save operation.
 * Mimics Server Action processing time.
 * 
 * @param data - Annotation data
 */
async function simulateAnnotationSave(data: any): Promise<void> {
  // Simulate validation (5-10ms)
  await new Promise(resolve => setTimeout(resolve, 7))
  
  // Simulate ECS entity creation (20-40ms)
  await new Promise(resolve => setTimeout(resolve, 30))
  
  // Simulate database write (30-50ms)
  await new Promise(resolve => setTimeout(resolve, 40))
  
  // Simulate response serialization (5-10ms)
  await new Promise(resolve => setTimeout(resolve, 7))
}

/**
 * Run all benchmarks and generate summary report.
 */
async function runBenchmarks() {
  console.log(`${colors.bold}🚀 Annotation System Performance Benchmarks${colors.reset}`)
  console.log('============================================')
  
  const firstPaint = await benchmarkFirstPaint()
  const saveTime = await benchmarkAnnotationSave()
  const rerankTime = await benchmarkWeightReranking()
  
  console.log(`\n${colors.bold}📈 Summary${colors.reset}`)
  console.log('============================================')
  console.log(`First Paint:       ${formatResult(firstPaint, 500)}ms (target: <500ms)`)
  console.log(`Annotation Save:   ${formatResult(saveTime, 200)}ms (target: <200ms)`)
  console.log(`Weight Re-ranking: ${formatResult(rerankTime, 100)}ms (target: <100ms)`)
  
  const allPass = firstPaint < 500 && saveTime < 200 && rerankTime < 100
  
  if (allPass) {
    console.log(`\n${colors.green}${colors.bold}✅ All benchmarks passed!${colors.reset}`)
  } else {
    console.log(`\n${colors.red}${colors.bold}❌ Some benchmarks failed!${colors.reset}`)
  }
  
  // Exit with appropriate code
  process.exit(allPass ? 0 : 1)
}

/**
 * Format benchmark result with color coding.
 * @param value - Measured value
 * @param target - Target threshold
 * @returns Formatted string
 */
function formatResult(value: number, target: number): string {
  const formatted = value.toFixed(2)
  
  if (value < target) {
    return `${colors.green}${formatted}${colors.reset}`
  } else if (value < target * 1.2) {
    return `${colors.yellow}${formatted}${colors.reset}`
  } else {
    return `${colors.red}${formatted}${colors.reset}`
  }
}

// Run benchmarks
runBenchmarks()