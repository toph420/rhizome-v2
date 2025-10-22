'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MetadataTestPanel } from '@/components/experiments/MetadataTestPanel'
import { BridgeTestPanel } from '@/components/experiments/BridgeTestPanel'

export default function PromptExperimentsPage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Prompt Experiments</h1>
        <p className="text-muted-foreground">
          Test and compare different prompt versions before deploying to production
        </p>
      </div>

      <Tabs defaultValue="metadata" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="metadata">
            Metadata Extraction
          </TabsTrigger>
          <TabsTrigger value="bridge">
            Thematic Bridge
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metadata" className="mt-6">
          <MetadataTestPanel />
        </TabsContent>

        <TabsContent value="bridge" className="mt-6">
          <BridgeTestPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
