'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ConnectionsList } from './ConnectionsList'
import { AnnotationsList } from './AnnotationsList'
import { WeightTuning } from './WeightTuning'
import { ConnectionFilters } from './ConnectionFilters'

interface RightPanelProps {
  documentId: string
}

/**
 * Fixed right panel with Connections and Annotations tabs.
 * Follows ProcessingDock.tsx collapse/expand pattern with Framer Motion animations.
 * 
 * @param props - Component props.
 * @param props.documentId - Document identifier for filtering connections and annotations.
 * @returns React element with collapsible right panel.
 */
export function RightPanel({ documentId }: RightPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'connections' | 'annotations' | 'weights'>('connections')
  
  return (
    <motion.div
      className="fixed right-0 top-0 bottom-0 border-l z-40 bg-background"
      initial={false}
      animate={{ 
        width: collapsed ? 48 : 384 // w-12 : w-96
      }}
      transition={{ 
        type: 'spring', 
        damping: 25, 
        stiffness: 300 
      }}
    >
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -left-4 top-8 z-50 rounded-full border bg-background shadow-md"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      >
        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
      
      {/* Panel content (hidden when collapsed) */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Tabs 
              value={activeTab} 
              onValueChange={(v) => setActiveTab(v as 'connections' | 'annotations' | 'weights')} 
              className="h-full flex flex-col"
            >
              <TabsList className="grid w-full grid-cols-3 m-4">
                <TabsTrigger value="connections">Connections</TabsTrigger>
                <TabsTrigger value="annotations">Annotations</TabsTrigger>
                <TabsTrigger value="weights">Weights</TabsTrigger>
              </TabsList>
              
              <TabsContent value="connections" className="flex-1 overflow-hidden m-0 flex flex-col">
                <div className="border-b">
                  <ConnectionFilters />
                </div>
                <ScrollArea className="flex-1">
                  <ConnectionsList documentId={documentId} />
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="annotations" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <AnnotationsList documentId={documentId} />
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="weights" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <WeightTuning />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}