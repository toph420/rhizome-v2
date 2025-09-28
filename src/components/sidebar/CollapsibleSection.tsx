'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface CollapsibleSectionProps {
  title: string
  count: number
  color: string
  defaultOpen?: boolean
  children: React.ReactNode
}

/**
 * Collapsible section component for grouping connections by engine type.
 * Provides expand/collapse functionality with smooth animations.
 * @param props - Component props
 * @param props.title - Section title (e.g., "Semantic", "Thematic")
 * @param props.count - Number of items in section
 * @param props.color - Tailwind color class for badge
 * @param props.defaultOpen - Whether section starts expanded
 * @param props.children - Section content
 * @returns Collapsible section component
 */
export function CollapsibleSection({
  title,
  count,
  color,
  defaultOpen = true,
  children
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border rounded-lg overflow-hidden">
      <Button
        variant="ghost"
        className="w-full justify-between p-4 h-auto"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium">{title}</span>
          <Badge variant="secondary" className="ml-2">
            {count}
          </Badge>
        </div>
        <div className={`w-3 h-3 rounded-full bg-${color}`} />
      </Button>
      
      {isOpen && (
        <div className="p-2 border-t">
          {children}
        </div>
      )}
    </div>
  )
}