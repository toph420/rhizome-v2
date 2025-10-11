'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, GitBranch, Sparkles } from 'lucide-react'

interface SparksTabProps {
  documentId: string
}

/**
 * Sparks tab showing captured thoughts with context.
 * PLACEHOLDER: Full implementation requires Sparks ECS component.
 *
 * @param props - Component props
 * @param props.documentId - Document ID for filtering sparks
 * @returns Sparks list placeholder
 */
export function SparksTab({ documentId }: SparksTabProps) {
  // TODO: Fetch sparks from database once ECS component is built
  // const sparks = await getSparks(documentId)

  return (
    <div className="p-4 space-y-4">
      {/* Quick Capture Button */}
      <Button variant="outline" className="w-full justify-start gap-2" disabled>
        <Zap className="h-4 w-4" />
        <span>Capture a spark... (⌘K)</span>
      </Button>

      {/* Placeholder Message */}
      <Card className="p-6 border-dashed">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/20">
              <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Sparks Coming Soon</h3>
            <p className="text-sm text-muted-foreground">
              Quick capture thoughts with automatic context preservation
            </p>
          </div>
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              Features in development:
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1">
              <li>• Auto-capture reading position & connections</li>
              <li>• Thread suggestions from related sparks</li>
              <li>• Jump back to exact context</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Example Spark (for design reference) */}
      <Card className="p-3 opacity-50">
        <div className="space-y-2">
          <p className="text-sm">
            The intersection of paranoia and technology feels incredibly relevant to modern
            surveillance capitalism
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>2 hours ago</span>
            <Badge variant="secondary" className="h-4 text-xs">
              paranoia
            </Badge>
            <Badge variant="secondary" className="h-4 text-xs">
              technology
            </Badge>
          </div>
          <Button variant="outline" size="sm" className="w-full" disabled>
            <GitBranch className="h-3 w-3 mr-1" />
            Start Thread
          </Button>
        </div>
      </Card>
    </div>
  )
}
