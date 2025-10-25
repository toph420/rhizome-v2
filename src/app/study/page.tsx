'use client'

import { useRouter } from 'next/navigation'
import { StudySession } from '@/components/flashcards/StudySession'

/**
 * Fullscreen study page - uses reusable StudySession component
 * Keyboard shortcuts: Space (reveal), 1/2/3/4 (ratings), Esc (exit)
 */
export default function StudyPage() {
  const router = useRouter()

  return (
    <StudySession
      mode="fullscreen"
      onExit={() => router.push('/flashcards')}
      onComplete={(stats) => {
        console.log('[Study] Session complete:', stats)
      }}
    />
  )
}
