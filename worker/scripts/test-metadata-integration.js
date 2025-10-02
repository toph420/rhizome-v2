#!/usr/bin/env node

/**
 * Test script for metadata extraction integration.
 * Validates that document processors correctly extract metadata during chunk processing.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { TextProcessor } from '../dist/processors/text-processor.js'

// Load environment variables
config({ path: '../../.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY')
  process.exit(1)
}

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ai = new GoogleGenAI(GEMINI_API_KEY)

// Sample text content for testing
const TEST_CONTENT = `
# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that enables computers to learn from data without explicit programming. It's transforming industries from healthcare to finance.

## Key Concepts

### Supervised Learning
In supervised learning, algorithms learn from labeled training data. Common applications include:
- Image classification
- Spam detection
- Price prediction

### Unsupervised Learning
Unsupervised learning finds patterns in unlabeled data. Examples include:
- Customer segmentation
- Anomaly detection
- Dimensionality reduction

## Implementation Example

\`\`\`python
def train_model(X, y):
    """Train a simple linear regression model."""
    from sklearn.linear_model import LinearRegression
    
    model = LinearRegression()
    model.fit(X, y)
    return model
\`\`\`

## Conclusion

Machine learning continues to evolve rapidly, with new breakthroughs in deep learning, reinforcement learning, and neural networks pushing the boundaries of what's possible.
`

async function testMetadataExtraction() {
  console.log('🧪 Testing Metadata Extraction Integration\n')
  console.log('=' .repeat(50))
  
  try {
    // Create a test document
    console.log('\n📄 Creating test document...')
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: 'dev-user-123',
        title: 'Test Metadata Integration',
        source_type: 'txt',
        processing_status: 'pending'
      })
      .select()
      .single()
    
    if (docError) throw docError
    
    console.log(`✅ Created document: ${doc.id}`)
    
    // Upload test content
    const storagePath = `dev-user-123/${doc.id}/source.txt`
    console.log(`\n📤 Uploading content to: ${storagePath}`)
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, TEST_CONTENT, {
        contentType: 'text/plain',
        upsert: true
      })
    
    if (uploadError) throw uploadError
    console.log('✅ Content uploaded')
    
    // Create a mock job
    const mockJob = {
      id: 'test-job-' + Date.now(),
      document_id: doc.id,
      status: 'processing',
      metadata: { storage_path: `dev-user-123/${doc.id}` },
      input_data: {
        document_id: doc.id,
        source_type: 'txt'
      }
    }
    
    // Process with TextProcessor (includes metadata extraction)
    console.log('\n⚙️ Processing document with metadata extraction...')
    const processor = new TextProcessor(ai, supabase, mockJob)
    const result = await processor.process()
    
    console.log(`\n✅ Processing complete!`)
    console.log(`📊 Results:`)
    console.log(`  - Markdown length: ${result.markdown.length} chars`)
    console.log(`  - Chunks created: ${result.chunks.length}`)
    console.log(`  - Word count: ${result.wordCount || 'N/A'}`)
    
    // Check metadata extraction
    console.log(`\n🔍 Checking metadata extraction...`)
    let metadataCount = 0
    let totalCompleteness = 0
    
    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i]
      if (chunk.metadata) {
        metadataCount++
        totalCompleteness += chunk.metadata.quality?.completeness || 0
        
        console.log(`\n  Chunk ${i + 1}:`)
        console.log(`    - Has metadata: ✅`)
        console.log(`    - Completeness: ${((chunk.metadata.quality?.completeness || 0) * 100).toFixed(1)}%`)
        
        if (chunk.metadata.structural) {
          console.log(`    - Structural patterns: ${chunk.metadata.structural.patterns.length}`)
        }
        if (chunk.metadata.emotional) {
          console.log(`    - Primary emotion: ${chunk.metadata.emotional.primaryEmotion}`)
        }
        if (chunk.metadata.concepts) {
          console.log(`    - Key concepts: ${chunk.metadata.concepts.concepts.length}`)
        }
        if (chunk.metadata.methods) {
          console.log(`    - Method signatures: ${chunk.metadata.methods.signatures.length}`)
        }
        if (chunk.metadata.narrative) {
          console.log(`    - Narrative pattern: ${chunk.metadata.narrative.sentenceRhythm.pattern}`)
        }
        if (chunk.metadata.references) {
          console.log(`    - References: ${chunk.metadata.references.externalRefs.length} external`)
        }
        if (chunk.metadata.domain) {
          console.log(`    - Primary domain: ${chunk.metadata.domain.primaryDomain}`)
        }
      } else {
        console.log(`\n  Chunk ${i + 1}: No metadata ❌`)
      }
    }
    
    const avgCompleteness = metadataCount > 0 ? totalCompleteness / metadataCount : 0
    
    console.log('\n' + '=' .repeat(50))
    console.log('📈 Summary:')
    console.log(`  - Chunks with metadata: ${metadataCount}/${result.chunks.length}`)
    console.log(`  - Average completeness: ${(avgCompleteness * 100).toFixed(1)}%`)
    
    if (metadataCount === result.chunks.length && avgCompleteness > 0.5) {
      console.log('\n✅ Metadata extraction integration successful!')
    } else if (metadataCount > 0) {
      console.log('\n⚠️ Partial success - some chunks missing metadata or low completeness')
    } else {
      console.log('\n❌ Metadata extraction failed - no metadata found')
    }
    
    // Cleanup - delete test document
    console.log('\n🧹 Cleaning up test document...')
    await supabase.from('documents').delete().eq('id', doc.id)
    console.log('✅ Cleanup complete')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  }
}

// Run the test
testMetadataExtraction()
  .then(() => {
    console.log('\n✨ Test script completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('Unexpected error:', error)
    process.exit(1)
  })