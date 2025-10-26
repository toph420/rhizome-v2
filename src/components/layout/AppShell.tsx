'use client'

import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { TopNav } from './TopNav'
import { Navigation } from './Navigation'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { QuickSparkCapture } from '@/components/sparks/QuickSparkCapture'
import { useAdminPanelStore } from '@/stores/admin/admin-panel'
import { useSettingsPanelStore } from '@/stores/settings-panel'
import { useUIStore } from '@/stores/ui-store'
import { NeobrutalismTheme } from '@/components/design/ThemeWrappers'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isOpen: adminIsOpen, toggle: toggleAdmin, close: closeAdmin } = useAdminPanelStore()
  const { isOpen: settingsIsOpen, toggle: toggleSettings, close: closeSettings } = useSettingsPanelStore()
  const { openSparkCapture } = useUIStore()

  // Global keyboard shortcut to toggle Admin Panel
  useHotkeys('mod+shift+a', (e) => {
    e.preventDefault()
    toggleAdmin()
  })

  // Global keyboard shortcut to toggle Settings Panel
  useHotkeys('mod+comma', (e) => {
    e.preventDefault()
    toggleSettings()
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
          onAdminClick={toggleAdmin}
          onSettingsClick={toggleSettings}
        />

        <AdminPanel
          isOpen={adminIsOpen}
          onClose={closeAdmin}
        />

        <SettingsPanel
          isOpen={settingsIsOpen}
          onClose={closeSettings}
        />

        {/* Global Spark Capture - available everywhere */}
        <QuickSparkCapture />

        <main className="flex-1">
          {children}
        </main>
      </div>
  )
}
