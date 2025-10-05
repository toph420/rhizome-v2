#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const PALMER_ELDRITCH_ID = 'a44b039a-af64-49c1-b53a-8404405c6ad6';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

console.log('🔧 Fixing Palmer Eldritch status...\n');

// Check current status
const { data: before } = await supabase
  .from('documents')
  .select('title, processing_status')
  .eq('id', PALMER_ELDRITCH_ID)
  .single();

console.log('Before:');
console.log(`  Title: ${before?.title}`);
console.log(`  Status: ${before?.processing_status || 'null'}\n`);

// Fix status
const { error } = await supabase
  .from('documents')
  .update({ processing_status: 'completed' })
  .eq('id', PALMER_ELDRITCH_ID);

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

// Verify
const { data: after } = await supabase
  .from('documents')
  .select('title, processing_status')
  .eq('id', PALMER_ELDRITCH_ID)
  .single();

console.log('After:');
console.log(`  Title: ${after?.title}`);
console.log(`  Status: ${after?.processing_status}\n`);

console.log('✅ Status fixed!');
