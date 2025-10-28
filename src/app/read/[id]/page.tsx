import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { getDocumentJob, updateLastViewed } from '@/app/actions/documents'
import { getAnnotations, getAnnotationsNeedingReview } from '@/app/actions/annotations'
import { ReaderLayout } from '@/components/reader/ReaderLayout'

interface ReaderPageProps {
  params: Promise<{ id: string }>
}

/**
 * Reader page component for viewing documents with annotations.
 * @param root0 - Component props.
 * @param root0.params - Route parameters.
 * @returns Reader page JSX.
 */
export default async function ReaderPage({ params }: ReaderPageProps) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: doc, error } = await supabase
    .from('documents')
    .select('*, markdown_available, embeddings_available, processing_status, processing_stage, chunker_type')
    .eq('id', id)
    .single()
  
  if (error || !doc) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Document Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p>The requested document could not be found.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Update last_viewed timestamp (fire and forget - don't block rendering)
  updateLastViewed(id).catch(error => {
    console.error('[ReaderPage] Failed to update last_viewed:', error)
    // Continue rendering even if update fails
  })

  // Check processing status first
  if (doc.processing_status === 'failed') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Processing Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive mb-4">
              Document processing failed. Please try uploading the document again.
            </p>
            {doc.processing_stage && (
              <p className="text-sm text-muted-foreground">
                Failed at stage: {doc.processing_stage}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if processing is still in progress
  if (doc.processing_status === 'processing' || doc.processing_status === 'pending') {
    const job = await getDocumentJob(id)
    
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Processing Document</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              
              {job && (
                <div className="text-center w-full">
                  <p className="text-sm font-medium mb-2">
                    {job.progress?.stage || 'Pending'}
                  </p>
                  <p className="text-2xl font-bold mb-2">
                    {job.progress?.percent || 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: {job.status}
                  </p>
                </div>
              )}
              
              {!job && (
                <p className="text-sm text-muted-foreground">
                  Initializing processing...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Processing is complete - check if markdown is available
  if (doc.markdown_available) {
    // Use admin client to bypass RLS for signed URL creation
    const adminClient = createAdminClient()
    const { data, error: storageError } = await adminClient.storage
      .from('documents')
      .createSignedUrl(`${doc.storage_path}/content.md`, 3600)

    if (storageError || !data) {
      return (
        <div className="flex items-center justify-center h-screen">
          <Card>
            <CardHeader>
              <CardTitle>Error Loading Document</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive mb-4">
                Failed to load document content: {storageError?.message || 'File not found'}
              </p>
              <p className="text-sm text-muted-foreground">
                Storage path: {doc.storage_path}/content.md
              </p>
            </CardContent>
          </Card>
        </div>
      )
    }

    const signedUrl = data.signedUrl

    // Phase 1A: Load Docling markdown for charspan search
    let doclingMarkdown: string | undefined
    try {
      const { data: doclingData, error: doclingError } = await adminClient.storage
        .from('documents')
        .download(`${doc.storage_path}/docling.md`)

      if (!doclingError && doclingData) {
        doclingMarkdown = await doclingData.text()
        console.log('[ReaderPage] Loaded docling.md for charspan search:', doclingMarkdown.length, 'chars')
      } else {
        console.warn('[ReaderPage] docling.md not available:', doclingError?.message || 'File not found')
        // Continue without charspan search - will fall back to Phase 1 logic
      }
    } catch (error) {
      console.warn('[ReaderPage] Failed to load docling.md:', error)
      // Non-blocking - continue without charspan search
    }
    const job = await getDocumentJob(id)

    // 🆕 ADD: Generate PDF signed URL
    let pdfSignedUrl: string | null = null

    // Check if original PDF exists in storage
    const { data: pdfData, error: pdfError } = await adminClient.storage
      .from('documents')
      .createSignedUrl(`${doc.storage_path}/source.pdf`, 3600)

    if (!pdfError && pdfData) {
      pdfSignedUrl = pdfData.signedUrl

      // File size warning for large PDFs (personal tool philosophy)
      const { data: fileData } = await adminClient.storage
        .from('documents')
        .list(doc.storage_path, { search: 'source.pdf' })

      const fileSizeMB = fileData?.[0]?.metadata?.size ? fileData[0].metadata.size / (1024 * 1024) : 0

      // No artificial limits, just warnings
      if (fileSizeMB > 100) {
        console.warn(`[PDF Viewer] Large PDF: ${fileSizeMB.toFixed(2)}MB - may take longer to load`)
      }
    }

    // Query chunks ordered by index with metadata
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select(`
        id,
        content,
        chunk_index,
        chunker_type,
        start_offset,
        end_offset,
        themes,
        summary,
        importance_score,
        emotional_metadata,
        conceptual_metadata,
        domain_metadata,
        bboxes,
        page_start,
        page_end,
        charspan
      `)
      .eq('document_id', id)
      .order('chunk_index', { ascending: true })
    
    if (chunksError) {
      console.error('Failed to load chunks:', chunksError)
      return (
        <div className="p-8 text-center">
          <p className="text-destructive">Failed to load document chunks</p>
          <p className="text-sm text-muted-foreground mt-2">
            {chunksError.message}
          </p>
        </div>
      )
    }
    
    if (!chunks || chunks.length === 0) {
      return (
        <div className="p-8 text-center">
          <p className="text-muted-foreground">
            Document has no chunks. Processing may still be in progress.
          </p>
        </div>
      )
    }
    
    // Query annotations for this document
    const annotations = await getAnnotations(id)

    // Fetch review results for annotation recovery with error handling
    let reviewResults = null
    try {
      const results = await getAnnotationsNeedingReview(id)
      // Check if any recovered annotations exist (success, needsReview, or lost)
      if (results.success.length > 0 || results.needsReview.length > 0 || results.lost.length > 0) {
        reviewResults = results
      }
    } catch (error) {
      console.error('[ReaderPage] Failed to fetch review results:', error)
      // Continue showing reader page without review tab
      reviewResults = null
    }

    // Query connection count for header stats
    const { count: connectionCount } = await supabase
      .from('chunk_connections')
      .select('*', { count: 'exact', head: true })
      .or(`source_chunk_id.in.(${chunks.map(c => c.id).join(',')}),target_chunk_id.in.(${chunks.map(c => c.id).join(',')})`)

    return (
      <>
        {!doc.embeddings_available && job && (job.status === 'processing' || job.status === 'pending') && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 fixed top-0 left-0 right-0 z-50">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  Processing connections: {job.progress?.percent || 0}%
                </p>
                <p className="text-xs text-blue-700">
                  Stage: {job.progress?.stage || 'pending'}
                </p>
              </div>
            </div>
          </div>
        )}

        <ReaderLayout
          documentId={id}
          markdownUrl={signedUrl}
          pdfUrl={pdfSignedUrl}
          chunks={chunks}
          annotations={annotations}
          documentTitle={doc.title}
          wordCount={doc.word_count}
          connectionCount={connectionCount || 0}
          reviewResults={reviewResults}
          chunkerType={doc.chunker_type}
          doclingMarkdown={doclingMarkdown}
        />
      </>
    )
  }
  
  // Processing complete but no markdown available - could be an error state
  return (
    <div className="flex items-center justify-center h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Document Not Available</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            The document has been processed but the content is not available for viewing.
          </p>
          <p className="text-sm text-muted-foreground">
            Status: {doc.processing_status || 'Unknown'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}