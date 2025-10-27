/**
 * Job Output Schemas with Zod Validation
 *
 * CRITICAL NAMING CONVENTION:
 * - Database columns: snake_case (e.g., created_at, output_data)
 * - JSONB content (output_data): camelCase (e.g., downloadUrl, zipFilename)
 * - Frontend variables: camelCase (e.g., const downloadUrl = ...)
 *
 * WHY camelCase in output_data?
 * - JSONB is schemaless in PostgreSQL - no DB constraints anyway
 * - Avoids transformation layer complexity
 * - Frontend and backend share same data structure
 * - Less churn, simpler codebase
 *
 * These schemas provide runtime validation to catch typos and type mismatches.
 */

import { z } from 'zod'

/**
 * Export Job Output Schema
 *
 * Used in: worker/handlers/export-document.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: src/components/admin/tabs/ExportTab.tsx
 */
export const ExportJobOutputSchema = z.object({
  success: z.boolean(),
  documentCount: z.number(),
  zipFilename: z.string(),
  zipSizeMb: z.string(),
  downloadUrl: z.string().url(), // ✅ camelCase
  expiresAt: z.string().datetime(),
  storagePath: z.string(),
  includedConnections: z.boolean(),
  includedAnnotations: z.boolean(),
})

export type ExportJobOutput = z.infer<typeof ExportJobOutputSchema>

/**
 * Import Job Output Schema
 *
 * Used in: worker/handlers/import-document.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: src/components/admin/tabs/ImportTab.tsx
 */
export const ImportJobOutputSchema = z.object({
  success: z.boolean(),
  documentId: z.string().optional(),
  documentTitle: z.string().optional(),
  chunksImported: z.number(),
  annotationsImported: z.number().optional(),
  annotationsRecovered: z.number().optional(),
  sparksImported: z.number().optional(),
  sparksRecovered: z.number().optional(),
  connectionsImported: z.number().optional(),
  connectionsRemapped: z.number().optional(),
  uploadedToStorage: z.boolean().optional(),
  strategy: z.enum(['skip', 'replace', 'merge_smart']).optional(),
  conflictStrategy: z.enum(['skip', 'replace', 'merge_smart']).optional(), // Legacy field
  embeddingsRegenerated: z.boolean().optional(),
  connectionDetectionJobId: z.string().nullish(),
  connectionsReprocessed: z.boolean().optional(),
  importDurationMs: z.number().optional(),
  error: z.string().optional(),
})

export type ImportJobOutput = z.infer<typeof ImportJobOutputSchema>

/**
 * Reprocess Connections Job Output Schema
 *
 * Used in: worker/handlers/reprocess-connections.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: src/components/admin/tabs/ConnectionsTab.tsx
 */
export const ReprocessConnectionsOutputSchema = z.object({
  success: z.boolean(),
  mode: z.enum(['reprocess_all', 'smart_mode', 'add_new']),
  connectionsDeleted: z.number().optional(),
  connectionsCreated: z.number(),
  validatedPreserved: z.number().optional(),
  backupCreated: z.boolean().optional(),
  backupPath: z.string().optional(),
  processingTimeMs: z.number().optional(),
  engines: z.array(z.string()).optional(),
  error: z.string().optional(),
})

export type ReprocessConnectionsOutput = z.infer<typeof ReprocessConnectionsOutputSchema>

/**
 * Generic Job Error Output
 *
 * Used when any job fails
 */
export const JobErrorOutputSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  errorStack: z.string().optional(),
  timestamp: z.string().datetime().optional(),
})

export type JobErrorOutput = z.infer<typeof JobErrorOutputSchema>

/**
 * Generate Flashcards Job Output Schema
 *
 * Used in: worker/handlers/generate-flashcards.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: Review panel UI
 */
export const GenerateFlashcardsOutputSchema = z.object({
  success: z.boolean(),
  flashcardsGenerated: z.number(),
  flashcardIds: z.array(z.string().uuid()),
  processingTimeMs: z.number(),
  aiCost: z.number().optional(),  // Estimated cost in USD
  averageConfidence: z.number().optional(),  // 0-1 range
  error: z.string().optional(),
})

export type GenerateFlashcardsOutput = z.infer<typeof GenerateFlashcardsOutputSchema>

/**
 * Scan Vault Job Output Schema
 *
 * Used in: worker/handlers/scan-vault.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: Obsidian integration UI
 */
export const ScanVaultOutputSchema = z.object({
  success: z.boolean(),
  documentCount: z.number(),
  documents: z.array(z.object({
    title: z.string(),
    complete: z.boolean(),
    hasContent: z.boolean(),
    hasHighlights: z.boolean(),
    hasConnections: z.boolean(),
    hasChunksJson: z.boolean(),
    hasMetadataJson: z.boolean(),
    hasManifestJson: z.boolean(),
  })),
  vaultPath: z.string(),
})

