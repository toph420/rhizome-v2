'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createAnnotation } from '@/app/actions/annotations'
import { extractContext } from '@/lib/annotations/text-range'
import type { TextSelection } from '@/types/annotations'

interface QuickCapturePanelProps {
  selection: TextSelection
  documentId: string
  onClose: () => void
  chunkContent: string // Full chunk text for context extraction
}

const COLOR_OPTIONS = [
  {
    key: 'g',
    color: 'green',
    label: 'Green',
    className: 'bg-green-200 hover:bg-green-300 border-green-400',
  },
  {
    key: 'y',
    color: 'yellow',
    label: 'Yellow',
    className: 'bg-yellow-200 hover:bg-yellow-300 border-yellow-400',
  },
  {
    key: 'r',
    color: 'red',
    label: 'Red',
    className: 'bg-red-200 hover:bg-red-300 border-red-400',
  },
  {
    key: 'b',
    color: 'blue',
    label: 'Blue',
    className: 'bg-blue-200 hover:bg-blue-300 border-blue-400',
  },
  {
    key: 'p',
    color: 'purple',
    label: 'Purple',
    className: 'bg-purple-200 hover:bg-purple-300 border-purple-400',
  },
] as const

/**
 * Quick capture panel for creating annotations inline.
 * Positioned near text selection with color buttons and optional note.
 * @param props - Component props.
 * @param props.selection - Text selection data from Range API.
 * @param props.documentId - Document identifier for annotation linking.
 * @param props.onClose - Callback to close panel.
 * @param props.chunkContent - Full chunk text for context extraction.
 * @returns React element with annotation creation UI.
 */
export function QuickCapturePanel({
  selection,
  documentId,
  onClose,
  chunkContent,
}: QuickCapturePanelProps) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const handleColorSelect = useCallback(async (color: string) => {
    if (saving) return // Prevent double-submit
    setSelectedColor(color)

    // saveAnnotation logic inline to avoid nested async functions
    setSaving(true)

    try {
      // Extract context from full chunk text
      const textContext = extractContext(
        chunkContent,
        selection.range.startOffset,
        selection.range.endOffset
      )

      const result = await createAnnotation({
        text: selection.text,
        chunkId: selection.range.chunkId,
        documentId,
        startOffset: selection.range.startOffset,
        endOffset: selection.range.endOffset,
        color: color as 'yellow' | 'green' | 'blue' | 'red' | 'purple',
        note: note || undefined,
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
  }, [saving, chunkContent, selection, documentId, note, retryCount, onClose])


  // Handle keyboard shortcuts
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      // Don't capture if user is typing in textarea
      if (document.activeElement === noteRef.current) return

      const colorOption = COLOR_OPTIONS.find(
        (opt) => opt.key === e.key.toLowerCase()
      )
      if (colorOption) {
        e.preventDefault()
        void handleColorSelect(colorOption.color)
      }
    }

    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [handleColorSelect])

  return (
    <Popover open={true} onOpenChange={(open) => !open && onClose()}>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-80"
        style={{
          position: 'fixed',
          top: Math.min(selection.rect.bottom + 10, window.innerHeight - 250),
          left: selection.rect.left + selection.rect.width / 2,
          transform: 'translateX(-50%)',
          zIndex: 50,
        }}
      >
        <div className="space-y-3">
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