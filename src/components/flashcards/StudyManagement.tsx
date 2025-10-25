'use client'

import { ScrollArea } from '@/components/rhizome/scroll-area'
import { StudyStats } from './StudyStats'
import { DeckGrid } from './DeckGrid'
import { CustomStudyBuilder } from './CustomStudyBuilder'
import type { SessionContext } from '@/stores/study-store'

interface StudyManagementProps {
  onStartStudy: (context: SessionContext) => void
}

/**
 * Study Management Tab
 *
 * Container for deck browser, custom study, and global stats.
 * Provides deck selection and custom filter UI before starting sessions.
 */
export function StudyManagement({ onStartStudy }: StudyManagementProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Global Stats */}
        <StudyStats
          scope="global"
          mode="expanded"
          showRetention
          showStreak
          showUpcoming
        />

        {/* Deck Browser */}
        <div>
          <h2 className="text-xl font-bold mb-4">My Decks</h2>
          <DeckGrid
            onStudyDeck={(deckId, deckName, dueOnly) =>
              onStartStudy({
                deckId,
                deckName,
                filters: { dueOnly },
                returnTo: 'management',
              })
            }
          />
        </div>

        {/* Custom Study Builder */}
        <div>
          <h2 className="text-xl font-bold mb-4">Custom Study</h2>
          <CustomStudyBuilder
            onStartSession={(filters) =>
              onStartStudy({
                filters,
                returnTo: 'management',
              })
            }
          />
        </div>
      </div>
    </ScrollArea>
  )
}
