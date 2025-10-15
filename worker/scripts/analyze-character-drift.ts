import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'http://localhost:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
)

async function analyzeDrift() {
  // Get chunk 2 from database
  const { data: chunks } = await supabase
    .from('chunks')
    .select('chunk_index, content, start_offset, end_offset')
    .eq('document_id', 'd00ca154-2126-470b-b20b-226016041e4a')
    .eq('chunk_index', 2)
    .single()

  // Get content.md from storage
  const { data: mdBlob } = await supabase.storage
    .from('documents')
    .download('00000000-0000-0000-0000-000000000000/d00ca154-2126-470b-b20b-226016041e4a/content.md')

  const storedMarkdown = await mdBlob.text()

  console.log('=== Chunk 2 Analysis ===')
  console.log('Expected content (from DB):', JSON.stringify(chunks.content.slice(0, 60)))
  console.log('Stored offsets:', `[${chunks.start_offset}, ${chunks.end_offset}]`)
  console.log('Length:', chunks.end_offset - chunks.start_offset)

  console.log('\n=== Finding Expected Content in Stored Markdown ===')
  const expectedStart = chunks.content.slice(0, 30)
  const actualPosition = storedMarkdown.indexOf(expectedStart)

  if (actualPosition !== -1) {
    console.log('✓ Found expected content at position:', actualPosition)
    console.log('Stored offset says:', chunks.start_offset)
    console.log('Character drift:', chunks.start_offset - actualPosition, 'chars')

    console.log('\n=== What\'s at the stored offset? ===')
    const atStoredOffset = storedMarkdown.slice(chunks.start_offset, chunks.end_offset)
    console.log('Content at stored offset [286, 486]:')
    console.log(JSON.stringify(atStoredOffset.slice(0, 60)))

    console.log('\n=== What\'s at the actual position? ===')
    const atActualPosition = storedMarkdown.slice(actualPosition, actualPosition + 200)
    console.log(`Content at actual position [${actualPosition}, ${actualPosition + 200}]:`)
    console.log(JSON.stringify(atActualPosition.slice(0, 60)))

    console.log('\n=== Pattern Analysis ===')
    console.log('If drift is consistent, we could:')
    console.log('1. Calculate offset adjustment: ', chunks.start_offset - actualPosition)
    console.log('2. Apply to all chunks')
    console.log('3. Check if that fixes the validation')
  } else {
    console.log('✗ Could not find expected content in stored markdown!')
    console.log('Trying with normalized whitespace...')

    const normalizedExpected = expectedStart.replace(/\s+/g, ' ').trim()
    const normalizedMarkdown = storedMarkdown.replace(/\s+/g, ' ')
    const normalizedPosition = normalizedMarkdown.indexOf(normalizedExpected)

    if (normalizedPosition !== -1) {
      console.log('✓ Found with normalized whitespace at position:', normalizedPosition)
      console.log('Issue: Whitespace normalization happened after matching')
    } else {
      console.log('✗ Content genuinely missing or heavily modified')
    }
  }
}

analyzeDrift()
