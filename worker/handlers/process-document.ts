/**
 * Document Processing Handler V2 - Refactored with DocumentProcessingManager
 *
 * This is the refactored version using the manager pattern.
 * Reduced from 730 lines to ~50 lines by extracting workflow into DocumentProcessingManager.
 *
 * The manager handles:
 * - Checkpoint/cache checking
 * - AI processing with cancellation
 * - Storage operations
 * - Database operations
 * - Embeddings generation
 * - Connection detection
 *
 * The handler now focuses solely on:
 * - Extracting job parameters
 * - Creating the manager
 * - Handling errors
 */

import { DocumentProcessingManager } from '../lib/managers/document-processing-manager.js'
import type { SourceType } from '../types/multi-format.js'

/**
 * Main document processing handler.
 * Routes processing to DocumentProcessingManager.
 *
 * @param supabase - Supabase client with service role
 * @param job - Background job containing document processing request
 */
export async function processDocumentHandler(supabase: any, job: any): Promise<void> {
  const { document_id, source_type = 'pdf', review_before_chunking, review_docling_extraction } = job.input_data

  // Get document metadata
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', document_id)
    .single()

  if (docError || !doc) {
    throw new Error(`Document not found: ${document_id}`)
  }

  // Create manager with all parameters
  const manager = new DocumentProcessingManager(supabase, job.id, {
    documentId: document_id,
    userId: doc.user_id,
    sourceType: source_type as SourceType,
    reviewBeforeChunking: review_before_chunking,
    reviewDoclingExtraction: review_docling_extraction
  })

  // Execute complete workflow
  try {
    await manager.execute()
  } catch (error: any) {
    await manager.markFailed(error)
    throw error // Re-throw for retry logic
  }
}
