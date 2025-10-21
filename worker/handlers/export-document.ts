/**
 * Export Document Background Job Handler
 * REFACTORED: Now uses HandlerJobManager
 */
 * Export Document Background Job Handler
 *
 * Generates downloadable ZIP bundles containing all document files from Storage.
 *
 * Features:
 * - Reads all files from Storage for each document
 * - Creates ZIP with organized document folders
 * - Optional connections.json inclusion (queries from Database)
 * - Optional annotations.json inclusion (reads from Storage)
 * - Saves ZIP to Storage under exports/ folder
 * - Returns signed URL with 24-hour expiry for download
 *
 * ZIP Structure:
 * export-2025-10-12.zip/
 * ├── doc-id-1/
 * │   ├── source.pdf
 * │   ├── content.md
 * │   ├── chunks.json
 * │   ├── metadata.json
 * │   ├── manifest.json
 * │   ├── cached_chunks.json (if LOCAL mode)
 * │   ├── connections.json (if includeConnections)
 * │   └── annotations.json (if includeAnnotations)
 * ├── doc-id-2/
 * │   └── (same structure)
 * └── manifest.json (top-level, describes all documents)
 *
 * See: docs/tasks/storage-first-portability.md (T-019)
 * Pattern reference: worker/handlers/import-document.ts
 */

import JSZip from 'jszip'
import { readFromStorage, listStorageFiles } from '../lib/storage-helpers.js'
import { HandlerJobManager } from '../lib/handler-job-manager.js'
import { ExportJobOutputSchema } from '../types/job-schemas.js'

/**
 * Export documents to ZIP bundle.
 *
 * @param supabase - Supabase client with service role
 * @param job - Background job containing export request
 */
