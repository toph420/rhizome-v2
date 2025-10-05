import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugChunks() {
  const documentId = 'a796c60c-5cc0-4905-addc-ae896b302b4b';

  // Check chunk metadata
  const { data: chunks, error } = await supabase
    .from('chunks')
    .select('id, importance_score, domain_metadata, summary')
    .eq('document_id', documentId)
    .order('importance_score', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching chunks:', error);
    return;
  }

  console.log(`\n📊 Found ${chunks?.length || 0} chunks for document ${documentId}\n`);

  chunks?.forEach((chunk, idx) => {
    console.log(`Chunk ${idx + 1}:`);
    console.log(`  - ID: ${chunk.id}`);
    console.log(`  - Importance: ${chunk.importance_score}`);
    console.log(`  - Domain: ${chunk.domain_metadata?.primaryDomain || 'NULL'}`);
    console.log(`  - Has Summary: ${!!chunk.summary}`);
    console.log('');
  });

  // Count how many would pass thematic bridge filters
  const highImportance = chunks?.filter(c =>
    c.importance_score >= 0.6 && c.domain_metadata?.primaryDomain
  );

  console.log(`\n🔍 Thematic Bridge Filter Results:`);
  console.log(`  - Total chunks: ${chunks?.length || 0}`);
  console.log(`  - importance_score >= 0.6: ${chunks?.filter(c => c.importance_score >= 0.6).length || 0}`);
  console.log(`  - Has domain metadata: ${chunks?.filter(c => c.domain_metadata?.primaryDomain).length || 0}`);
  console.log(`  - Passes both filters: ${highImportance?.length || 0}`);
}

debugChunks().catch(console.error);
