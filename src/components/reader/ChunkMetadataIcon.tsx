'use client'

import { motion } from 'framer-motion'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Badge } from '@/components/ui/badge'
import { Info, TrendingUp } from 'lucide-react'
import type { Chunk } from '@/types/annotations'

interface ChunkMetadataIconProps {
  chunk: Chunk
  chunkIndex: number
}

/**
 * Hoverable chunk metadata icon that appears in the left margin.
 * Shows chunk index, themes, and importance score on hover.
 *
 * @param props - Component props
 * @param props.chunk - Chunk data with metadata
 * @param props.chunkIndex - Sequential chunk index
 * @returns Hover card with chunk metadata
 */
export function ChunkMetadataIcon({ chunk, chunkIndex }: ChunkMetadataIconProps) {
  // Extract metadata (will be populated once worker adds metadata extraction)
  const metadata = {
    themes: chunk.position_context?.context_before ? ['processing...'] : [],
    importanceScore: 0.75, // Placeholder - will come from chunk metadata
    concepts: [], // Placeholder - will come from chunk metadata
    emotionalPolarity: null as 'positive' | 'negative' | 'neutral' | null // Placeholder
  }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <motion.button
          className="absolute left-0 -ml-12 top-2 w-6 h-6 rounded-full bg-muted/50 hover:bg-primary/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <Info className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </motion.button>
      </HoverCardTrigger>

      <HoverCardContent side="left" className="w-80">
        <div className="space-y-3">
          {/* Chunk Index */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-mono text-xs">
              Chunk {chunkIndex}
            </Badge>
            {metadata.importanceScore > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                <span>Importance: {Math.round(metadata.importanceScore * 100)}%</span>
              </div>
            )}
          </div>

          {/* Themes */}
          {metadata.themes.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5">Themes</p>
              <div className="flex flex-wrap gap-1">
                {metadata.themes.map((theme, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {theme}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Concepts (when available) */}
          {metadata.concepts.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5">Concepts</p>
              <div className="flex flex-wrap gap-1">
                {metadata.concepts.map((concept: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {concept}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Emotional Polarity (when available) */}
          {metadata.emotionalPolarity && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Tone:</span>
              <Badge
                variant={
                  metadata.emotionalPolarity === 'positive'
                    ? 'default'
                    : metadata.emotionalPolarity === 'negative'
                    ? 'destructive'
                    : 'secondary'
                }
                className="text-xs"
              >
                {metadata.emotionalPolarity}
              </Badge>
            </div>
          )}

          {/* Placeholder message when no metadata */}
          {metadata.themes.length === 0 && metadata.concepts.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Metadata extraction in progress...
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
