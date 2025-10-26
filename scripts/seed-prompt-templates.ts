/**
 * Seed prompt templates for users who don't have them yet
 * Run this after migration 066 if templates weren't auto-created
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load production environment
config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const defaultPrompts = [
  {
    name: 'Comprehensive Concepts',
    description: 'Key definitions, core ideas, and concept relationships',
    template: `Generate {{count}} flashcards covering the most important concepts in this text.

Focus on:
- Key definitions and terminology
- Core ideas and principles
- Relationships between concepts

For each card:
- Question should be clear and specific
- Answer should be concise but complete (1-3 sentences)
- Include keywords from the source text for chunk matching

Text:
{{content}}

Chunk metadata:
{{chunks}}

Custom instructions:
{{custom}}

Return ONLY a JSON array of flashcards in this format:
[
  {
    "type": "basic",
    "question": "...",
    "answer": "...",
    "confidence": 0.85,
    "keywords": ["concept1", "concept2"]
  }
]

Generate exactly {{count}} flashcards.`,
    variables: ['count', 'content', 'chunks', 'custom'],
    is_system: true,
    is_default: true
  },
  {
    name: 'Deep Details',
    description: 'Specific claims, evidence, and precise terminology',
    template: `Generate {{count}} flashcards focusing on important details and specifics.

Focus on:
- Specific claims and arguments
- Supporting evidence and examples
- Precise terminology and numbers

For each card:
- Test recall of specific information
- Avoid overly broad questions
- Link to exact source chunks

Text:
{{content}}

Chunk metadata:
{{chunks}}

Custom instructions:
{{custom}}

Return ONLY a JSON array of flashcards in this format:
[
  {
    "type": "basic",
    "question": "...",
    "answer": "...",
    "confidence": 0.85,
    "keywords": ["detail1", "detail2"]
  }
]

Generate exactly {{count}} flashcards.`,
    variables: ['count', 'content', 'chunks', 'custom'],
    is_system: true,
    is_default: false
  },
  {
    name: 'Connections & Synthesis',
    description: 'How ideas connect, comparisons, and applications',
    template: `Generate {{count}} flashcards that synthesize concepts across this text.

Focus on:
- How ideas connect to each other
- Comparisons and contrasts
- Applications and implications

For each card:
- Test understanding, not just recall
- Encourage cross-referencing
- Link to multiple relevant chunks when possible

Text:
{{content}}

Chunk metadata:
{{chunks}}

Custom instructions:
{{custom}}

Return ONLY a JSON array of flashcards in this format:
[
  {
    "type": "basic",
    "question": "...",
    "answer": "...",
    "confidence": 0.85,
    "keywords": ["connection1", "connection2"]
  }
]

Generate exactly {{count}} flashcards.`,
    variables: ['count', 'content', 'chunks', 'custom'],
    is_system: true,
    is_default: false
  },
  {
    name: 'Contradiction Focus',
    description: 'Conceptual tensions, opposing viewpoints, and paradoxes',
    template: `Generate {{count}} flashcards highlighting conceptual tensions in this text.

Focus on:
- Opposing viewpoints
- Contradictions and paradoxes
- Debates and disagreements

For each card:
- Present both sides clearly
- Ask which perspective is supported
- Link to contrasting chunks

Text:
{{content}}

Chunk metadata:
{{chunks}}

Custom instructions:
{{custom}}

Return ONLY a JSON array of flashcards in this format:
[
  {
    "type": "basic",
    "question": "...",
    "answer": "...",
    "confidence": 0.85,
    "keywords": ["contradiction1", "contradiction2"]
  }
]

Generate exactly {{count}} flashcards.`,
    variables: ['count', 'content', 'chunks', 'custom'],
    is_system: true,
    is_default: false
  }
]

async function seedPrompts() {
  console.log('🌱 Seeding prompt templates...')
  console.log(`📍 Supabase: ${supabaseUrl}`)

  // Get all users
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers()

  if (usersError) {
    console.error('❌ Failed to fetch users:', usersError.message)
    process.exit(1)
  }

  console.log(`👥 Found ${users.users.length} users`)

  for (const user of users.users) {
    console.log(`\n🔍 Checking user: ${user.email} (${user.id})`)

    // Check if user already has prompt templates
    const { data: existing, error: checkError } = await supabase
      .from('prompt_templates')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_system', true)

    if (checkError) {
      console.error(`  ❌ Error checking prompts:`, checkError.message)
      continue
    }

    if (existing && existing.length > 0) {
      console.log(`  ✅ User already has ${existing.length} prompt templates, skipping`)
      continue
    }

    // Insert default prompts for this user
    console.log(`  📝 Creating ${defaultPrompts.length} prompt templates...`)

    const promptsToInsert = defaultPrompts.map(prompt => ({
      user_id: user.id,
      ...prompt
    }))

    const { error: insertError } = await supabase
      .from('prompt_templates')
      .insert(promptsToInsert)

    if (insertError) {
      console.error(`  ❌ Failed to create prompts:`, insertError.message)
      continue
    }

    console.log(`  ✅ Created ${defaultPrompts.length} prompt templates`)
  }

  console.log('\n✅ Prompt template seeding complete!')
}

seedPrompts().catch(console.error)
