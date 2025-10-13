'use client'

import { useState } from 'react'
import { TopNav } from './TopNav'
import { Navigation } from './Navigation'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      <TopNav onMenuClick={() => setMobileMenuOpen(true)} />

      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
