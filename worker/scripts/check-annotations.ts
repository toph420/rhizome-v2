#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const PALMER_ELDRITCH_ID = 'a44b039a-af64-49c1-b53a-8404405c6ad6';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

console.log('🔍 Checking annotations for Palmer Eldritch\n');

// Check entities
const { data: entities, error: entitiesError } = await supabase
  .from('entities')
  .select('id, user_id, created_at')
  .eq('document_id', PALMER_ELDRITCH_ID);

console.log(`📦 Entities: ${entities?.length || 0}`);
if (entitiesError) console.error('Error:', entitiesError);

// Check annotation components
const { data: annotations, error: annoError } = await supabase
  .from('components')
  .select('id, entity_id, component_type, data')
  .eq('component_type', 'annotation')
  .limit(5);

console.log(`📝 Annotation components (sample): ${annotations?.length || 0}`);
if (annoError) console.error('Error:', annoError);

if (annotations && annotations.length > 0) {
  console.log('\nSample annotation:');
  console.log(JSON.stringify(annotations[0], null, 2));
}

// Check if components link to Palmer Eldritch entities
if (entities && entities.length > 0) {
  const entityIds = entities.map(e => e.id);
  const { data: linkedComponents } = await supabase
    .from('components')
    .select('id, entity_id, component_type')
    .in('entity_id', entityIds);

  console.log(`\n🔗 Components linked to Palmer Eldritch entities: ${linkedComponents?.length || 0}`);

  const byType = linkedComponents?.reduce((acc, c) => {
    acc[c.component_type] = (acc[c.component_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('By type:', byType);
}

// Check what the frontend might be querying
console.log('\n📋 Frontend Query Simulation:');
const { data: frontendView, error: fvError } = await supabase
  .from('entities')
  .select(`
    id,
    document_id,
    components:components(
      id,
      component_type,
      data
    )
  `)
  .eq('document_id', PALMER_ELDRITCH_ID)
  .limit(3);

console.log(`Results: ${frontendView?.length || 0}`);
if (fvError) console.error('Error:', fvError);

if (frontendView && frontendView.length > 0) {
  console.log('\nSample entity with components:');
  console.log(JSON.stringify(frontendView[0], null, 2));
}
