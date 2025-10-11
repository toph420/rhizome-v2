'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Brain, GraduationCap, Layers } from 'lucide-react'

interface FlashcardsTabProps {
  documentId: string
}

/**
 * Flashcards tab with FSRS spaced repetition.
 * PLACEHOLDER: Full implementation requires Flashcard ECS component + FSRS algorithm.
 *
 * @param props - Component props
 * @param props.documentId - Document ID for filtering flashcards
 * @returns Flashcards list placeholder
 */
export function FlashcardsTab({ documentId }: FlashcardsTabProps) {
  // TODO: Fetch flashcards from database once ECS component is built
  // const cards = await getFlashcards(documentId)

  return (
    <div className="p-4 space-y-4">
      {/* Study Session Prompt (placeholder) */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Due for Review</p>
              <p className="text-xs text-muted-foreground">0 cards • Est. 0 min</p>
            </div>
            <Button size="sm" disabled>
              <GraduationCap className="h-4 w-4 mr-2" />
              Start
            </Button>
          </div>
        </div>
      </Card>

      {/* Placeholder Message */}
      <Card className="p-6 border-dashed">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20">
              <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Flashcards Coming Soon</h3>
            <p className="text-sm text-muted-foreground">
              Create flashcards from selections with FSRS spaced repetition
            </p>
          </div>
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              Features in development:
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1">
              <li>• Create cards from text selections</li>
              <li>• FSRS algorithm for optimal review timing</li>
              <li>• Study sessions with progress tracking</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Example Flashcard (for design reference) */}
      <Card className="p-3 opacity-50">
        <div className="space-y-2">
          <p className="text-sm font-medium">
            What is the significance of the V-2 rocket in Gravity's Rainbow?
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              <span>Chunk 42</span>
            </div>
            <Badge variant="secondary" className="h-4 text-xs">
              Due today
            </Badge>
          </div>
          <Button variant="outline" size="sm" className="w-full" disabled>
            Review Card
          </Button>
        </div>
      </Card>
    </div>
  )
}
