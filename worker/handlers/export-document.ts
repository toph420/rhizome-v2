/**
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
    await updateProgress(supabase, job.id, 5, 'metadata', 'processing', 'Fetching document metadata')

    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, title, source_type, created_at')
      .in('id', document_ids)

    if (docsError || !documents || documents.length === 0) {
      throw new Error(`Failed to fetch documents: ${docsError?.message || 'No documents found'}`)
    }

    console.log(`✓ Found ${documents.length} documents to export`)

    // ✅ STEP 2: CREATE ZIP ARCHIVE (10%)
    await updateProgress(supabase, job.id, 10, 'creating_zip', 'processing', 'Creating ZIP archive')

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

      // ✅ OPTIONAL: ADD CONNECTIONS.JSON
      if (includeConnections) {
        console.log(`  - Querying connections for ${doc.id}`)

        try {
          // First, get all chunk IDs for this document
          const { data: chunks, error: chunksError } = await supabase
            .from('chunks')
            .select('id')
            .eq('document_id', doc.id)

          if (chunksError) {
            console.warn(`  ⚠️ Failed to fetch chunks:`, chunksError.message)
          } else if (!chunks || chunks.length === 0) {
            console.log(`  - No chunks found for document`)
          } else {
            const chunkIds = chunks.map((c: any) => c.id)

            // Now query connections using chunk IDs directly
            const { data: connections, error: connError } = await supabase
              .from('connections')
              .select(`
                id,
                source_chunk_id,
                target_chunk_id,
                connection_type,
                strength,
                explanation,
                user_validated,
                created_at
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

      // ✅ OPTIONAL: ADD ANNOTATIONS.JSON
      if (includeAnnotations) {
        console.log(`  - Checking for annotations.json`)

        try {
          const annotationsPath = `${storagePath}/annotations.json`
          const annotations = await readFromStorage(supabase, annotationsPath)

          if (annotations) {
            docFolder.file('annotations.json', JSON.stringify(annotations, null, 2))
            console.log(`  ✓ Added: annotations.json`)
          }
        } catch (error) {
          // Annotations file doesn't exist - this is not an error
          console.log(`  - No annotations.json found (this is normal)`)
        }
      }

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
    await updateProgress(supabase, job.id, 90, 'finalizing', 'processing', 'Finalizing ZIP archive')

    zip.file('manifest.json', JSON.stringify(topLevelManifest, null, 2))
    console.log(`\n✓ Added top-level manifest.json`)

    // ✅ STEP 5: GENERATE ZIP BLOB (95%)
    await updateProgress(supabase, job.id, 95, 'generating', 'processing', 'Generating ZIP file')

    console.log(`\n📦 Generating ZIP blob...`)
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    console.log(`✓ ZIP generated: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`)

    // ✅ STEP 6: SAVE ZIP TO STORAGE (97%)
    await updateProgress(supabase, job.id, 97, 'saving', 'processing', 'Saving ZIP to Storage')

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
    await updateProgress(supabase, job.id, 99, 'url', 'processing', 'Creating download URL')

    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(zipPath, 86400) // 24 hours = 86400 seconds

    if (urlError || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${urlError?.message || 'No URL returned'}`)
    }

    console.log(`✓ Created signed URL (expires in 24 hours)`)

    // ✅ STEP 8: MARK JOB COMPLETE (100%)
    await updateProgress(supabase, job.id, 100, 'complete', 'completed', 'Export completed successfully')

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: {
          success: true,
          document_count: documents.length,
          zip_filename: zipFilename,
          zip_size_mb: (zipBlob.size / 1024 / 1024).toFixed(2),
          downloadUrl: signedUrlData.signedUrl, // Frontend expects camelCase
          expires_at: new Date(Date.now() + 86400 * 1000).toISOString(), // 24 hours
          storage_path: zipPath,
          included_connections: includeConnections || false,
          included_annotations: includeAnnotations || false
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    console.log(`\n✅ Export complete!`)
    console.log(`   - Documents: ${documents.length}`)
    console.log(`   - ZIP size: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   - Download URL: ${signedUrlData.signedUrl.substring(0, 100)}...`)

  } catch (error: any) {
    console.error('❌ Export failed:', error)

    // Update job with error
    await updateProgress(
      supabase,
      job.id,
      0,
      'error',
      'failed',
      error.message || 'Export failed'
    )

    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        output_data: {
          success: false,
          error: error.message
        },
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw error
  }
}

/**
 * Update job progress in background_jobs table.
 *
 * @param supabase - Supabase client
 * @param jobId - Job ID to update
 * @param percentage - Progress percentage (0-100)
 * @param stage - Current processing stage
 * @param status - Job status
 * @param message - Human-readable progress message
 */
async function updateProgress(
  supabase: any,
  jobId: string,
  percentage: number,
  stage: string,
  status: string,
  message?: string
) {
  const { error } = await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent: percentage,
        stage,
        details: message || `${stage}: ${percentage}%`
      },
      status
    })
    .eq('id', jobId)

  if (error) {
    console.error('Failed to update job progress:', error)
  }
}
