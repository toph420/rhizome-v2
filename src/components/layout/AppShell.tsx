'use client'

import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { TopNav } from './TopNav'
import { Navigation } from './Navigation'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { QuickSparkCapture } from '@/components/sparks/QuickSparkCapture'
import { useAdminPanelStore } from '@/stores/admin/admin-panel'
import { useUIStore } from '@/stores/ui-store'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isOpen, toggle, close } = useAdminPanelStore()
  const { openSparkCapture } = useUIStore()

  // Global keyboard shortcut to toggle Admin Panel
  useHotkeys('mod+shift+a', (e) => {
    e.preventDefault()
    toggle()
  })

  // Global keyboard shortcut for Spark Capture
  useHotkeys('mod+k', (e) => {
    e.preventDefault()
    openSparkCapture()
  })

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      <TopNav
        onMenuClick={() => setMobileMenuOpen(true)}
        onAdminClick={toggle}
      />

      <AdminPanel
        isOpen={isOpen}
        onClose={close}
      />

      {/* Global Spark Capture - available everywhere */}
      <QuickSparkCapture />

      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
