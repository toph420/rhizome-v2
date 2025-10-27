'use client'

import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/rhizome/tooltip'
import { Compass, BookOpen, GraduationCap, Zap, ArrowLeft } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useRouter } from 'next/navigation'
import { chunkerLabels, chunkerDescriptions, chunkerColors, type ChunkerType } from '@/types/chunker'

interface DocumentHeaderProps {
  documentId: string
  title: string
  wordCount?: number
  chunkCount?: number
  connectionCount?: number
  chunkerType?: string | null
  viewMode?: 'explore' | 'focus' | 'study'
  onViewModeChange?: (mode: 'explore' | 'focus' | 'study') => void
  onQuickSpark?: () => void
}

/**
 * Document header with view controls and document details
 */
export function DocumentHeader({
  documentId,
  title,
  wordCount,
  chunkCount,
  connectionCount,
  chunkerType,
  viewMode = 'explore',
  onViewModeChange,
  onQuickSpark,
}: DocumentHeaderProps) {
  const router = useRouter()

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-background">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/')}
          title="Back to Library"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-l font-semibold truncate">{title}</h1>
            {chunkerType && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={chunkerColors[chunkerType as ChunkerType] || chunkerColors.hybrid}
                    >
                      {chunkerLabels[chunkerType as ChunkerType] || 'Unknown'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      {chunkerDescriptions[chunkerType as ChunkerType] || 'No description available'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {(wordCount || chunkCount || connectionCount) && (
            <p className="text-xs text-muted-foreground">
              {wordCount && `${wordCount.toLocaleString()} words`}
              {wordCount && chunkCount && ' • '}
              {chunkCount && `${chunkCount} chunks`}
              {chunkCount && connectionCount && ' • '}
              {connectionCount !== undefined && `${connectionCount} connections`}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Reading Mode Toggle */}
        {onViewModeChange && (
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) onViewModeChange(value as 'explore' | 'focus' | 'study')
            }}
          >
            <ToggleGroupItem value="explore" title="Explore (sidebar visible)">
              <Compass className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="focus" title="Focus (hide sidebar)">
              <BookOpen className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="study" title="Study (flashcards)">
              <GraduationCap className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
    </header>
  )
}
