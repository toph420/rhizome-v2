#!/usr/bin/env tsx
/**
 * Debug: Check what data connections actually have
 */

import { createClient } from '@supabase/supabase-js'

const PALMER_ELDRITCH_ID = 'a44b039a-af64-49c1-b53a-8404405c6ad6'

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// Get chunks
const { data: chunks } = await supabase
  .from('chunks')
  .select('id, is_current, chunk_index, embedding')
  .eq('document_id', PALMER_ELDRITCH_ID)
  .order('chunk_index')

console.log('Palmer Eldritch Chunks:')
console.log(`  Total: ${chunks?.length}`)
console.log(`  Current: ${chunks?.filter(c => c.is_current).length}`)
console.log(`  Old: ${chunks?.filter(c => !c.is_current).length}`)
console.log(`  With embeddings: ${chunks?.filter(c => c.embedding).length}\n`)

// Get connections with chunk data
const { data: connections } = await supabase
  .from('connections')
  .select(`
    id,
    source_chunk_id,
    target_chunk_id,
    connection_type,
    user_validated,
    source_chunk:chunks!source_chunk_id(id, document_id, is_current, embedding),
    target_chunk:chunks!target_chunk_id(id, document_id, is_current, embedding)
  `)
  .eq('user_validated', true)
  .limit(3)

console.log('Connection Data Sample:')
connections?.forEach((conn, i) => {
  console.log(`\n${i + 1}. ${conn.connection_type}`)
  console.log(`   Source Chunk ID: ${conn.source_chunk_id}`)
  console.log(`   Source Chunk Data:`, {
    id: conn.source_chunk?.id,
    document_id: conn.source_chunk?.document_id,
    is_current: conn.source_chunk?.is_current,
    has_embedding: !!conn.source_chunk?.embedding
  })
  console.log(`   Target Chunk ID: ${conn.target_chunk_id}`)
  console.log(`   Target Chunk Data:`, {
    id: conn.target_chunk?.id,
    document_id: conn.target_chunk?.document_id,
    is_current: conn.target_chunk?.is_current,
    has_embedding: !!conn.target_chunk?.embedding
  })
})
