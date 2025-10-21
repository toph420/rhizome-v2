/**
 * Rebuild Storage files for existing sparks
 * Run with: npx tsx scripts/rebuild-spark-storage.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function rebuildSparkStorage() {
  // Get all sparks from entities
  const { data: sparks, error } = await supabase
    .from('entities')
    .select('id, user_id')
    .eq('entity_type', 'spark')

  if (error) {
    console.error('Error fetching sparks:', error)
    return
  }

  console.log(`Found ${sparks.length} sparks to rebuild`)

  for (const spark of sparks) {
    // Get all components for this spark
    const { data: components } = await supabase
      .from('components')
      .select('component_type, data')
      .eq('entity_id', spark.id)

    if (!components) continue

    // Build component map
    const componentMap: Record<string, any> = {}
    components.forEach(c => {
      componentMap[c.component_type] = { data: c.data }
    })

    // Get storage path from cache
    const { data: cache } = await supabase
      .from('sparks_cache')
      .select('storage_path')
      .eq('entity_id', spark.id)
      .single()

    if (!cache?.storage_path) {
      console.log(`Skipping ${spark.id} - no storage path`)
      continue
    }

    // Build Storage JSON
    const sparkData = {
      entity_id: spark.id,
      user_id: spark.user_id,
      component_type: 'spark',
      components: componentMap,
    }

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(cache.storage_path, JSON.stringify(sparkData, null, 2), {
        contentType: 'application/json',
        upsert: true,
      })

    if (uploadError) {
      console.error(`Failed to upload ${spark.id}:`, uploadError)
    } else {
      console.log(`✓ Uploaded ${cache.storage_path}`)
    }
  }

  console.log('Done!')
}

rebuildSparkStorage()
