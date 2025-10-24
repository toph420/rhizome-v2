'use client'

import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Link as LinkIcon, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface SparkCardProps {
  spark: {
    entity_id: string
    content: string
    tags: string[]
    created_at: string
    selections?: Array<{
      text: string
      chunkId: string
    }>
    connections?: string[]
  }
  onJump?: () => void
}

/**
 * Feature-rich SparkCard with:
 * - Zap icon indicator
 * - Selection badges with link icon
 * - Tag badges in footer
 * - Connection count badge
 * - Relative timestamp
 * - Click to jump to spark origin
 * - Neobrutalist theming
 */
export function SparkCard({ spark, onJump }: SparkCardProps) {
  const selectionCount = spark.selections?.length || 0
  const connectionCount = spark.connections?.length || 0

  return (
    <Card className="hover:bg-muted/50 transition-all cursor-pointer" onClick={onJump}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <Zap className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm flex-1">{spark.content}</p>
        </div>
      </CardHeader>

      {selectionCount > 0 && (
        <CardContent className="pb-2">
          <div className="flex flex-wrap gap-1">
            {spark.selections?.map((selection, idx) => (
              <Badge
                key={idx}
                variant="neutral"
                className="text-xs max-w-[150px] truncate"
              >
                <LinkIcon className="h-3 w-3 mr-1" />
                {selection.text.substring(0, 20)}...
              </Badge>
            ))}
          </div>
        </CardContent>
      )}

      <CardFooter className="pt-2">
        <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
          <span>
            {formatDistanceToNow(new Date(spark.created_at), {
              addSuffix: true,
            })}
          </span>
          <div className="flex items-center gap-2">
            {spark.tags.map((tag) => (
              <Badge key={tag} variant="neutral" className="h-4 text-xs">
                #{tag}
              </Badge>
            ))}
            {connectionCount > 0 && (
              <Badge variant="default" className="h-4 text-xs">
                {connectionCount} links
              </Badge>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
