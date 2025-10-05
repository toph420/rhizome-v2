#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const { data, error } = await supabase
  .from('documents')
  .select('id, title, created_at')
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('\nRecent Documents:');
console.log('================');
if (!data || data.length === 0) {
  console.log('No documents found.');
} else {
  data.forEach((doc, i) => {
    console.log(`${i + 1}. ${doc.title || 'Untitled'}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   Created: ${new Date(doc.created_at).toLocaleString()}`);
    console.log('');
  });
}
