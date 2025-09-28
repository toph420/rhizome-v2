'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Highlighting',
    shortcuts: [
      { keys: ['g'], description: 'Create green highlight' },
      { keys: ['y'], description: 'Create yellow highlight' },
      { keys: ['r'], description: 'Create red highlight' },
      { keys: ['b'], description: 'Create blue highlight' },
      { keys: ['p'], description: 'Create purple highlight' }
    ]
  },
  {
    title: 'Connection Validation',
    shortcuts: [
      { keys: ['v'], description: 'Validate connection (agree)' },
      { keys: ['r'], description: 'Reject connection (disagree)' },
      { keys: ['s'], description: 'Star connection (favorite)' }
    ]
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Escape'], description: 'Close panels and dialogs' },
      { keys: ['?'], description: 'Show this help panel' }
    ]
  }
]

export function KeyboardHelp() {
  const [open, setOpen] = useState(false)
  
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      if (e.key === '?') {
        e.preventDefault()
        setOpen(true)
      }
    }
    
    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [])
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Available shortcuts for the document reader
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title} className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map(key => (
                        <kbd
                          key={key}
                          className="px-2 py-1 text-xs font-mono bg-muted border border-border rounded">
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
          <p>💡 Tip: Most shortcuts work when the relevant element is active or selected.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}