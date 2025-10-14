'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface KeyboardShortcutsDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface Shortcut {
  keys: string[]
  description: string
  category: 'panel' | 'navigation'
}

const shortcuts: Shortcut[] = [
  // Panel controls
  {
    keys: ['Cmd', 'Shift', 'A'],
    description: 'Toggle Admin Panel (Ctrl on Windows)',
    category: 'panel',
  },
  {
    keys: ['Esc'],
    description: 'Close Admin Panel',
    category: 'panel',
  },
  {
    keys: ['?'],
    description: 'Show keyboard shortcuts help',
    category: 'panel',
  },
  // Tab navigation
  {
    keys: ['1'],
    description: 'Switch to Scanner tab',
    category: 'navigation',
  },
  {
    keys: ['2'],
    description: 'Switch to Import tab',
    category: 'navigation',
  },
  {
    keys: ['3'],
    description: 'Switch to Export tab',
    category: 'navigation',
  },
  {
    keys: ['4'],
    description: 'Switch to Connections tab',
    category: 'navigation',
  },
  {
    keys: ['5'],
    description: 'Switch to Integrations tab',
    category: 'navigation',
  },
  {
    keys: ['6'],
    description: 'Switch to Jobs tab',
    category: 'navigation',
  },
]

export function KeyboardShortcutsDialog({
  isOpen,
  onClose,
}: KeyboardShortcutsDialogProps) {
  const panelShortcuts = shortcuts.filter((s) => s.category === 'panel')
  const navigationShortcuts = shortcuts.filter((s) => s.category === 'navigation')

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate the Admin Panel efficiently
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Panel Controls Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Panel Controls</h3>
            <div className="space-y-2">
              {panelShortcuts.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <span className="text-sm text-muted-foreground">
                    {shortcut.description}
                  </span>
                  <div className="flex gap-1">
                    {shortcut.keys.map((key, keyIndex) => (
                      <kbd
                        key={keyIndex}
                        className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tab Navigation Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3">
              Tab Navigation (when panel open)
            </h3>
            <div className="space-y-2">
              {navigationShortcuts.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <span className="text-sm text-muted-foreground">
                    {shortcut.description}
                  </span>
                  <div className="flex gap-1">
                    {shortcut.keys.map((key, keyIndex) => (
                      <kbd
                        key={keyIndex}
                        className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform Note */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> On Windows and Linux, use <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-gray-100 border border-gray-200 rounded dark:bg-gray-600 dark:border-gray-500">Ctrl</kbd> instead of <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-gray-100 border border-gray-200 rounded dark:bg-gray-600 dark:border-gray-500">Cmd</kbd>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
