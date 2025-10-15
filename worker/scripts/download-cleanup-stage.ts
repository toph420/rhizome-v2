import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'http://localhost:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
)

async function main() {
  const { data, error } = await supabase.storage
    .from('documents')
    .download('00000000-0000-0000-0000-000000000000/d00ca154-2126-470b-b20b-226016041e4a/stage-cleanup.json')

  if (error) {
    console.error('Error:', error)
    return
  }

  const cleanupData = JSON.parse(await data.text())
  const md = cleanupData.markdown

  console.log('Cleaned markdown from stage-cleanup.json:')
  console.log('Length:', md.length)
  console.log('\nContent at [286, 486]:')
  console.log(JSON.stringify(md.slice(286, 486).slice(0, 100)))

  console.log('\n=== Compare with database chunk 2 ===')
  console.log('Expected: "ALCHEMY, CYBERNETICS, ETHICS\\nThis oceanic feeling of  wonder"')

  const expected = "ALCHEMY, CYBERNETICS, ETHICS\nThis oceanic feeling of  wonder"
  console.log('\nDoes it match?', md.slice(286, 486).startsWith(expected))
}

main()
