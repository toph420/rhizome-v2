'use client'

import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Pencil, Trash, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface AnnotationCardProps {
  annotation: {
    entity_id: string
    text: string
    note?: string
    color: string
    tags: string[]
    created_at: string
    chunk_ids: string[]
  }
  onEdit?: () => void
  onDelete?: () => void
  onJump?: () => void
}

/**
 * Feature-rich AnnotationCard with:
 * - Colored left border based on highlight color
 * - Hover-revealed edit/delete buttons
 * - Tag badges in footer
 * - Relative timestamp
 * - Line clamp for text and note
 * - Click to jump to annotation
 * - Neobrutalist theming
 */
export function AnnotationCard({
  annotation,
  onEdit,
  onDelete,
  onJump,
}: AnnotationCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Color mapping for left border
  const colorClasses: Record<string, string> = {
    yellow: 'border-l-yellow-400',
    green: 'border-l-green-400',
    blue: 'border-l-blue-400',
    purple: 'border-l-purple-400',
    pink: 'border-l-pink-400',
  }

  return (
    <Card
      className={cn(
        'cursor-pointer hover:bg-muted/50 transition-all border-l-4',
        colorClasses[annotation.color] || 'border-l-border'
      )}
      onClick={onJump}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium line-clamp-2">
              {annotation.text}
            </p>
          </div>
          {isHovered && (
            <div className="flex gap-1">
              <Button
                variant="noShadow"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit?.()
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="noShadow"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.()
                }}
              >
                <Trash className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {annotation.note && (
        <CardContent className="pb-2">
          <p className="text-xs text-muted-foreground line-clamp-2">
            {annotation.note}
          </p>
        </CardContent>
      )}

      <CardFooter className="pt-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground w-full">
          <span>
            {formatDistanceToNow(new Date(annotation.created_at), {
              addSuffix: true,
            })}
          </span>
          {annotation.tags.map((tag) => (
            <Badge key={tag} variant="neutral" className="h-4 text-xs">
              #{tag}
            </Badge>
          ))}
        </div>
      </CardFooter>
    </Card>
  )
}
