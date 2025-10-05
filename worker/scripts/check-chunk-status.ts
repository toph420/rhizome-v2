#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const { data } = await supabase
  .from('chunks')
  .select('is_current, chunk_index')
  .eq('document_id', 'a44b039a-af64-49c1-b53a-8404405c6ad6')
  .order('chunk_index');

const current = data?.filter(c => c.is_current).length || 0;
const old = data?.filter(c => !c.is_current).length || 0;

console.log(`Palmer Eldritch chunks:`);
console.log(`  Current (is_current=true): ${current}`);
console.log(`  Old (is_current=false): ${old}`);
console.log(`  Total: ${data?.length || 0}`);
