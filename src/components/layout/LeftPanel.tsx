'use client'

import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { MetadataTab } from './tabs/MetadataTab'
import { OutlineTab } from './tabs/OutlineTab'
import { HeatmapTab } from './tabs/HeatmapTab'
import { ThumbnailsTab } from './tabs/ThumbnailsTabWrapper'
import type { Chunk } from '@/types/annotations'

interface LeftPanelProps {
  documentId: string
  pdfMetadata?: any
  outline?: any[]  // PDF outline/TOC
  fileUrl?: string  // 🆕 ADD: For thumbnails
  numPages?: number  // 🆕 ADD: Total page count
  currentPage?: number  // 🆕 ADD: Current page for highlighting
  chunks: Chunk[]  // 🆕 ADD: For heatmap
  onPageNavigate?: (page: number) => void  // Navigation handler
}

export function LeftPanel({
  documentId,
  pdfMetadata,
  outline,
  fileUrl,
  numPages,
  currentPage,
  chunks,
  onPageNavigate
}: LeftPanelProps) {
  const isOpen = useUIStore(state => state.leftPanelOpen)
  const activeTab = useUIStore(state => state.leftPanelTab)
  const setActiveTab = useUIStore(state => state.setLeftPanelTab)

  // Type-safe handler for tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value as 'metadata' | 'outline' | 'thumbnails' | 'heatmap')
  }

  if (!isOpen) return null

  return (
    <div className="w-[300px] border-r bg-background overflow-hidden flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-sm font-semibold">Document Navigation</h2>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none p-1">
          <TabsTrigger value="metadata" className="text-xs">Metadata</TabsTrigger>
          <TabsTrigger value="outline" className="text-xs">Outline</TabsTrigger>
          <TabsTrigger value="thumbnails" className="text-xs">Pages</TabsTrigger>
          <TabsTrigger value="heatmap" className="text-xs">Heatmap</TabsTrigger>
        </TabsList>

        <TabsContent value="metadata" className="flex-1 overflow-auto">
          <MetadataTab documentId={documentId} pdfMetadata={pdfMetadata} chunks={chunks} />
        </TabsContent>

        <TabsContent value="outline" className="flex-1 overflow-auto">
          <OutlineTab outline={outline} onPageNavigate={onPageNavigate} />
        </TabsContent>

        <TabsContent value="thumbnails" className="flex-1 overflow-auto">
          {activeTab === 'thumbnails' && (
            <ThumbnailsTab
              fileUrl={fileUrl}
              numPages={numPages}
              currentPage={currentPage}
              onPageNavigate={onPageNavigate}
            />
          )}
        </TabsContent>

        <TabsContent value="heatmap" className="flex-1 overflow-auto">
          <HeatmapTab documentId={documentId} currentPage={currentPage} chunks={chunks} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
