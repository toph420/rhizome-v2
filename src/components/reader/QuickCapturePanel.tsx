'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, X, Layers } from 'lucide-react'
import { createAnnotation } from '@/app/actions/annotations'
import { extractContext } from '@/lib/annotations/text-range'
import type { TextSelection, Chunk } from '@/types/annotations'

interface QuickCapturePanelProps {
  selection: TextSelection
  documentId: string
  onClose: () => void
  chunks: Chunk[] // All chunks for context extraction
}

const COLOR_OPTIONS = [
  {
    key: 'y',
    color: 'yellow',
    label: 'Yellow',
    className: 'bg-yellow-200 hover:bg-yellow-300 border-yellow-400',
  },
  {
    key: 'g',
    color: 'green',
    label: 'Green',
    className: 'bg-green-200 hover:bg-green-300 border-green-400',
  },
  {
    key: 'b',
    color: 'blue',
    label: 'Blue',
    className: 'bg-blue-200 hover:bg-blue-300 border-blue-400',
  },
  {
    key: 'r',
    color: 'red',
    label: 'Red',
    className: 'bg-red-200 hover:bg-red-300 border-red-400',
  },
  {
    key: 'p',
    color: 'purple',
    label: 'Purple',
    className: 'bg-purple-200 hover:bg-purple-300 border-purple-400',
  },
  {
    key: 'o',
    color: 'orange',
    label: 'Orange',
    className: 'bg-orange-200 hover:bg-orange-300 border-orange-400',
  },
  {
    key: 'k',
    color: 'pink',
    label: 'Pink',
    className: 'bg-pink-200 hover:bg-pink-300 border-pink-400',
  },
] as const

/**
 * Quick capture panel for creating annotations inline.
 * Positioned near text selection with color buttons and optional note.
 * Supports multi-chunk annotations with visual indicator.
 * @param props - Component props.
 * @param props.selection - Text selection data with chunkIds array.
 * @param props.documentId - Document identifier for annotation linking.
 * @param props.onClose - Callback to close panel.
 * @param props.chunks - All chunks for context extraction.
 * @returns React element with annotation creation UI.
 */
