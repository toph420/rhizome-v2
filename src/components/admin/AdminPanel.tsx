'use client'

import { useState } from 'react'
import { deleteDocument, retryDocument } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Trash2, RefreshCw } from 'lucide-react'

interface AdminPanelProps {
  documents: Array<{
    id: string
    title: string
    status: string
    created_at: string
  }>
}

export function AdminPanel({ documents }: AdminPanelProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleDelete = async (documentId: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return

    setLoading(documentId)
    setMessage(null)

    const result = await deleteDocument(documentId)

    if (result.success) {
      setMessage(`Deleted: ${title}`)
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setLoading(null)
  }

  const handleRetry = async (documentId: string, title: string) => {
    setLoading(documentId)
    setMessage(null)

    const result = await retryDocument(documentId)

    if (result.success) {
      setMessage(`Retry queued for: ${title}`)
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setLoading(null)
  }

  if (documents.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">No documents yet</p>
      </Card>
    )
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Admin Controls</h3>
        {message && (
          <span className="text-sm text-muted-foreground">{message}</span>
        )}
      </div>

      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-3 rounded-lg border"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{doc.title}</p>
              <p className="text-xs text-muted-foreground">
                {doc.status} • {new Date(doc.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRetry(doc.id, doc.title)}
                disabled={loading === doc.id}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(doc.id, doc.title)}
                disabled={loading === doc.id}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
