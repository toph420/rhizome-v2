import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, Database, Sparkles, Download } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface PageProps {
  params: Promise<{ id: string }>
}

interface Chunk {
  id: string
  content: string
  chunk_index: number
  importance_score?: number | null
  summary?: string | null
  themes?: string[] | null
  start_offset?: number | null
  end_offset?: number | null
  embedding?: number[] | null
  timestamps?: unknown | null
}

/**
 * Document preview page showing processing results.
 * @param params - Route parameters containing document ID.
 * @returns Preview page component.
 */

export default async function DocumentPreviewPage({ params }: PageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) {
    return <div className="container mx-auto p-8">Authentication required</div>
  }
  
  const supabase = await createClient()

  // Get document metadata
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (docError || !doc) {
    return <div className="container mx-auto p-8">Document not found</div>
  }

  // Get chunks
  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', id)
    .order('chunk_index')

  // Get markdown content
  let markdownContent: string | null = null
  if (doc.markdown_available) {
    const { data: signedUrlData } = await supabase.storage
      .from('documents')
      .createSignedUrl(`${doc.storage_path}/content.md`, 3600)
    
    if (signedUrlData?.signedUrl) {
      const response = await fetch(signedUrlData.signedUrl)
      markdownContent = await response.text()
    }
  }

  return (
    <div className="container mx-auto p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{doc.title}</h1>
          <p className="text-muted-foreground">Processing Preview</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/read/${id}`}>
            <Button>
              <FileText className="h-4 w-4 mr-2" />
              Read Document
            </Button>
          </Link>
        </div>
      </div>

      {/* Document Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Document Metadata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={doc.processing_status === 'completed' ? 'default' : 'secondary'}>
                {doc.processing_status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stage</p>
              <p className="font-medium">{doc.processing_stage || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Chunks</p>
              <p className="font-medium">{chunks?.length || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Embeddings</p>
              <Badge variant={doc.embeddings_available ? 'default' : 'secondary'}>
                {doc.embeddings_available ? 'Available' : 'Pending'}
              </Badge>
            </div>
          </div>
          
          {doc.processing_error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-sm text-destructive">{doc.processing_error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="chunks" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chunks">
            <Sparkles className="h-4 w-4 mr-2" />
            Chunks ({chunks?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="markdown" disabled={!markdownContent}>
            <FileText className="h-4 w-4 mr-2" />
            Markdown
          </TabsTrigger>
          <TabsTrigger value="raw">
            <Database className="h-4 w-4 mr-2" />
            Raw Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chunks" className="space-y-4">
          {chunks && chunks.length > 0 ? (
            chunks.map((chunk: Chunk, index: number) => (
              <Card key={chunk.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        Chunk {index + 1}
                        {chunk.importance_score && (
                          <Badge variant="outline" className="ml-2">
                            Importance: {(chunk.importance_score * 100).toFixed(0)}%
                          </Badge>
                        )}
                      </CardTitle>
                      {chunk.summary && (
                        <CardDescription className="mt-2">{chunk.summary}</CardDescription>
                      )}
                    </div>
                  </div>
                  {chunk.themes && chunk.themes.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {chunk.themes.map((theme: string, i: number) => (
                        <Badge key={i} variant="secondary">{theme}</Badge>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm whitespace-pre-wrap">{chunk.content}</p>
                  </div>
                  <div className="mt-4 pt-4 border-t flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Chunk Index: {chunk.chunk_index}</span>
                    <span>•</span>
                    <span>Length: {chunk.content.length} chars</span>
                    {chunk.embedding && (
                      <>
                        <span>•</span>
                        <span>Embedding: {Array.isArray(chunk.embedding) ? chunk.embedding.length : 0}D vector</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No chunks available yet. Document may still be processing.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="markdown">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Markdown</CardTitle>
              <CardDescription>
                Full markdown content extracted from the document
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none bg-muted p-4 rounded-md overflow-auto max-h-[600px]">
                <pre className="whitespace-pre-wrap text-xs">{markdownContent}</pre>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                {markdownContent ? `${markdownContent.length} characters` : 'No content'}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw">
          <div className="space-y-4">
            {/* Document JSON */}
            <Card>
              <CardHeader>
                <CardTitle>Document Record (documents table)</CardTitle>
                <CardDescription>Complete database record</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-md overflow-auto max-h-[400px] text-xs">
                  {JSON.stringify(doc, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* Chunks JSON */}
            {chunks && chunks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Chunks Data (chunks table)</CardTitle>
                  <CardDescription>
                    {chunks.length} chunks with embeddings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded-md overflow-auto max-h-[400px] text-xs">
                    {JSON.stringify(
                      chunks.map(c => ({
                        ...c,
                        // Truncate embedding for display
                        embedding: c.embedding ? `[${c.embedding.length}D vector]` : null,
                        content: c.content.slice(0, 100) + '...'
                      })),
                      null,
                      2
                    )}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}