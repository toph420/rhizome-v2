import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'

const SUPABASE_URL = 'http://localhost:54321'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const docId = 'd00ca154-2126-470b-b20b-226016041e4a'
const basePath = `00000000-0000-0000-0000-000000000000/${docId}`

async function downloadFile(filename: string) {
  const filePath = `${basePath}/${filename}`
  console.log(`Downloading: ${filename}`)

  const { data, error } = await supabase.storage
    .from('documents')
    .download(filePath)

  if (error) {
    console.error(`  Error: ${error.message}`)
    return null
  }

  const text = await data.text()
  console.log(`  Size: ${text.length} bytes`)

  return JSON.parse(text)
}

async function main() {
  // Download stage-chunking.json to see bulletproof matcher results
  const chunkingData = await downloadFile('stage-chunking.json')

  if (!chunkingData) {
    console.error('Failed to download chunking data')
    return
  }

  // Analyze the match results
  const matchResults = chunkingData.matchResults || chunkingData.matches
  const stats = chunkingData.matchStats || chunkingData.stats

  console.log('\n=== Bulletproof Matcher Statistics ===')
  if (stats) {
    console.log(`Total chunks: ${stats.total}`)
    console.log(`Exact matches: ${stats.exact} (${((stats.exact / stats.total) * 100).toFixed(1)}%)`)
    console.log(`High confidence: ${stats.high} (${((stats.high / stats.total) * 100).toFixed(1)}%)`)
    console.log(`Medium confidence: ${stats.medium} (${((stats.medium / stats.total) * 100).toFixed(1)}%)`)
    console.log(`Synthetic: ${stats.synthetic} (${((stats.synthetic / stats.total) * 100).toFixed(1)}%)`)
    console.log(`\nBy Layer:`)
    console.log(`  Layer 1 (Fuzzy): ${stats.byLayer?.layer1 || 0}`)
    console.log(`  Layer 2 (Embeddings): ${stats.byLayer?.layer2 || 0}`)
    console.log(`  Layer 3 (LLM): ${stats.byLayer?.layer3 || 0}`)
    console.log(`  Layer 4 (Interpolation): ${stats.byLayer?.layer4 || 0}`)
  }

  // Analyze WHY chunks went to Layer 4
  if (matchResults && Array.isArray(matchResults)) {
    console.log('\n=== Analyzing Synthetic Chunks ===')
    const syntheticChunks = matchResults.filter((r: any) => r.confidence === 'synthetic')

    console.log(`Found ${syntheticChunks.length} synthetic chunks`)

    if (syntheticChunks.length > 0) {
      console.log('\nFirst 5 synthetic chunks:')
      syntheticChunks.slice(0, 5).forEach((chunk: any, i: number) => {
        console.log(`\n${i + 1}. Chunk ${chunk.chunk?.index || '?'}`)
        console.log(`   Method: ${chunk.method}`)
        console.log(`   Content preview: "${(chunk.chunk?.content || '').slice(0, 60)}..."`)
        console.log(`   Offsets: [${chunk.start_offset}, ${chunk.end_offset}]`)
        if (chunk.validation_warning) {
          console.log(`   Warning: ${chunk.validation_warning}`)
        }
      })
    }
  }

  // Save full data for inspection
  await fs.writeFile('/tmp/hexen-chunking-analysis.json', JSON.stringify(chunkingData, null, 2))
  console.log('\n✓ Full data saved to: /tmp/hexen-chunking-analysis.json')
}

main().catch(console.error)
