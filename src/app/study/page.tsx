'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/rhizome/tabs'
import { StudyManagement } from '@/components/flashcards/StudyManagement'
import { StudySession } from '@/components/flashcards/StudySession'
import { useStudyStore, type SessionContext } from '@/stores/study-store'

type StudyTab = 'management' | 'session'

/**
 * Study page with two-tab interface
 *
 * **Management Tab**: Deck browser, custom study builder, stats
 * **Session Tab**: Active study with completion screen
 */
export default function StudyPage() {
  const router = useRouter()
  const { sessionContext, setSessionContext } = useStudyStore()
  const [activeTab, setActiveTab] = useState<StudyTab>('management')

  const handleStartStudy = (context: SessionContext) => {
    setSessionContext(context)
    setActiveTab('session')
  }

  const handleSessionComplete = () => {
    setActiveTab('management')
    setSessionContext(null)
  }

  const handleExit = () => {
    if (sessionContext?.returnTo !== 'management') {
      // Navigate back to document
      const doc = sessionContext?.returnTo as { type: 'document'; id: string; title: string }
      router.push(`/read/${doc.id}`)
    } else {
      // Back to management tab
      setActiveTab('management')
      setSessionContext(null)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as StudyTab)}
        className="p-6 space-y-6 max-w-7xl mx-auto"
      >
        <TabsList className="grid w-full grid-cols-2 border-b-2 border-border">
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="session" disabled={!sessionContext}>
            Study Session
            {sessionContext && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({sessionContext.deckName || 'Custom'})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="flex-1 overflow-hidden m-0">
          <StudyManagement onStartStudy={handleStartStudy} />
        </TabsContent>

        <TabsContent value="session" className="flex-1 overflow-hidden m-0 flex flex-col">
          {sessionContext && (
            <StudySession
              deckId={sessionContext.deckId}
              documentId={sessionContext.documentId}
              chunkIds={sessionContext.filters?.chunkIds}
              tags={sessionContext.filters?.tags}
              dueOnly={sessionContext.filters?.dueOnly}
              mode="fullscreen"
              onComplete={handleSessionComplete}
              onExit={handleExit}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
