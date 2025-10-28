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
  const documentHeaderHeight = useUIStore(state => state.documentHeaderHeight)

  // Dynamic positioning: TopNav (57px) + DocumentHeader (measured by ResizeObserver)
  const navHeight = 57 // h-14 (56px) + border-b (1px)
  const topOffset = navHeight + documentHeaderHeight

  return (
    <motion.div
      className="fixed left-0 bottom-0 border-r-2 border-border z-30 bg-secondary-background flex flex-col"
      style={{ top: `${topOffset}px` }}
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
          {/* Expand button as first icon */}
          <motion.button
            className="sidebar-icon-btn"
            onClick={() => setCollapsed(false)}
            title="Expand panel"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronRight className="h-5 w-5" />
          </motion.button>

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
                      "sidebar-icon-btn",
                      activeTab === id && "active"
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
          transition={{ delay: 0.3, duration: 0.2 }}
        >
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)} className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-4 gap-1 p-2 m-4 border-b-2 border-border flex-shrink-0">
              {tabs.map(({ id, icon: Icon }) => (
                <TabsTrigger key={id} value={id} className="flex items-center justify-center">
                  <Icon className="h-4 w-4" />
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

      {/* COLLAPSE BUTTON: Positioned outside expanded panel */}
      {!collapsed && (
        <motion.button
          className={cn(
            "absolute -right-6 top-4 p-1.5 rounded-base border-2 border-border bg-secondary-background",
            "hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none",
            "transition-all shadow-base z-50"
          )}
          onClick={() => setCollapsed(true)}
          title="Collapse panel"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronLeft className="h-3 w-3" />
        </motion.button>
      )}
    </motion.div>
  )
}
