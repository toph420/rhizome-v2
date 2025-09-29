import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { getDocumentJob } from '@/app/actions/documents'
import { getAnnotations } from '@/app/actions/annotations'
import { DocumentViewer } from '@/components/reader/DocumentViewer'
import { RightPanel } from '@/components/sidebar/RightPanel'

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
    .select('*, markdown_available, embeddings_available, processing_status, processing_stage')
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
    const job = await getDocumentJob(id)
    
    // Query chunks ordered by index
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, position_context, start_offset, end_offset')
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
    const annotationsResult = await getAnnotations(id)
    const annotations = annotationsResult.success ? annotationsResult.data : []
    
    return (
      <div className="flex flex-col h-screen">
        {!doc.embeddings_available && job && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
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
        
        <div className="flex-1 overflow-auto">
          <DocumentViewer
            documentId={id}
            markdownUrl={signedUrl}
            chunks={chunks}
            annotations={annotations}
          />
        </div>
        
        {/* Right panel with connections and annotations */}
        <RightPanel documentId={id} />
      </div>
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