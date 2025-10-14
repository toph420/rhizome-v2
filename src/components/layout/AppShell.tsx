'use client'

import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { TopNav } from './TopNav'
import { Navigation } from './Navigation'
import { AdminPanel } from '@/components/admin/AdminPanel'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)

  // Global keyboard shortcut to toggle Admin Panel
  useHotkeys('mod+shift+a', (e) => {
    e.preventDefault()
    setAdminPanelOpen((prev) => !prev)
  })

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      <TopNav
        onMenuClick={() => setMobileMenuOpen(true)}
        onAdminClick={() => setAdminPanelOpen(prev => !prev)}
      />

      <AdminPanel
        isOpen={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
      />

      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