export async function exportDocumentHandler(supabase: any, job: any): Promise<void> {
  const {
    document_ids,
    includeConnections,
    includeAnnotations,
    format
  } = job.input_data

  console.log(`📦 Starting export for ${document_ids.length} documents`)
  console.log(`   - Include connections: ${includeConnections || false}`)
  console.log(`   - Include annotations: ${includeAnnotations || false}`)
  console.log(`   - Format: ${format || 'zip'}`)

  try {
    // Get user_id from job
    const userId = job.user_id

    // ✅ STEP 1: GET DOCUMENT METADATA (5%)
    await jobManager.updateProgress(5, 'metadata', 'Fetching document metadata')

    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, title, source_type, created_at')
      .in('id', document_ids)

    if (docsError || !documents || documents.length === 0) {
      throw new Error(`Failed to fetch documents: ${docsError?.message || 'No documents found'}`)
    }

    console.log(`✓ Found ${documents.length} documents to export`)

    // ✅ STEP 2: CREATE ZIP ARCHIVE (10%)
    await jobManager.updateProgress(10, 'creating_zip', 'Creating ZIP archive')

    const zip = new JSZip()
    const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const zipFilename = `export-${timestamp}.zip`

    // Track top-level manifest data
    const topLevelManifest = {
      export_date: new Date().toISOString(),
      document_count: documents.length,
      documents: [] as any[]
    }

    // ✅ STEP 3: PROCESS EACH DOCUMENT (10-90%)
    const progressPerDoc = 80 / documents.length // Distribute 80% progress across documents

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      const docProgress = 10 + Math.round(progressPerDoc * (i + 0.5))

      await updateProgress(
        supabase,
        job.id,
        docProgress,
        'processing_documents',
        'processing',
        `Processing document ${i + 1} of ${documents.length}: ${doc.title}`
      )

      console.log(`\n📄 Processing document ${i + 1}/${documents.length}: ${doc.title}`)

      // Create folder for this document in ZIP
      const docFolder = zip.folder(doc.id)
      if (!docFolder) {
        console.warn(`⚠️ Failed to create folder for ${doc.id}`)
        continue
      }

      // List all files in Storage for this document
      const storagePath = `${userId}/${doc.id}`
      let storageFiles: Array<{ name: string; size: number; updated_at: string }> = []

      try {
        storageFiles = await listStorageFiles(supabase, storagePath)
        console.log(`✓ Found ${storageFiles.length} files in Storage`)
      } catch (error) {
        console.warn(`⚠️ Failed to list files for ${doc.id}:`, error)
        continue
      }

      // Read and add each file to ZIP
      // This includes annotations.json created by the hourly cron job
      for (const file of storageFiles) {
        try {
          const filePath = `${storagePath}/${file.name}`
          console.log(`  - Reading: ${file.name}`)

          // Create signed URL for all file types
          const { data: signedUrlData, error: urlError } = await supabase.storage
            .from('documents')
            .createSignedUrl(filePath, 3600)

          if (urlError || !signedUrlData?.signedUrl) {
            console.warn(`  ⚠️ Failed to create signed URL for ${file.name}`)
            continue
          }

          // Handle different file types
          if (
            file.name.endsWith('.pdf') ||
            file.name.endsWith('.epub') ||
            file.name.endsWith('.jpg') ||
            file.name.endsWith('.png')
          ) {
            // Binary files: fetch as ArrayBuffer for JSZip
            const response = await fetch(signedUrlData.signedUrl)
            if (!response.ok) {
              console.warn(`  ⚠️ Failed to fetch ${file.name}: ${response.statusText}`)
              continue
            }

            const arrayBuffer = await response.arrayBuffer()
            docFolder.file(file.name, arrayBuffer)
            console.log(`  ✓ Added: ${file.name} (${arrayBuffer.byteLength} bytes)`)
          } else if (file.name.endsWith('.md')) {
            // Markdown files: fetch as plain text
            const response = await fetch(signedUrlData.signedUrl)
            if (!response.ok) {
              console.warn(`  ⚠️ Failed to fetch ${file.name}: ${response.statusText}`)
              continue
            }

            const text = await response.text()
            docFolder.file(file.name, text)
            console.log(`  ✓ Added: ${file.name}`)
          } else {
            // JSON files: fetch and parse as JSON
            const response = await fetch(signedUrlData.signedUrl)
            if (!response.ok) {
              console.warn(`  ⚠️ Failed to fetch ${file.name}: ${response.statusText}`)
              continue
            }

            const jsonData = await response.json()
            const jsonString = JSON.stringify(jsonData, null, 2)
            docFolder.file(file.name, jsonString)
            console.log(`  ✓ Added: ${file.name}`)
          }
        } catch (error) {
          console.warn(`  ⚠️ Failed to read ${file.name}:`, error)
          // Continue with other files
        }
      }

      // ✅ OPTIONAL: ADD CONNECTIONS.JSON (queried from Database)
      if (includeConnections) {
        console.log(`  - Querying connections for ${doc.id}`)

        try {
          const { data: chunks, error: chunksError } = await supabase
            .from('chunks')
            .select('id')
            .eq('document_id', doc.id)

          if (chunksError) {
            console.warn(`  ⚠️ Failed to fetch chunks:`, chunksError.message)
          } else if (chunks && chunks.length > 0) {
            const chunkIds = chunks.map((c: any) => c.id)

            // Query connections using chunk IDs directly
            const { data: connections, error: connError } = await supabase
              .from('connections')
              .select(`
                id,
                source_chunk_id,
                target_chunk_id,
                connection_type,
                strength,
                metadata,
                user_validated,
                auto_detected,
                discovered_at
              `)
              .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`)

            if (connError) {
              console.warn(`  ⚠️ Failed to fetch connections:`, connError.message)
            } else if (connections && connections.length > 0) {
              const connectionsData = {
                version: '1.0',
                document_id: doc.id,
                connection_count: connections.length,
                connections: connections,
                exported_at: new Date().toISOString()
              }

              docFolder.file('connections.json', JSON.stringify(connectionsData, null, 2))
              console.log(`  ✓ Added: connections.json (${connections.length} connections)`)
            } else {
              console.log(`  - No connections found`)
            }
          }
        } catch (error) {
          console.warn(`  ⚠️ Error fetching connections:`, error)
        }
      }

      // Note: Annotations are automatically included via annotations.json file
      // created by the hourly cron job (worker/jobs/export-annotations.ts)
      // The file loop above reads it from Storage and adds it to the ZIP

      // Add document to top-level manifest
      topLevelManifest.documents.push({
        id: doc.id,
        title: doc.title,
        source_type: doc.source_type,
        file_count: storageFiles.length,
        created_at: doc.created_at
      })
    }

    // ✅ STEP 4: ADD TOP-LEVEL MANIFEST (90%)
    await jobManager.updateProgress(90, 'finalizing', 'Finalizing ZIP archive')

    zip.file('manifest.json', JSON.stringify(topLevelManifest, null, 2))
    console.log(`\n✓ Added top-level manifest.json`)

    // ✅ STEP 5: GENERATE ZIP BLOB (95%)
    await jobManager.updateProgress(95, 'generating', 'Generating ZIP file')

    console.log(`\n📦 Generating ZIP blob...`)
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    console.log(`✓ ZIP generated: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`)

    // ✅ STEP 6: SAVE ZIP TO STORAGE (97%)
    await jobManager.updateProgress(97, 'saving', 'Saving ZIP to Storage')

    const zipPath = `${userId}/exports/${zipFilename}`
    console.log(`💾 Saving ZIP to Storage: ${zipPath}`)

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(zipPath, zipBlob, {
        contentType: 'application/zip',
        upsert: true
      })

    if (uploadError) {
      throw new Error(`Failed to save ZIP to Storage: ${uploadError.message}`)
    }

    console.log(`✓ ZIP saved to Storage`)

    // ✅ STEP 7: CREATE SIGNED URL (99%)
    await jobManager.updateProgress(99, 'url', 'Creating download URL')

    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(zipPath, 86400) // 24 hours = 86400 seconds

    if (urlError || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${urlError?.message || 'No URL returned'}`)
    }

    console.log(`✓ Created signed URL (expires in 24 hours)`)

    // ✅ STEP 8: MARK JOB COMPLETE (100%)
    await updateProgress(supabase, job.id, 100, 'complete', 'completed', 'Export completed successfully')

    // Prepare output data with camelCase (matches frontend expectations)
    const outputData = {
      success: true,
      documentCount: documents.length,
      zipFilename: zipFilename,
      zipSizeMb: (zipBlob.size / 1024 / 1024).toFixed(2),
      downloadUrl: signedUrlData.signedUrl,
      expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      storagePath: zipPath,
      includedConnections: includeConnections || false,
      includedAnnotations: includeAnnotations || false,
    }

    // Validate schema before saving (catches typos at runtime)
    ExportJobOutputSchema.parse(outputData)

    await jobManager.markComplete(outputData, 'Export completed successfully')

    console.log(`\n✅ Export complete!`)
    console.log(`   - Documents: ${documents.length}`)
    console.log(`   - ZIP size: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   - Download URL: ${signedUrlData.signedUrl.substring(0, 100)}...`)

  } catch (error: any) {
    console.error('❌ Export failed:', error)
    await jobManager.markFailed(error)
    throw error
  }
}