export function QuickCapturePanel({
  selection,
  documentId,
  onClose,
  chunks,
}: QuickCapturePanelProps) {
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Handle tag addition
  const addTag = useCallback(() => {
    const trimmedTag = tagInput.trim()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag])
      setTagInput('')
    }
  }, [tagInput, tags])

  // Handle tag removal
  const removeTag = useCallback((tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }, [tags])

  // Handle Enter key in tag input
  const handleTagKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }, [addTag])

  const handleColorSelect = useCallback(async (color: string) => {
    if (saving) return // Prevent double-submit
    setSelectedColor(color)

    // saveAnnotation logic inline to avoid nested async functions
    setSaving(true)

    try {
      // Get primary chunk (first in chunkIds array)
      const primaryChunkId = selection.range.chunkIds[0]
      if (!primaryChunkId) {
        toast.error('No chunk found for selection')
        setSaving(false)
        return
      }

      // Find primary chunk to extract context
      const primaryChunk = chunks.find(ch => ch.id === primaryChunkId)
      if (!primaryChunk) {
        console.error(`Primary chunk ${primaryChunkId} not found in chunks array`)
        toast.error('Failed to find annotation chunk')
        setSaving(false)
        return
      }

      // Extract context using chunk-relative offsets
      const chunkStartOffset = primaryChunk.start_offset ?? 0
      const chunkRelativeStart = selection.range.startOffset - chunkStartOffset
      const chunkRelativeEnd = selection.range.endOffset - chunkStartOffset

      const textContext = extractContext(
        primaryChunk.content,
        chunkRelativeStart,
        chunkRelativeEnd
      )

      // Save annotation with MARKDOWN-ABSOLUTE offsets and chunkIds array
      const result = await createAnnotation({
        text: selection.text,
        chunkIds: selection.range.chunkIds, // ← Array of chunk IDs
        documentId,
        startOffset: selection.range.startOffset,  // ← MARKDOWN-ABSOLUTE
        endOffset: selection.range.endOffset,      // ← MARKDOWN-ABSOLUTE
        color: color as 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink',
        note: note || undefined,
        tags: tags.length > 0 ? tags : undefined,
        textContext,
      })

      if (result.success) {
        toast.success('Highlight saved', {
          description: `${color.charAt(0).toUpperCase() + color.slice(1)} highlight created`,
          duration: 2000,
        })
        setRetryCount(0) // Reset retry count on success
        onClose()
      } else {
        // Server-side validation error
        console.error('Server validation error:', result.error)
        toast.error('Failed to save highlight', {
          description: result.error || 'Please try again',
          action: retryCount < 3 ? {
            label: 'Retry',
            onClick: () => {
              setRetryCount(retryCount + 1)
              void handleColorSelect(color)
            },
          } : undefined,
          duration: 5000,
        })
      }
    } catch (error) {
      // Network error or unexpected exception
      console.error('Failed to save annotation:', error)
      
      toast.error('Network error', {
        description: 'Could not reach server. Check your connection.',
        action: retryCount < 3 ? {
          label: 'Retry',
          onClick: () => {
            setRetryCount(retryCount + 1)
            void handleColorSelect(color)
          },
        } : undefined,
        duration: 5000,
      })
    } finally {
      setSaving(false)
    }
  }, [saving, chunks, selection, documentId, note, tags, retryCount, onClose])


  // Handle keyboard shortcuts
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      // Don't capture if user is typing in textarea or tag input
      if (
        document.activeElement === noteRef.current ||
        document.activeElement === tagInputRef.current
      ) {
        return
      }

      // Handle Escape key to close
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      const colorOption = COLOR_OPTIONS.find(
        (opt) => opt.key === e.key.toLowerCase()
      )
      if (colorOption) {
        e.preventDefault()
        void handleColorSelect(colorOption.color)
      }
    }

    window.addEventListener('keypress', handleKeyPress)
    window.addEventListener('keydown', handleKeyPress) // For Escape
    return () => {
      window.removeEventListener('keypress', handleKeyPress)
      window.removeEventListener('keydown', handleKeyPress)
    }
  }, [handleColorSelect, onClose])

  return (
    <Popover open={true} modal={false}>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-80"
        onInteractOutside={(e) => {
          // Only close if clicking outside, not on inputs/buttons inside
          e.preventDefault()
        }}
        onEscapeKeyDown={() => onClose()}
        style={{
          position: 'fixed',
          top: Math.min(selection.rect.bottom + 10, window.innerHeight - 250),
          left: selection.rect.left + selection.rect.width / 2,
          transform: 'translateX(-50%)',
          zIndex: 50,
        }}
      >
        <div className="space-y-3">
          {/* Multi-chunk indicator */}
          {selection.range.chunkIds.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
              <Layers className="h-3 w-3" />
              <span>Spans {selection.range.chunkIds.length} chunks</span>
            </div>
          )}

          <div className="flex gap-2 justify-center">
            {COLOR_OPTIONS.map((option) => (
              <Button
                key={option.color}
                variant="outline"
                size="sm"
                className={option.className}
                onClick={() => handleColorSelect(option.color)}
                disabled={saving}
                title={`${option.label} (${option.key})`}
                aria-label={`Highlight ${option.label}`}
              >
                {saving && selectedColor === option.color ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  option.key.toUpperCase()
                )}
              </Button>
            ))}
          </div>

          <Textarea
            ref={noteRef}
            placeholder="Add a note (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            className="min-h-[80px] resize-none"
          />

          {/* Tag Input */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                ref={tagInputRef}
                type="text"
                placeholder="Add tags (press Enter)..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                disabled={saving}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTag}
                disabled={saving || !tagInput.trim()}
              >
                Add
              </Button>
            </div>

            {/* Display tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 px-2 py-0.5"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      disabled={saving}
                      className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                handleColorSelect(selectedColor || 'yellow')
              }
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save with Note'
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}