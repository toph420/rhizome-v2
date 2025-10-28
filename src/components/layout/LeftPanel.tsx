'use client'

import { motion } from 'framer-motion'
import { Info, List, Images, Activity, ChevronRight, ChevronLeft } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/rhizome/tooltip'
import { MetadataTab } from './tabs/MetadataTab'
import { OutlineTab } from './tabs/OutlineTab'
import { HeatmapTab } from './tabs/HeatmapTab'
import { ThumbnailsTab } from './tabs/ThumbnailsTabWrapper'
import { cn } from '@/lib/utils'
import type { Chunk } from '@/types/annotations'

interface LeftPanelProps {
  documentId: string
  pdfMetadata?: any
  outline?: any[]
  fileUrl?: string
  numPages?: number
  currentPage?: number
  chunks: Chunk[]
  onPageNavigate?: (page: number) => void
}

type TabId = 'metadata' | 'outline' | 'thumbnails' | 'heatmap'

const tabs: { id: TabId; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'metadata', icon: Info, label: 'Metadata' },
  { id: 'outline', icon: List, label: 'Outline' },
  { id: 'thumbnails', icon: Images, label: 'Pages' },
  { id: 'heatmap', icon: Activity, label: 'Heatmap' },
]

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
  const collapsed = useUIStore(state => state.leftPanelCollapsed)
  const setCollapsed = useUIStore(state => state.setLeftPanelCollapsed)
  const activeTab = useUIStore(state => state.leftPanelTab)
  const setActiveTab = useUIStore(state => state.setLeftPanelTab)

  return (
    <motion.div
      className="relative border-r-2 border-border bg-background overflow-hidden flex flex-col shadow-base"
      initial={false}
      animate={{
        width: collapsed ? 48 : 300 // w-12 : w-[300px]
      }}
      transition={{
        type: 'spring',
        damping: 25,
        stiffness: 300
      }}
    >
      {/* COLLAPSED: Vertical icon stack */}
      {collapsed && (
        <motion.div
          className="flex flex-col gap-2 p-2 h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <TooltipProvider>
            {tabs.map(({ id, icon: Icon, label }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setActiveTab(id)
                      setCollapsed(false) // Expand when clicking icon
                    }}
                    className={cn(
                      "h-10 w-10 border-2 border-border rounded-base shadow-base",
                      "hover:translate-x-1 hover:translate-y-1 hover:shadow-none",
                      "transition-all flex items-center justify-center",
                      activeTab === id && "bg-main text-main-foreground shadow-none translate-x-1 translate-y-1"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </motion.div>
      )}

      {/* EXPANDED: Full tabs */}
      {!collapsed && (
        <motion.div
          className="flex flex-col h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)} className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-4 w-full border-b rounded-none">
              {tabs.map(({ id, icon: Icon }) => (
                <TabsTrigger key={id} value={id} className="flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </TabsTrigger>
              ))}
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
        </motion.div>
      )}

      {/* COLLAPSE BUTTON: Positioned outside panel */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "absolute -right-6 top-20 h-12 w-6",
          "border-2 border-border rounded-base shadow-base bg-background",
          "hover:translate-x-1 hover:translate-y-1 hover:shadow-none",
          "transition-all z-50 flex items-center justify-center"
        )}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </motion.button>
    </motion.div>
  )
}
