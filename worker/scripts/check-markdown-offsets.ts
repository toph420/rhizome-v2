import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'http://localhost:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
)

async function checkMarkdown() {
  const { data, error } = await supabase.storage
    .from('documents')
    .download('00000000-0000-0000-0000-000000000000/d00ca154-2126-470b-b20b-226016041e4a/content.md')

  if (error) {
    console.error('Error:', error)
    return
  }

  const markdown = await data.text()

  console.log('Markdown total length:', markdown.length)
  console.log('\n=== Content at chunk 2 offsets [286, 486] ===')
  const chunk2Content = markdown.slice(286, 486)
  console.log('Length:', chunk2Content.length)
  console.log('Content (first 100 chars):')
  console.log(JSON.stringify(chunk2Content.slice(0, 100)))

  console.log('\n=== Expected from database ===')
  console.log('"ALCHEMY, CYBERNETICS, ETHICS\\nThis oceanic feeling of  wonder"')

  console.log('\n=== Do they match? ===')
  const expected = "ALCHEMY, CYBERNETICS, ETHICS\nThis oceanic feeling of  wonder"
  console.log('Match:', chunk2Content.startsWith(expected))
}

checkMarkdown()
