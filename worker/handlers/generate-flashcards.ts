/**
 * Generate Flashcards Background Job Handler
 *
 * AI-powered flashcard generation from documents/chunks using Gemini.
 *
 * Features:
 * - Loads source content (full document or specific chunks)
 * - Calls Gemini AI to generate flashcards
 * - Matches cards to source chunks via keyword heuristics
 * - Creates ECS entities with draft status
 * - Links cards to source chunks via ChunkRef component
 *
 * Pattern: HandlerJobManager for progress tracking
 * Reference: worker/handlers/export-document.ts
 */

import { GoogleGenAI } from '@google/genai'
import { HandlerJobManager } from '../lib/handler-job-manager.js'
import { GenerateFlashcardsOutputSchema } from '../types/job-schemas.js'
import { renderTemplate } from '../lib/template-renderer.js'
import { createSourceLoader } from '../lib/source-loaders.js'
import { extractClozeDeletions, renderClozeQuestion, isClozeContent } from '../lib/cloze-parser.js'
import type { SupabaseClient } from '@supabase/supabase-js'

interface GenerateFlashcardsInput {
  sourceType: 'document' | 'chunks' | 'selection' | 'annotation' | 'connection'  // All 5 types
  sourceIds: string[]  // document IDs, chunk IDs, or entity IDs
  selectionData?: {  // For selection type
    text: string
    documentId: string
    startOffset: number
    endOffset: number
  }
  cardCount: number
  userId: string
  deckId: string  // Where to add generated cards
  promptTemplateId?: string  // Optional custom prompt (uses default if not provided)
  customInstructions?: string  // Optional user instructions
}

interface GeneratedCard {
  type?: 'basic' | 'cloze'  // Default to basic if not specified
  question: string
  answer: string
  content?: string  // For cloze cards - the original with {{c1::}} markers
  confidence?: number
  keywords?: string[]
}

/**
 * Generate flashcards from document/chunks using Gemini AI
 */
