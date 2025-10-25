'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { ChunkStatsOverview } from './ChunkStatsOverview'
import { AllChunksView } from './AllChunksView'
import { ChunkQualityPanel } from './ChunkQualityPanel'
import { BarChart3, List, CheckCircle } from 'lucide-react'

interface ChunksTabProps {
  documentId: string
  onNavigateToChunk?: (chunkId: string) => void
}

/**
 * ChunksTab component with three sub-tabs:
 * - Overview: Detection stats and "Detect All" button
 * - All Chunks: Virtualized list with selection and batch detection
 * - Quality: Chunk quality monitoring and validation
 */
export function ChunksTab({ documentId, onNavigateToChunk }: ChunksTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'list' | 'quality'>('overview')

  return (
    <div className="h-full flex flex-col">
      <Tabs
        value={activeSubTab}
        onValueChange={(value) => setActiveSubTab(value as 'overview' | 'list' | 'quality')}
        className="h-full flex flex-col"
      >
        <TabsList className="grid grid-cols-3 gap-1 p-2 m-4 border-b-2 border-border flex-shrink-0">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="text-sm">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="list" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            <span className="text-sm">All Chunks</span>
          </TabsTrigger>
          <TabsTrigger value="quality" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Quality</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 overflow-auto m-0">
          <ChunkStatsOverview documentId={documentId} />
        </TabsContent>

        <TabsContent value="list" className="flex-1 overflow-hidden m-0">
          <AllChunksView documentId={documentId} />
        </TabsContent>

        <TabsContent value="quality" className="flex-1 overflow-auto m-0">
          <ChunkQualityPanel
            documentId={documentId}
            onNavigateToChunk={onNavigateToChunk}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
