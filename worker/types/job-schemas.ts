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
  chunksImported: z.number(),
  conflictStrategy: z.enum(['skip', 'replace', 'merge_smart']).optional(),
  embeddingsRegenerated: z.boolean().optional(),
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
 * Union type for all job outputs
 */
export type JobOutput =
  | ExportJobOutput
  | ImportJobOutput
  | ReprocessConnectionsOutput
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
  jobType: 'export_documents' | 'import_document' | 'reprocess_connections',
  data: unknown
): JobOutput {
  switch (jobType) {
    case 'export_documents':
      return ExportJobOutputSchema.parse(data)
    case 'import_document':
      return ImportJobOutputSchema.parse(data)
    case 'reprocess_connections':
      return ReprocessConnectionsOutputSchema.parse(data)
    default:
      throw new Error(`Unknown job type: ${jobType}`)
  }
}