export async function generateFlashcardsHandler(
  supabase: SupabaseClient,
  job: { id: string; input_data: GenerateFlashcardsInput }
): Promise<void> {
  const { sourceType, sourceIds, selectionData, cardCount, userId, deckId, promptTemplateId, customInstructions } = job.input_data

  console.log(`[GenerateFlashcards] Starting for ${sourceIds.length} ${sourceType}(s), prompt: ${promptTemplateId || 'default'}`)

  const jobManager = new HandlerJobManager(supabase, job.id)
  const startTime = Date.now()

  try {
    // ✅ STEP 1: LOAD SOURCE CONTENT (10%)
    await jobManager.updateProgress(10, 'loading', 'Loading source content')

    // Use source loader abstraction (supports all 5 types)
    const loader = createSourceLoader(sourceType, sourceIds, selectionData)
    const { content: sourceContent, chunks: chunkContext } = await loader.load(supabase, userId)

    console.log(`✓ Loaded ${sourceContent.length} chars from ${chunkContext.length} chunks`)

    // ✅ STEP 2: LOAD & RENDER PROMPT TEMPLATE (15-20%)
    await jobManager.updateProgress(15, 'loading', 'Loading prompt template')

    // Load prompt template (use default if not specified)
    let template
    if (promptTemplateId) {
      const { data } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('id', promptTemplateId)
        .eq('user_id', userId)
        .single()

      template = data
    } else {
      // Get default template
      const { data } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single()

      template = data
    }

    if (!template) {
      throw new Error('No prompt template found')
    }

    console.log(`✓ Using prompt template: ${template.name}`)

    // Render template with variables
    const prompt = renderTemplate(template.template, {
      count: cardCount.toString(),
      content: sourceContent.slice(0, 50000),
      chunks: JSON.stringify(chunkContext.slice(0, 10).map(c => ({
        id: c.id,
        preview: c.content.slice(0, 200)
      }))),
      custom: customInstructions || 'None'
    })

    // Track usage
    await supabase.rpc('increment_prompt_usage', { prompt_id: template.id })

    // ✅ STEP 3: CALL GEMINI AI (20-70%)
    await jobManager.updateProgress(20, 'generating', 'Generating flashcards with AI')

    const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! })

    const result = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts: [{ text: prompt }] }]
    })
    const text = result.text

    await jobManager.updateProgress(70, 'parsing', 'Parsing AI response')

    // Parse JSON (extract from code block if needed)
    let generatedCards: GeneratedCard[] = []
    try {
      // Try to extract JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || text.match(/(\[[\s\S]*\])/)
      if (jsonMatch) {
        generatedCards = JSON.parse(jsonMatch[1] || jsonMatch[0])
      } else {
        generatedCards = JSON.parse(text)
      }
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error}. Response: ${text.slice(0, 500)}`)
    }

    console.log(`✓ Generated ${generatedCards.length} flashcards`)

    // ✅ STEP 4: CREATE ECS ENTITIES (70-95%)
    await jobManager.updateProgress(70, 'creating', 'Creating flashcard entities')

    const flashcardIds: string[] = []
    const progressPerCard = 25 / generatedCards.length  // 25% progress across all cards

    for (let i = 0; i < generatedCards.length; i++) {
      const card = generatedCards[i]

      // Find best matching chunk via keyword overlap
      let bestChunkId = chunkContext[0]?.id || null
      let bestChunkIds: string[] = []
      let documentId = chunkContext[0]?.document_id || null

      if (card.keywords && card.keywords.length > 0 && chunkContext.length > 0) {
        // Find chunks that contain any of the keywords
        const matchingChunks = chunkContext.filter(chunk =>
          card.keywords!.some((kw: string) =>
            chunk.content.toLowerCase().includes(kw.toLowerCase())
          )
        )

        if (matchingChunks.length > 0) {
          bestChunkId = matchingChunks[0].id
          bestChunkIds = matchingChunks.slice(0, 3).map((c: any) => c.id)  // Top 3 matches
          documentId = matchingChunks[0].document_id
        }
      }

      // Check if this is a cloze card
      const isCloze = card.type === 'cloze' && card.content && isClozeContent(card.content)

      if (isCloze) {
        // Extract cloze deletions and create one card per deletion
        const deletions = extractClozeDeletions(card.content!)
        const parentEntityId = `parent_${Date.now()}_${i}`  // Temporary ID for grouping

        console.log(`✓ Found ${deletions.length} cloze deletions in card ${i + 1}`)

        for (const deletion of deletions) {
          const question = renderClozeQuestion(card.content!, deletion.index)

          // Create ECS entity for this deletion
          const { data: entity } = await supabase
            .from('entities')
            .insert({
              user_id: userId,
              entity_type: 'flashcard',
            })
            .select()
            .single()

          if (!entity) {
            console.warn(`Failed to create cloze entity ${deletion.index}`)
            continue
          }

          // Add components
          await supabase.from('components').insert([
            {
              entity_id: entity.id,
              component_type: 'Card',
              data: {
                type: 'cloze',
                question: question,
                answer: deletion.text,
                content: card.content,  // Original with all {{c1::}} markers
                clozeIndex: deletion.index,
                clozeCount: deletions.length,
                status: 'draft',
                srs: null,
                deckId: deckId,
                deckAddedAt: new Date().toISOString(),
                parentCardId: parentEntityId,
                generatedBy: 'ai',
                generationPromptVersion: template.name,
              }
            },
            {
              entity_id: entity.id,
              component_type: 'Content',
              data: {
                tags: card.keywords || [],
                note: deletion.hint || null,
              }
            },
            {
              entity_id: entity.id,
              component_type: 'Temporal',
              data: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            },
            {
              entity_id: entity.id,
              component_type: 'ChunkRef',
              data: {
                documentId: documentId,
                document_id: documentId,
                chunkId: bestChunkId,
                chunk_id: bestChunkId,
                chunkIds: bestChunkIds.length > 0 ? bestChunkIds : (bestChunkId ? [bestChunkId] : []),
                chunkPosition: 0,
                generationJobId: job.id,
              }
            },
          ])

          flashcardIds.push(entity.id)
        }
      } else {
        // Regular basic card
        const { data: entity } = await supabase
          .from('entities')
          .insert({
            user_id: userId,
            entity_type: 'flashcard',
          })
          .select()
          .single()

        if (!entity) {
          console.warn(`Failed to create entity for card ${i + 1}`)
          continue
        }

        // Add components (Card, Content, Temporal, ChunkRef)
        await supabase.from('components').insert([
          {
            entity_id: entity.id,
            component_type: 'Card',
            data: {
              type: 'basic',
              question: card.question,
              answer: card.answer,
              status: 'draft',
              srs: null,
              deckId: deckId,
              deckAddedAt: new Date().toISOString(),
              generatedBy: 'ai',
              generationPromptVersion: template.name,
            }
          },
          {
            entity_id: entity.id,
            component_type: 'Content',
            data: {
              tags: card.keywords || [],
              note: null,
            }
          },
          {
            entity_id: entity.id,
            component_type: 'Temporal',
            data: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          },
          {
            entity_id: entity.id,
            component_type: 'ChunkRef',
            data: {
              documentId: documentId,
              document_id: documentId,
              chunkId: bestChunkId,
              chunk_id: bestChunkId,
              chunkIds: bestChunkIds.length > 0 ? bestChunkIds : (bestChunkId ? [bestChunkId] : []),
              chunkPosition: 0,
              generationJobId: job.id,
            }
          },
        ])

        flashcardIds.push(entity.id)
      }

      // Update progress every 5 cards
      if ((i + 1) % 5 === 0 || i === generatedCards.length - 1) {
        const percent = 70 + Math.floor((i + 1) * progressPerCard)
        await jobManager.updateProgress(
          percent,
          'creating',
          `Created ${i + 1} of ${generatedCards.length} cards`
        )
      }
    }

    console.log(`✓ Created ${flashcardIds.length} ECS entities`)

    // ✅ STEP 5: REBUILD CACHE (95%)
    await jobManager.updateProgress(95, 'finalizing', 'Building flashcards cache')

    const { error: cacheError } = await supabase.rpc('rebuild_flashcards_cache', {
      p_user_id: userId
    })

    if (cacheError) {
      console.error('[GenerateFlashcards] Cache rebuild failed:', cacheError)
      // Continue anyway - cache can be rebuilt manually
    } else {
      console.log(`✓ Rebuilt flashcards cache for user`)
    }

    // ✅ STEP 6: COMPLETE (100%)
    const processingTime = Date.now() - startTime

    const outputData = {
      success: true,
      flashcardsGenerated: flashcardIds.length,
      flashcardIds,
      processingTimeMs: processingTime,
      aiCost: 0.01,  // Estimated ~$0.01 per 5-10 cards
      averageConfidence: generatedCards.reduce((sum, c) => sum + (c.confidence || 0.8), 0) / generatedCards.length,
    }

    // Validate before saving
    GenerateFlashcardsOutputSchema.parse(outputData)

    await jobManager.markComplete(
      outputData,
      `Generated ${flashcardIds.length} flashcards in ${Math.round(processingTime / 1000)}s`
    )

    console.log(`[GenerateFlashcards] ✓ Complete: ${flashcardIds.length} cards`)

  } catch (error: any) {
    console.error('[GenerateFlashcards] Failed:', error)
    await jobManager.markFailed(error)
    throw error
  }
}
