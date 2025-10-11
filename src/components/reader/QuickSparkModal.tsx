'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { X, Zap, FileText, MapPin, Eye, Tag } from 'lucide-react'
import { toast } from 'sonner'
import type { Chunk } from '@/types/annotations'

interface QuickSparkModalProps {
  documentId: string
  documentTitle: string
  visibleChunks: Chunk[]
  activeConnections: number
  scrollPosition: number
  onClose: () => void
}

/**
 * Quick Spark capture modal with automatic context preservation.
 * Captures thoughts with full reading context (chunk, position, connections).
 *
 * @param props - Component props
 * @param props.documentId - Current document ID
 * @param props.documentTitle - Document title for context
 * @param props.visibleChunks - Currently visible chunks
 * @param props.activeConnections - Number of active connections in viewport
 * @param props.scrollPosition - Current scroll percentage (0-100)
 * @param props.onClose - Close handler
 * @returns Portal-rendered modal
 */
export function QuickSparkModal({
  documentId,
  documentTitle,
  visibleChunks,
  activeConnections,
  scrollPosition,
  onClose
}: QuickSparkModalProps) {
  const [content, setContent] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  async function handleCapture() {
    if (!content.trim()) {
      toast.error('Spark content cannot be empty')
      return
    }

    setIsSaving(true)

    try {
      // TODO: Create createSpark server action once Sparks ECS component is built
      // await createSpark({
      //   content: content.trim(),
      //   tags,
      //   documentId,
      //   context: {
      //     documentTitle,
      //     chunkIndex: visibleChunks[0]?.chunk_index,
      //     scrollPosition,
      //     visibleChunks: visibleChunks.map(c => c.id),
      //     activeConnections
      //   }
      // })

      // Placeholder: Show success
      toast.success('Spark captured with full context', {
        description: `Saved to ${documentTitle}`,
        duration: 3000
      })

      onClose()
    } catch (error) {
      console.error('[QuickSparkModal] Failed to capture spark:', error)
      toast.error('Failed to capture spark', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsSaving(false)
    }
  }

  function handleAddTag() {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }

  function handleRemoveTag(tag: string) {
    setTags(tags.filter(t => t !== tag))
  }

  const modalContent = (
    <motion.div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="bg-background rounded-lg shadow-2xl p-6 w-[500px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Quick Spark</h2>
            <p className="text-sm text-muted-foreground">Capture a thought with full context</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isSaving}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Input */}
        <Textarea
          autoFocus
          placeholder="What sparked this thought?..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full min-h-[120px] mb-4 resize-none"
          disabled={isSaving}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              handleCapture()
            }
          }}
        />

        {/* Tags Input */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Add tags (press Enter)..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTag()
                }
              }}
              disabled={isSaving}
              className="h-8"
            />
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    disabled={isSaving}
                    className="hover:text-foreground disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Auto-Captured Context Display */}
        <Card className="p-3 mb-4 bg-muted/50">
          <p className="text-xs font-medium mb-2">Context Captured:</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileText className="h-3 w-3" />
              <span>Reading: {documentTitle}</span>
            </div>
            {visibleChunks.length > 0 && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span>
                  Chunk {visibleChunks[0].chunk_index} • Position {scrollPosition}%
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Eye className="h-3 w-3" />
              <span>{activeConnections} active connections</span>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSaving} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleCapture} disabled={isSaving} className="flex-1">
            {isSaving ? (
              <>
                <motion.div
                  className="h-4 w-4 mr-2"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Zap className="h-4 w-4" />
                </motion.div>
                Saving...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Capture Spark
              </>
            )}
          </Button>
        </div>

        {/* Keyboard Hint */}
        <p className="text-xs text-muted-foreground text-center mt-3">
          Press <kbd className="px-1 border rounded bg-muted">⌘Enter</kbd> to save
        </p>
      </motion.div>
    </motion.div>
  )

  return typeof window !== 'undefined'
    ? createPortal(
        <AnimatePresence mode="wait">{modalContent}</AnimatePresence>,
        document.body
      )
    : null
}
