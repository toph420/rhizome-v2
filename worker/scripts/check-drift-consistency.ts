import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'http://localhost:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
)

async function checkDriftConsistency() {
  // Get first 10 chunks
  const { data: chunks } = await supabase
    .from('chunks')
    .select('chunk_index, content, start_offset, end_offset, position_method')
    .eq('document_id', 'd00ca154-2126-470b-b20b-226016041e4a')
    .order('chunk_index')
    .limit(10)

  // Get content.md
  const { data: mdBlob } = await supabase.storage
    .from('documents')
    .download('00000000-0000-0000-0000-000000000000/d00ca154-2126-470b-b20b-226016041e4a/content.md')

  const storedMarkdown = await mdBlob.text()
  const normalizedMarkdown = storedMarkdown.replace(/\s+/g, ' ')

  console.log('=== Checking Drift Consistency Across Chunks ===\n')

  const drifts: number[] = []

  for (const chunk of chunks) {
    // Try to find chunk content
    const searchText = chunk.content.slice(0, 40).replace(/\s+/g, ' ').trim()
    const foundPos = normalizedMarkdown.indexOf(searchText)

    if (foundPos !== -1) {
      // Calculate drift
      const drift = chunk.start_offset - foundPos
      drifts.push(drift)

      console.log(`Chunk ${chunk.chunk_index} (${chunk.position_method}):`)
      console.log(`  Stored offset: ${chunk.start_offset}`)
      console.log(`  Actual position: ${foundPos}`)
      console.log(`  Drift: ${drift} chars`)
    } else {
      console.log(`Chunk ${chunk.chunk_index}: NOT FOUND (may be gap-fill or heavily modified)`)
    }
  }

  console.log('\n=== Drift Statistics ===')
  if (drifts.length > 0) {
    const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length
    const minDrift = Math.min(...drifts)
    const maxDrift = Math.max(...drifts)

    console.log(`Chunks analyzed: ${drifts.length}/${chunks.length}`)
    console.log(`Average drift: ${avgDrift.toFixed(1)} chars`)
    console.log(`Min drift: ${minDrift} chars`)
    console.log(`Max drift: ${maxDrift} chars`)
    console.log(`Drift variance: ${maxDrift - minDrift} chars`)

    if (maxDrift - minDrift < 10) {
      console.log('\n✓ Drift is CONSISTENT - a simple offset adjustment would fix this!')
      console.log(`Recommendation: Subtract ${Math.round(avgDrift)} from all offsets`)
    } else {
      console.log('\n✗ Drift is INCONSISTENT - more complex issue')
      console.log('Likely cause: Variable whitespace changes throughout document')
    }
  }
}

checkDriftConsistency()
