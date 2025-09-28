'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SupabaseClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Eye, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface Document {
  id: string
  title: string
  processing_status: string
  processing_stage?: string
  created_at: string
  markdown_available: boolean
  embeddings_available: boolean
}

/**
 * DocumentList component displays user's documents with links to reader and preview.
 * @returns DocumentList component.
 */
export function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    
    // Get user ID (dev mode or auth)
    const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID
    if (devUserId) {
      setUserId(devUserId)
      loadDocuments(supabase, devUserId)
    } else {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          setUserId(user.id)
          loadDocuments(supabase, user.id)
        } else {
          setLoading(false)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    
    // Subscribe to document changes
    const channel = supabase
      .channel('document-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'documents',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setDocuments(prev => [payload.new as Document, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setDocuments(prev => prev.map(doc => 
            doc.id === (payload.new as Document).id ? payload.new as Document : doc
          ))
        } else if (payload.eventType === 'DELETE') {
          setDocuments(prev => prev.filter(doc => doc.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  async function loadDocuments(supabase: SupabaseClient, userId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('documents')
      .select('id, title, processing_status, processing_stage, created_at, markdown_available, embeddings_available')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (data) {
      setDocuments(data)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No documents yet. Upload one to get started!
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {documents.map((doc) => {
        const isCompleted = doc.processing_status === 'completed'
        const isProcessing = doc.processing_status === 'processing'
        const isFailed = doc.processing_status === 'failed'
        
        return (
          <Card key={doc.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="truncate">{doc.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Badge variant={
                      isCompleted ? 'default' : 
                      isProcessing ? 'secondary' : 
                      isFailed ? 'destructive' : 
                      'outline'
                    }>
                      {doc.processing_status}
                    </Badge>
                    {doc.processing_stage && (
                      <span className="text-xs">{doc.processing_stage}</span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2 ml-4">
                  {isCompleted && doc.markdown_available && (
                    <>
                      <Link href={`/documents/${doc.id}/preview`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          Preview
                        </Button>
                      </Link>
                      <Link href={`/read/${doc.id}`}>
                        <Button size="sm">
                          <FileText className="h-4 w-4 mr-2" />
                          Read
                        </Button>
                      </Link>
                    </>
                  )}
                  {isProcessing && (
                    <Button variant="outline" size="sm" disabled>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Created {new Date(doc.created_at).toLocaleDateString()}</span>
                {doc.markdown_available && (
                  <>
                    <span>•</span>
                    <span>✓ Markdown</span>
                  </>
                )}
                {doc.embeddings_available && (
                  <>
                    <span>•</span>
                    <span>✓ Embeddings</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}