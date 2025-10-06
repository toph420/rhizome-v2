/**
 * Test script to validate AI cleanup prompt effectiveness.
 * Tests with real EPUB artifacts found in The Man in the High Castle.
 */

import { readFileSync } from 'fs'
import { GoogleGenAI } from '@google/genai'
import { cleanMarkdownWithAI } from './lib/ai-chunking.js'

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY

if (!GOOGLE_AI_API_KEY) {
  console.error('❌ GOOGLE_AI_API_KEY environment variable not set')
  process.exit(1)
}

async function testCleanup() {
  console.log('📄 Testing AI cleanup prompt with EPUB artifacts\n')

  // Read test markdown with artifacts
  const testMarkdown = readFileSync('/tmp/test-epub-cleanup.md', 'utf-8')

  console.log('='.repeat(60))
  console.log('BEFORE CLEANUP:')
  console.log('='.repeat(60))
  console.log(testMarkdown)
  console.log('\n')

  // Initialize AI client
  const ai = new GoogleGenAI({
    apiKey: GOOGLE_AI_API_KEY
  })

  console.log('🤖 Running AI cleanup...\n')

  try {
    const startTime = Date.now()

    const cleaned = await cleanMarkdownWithAI(ai, testMarkdown)

    const duration = Math.round((Date.now() - startTime) / 1000)

    console.log('\n')
    console.log('='.repeat(60))
    console.log('AFTER CLEANUP:')
    console.log('='.repeat(60))
    console.log(cleaned)
    console.log('\n')

    console.log('='.repeat(60))
    console.log('ANALYSIS:')
    console.log('='.repeat(60))
    console.log(`⏱️  Processing time: ${duration}s`)
    console.log(`📊 Size: ${testMarkdown.length} → ${cleaned.length} chars`)
    console.log(`🗑️  Removed: ${testMarkdown.length - cleaned.length} chars`)
    console.log('\n')

    // Check if artifacts were removed
    const checksTable = [
      {
        artifact: '[Cover page](...)',
        present: cleaned.includes('[Cover page]'),
        expected: false
      },
      {
        artifact: '[Title page](...)',
        present: cleaned.includes('[Title page]'),
        expected: false
      },
      {
        artifact: '[Dedication](...)',
        present: cleaned.includes('[Dedication]'),
        expected: false
      },
      {
        artifact: 'Unknown headings',
        present: cleaned.includes('Unknown'),
        expected: false
      },
      {
        artifact: 'Contents section',
        present: cleaned.includes('Contents'),
        expected: false
      },
      {
        artifact: '.html links',
        present: cleaned.includes('.html'),
        expected: false
      },
      {
        artifact: 'Story content (ONE)',
        present: cleaned.includes('For a week Mr. R. Childan'),
        expected: true
      },
      {
        artifact: 'Story content (TWO)',
        present: cleaned.includes('The next day Mr. Childan'),
        expected: true
      },
      {
        artifact: 'Dedication preserved',
        present: cleaned.includes('To my wife, Tessa'),
        expected: true
      }
    ]

    console.log('ARTIFACT REMOVAL CHECKS:')
    console.log('-'.repeat(60))

    let passed = 0
    let failed = 0

    checksTable.forEach(check => {
      const success = check.present === check.expected
      const icon = success ? '✅' : '❌'
      const status = check.expected ? 'KEPT' : 'REMOVED'
      const result = success ? status : (check.present ? 'STILL PRESENT' : 'WRONGLY REMOVED')

      console.log(`${icon} ${check.artifact}: ${result}`)

      if (success) passed++
      else failed++
    })

    console.log('-'.repeat(60))
    console.log(`\n📊 Results: ${passed}/${checksTable.length} checks passed`)

    if (failed === 0) {
      console.log('\n🎉 SUCCESS! All artifacts removed, all content preserved!')
    } else {
      console.log(`\n⚠️  ISSUES FOUND: ${failed} checks failed`)
      console.log('The prompt may need further tuning.')
    }

  } catch (error: any) {
    console.error('\n❌ Cleanup failed:', error.message)
    process.exit(1)
  }
}

testCleanup().catch(console.error)
