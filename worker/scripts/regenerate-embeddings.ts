import { createClient } from '@supabase/supabase-js'
import { generateEmbeddings } from '../lib/embeddings.js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load env from parent .env.local
config({ path: resolve(process.cwd(), '../.env.local') })

const docId = process.argv[2]
if (!docId) {
  console.error('Usage: tsx scripts/regenerate-embeddings.ts <document-id>')
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log(`Regenerating embeddings for document ${docId}`)

  // Get chunks
  const { data: chunks, error } = await supabase
    .from('chunks')
    .select('id, content, chunk_index')
    .eq('document_id', docId)
    .eq('is_current', true)
    .order('chunk_index')

  if (error) throw error
  console.log(`Found ${chunks.length} chunks`)

  // Generate embeddings
  console.log('Generating embeddings...')
  const texts = chunks.map(c => c.content)
  const embeddings = await generateEmbeddings(texts)
  console.log(`Generated ${embeddings.length} embeddings`)

  // Update chunks
  for (let i = 0; i < chunks.length; i++) {
    const { error: updateError } = await supabase
      .from('chunks')
      .update({ embedding: embeddings[i] })
      .eq('id', chunks[i].id)

    if (updateError) {
      console.error(`Failed to update chunk ${i}:`, updateError)
    } else {
      console.log(`✓ Updated chunk ${i}`)
    }
  }

  console.log('✅ All embeddings updated')

  // Trigger connection detection
  console.log('\n📍 Creating connection detection job...')
  const { data: job, error: jobError } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'detect_connections',
      user_id: '00000000-0000-0000-0000-000000000000',
      input_data: {
        document_id: docId,
        source: 'manual-regenerate'
      },
      status: 'pending'
    })
    .select('id')
    .single()

  if (jobError) {
    console.error('Failed to create job:', jobError)
  } else {
    console.log(`✅ Connection detection job created: ${job.id}`)
  }
}

main().catch(console.error)
