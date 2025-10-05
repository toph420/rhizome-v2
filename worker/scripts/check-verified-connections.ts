#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const PALMER_ELDRITCH_ID = 'a44b039a-af64-49c1-b53a-8404405c6ad6';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('🔍 Checking Verified Connections for Palmer Eldritch\n');

  // Get all chunks for this document
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id')
    .eq('document_id', PALMER_ELDRITCH_ID)
    .eq('is_current', true);

  if (!chunks || chunks.length === 0) {
    console.log('❌ No chunks found');
    process.exit(1);
  }

  const chunkIds = chunks.map(c => c.id);
  console.log(`📊 Document has ${chunks.length} chunks\n`);

  // Check for verified connections
  const { data: connections, error } = await supabase
    .from('connections')
    .select(`
      id,
      source_chunk_id,
      target_chunk_id,
      connection_type,
      strength,
      user_validated,
      metadata,
      source_chunk:chunks!source_chunk_id(id, chunk_index, summary, document_id),
      target_chunk:chunks!target_chunk_id(id, chunk_index, summary, document_id)
    `)
    .eq('user_validated', true)
    .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (!connections || connections.length === 0) {
    console.log('⚠️  No verified connections found');
    console.log('   User may have starred connections, but none marked as user_validated=true');
    process.exit(0);
  }

  console.log(`✅ Found ${connections.length} verified connections:\n`);

  connections.forEach((conn, i) => {
    const isInternal = conn.source_chunk?.document_id === conn.target_chunk?.document_id;

    console.log(`${i + 1}. ${conn.connection_type} (strength: ${conn.strength.toFixed(2)})`);
    console.log(`   ${isInternal ? '📖 Internal' : '🔗 Cross-document'}`);
    console.log(`   Source: Chunk ${conn.source_chunk?.chunk_index} - "${conn.source_chunk?.summary?.slice(0, 60)}..."`);
    console.log(`   Target: Chunk ${conn.target_chunk?.chunk_index} - "${conn.target_chunk?.summary?.slice(0, 60)}..."`);

    if (conn.metadata) {
      console.log(`   Metadata:`, JSON.stringify(conn.metadata, null, 2).slice(0, 100));
    }
    console.log('');
  });

  console.log(`\n✅ Ready for remapping test with ${connections.length} real connections`);
}

main().catch(console.error);