export type ScanVaultOutput = z.infer<typeof ScanVaultOutputSchema>

/**
 * Import From Vault Job Output Schema
 *
 * Used in: worker/handlers/import-from-vault.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: Obsidian integration UI
 */
export const ImportFromVaultOutputSchema = z.object({
  success: z.boolean(),
  documentId: z.string().optional(),
  documentTitle: z.string().optional(),
  chunksImported: z.number(),
  annotationsImported: z.number().optional(),
  annotationsRecovered: z.number().optional(),
  sparksImported: z.number().optional(),
  sparksRecovered: z.number().optional(),
  connectionsImported: z.number().optional(),
  connectionsRemapped: z.number().optional(),
  uploadedToStorage: z.boolean().optional(),
  strategy: z.enum(['skip', 'replace', 'merge_smart']).optional(),
  embeddingsRegenerated: z.boolean().optional(),
  connectionDetectionJobId: z.string().nullish(),
  error: z.string().optional(),
})

export type ImportFromVaultOutput = z.infer<typeof ImportFromVaultOutputSchema>

/**
 * Enrich Chunks Job Output Schema
 *
 * Used in: worker/handlers/enrich-chunks.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: UI components (ChunkMetadataIcon, ChunkCard, EnrichmentsTab)
 */
export const EnrichChunksOutputSchema = z.object({
  success: z.boolean(),
  chunksEnriched: z.union([z.number(), z.literal('all')]),
  completedAt: z.string(),
})

export type EnrichChunksOutput = z.infer<typeof EnrichChunksOutputSchema>

/**
 * Enrich and Connect Job Output Schema
 *
 * Used in: worker/handlers/enrich-and-connect.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: UI components (ChunkMetadataIcon, ChunkCard)
 */
export const EnrichAndConnectOutputSchema = z.object({
  success: z.boolean(),
  chunksProcessed: z.union([z.number(), z.literal('all')]),
  enrichmentComplete: z.boolean(),
  connectionsComplete: z.boolean(),
  completedAt: z.string(),
})

export type EnrichAndConnectOutput = z.infer<typeof EnrichAndConnectOutputSchema>

/**
 * Readwise Auto-Import Job Output Schema
 *
 * Used in: worker/handlers/readwise-auto-import.ts
 * Stored in: background_jobs.output_data (JSONB)
 * Consumed by: Integrations panel UI
 */
export const ReadwiseAutoImportOutputSchema = z.object({
  success: z.boolean(),
  bookTitle: z.string().optional(),
  bookAuthor: z.string().optional(),
  bookId: z.number().optional(),
  highlightCount: z.number().optional(),
  imported: z.number().optional(),
  needsReview: z.number().optional(),
  failed: z.number().optional(),
  error: z.string().optional(),
})

export type ReadwiseAutoImportOutput = z.infer<typeof ReadwiseAutoImportOutputSchema>

/**
 * Union type for all job outputs
 */
export type JobOutput =
  | ExportJobOutput
  | ImportJobOutput
  | ReprocessConnectionsOutput
  | GenerateFlashcardsOutput
  | ScanVaultOutput
  | ImportFromVaultOutput
  | EnrichChunksOutput
  | EnrichAndConnectOutput
  | ReadwiseAutoImportOutput
  | JobErrorOutput

/**
 * Helper function to validate job output before saving to database.
 * Throws ZodError if validation fails, which will be caught by job handler.
 *
 * @example
 * const outputData = {
 *   success: true,
 *   downloadUrl: signedUrl,
 *   // ... other fields
 * }
 * validateJobOutput('export', outputData) // Throws if invalid
 */
export function validateJobOutput(
  jobType: 'export_documents' | 'import_document' | 'reprocess_connections' | 'generate_flashcards' | 'scan_vault' | 'import_from_vault' | 'enrich_chunks' | 'enrich_and_connect' | 'readwise_auto_import',
  data: unknown
): JobOutput {
  switch (jobType) {
    case 'export_documents':
      return ExportJobOutputSchema.parse(data)
    case 'import_document':
      return ImportJobOutputSchema.parse(data)
    case 'reprocess_connections':
      return ReprocessConnectionsOutputSchema.parse(data)
    case 'generate_flashcards':
      return GenerateFlashcardsOutputSchema.parse(data)
    case 'scan_vault':
      return ScanVaultOutputSchema.parse(data)
    case 'import_from_vault':
      return ImportFromVaultOutputSchema.parse(data)
    case 'enrich_chunks':
      return EnrichChunksOutputSchema.parse(data)
    case 'enrich_and_connect':
      return EnrichAndConnectOutputSchema.parse(data)
    case 'readwise_auto_import':
      return ReadwiseAutoImportOutputSchema.parse(data)
    default:
      throw new Error(`Unknown job type: ${jobType}`)
  }
}
