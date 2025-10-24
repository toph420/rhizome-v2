/**
 * Source loaders for flashcard generation
 *
 * Supports 5 source types:
 * 1. Document - Full document markdown
 * 2. Chunks - Specific chunks by ID
 * 3. Selection - Text selection from reader
 * 4. Annotation - From annotation entities
 * 5. Connection - From connection entities
 *
 * Pattern: Clean abstraction using loader classes
 * Each loader implements SourceLoader interface
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SourceContent {
  content: string
  chunks: Array<{
    id: string
    content: string
    chunk_index: number
    document_id: string
    embedding?: number[]
  }>
}

export interface SourceLoader {
  load(supabase: SupabaseClient, userId: string): Promise<SourceContent>
}

/**
 * Document source loader
 * Loads full document markdown + chunks for matching
 */
export class DocumentSourceLoader implements SourceLoader {
  constructor(private documentIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    let content = ''
    const chunks: SourceContent['chunks'] = []

    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, markdown_available, storage_path')
      .in('id', this.documentIds)

    for (const doc of docs || []) {
      let hasMarkdown = false

      // Try to load markdown from Storage first
      if (doc.markdown_available && doc.storage_path) {
        try {
          const markdownPath = `${doc.storage_path}/content.md`
          const { data: signedUrl } = await supabase.storage
            .from('documents')
            .createSignedUrl(markdownPath, 3600)

          if (signedUrl?.signedUrl) {
            const response = await fetch(signedUrl.signedUrl)
            if (response.ok) {
              const markdown = await response.text()
              content += `\n\n# ${doc.title}\n\n${markdown}`
              hasMarkdown = true
            }
          }
        } catch (error) {
          console.warn(`Failed to load markdown for doc ${doc.id}, using chunks`)
        }
      }

      // Load chunks for matching (always)
      const { data: docChunks } = await supabase
        .from('chunks')
        .select('id, content, chunk_index, document_id, embedding')
        .eq('document_id', doc.id)
        .eq('is_current', true)
        .order('chunk_index')

      chunks.push(...(docChunks || []))

      // If markdown wasn't available, use chunk content as fallback
      if (!hasMarkdown && docChunks && docChunks.length > 0) {
        content += `\n\n# ${doc.title}\n\n`
        content += docChunks.map(c => c.content).join('\n\n')
      }
    }

    return { content, chunks }
  }
}

/**
 * Chunks source loader
 * Loads specific chunks by ID
 */
export class ChunksSourceLoader implements SourceLoader {
  constructor(private chunkIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', this.chunkIds)
      .order('chunk_index')

    const content = chunks?.map(c => c.content).join('\n\n') || ''

    return { content, chunks: chunks || [] }
  }
}

/**
 * Selection source loader
 * Loads from text selection in reader
 */
export class SelectionSourceLoader implements SourceLoader {
  constructor(
    private selection: {
      text: string
      documentId: string
      startOffset: number
      endOffset: number
    }
  ) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    // Find chunks that overlap with selection using character offsets
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, character_start, character_end, embedding')
      .eq('document_id', this.selection.documentId)
      .eq('is_current', true)
      .lte('character_start', this.selection.endOffset)
      .gte('character_end', this.selection.startOffset)
      .order('chunk_index')

    return { content: this.selection.text, chunks: chunks || [] }
  }
}

/**
 * Annotation source loader
 * Loads from annotation entities (ECS)
 */
export class AnnotationSourceLoader implements SourceLoader {
  constructor(private annotationIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    const { data: entities } = await supabase
      .from('entities')
      .select(`
        id,
        components!inner(component_type, data)
      `)
      .in('id', this.annotationIds)
      .eq('user_id', userId)

    let content = ''
    const chunkIds: string[] = []

    for (const entity of entities || []) {
      const components = entity.components as any[]
      const contentComp = components.find(c => c.component_type === 'Content')
      const chunkRefComp = components.find(c => c.component_type === 'ChunkRef')

      // Extract annotation text
      if (contentComp?.data.text) {
        content += contentComp.data.text + '\n\n'
      }

      // Extract note if present
      if (contentComp?.data.note) {
        content += `Note: ${contentComp.data.note}\n\n`
      }

      // Collect chunk IDs
      if (chunkRefComp?.data.chunkIds) {
        chunkIds.push(...chunkRefComp.data.chunkIds)
      }
    }

    // Load chunks
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', chunkIds)
      .order('chunk_index')

    return { content, chunks: chunks || [] }
  }
}

/**
 * Connection source loader
 * Loads from connection entities
 */
export class ConnectionSourceLoader implements SourceLoader {
  constructor(private connectionIds: string[]) {}

  async load(supabase: SupabaseClient, userId: string): Promise<SourceContent> {
    const { data: connections } = await supabase
      .from('connections')
      .select(`id, source_chunk_id, target_chunk_id, connection_type, explanation`)
      .in('id', this.connectionIds)

    const chunkIds = new Set<string>()
    let content = ''

    for (const conn of connections || []) {
      chunkIds.add(conn.source_chunk_id)
      chunkIds.add(conn.target_chunk_id)

      // Add connection explanation if available
      if (conn.explanation) {
        content += `Connection (${conn.connection_type}): ${conn.explanation}\n\n`
      }
    }

    // Load chunks
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, document_id, embedding')
      .in('id', Array.from(chunkIds))
      .order('chunk_index')

    // Add chunk content
    for (const chunk of chunks || []) {
      content += chunk.content + '\n\n'
    }

    return { content, chunks: chunks || [] }
  }
}

/**
 * Factory function to create appropriate loader
 */
export function createSourceLoader(
  sourceType: string,
  sourceIds: string[],
  selectionData?: {
    text: string
    documentId: string
    startOffset: number
    endOffset: number
  }
): SourceLoader {
  switch (sourceType) {
    case 'document':
      return new DocumentSourceLoader(sourceIds)
    case 'chunks':
      return new ChunksSourceLoader(sourceIds)
    case 'selection':
      if (!selectionData) {
        throw new Error('Selection data required for selection source type')
      }
      return new SelectionSourceLoader(selectionData)
    case 'annotation':
      return new AnnotationSourceLoader(sourceIds)
    case 'connection':
      return new ConnectionSourceLoader(sourceIds)
    default:
      throw new Error(`Unknown source type: ${sourceType}`)
  }
}
