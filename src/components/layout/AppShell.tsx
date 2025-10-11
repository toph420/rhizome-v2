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
    <div className="flex min-h-screen">
      <Navigation open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />

      <div className="flex-1 flex flex-col">
        <TopNav onMenuClick={() => setMobileMenuOpen(true)} />

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
