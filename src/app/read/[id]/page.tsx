import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { getDocumentJob } from '@/app/actions/documents'

interface ReaderPageProps {
  params: Promise<{ id: string }>
}

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
        
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">{doc.title}</h1>
            
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-4">
                  Document reader with markdown content from: {signedUrl}
                </p>
                <div className="prose prose-sm max-w-none">
                  <p className="italic">
                    Full markdown rendering will be implemented in the reader component.
                    The signed URL above provides access to the processed markdown content.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }
  
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