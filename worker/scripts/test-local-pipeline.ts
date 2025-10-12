#!/usr/bin/env tsx
/**
 * Test Local Processing Pipeline Components
 * Validates that all pieces are working before processing a real document
 */

import { OllamaClient } from '../lib/local/ollama-client.js'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

interface TestResult {
  name: string
  passed: boolean
  message: string
  duration?: number
}

const results: TestResult[] = []

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now()
  try {
    await fn()
    const duration = Date.now() - start
    results.push({ name, passed: true, message: 'OK', duration })
    console.log(`${GREEN}✓${RESET} ${name} (${duration}ms)`)
  } catch (error) {
    const duration = Date.now() - start
    const message = error instanceof Error ? error.message : 'Unknown error'
    results.push({ name, passed: false, message, duration })
    console.log(`${RED}✗${RESET} ${name}: ${message} (${duration}ms)`)
  }
}

// Test 1: Ollama Connection
await test('Ollama server connectivity', async () => {
  const client = new OllamaClient()
  const config = client.getConfig()

  if (!config.host.includes('11434')) {
    throw new Error(`Unexpected host: ${config.host}`)
  }

  const response = await client.chat('Respond with: OK', { temperature: 0 })
  if (!response.toLowerCase().includes('ok')) {
    throw new Error(`Unexpected response: ${response}`)
  }
})

// Test 2: Ollama Structured Output
await test('Ollama structured JSON output', async () => {
  const client = new OllamaClient()
  const result = await client.generateStructured(
    'Return a JSON object with a single field "status" set to "working"'
  )

  if (result.status !== 'working') {
    throw new Error(`Expected status=working, got: ${JSON.stringify(result)}`)
  }
})

// Test 3: Python Docling Script
await test('Python Docling script exists', async () => {
  const scriptPath = path.join(__dirname, 'docling_extract.py')
  await fs.access(scriptPath)
})

// Test 4: Python PydanticAI Script
await test('Python PydanticAI script exists', async () => {
  const scriptPath = path.join(__dirname, 'extract_metadata_pydantic.py')
  await fs.access(scriptPath)
})

// Test 5: Python Dependencies
await test('Python dependencies installed', async () => {
  const python = process.platform === 'win32' ? 'python' : 'python3'

  const checkImport = (pkg: string) => new Promise<void>((resolve, reject) => {
    const proc = spawn(python, ['-c', `import ${pkg}`])
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Package ${pkg} not found`))
    })
  })

  await checkImport('docling')
  await checkImport('pydantic_ai')
  await checkImport('sentence_transformers')
  await checkImport('transformers')
})

// Test 6: Node.js Dependencies
await test('Node.js Ollama package', async () => {
  try {
    await import('ollama')
  } catch {
    throw new Error('ollama package not installed')
  }
})

await test('Node.js Transformers.js package', async () => {
  try {
    await import('@huggingface/transformers')
  } catch {
    throw new Error('@huggingface/transformers package not installed')
  }
})

// Test 7: Environment Variables
await test('Environment variables configured', async () => {
  const required = ['PROCESSING_MODE', 'OLLAMA_HOST', 'OLLAMA_MODEL']
  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`)
  }

  if (process.env.PROCESSING_MODE !== 'local') {
    throw new Error(`PROCESSING_MODE=${process.env.PROCESSING_MODE}, expected 'local'`)
  }
})

// Print Summary
console.log('\n' + '='.repeat(60))
console.log('Test Summary')
console.log('='.repeat(60))

const passed = results.filter(r => r.passed).length
const failed = results.filter(r => r.passed === false).length
const total = results.length

console.log(`\nPassed: ${GREEN}${passed}/${total}${RESET}`)
console.log(`Failed: ${failed > 0 ? RED : GREEN}${failed}/${total}${RESET}`)

if (failed > 0) {
  console.log(`\n${YELLOW}Failed Tests:${RESET}`)
  results
    .filter(r => !r.passed)
    .forEach(r => {
      console.log(`  ${RED}✗${RESET} ${r.name}`)
      console.log(`    ${r.message}`)
    })
}

const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0)
console.log(`\nTotal time: ${totalDuration}ms`)

console.log('\n' + '='.repeat(60))

if (failed === 0) {
  console.log(`${GREEN}✅ All tests passed! Local pipeline is ready.${RESET}`)
  console.log(`\nNext steps:`)
  console.log(`  1. Upload a PDF document through the UI`)
  console.log(`  2. Monitor /tmp/worker.log for processing`)
  console.log(`  3. Check Chunk Quality Panel in UI`)
  process.exit(0)
} else {
  console.log(`${RED}❌ Some tests failed. Fix issues before processing documents.${RESET}`)
  process.exit(1)
}
