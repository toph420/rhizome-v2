'use client'

import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { TopNav } from './TopNav'
import { Navigation } from './Navigation'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { useAdminPanelStore } from '@/stores/admin/admin-panel'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isOpen, toggle, close } = useAdminPanelStore()

  // Global keyboard shortcut to toggle Admin Panel
  useHotkeys('mod+shift+a', (e) => {
    e.preventDefault()
    toggle()
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

      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
