'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { Input } from '@/components/rhizome/input'
import { Textarea } from '@/components/rhizome/textarea'
import { FileText, Eye, Loader2, Trash2, Pause, Play, ExternalLink, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { updateDocumentMetadata } from '@/app/actions/documents'
import { cn } from '@/lib/utils'

interface DocumentCardProps {
  document: {
    id: string
    title: string
    author?: string | null
    description?: string | null
    publication_date?: string | null
    processing_status: string
    processing_stage?: string | null
    review_stage?: 'docling_extraction' | 'ai_cleanup' | null
    created_at: string
    markdown_available: boolean
    embeddings_available: boolean
    obsidian_uri?: string | null
    source_type?: string | null
    source_url?: string | null
    page_count?: number | null
    word_count?: number | null
    language?: string | null
    publisher?: string | null
    chunker_type?: string | null
  }
  onDeleted?: () => void
  onUpdated?: () => void
  onContinueProcessing?: (docId: string, skipAi: boolean) => void
  onOpenObsidian?: (docId: string, uri?: string) => void
  onDelete?: (docId: string, title: string) => void
  processing?: string | null
  deleting?: string | null
}

/**
 * Feature-rich DocumentCard component with:
 * - Click-to-edit inline metadata (title, author, description, publication_date)
 * - Auto-save on blur
 * - Metadata display (source info, stats, processing info)
 * - Action buttons (Preview, Read, Review, Delete, etc.)
 * - Local state management (NO Zustand - follows FlashcardCard pattern)
 * - Optimistic updates with error rollback
 *
 * Pattern: Exactly like FlashcardCard at src/components/rhizome/flashcard-card.tsx
 */
export function DocumentCard({
  document,
  onDeleted,
  onUpdated,
  onContinueProcessing,
  onOpenObsidian,
  onDelete,
  processing,
  deleting
}: DocumentCardProps) {
  // Local state for inline editing (NO Zustand)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(document.title)
  const [editingAuthor, setEditingAuthor] = useState(false)
  const [authorValue, setAuthorValue] = useState(document.author || '')
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionValue, setDescriptionValue] = useState(document.description || '')
  const [editingPubDate, setEditingPubDate] = useState(false)
  const [pubDateValue, setPubDateValue] = useState(document.publication_date || '')

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Status checks
  const isCompleted = document.processing_status === 'completed'
  const isProcessing = document.processing_status === 'processing'
  const isFailed = document.processing_status === 'failed'
  const isAwaitingReview = document.processing_status === 'awaiting_manual_review'
  const isCurrentlyProcessing = processing === document.id
  const isCurrentlyDeleting = deleting === document.id

  // Auto-save title on blur
  const handleTitleBlur = useCallback(async () => {
    const trimmed = titleValue.trim()

    // Validate title
    if (!trimmed) {
      toast.error('Title cannot be empty')
      setTitleValue(document.title) // Revert
      setEditingTitle(false)
      return
    }

    // Skip if unchanged
    if (trimmed === document.title) {
      setEditingTitle(false)
      return
    }

    setIsSubmitting(true)
    const originalTitle = document.title

    try {
      const result = await updateDocumentMetadata(document.id, { title: trimmed })

      if (!result.success) {
        throw new Error(result.error || 'Failed to update title')
      }

      // No toast - Supabase realtime will update automatically
      // onUpdated removed - realtime subscription handles update
    } catch (error) {
      // Rollback on error
      setTitleValue(originalTitle)
      toast.error('Failed to update title')
      console.error('[DocumentCard] Title update failed:', error)
    } finally {
      setIsSubmitting(false)
      setEditingTitle(false)
    }
  }, [titleValue, document.title, document.id, onUpdated])

  // Auto-save author on blur
  const handleAuthorBlur = useCallback(async () => {
    const trimmed = authorValue.trim()
    const newValue = trimmed || null
    const currentValue = document.author || null

    // Skip if unchanged
    if (newValue === currentValue) {
      setEditingAuthor(false)
      return
    }

    setIsSubmitting(true)
    const originalAuthor = document.author

    try {
      const result = await updateDocumentMetadata(document.id, { author: newValue })

      if (!result.success) {
        throw new Error(result.error || 'Failed to update author')
      }

      // No toast - Supabase realtime will update automatically
      // onUpdated removed - realtime subscription handles update
    } catch (error) {
      // Rollback on error
      setAuthorValue(originalAuthor || '')
      toast.error('Failed to update author')
      console.error('[DocumentCard] Author update failed:', error)
    } finally {
      setIsSubmitting(false)
      setEditingAuthor(false)
    }
  }, [authorValue, document.author, document.id, onUpdated])

  // Auto-save description on blur
  const handleDescriptionBlur = useCallback(async () => {
    const trimmed = descriptionValue.trim()
    const newValue = trimmed || null
    const currentValue = document.description || null

    // Skip if unchanged
    if (newValue === currentValue) {
      setEditingDescription(false)
      return
    }

    setIsSubmitting(true)
    const originalDescription = document.description

    try {
      const result = await updateDocumentMetadata(document.id, { description: newValue })

      if (!result.success) {
        throw new Error(result.error || 'Failed to update description')
      }

      // No toast - Supabase realtime will update automatically
      // onUpdated removed - realtime subscription handles update
    } catch (error) {
      // Rollback on error
      setDescriptionValue(originalDescription || '')
      toast.error('Failed to update description')
      console.error('[DocumentCard] Description update failed:', error)
    } finally {
      setIsSubmitting(false)
      setEditingDescription(false)
    }
  }, [descriptionValue, document.description, document.id, onUpdated])

  // Auto-save publication date on blur
  const handlePubDateBlur = useCallback(async () => {
    const trimmed = pubDateValue.trim()
    const newValue = trimmed || null
    const currentValue = document.publication_date || null

    // Skip if unchanged
    if (newValue === currentValue) {
      setEditingPubDate(false)
      return
    }

    setIsSubmitting(true)
    const originalPubDate = document.publication_date

    try {
      const result = await updateDocumentMetadata(document.id, { publication_date: newValue })

      if (!result.success) {
        throw new Error(result.error || 'Failed to update publication date')
      }

      // No toast - Supabase realtime will update automatically
      // onUpdated removed - realtime subscription handles update
    } catch (error) {
      // Rollback on error
      setPubDateValue(originalPubDate || '')
      toast.error('Failed to update publication date')
      console.error('[DocumentCard] Publication date update failed:', error)
    } finally {
      setIsSubmitting(false)
      setEditingPubDate(false)
    }
  }, [pubDateValue, document.publication_date, document.id, onUpdated])

  return (
    <Card
      className={cn(
        "transition-all",
        isSubmitting && "opacity-50"
      )}
      data-testid="document-card"
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 space-y-2">
            {/* Editable Title */}
            {editingTitle ? (
              <Input
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  } else if (e.key === 'Escape') {
                    setTitleValue(document.title)
                    setEditingTitle(false)
                  }
                }}
                autoFocus
                disabled={isSubmitting}
                className="text-lg font-semibold"
                data-testid="title-input"
              />
            ) : (
              <CardTitle
                onClick={() => !isSubmitting && setEditingTitle(true)}
                className={cn(
                  "truncate cursor-pointer transition-colors",
                  !isSubmitting && "hover:text-primary"
                )}
                data-testid="document-title"
              >
                {document.title}
              </CardTitle>
            )}

            {/* Editable Author & Publisher */}
            <div className="flex items-center gap-2 text-sm">
              {editingAuthor ? (
                <Input
                  value={authorValue}
                  onChange={(e) => setAuthorValue(e.target.value)}
                  onBlur={handleAuthorBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    } else if (e.key === 'Escape') {
                      setAuthorValue(document.author || '')
                      setEditingAuthor(false)
                    }
                  }}
                  autoFocus
                  disabled={isSubmitting}
                  placeholder="Add author..."
                  className="h-7 text-sm max-w-xs"
                  data-testid="author-input"
                />
              ) : (
                <span
                  onClick={() => !isSubmitting && setEditingAuthor(true)}
                  className={cn(
                    "cursor-pointer transition-colors text-muted-foreground",
                    !isSubmitting && "hover:text-foreground"
                  )}
                  data-testid="document-author"
                >
                  {document.author || 'Add author...'}
                </span>
              )}

              {document.publisher && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{document.publisher}</span>
                </>
              )}
            </div>

            {/* Editable Description */}
            {editingDescription ? (
              <Textarea
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                onBlur={handleDescriptionBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setDescriptionValue(document.description || '')
                    setEditingDescription(false)
                  }
                }}
                autoFocus
                disabled={isSubmitting}
                placeholder="Add description..."
                className="text-sm min-h-[60px]"
                rows={2}
                data-testid="description-input"
              />
            ) : (
              document.description || !isSubmitting ? (
                <CardDescription
                  onClick={() => !isSubmitting && setEditingDescription(true)}
                  className={cn(
                    "cursor-pointer transition-colors line-clamp-2",
                    !isSubmitting && "hover:text-foreground"
                  )}
                  data-testid="document-description"
                >
                  {document.description || 'Add description...'}
                </CardDescription>
              ) : null
            )}

            {/* Status Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={
                isCompleted ? 'default' :
                isProcessing ? 'secondary' :
                isFailed ? 'destructive' :
                isAwaitingReview ? 'secondary' :
                'outline'
              } data-testid="status-badge">
                {isAwaitingReview && <Pause className="h-3 w-3 mr-1" />}
                {document.processing_status}
              </Badge>
              {document.processing_stage && (
                <span className="text-xs text-muted-foreground">{document.processing_stage}</span>
              )}
              {document.source_type && (
                <Badge variant="outline" className="text-xs">
                  {document.source_type.replace('_', ' ')}
                </Badge>
              )}
              {document.chunker_type && isCompleted && (
                <Badge variant="outline" className="text-xs">
                  {document.chunker_type}
                </Badge>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 ml-4">
            {isCompleted && document.markdown_available && (
              <>
                <Link href={`/documents/${document.id}/preview`}>
                  <Button variant="outline" size="sm" data-testid="preview-button">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                </Link>
                <Link href={`/read/${document.id}`}>
                  <Button size="sm" data-testid="read-button">
                    <FileText className="h-4 w-4 mr-2" />
                    Read
                  </Button>
                </Link>
              </>
            )}
            {isProcessing && (
              <Button variant="outline" size="sm" disabled data-testid="processing-button">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing
              </Button>
            )}
            {isAwaitingReview && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenObsidian?.(document.id, document.obsidian_uri || undefined)}
                  data-testid="review-obsidian-button"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Review in Obsidian
                </Button>
                {document.review_stage === 'docling_extraction' ? (
                  // After Docling extraction: Offer two options
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onContinueProcessing?.(document.id, true)}
                      disabled={isCurrentlyProcessing}
                      data-testid="skip-ai-cleanup-button"
                    >
                      {isCurrentlyProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Skip AI Cleanup
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onContinueProcessing?.(document.id, false)}
                      disabled={isCurrentlyProcessing}
                      data-testid="continue-with-ai-button"
                    >
                      {isCurrentlyProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Continue with AI Cleanup
                    </Button>
                  </>
                ) : (
                  // After AI cleanup: Just continue to chunking
                  <Button
                    size="sm"
                    onClick={() => onContinueProcessing?.(document.id, false)}
                    disabled={isCurrentlyProcessing}
                    data-testid="continue-processing-button"
                  >
                    {isCurrentlyProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Continue Processing
                  </Button>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete?.(document.id, document.title)}
              disabled={isCurrentlyDeleting}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              data-testid="delete-button"
            >
              {isCurrentlyDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {/* Publication Date (editable) */}
          {(editingPubDate || document.publication_date) && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Published:</span>
              {editingPubDate ? (
                <Input
                  type="date"
                  value={pubDateValue}
                  onChange={(e) => setPubDateValue(e.target.value)}
                  onBlur={handlePubDateBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    } else if (e.key === 'Escape') {
                      setPubDateValue(document.publication_date || '')
                      setEditingPubDate(false)
                    }
                  }}
                  autoFocus
                  disabled={isSubmitting}
                  className="h-6 text-xs max-w-[150px]"
                  data-testid="pubdate-input"
                />
              ) : (
                <span
                  onClick={() => !isSubmitting && setEditingPubDate(true)}
                  className={cn(
                    "cursor-pointer transition-colors",
                    !isSubmitting && "hover:text-foreground"
                  )}
                  data-testid="document-pubdate"
                >
                  {document.publication_date ?
                    new Date(document.publication_date).toLocaleDateString() :
                    'Add date...'
                  }
                </span>
              )}
            </div>
          )}

          {/* Document Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span data-testid="document-created">
              Created {new Date(document.created_at).toLocaleDateString()}
            </span>
            {document.page_count && (
              <>
                <span>•</span>
                <span data-testid="page-count">{document.page_count} pages</span>
              </>
            )}
            {document.word_count && (
              <>
                <span>•</span>
                <span data-testid="word-count">{document.word_count.toLocaleString()} words</span>
              </>
            )}
            {document.language && document.language !== 'en' && (
              <>
                <span>•</span>
                <span data-testid="language">{document.language}</span>
              </>
            )}
            {document.markdown_available && (
              <>
                <span>•</span>
                <span data-testid="markdown-available">✓ Markdown</span>
              </>
            )}
            {document.embeddings_available && (
              <>
                <span>•</span>
                <span data-testid="embeddings-available">✓ Embeddings</span>
              </>
            )}
            {document.source_url && (
              <>
                <span>•</span>
                <a
                  href={document.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  data-testid="source-url"
                >
                  <Globe className="h-3 w-3" />
                  Source
                </a>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
