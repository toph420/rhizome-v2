'use client'

import { useState, useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { HelpCircle } from 'lucide-react'
import { BottomPanel } from '@/components/layout/BottomPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { Button } from '@/components/rhizome/button'
import {
  ScannerTab,
  ImportTab,
  ExportTab,
  ConnectionsTab,
  IntegrationsTab,
  JobsTab,
} from './tabs'
import { EnrichmentsTab } from './tabs/EnrichmentsTab'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'
import { useAdminPanelStore } from '@/stores/admin/admin-panel'

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [helpDialogOpen, setHelpDialogOpen] = useState(false)

  // Use store for tab state and sync with store's isOpen
  const { activeTab, setActiveTab, open: storeOpen, close: storeClose } = useAdminPanelStore()

  // Sync parent isOpen prop with store
  useEffect(() => {
    if (isOpen) {
      storeOpen(activeTab)
    } else {
      storeClose()
    }
  }, [isOpen, activeTab, storeOpen, storeClose])

  // Tab switching shortcuts (only when panel open)
  useHotkeys('1', () => setActiveTab('scanner'), { enabled: isOpen })
  useHotkeys('2', () => setActiveTab('import'), { enabled: isOpen })
  useHotkeys('3', () => setActiveTab('export'), { enabled: isOpen })
  useHotkeys('4', () => setActiveTab('enrichments'), { enabled: isOpen })
  useHotkeys('5', () => setActiveTab('connections'), { enabled: isOpen })
  useHotkeys('6', () => setActiveTab('integrations'), { enabled: isOpen })
  useHotkeys('7', () => setActiveTab('jobs'), { enabled: isOpen })

  // Help dialog shortcut
  useHotkeys(
    'shift+/',
    () => {
      setHelpDialogOpen(true)
    },
    { enabled: isOpen }
  )

  // Close on Esc
  useHotkeys('esc', () => onClose(), { enabled: isOpen })

  return (
    <>
      <BottomPanel
        open={isOpen}
        onOpenChange={(open) => !open && onClose()}
        title="Admin Panel"
        description="Manage documents, storage, and integrations"
        size="lg"
      >
        <div className="flex items-center justify-end mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHelpDialogOpen(true)}
            title="Keyboard shortcuts (Shift + ?)"
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="scanner">Scanner</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="enrichments">Enrichments</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="scanner" className="mt-6">
            <ScannerTab />
          </TabsContent>

          <TabsContent value="import" className="mt-6">
            <ImportTab />
          </TabsContent>

          <TabsContent value="export" className="mt-6">
            <ExportTab />
          </TabsContent>

          <TabsContent value="enrichments" className="mt-6">
            <EnrichmentsTab />
          </TabsContent>

          <TabsContent value="connections" className="mt-6">
            <ConnectionsTab />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsTab />
          </TabsContent>

          <TabsContent value="jobs" className="mt-6">
            <JobsTab />
          </TabsContent>
        </Tabs>
      </BottomPanel>

      <KeyboardShortcutsDialog
        isOpen={helpDialogOpen}
        onClose={() => setHelpDialogOpen(false)}
      />
    </>
  )
}
