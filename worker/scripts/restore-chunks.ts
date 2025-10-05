#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

console.log('🔄 Restoring Palmer Eldritch chunks...');

const { data, error } = await supabase
  .from('chunks')
  .update({ is_current: true })
  .eq('document_id', 'a44b039a-af64-49c1-b53a-8404405c6ad6')
  .eq('is_current', false)
  .select();

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log(`✅ Restored ${data?.length || 0} chunks to is_current=true`);
