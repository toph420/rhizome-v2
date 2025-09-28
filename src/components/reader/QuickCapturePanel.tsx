'use client'

import { useState, useEffect, useRef } from 'react'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
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

type ColorOption = (typeof COLOR_OPTIONS)[number]

/**
 * Quick capture panel for creating annotations inline.
 * Positioned near text selection with color buttons and optional note.
 * 
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
  const noteRef = useRef<HTMLTextAreaElement>(null)

  async function handleColorSelect(color: string) {
    setSelectedColor(color)
    await saveAnnotation(color)
  }

  async function saveAnnotation(color: string) {
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
        toast.success('Annotation saved', {
          description: `Highlighted in ${color}`,
          duration: 2000,
        })
        onClose()
      } else {
        toast.error('Failed to save annotation', {
          description: result.error || 'Unknown error',
          duration: 4000,
        })
      }
    } catch (error) {
      console.error('Failed to save annotation:', error)
      toast.error('Error', {
        description: 'Failed to save annotation',
        duration: 4000,
      })
    } finally {
      setSaving(false)
    }
  }

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
        handleColorSelect(colorOption.color)
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
                {option.key.toUpperCase()}
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
              {saving ? 'Saving...' : 'Save with Note'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}