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
import type { SupabaseClient } from '@supabase/supabase-js'

interface GenerateFlashcardsInput {
  sourceType: 'document' | 'chunks' | 'selection'
  sourceIds: string[]  // document IDs or chunk IDs
  cardCount: number
  userId: string
  deckId: string  // Where to add generated cards
}

interface GeneratedCard {
  question: string
  answer: string
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
  const { sourceType, sourceIds, cardCount, userId, deckId } = job.input_data

  console.log(`[GenerateFlashcards] Starting for ${sourceIds.length} ${sourceType}(s)`)

  const jobManager = new HandlerJobManager(supabase, job.id)
  const startTime = Date.now()

  try {
    // ✅ STEP 1: LOAD SOURCE CONTENT (10%)
    await jobManager.updateProgress(10, 'loading', 'Loading source content')

    let sourceContent = ''
    let chunkContext: any[] = []

    if (sourceType === 'document') {
      // Load full document markdown + chunks for matching
      const { data: docs } = await supabase
        .from('documents')
        .select('id, title, markdown_available')
        .in('id', sourceIds)

      for (const doc of docs || []) {
        if (doc.markdown_available) {
          // Download cleaned markdown from Storage (stored as content.md)
          const { data: signedUrl } = await supabase.storage
            .from('documents')
            .createSignedUrl(`${userId}/documents/${doc.id}/content.md`, 3600)

          if (signedUrl?.signedUrl) {
            const response = await fetch(signedUrl.signedUrl)
            const markdown = await response.text()
            sourceContent += `\n\n# ${doc.title}\n\n${markdown}`
          }
        }

        // Load chunks for matching
        const { data: chunks } = await supabase
          .from('chunks')
          .select('id, content, chunk_index, document_id, embedding')
          .eq('document_id', doc.id)
          .eq('is_current', true)
          .order('chunk_index')

        chunkContext.push(...(chunks || []))
      }
    } else if (sourceType === 'chunks') {
      // Load specific chunks
      const { data: chunks } = await supabase
        .from('chunks')
        .select('id, content, chunk_index, document_id, embedding')
        .in('id', sourceIds)
        .order('chunk_index')

      chunkContext = chunks || []
      sourceContent = chunks?.map(c => c.content).join('\n\n') || ''
    }

    console.log(`✓ Loaded ${sourceContent.length} chars from ${chunkContext.length} chunks`)

    // ✅ STEP 2: CALL GEMINI AI (20-70%)
    await jobManager.updateProgress(20, 'generating', 'Generating flashcards with AI')

    const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! })

    const prompt = `Generate ${cardCount} high-quality flashcards from this content.

Content:
${sourceContent.slice(0, 50000)}

Requirements:
- Focus on key concepts, important details, and connections
- Questions should be clear and specific
- Answers should be concise but complete (1-3 sentences)
- Each card should test understanding, not just recall
- Include keywords from the source text for each card

Output format (JSON array):
[
  {
    "question": "What is...",
    "answer": "...",
    "confidence": 0.85,
    "keywords": ["concept1", "concept2"]
  }
]

Generate exactly ${cardCount} flashcards in JSON format. Return ONLY the JSON array, no other text.`

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

    // ✅ STEP 3: CREATE ECS ENTITIES (70-95%)
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

      // Create ECS entity
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
          user_id: userId,
          component_type: 'Card',
          data: {
            type: 'basic',
            question: card.question,
            answer: card.answer,
            status: 'draft',
            srs: null,
            deckId: deckId,
            deckAddedAt: new Date().toISOString(),
            generatedBy: `ai_${sourceType}`,
            generationPromptVersion: 'v1-default',
          }
        },
        {
          entity_id: entity.id,
          user_id: userId,
          component_type: 'Content',
          data: {
            tags: card.keywords || [],
            note: null,
          }
        },
        {
          entity_id: entity.id,
          user_id: userId,
          component_type: 'Temporal',
          data: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        },
        {
          entity_id: entity.id,
          user_id: userId,
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

    // ✅ STEP 4: COMPLETE (100%)
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
