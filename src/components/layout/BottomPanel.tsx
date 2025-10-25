'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/rhizome/sheet'
import { cn } from '@/lib/utils'

interface BottomPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

/**
 * BottomPanel - Reusable Bottom Sheet Container
 *
 * Generic container for bottom-sliding panels (forms, actions, etc.)
 * Uses neobrutalist Sheet component with consistent styling.
 *
 * **Size Variants:**
 * - sm: 300px height (quick actions)
 * - md: 500px height (forms) - DEFAULT
 * - lg: 80vh height (complex content)
 *
 * **Pattern:**
 * - Parent controls open/close state
 * - Children are self-contained (no prop drilling)
 * - Auto-focus first input on open
 *
 * @example
 * <BottomPanel
 *   open={showPanel}
 *   onOpenChange={setShowPanel}
 *   title="Create New Deck"
 *   description="Organize flashcards"
 *   size="md"
 * >
 *   <CreateDeckForm onSuccess={...} onCancel={...} />
 * </BottomPanel>
 */
export function BottomPanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
}: BottomPanelProps) {
  const sizeClasses = {
    sm: 'max-h-[300px]',
    md: 'max-h-[500px]',
    lg: 'max-h-[80vh]',
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'overflow-y-auto',
          sizeClasses[size]
        )}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="px-4 pb-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
