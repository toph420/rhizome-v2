'use client'

import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { HelpCircle } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  ScannerTab,
  ImportTab,
  ExportTab,
  ConnectionsTab,
  IntegrationsTab,
  JobsTab,
} from './tabs'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState('scanner')
  const [helpDialogOpen, setHelpDialogOpen] = useState(false)

  // Tab switching shortcuts (only when panel open)
  useHotkeys('1', () => setActiveTab('scanner'), { enabled: isOpen })
  useHotkeys('2', () => setActiveTab('import'), { enabled: isOpen })
  useHotkeys('3', () => setActiveTab('export'), { enabled: isOpen })
  useHotkeys('4', () => setActiveTab('connections'), { enabled: isOpen })
  useHotkeys('5', () => setActiveTab('integrations'), { enabled: isOpen })
  useHotkeys('6', () => setActiveTab('jobs'), { enabled: isOpen })

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
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="top" className="h-[85vh] overflow-auto">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle>Admin Panel</SheetTitle>
                <SheetDescription>
                  Manage documents, storage, and integrations
                </SheetDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setHelpDialogOpen(true)}
                title="Keyboard shortcuts (Shift + ?)"
              >
                <HelpCircle className="h-5 w-5" />
              </Button>
            </div>
          </SheetHeader>

          <div className="mt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="scanner">Scanner</TabsTrigger>
                <TabsTrigger value="import">Import</TabsTrigger>
                <TabsTrigger value="export">Export</TabsTrigger>
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
          </div>
        </SheetContent>
      </Sheet>

      <KeyboardShortcutsDialog
        isOpen={helpDialogOpen}
        onClose={() => setHelpDialogOpen(false)}
      />
    </>
  )
}
