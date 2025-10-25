'use client'

import { useState } from 'react'
import { Button } from '@/components/rhizome/button'
import { Label } from '@/components/rhizome/label'
import { Badge } from '@/components/rhizome/badge'
import { ScrollArea } from '@/components/rhizome/scroll-area'
import { RadioGroup, RadioGroupItem } from '@/components/rhizome/radio-group'
import { StudySession } from '@/components/flashcards/StudySession'
import { StudyStats } from '@/components/flashcards/StudyStats'
import { ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface CompactStudyTabProps {
  documentId: string
}

type StudySource = 'visible' | 'nearby' | 'full'
type StudyMode = 'select' | 'studying'

/**
 * Compact Study Tab for RightPanel
 *
 * Quick study interface without leaving document reader.
 * Supports visible chunks, nearby range, and full document modes.
 */
export function CompactStudyTab({ documentId }: CompactStudyTabProps) {
  const router = useRouter()
  const [studyMode, setStudyMode] = useState<StudyMode>('select')
  const [source, setSource] = useState<StudySource>('full')
  const [chunkIds] = useState<string[]>([]) // TODO: Calculate from visible chunks

  const handleStart = () => {
    setStudyMode('studying')
  }

  const handleComplete = () => {
    setStudyMode('select')
  }

  const handleExit = () => {
    setStudyMode('select')
  }

  // Selection mode
  if (studyMode === 'select') {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div>
            <h3 className="font-semibold mb-1">Quick Study</h3>
            <p className="text-xs text-muted-foreground">
              Study cards from this document
            </p>
          </div>

          {/* Document Stats */}
          <StudyStats
            scope="document"
            scopeId={documentId}
            mode="compact"
            className="p-3 bg-muted/50 rounded-lg"
          />

          {/* Source Selection */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2">Study from:</Label>
            <RadioGroup value={source} onValueChange={(v) => setSource(v as StudySource)}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="visible" id="visible" />
                  <Label htmlFor="visible" className="text-sm font-normal cursor-pointer">
                    Visible chunks
                    <Badge variant="neutral" className="ml-2 text-xs">
                      0 cards
                    </Badge>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nearby" id="nearby" />
                  <Label htmlFor="nearby" className="text-sm font-normal cursor-pointer">
                    Nearby range
                    <Badge variant="neutral" className="ml-2 text-xs">
                      0 cards
                    </Badge>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full" className="text-sm font-normal cursor-pointer">
                    Full document
                    <Badge variant="neutral" className="ml-2 text-xs">
                      All cards
                    </Badge>
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t">
            <Button
              className="w-full"
              onClick={handleStart}
            >
              Start Quick Study
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => router.push('/study')}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open Full Study Page
            </Button>
          </div>
        </div>
      </ScrollArea>
    )
  }

  // Studying mode - embedded session
  return (
    <div className="h-full">
      <StudySession
        mode="compact"
        documentId={documentId}
        chunkIds={source === 'full' ? undefined : chunkIds}
        limit={20}
        dueOnly={false}
        onComplete={handleComplete}
        onExit={handleExit}
      />
    </div>
  )
}
