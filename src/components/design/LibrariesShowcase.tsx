'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NeobrutalismShowcase } from './NeobrutalismShowcase'
import { RetroUIShowcase } from './RetroUIShowcase'
import { ComponentComparison } from './ComponentComparison'

/**
 * Libraries Showcase - Compare and test components from different libraries
 */
export function LibrariesShowcase() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold">Component Libraries</h2>
        <p className="text-muted-foreground mt-2">
          Explore components from Neobrutalism and RetroUI libraries for comparison and testing
        </p>
      </div>

      {/* Library Selection Tabs */}
      <Tabs defaultValue="comparison" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto">
          <TabsTrigger value="comparison">
            Side-by-Side Comparison
          </TabsTrigger>
          <TabsTrigger value="neobrutalism">
            Neobrutalism (44)
          </TabsTrigger>
          <TabsTrigger value="retroui">
            RetroUI (32)
          </TabsTrigger>
        </TabsList>

        {/* Component Comparison */}
        <TabsContent value="comparison" className="space-y-6">
          <ComponentComparison />
        </TabsContent>

        {/* Neobrutalism Library */}
        <TabsContent value="neobrutalism" className="space-y-6">
          <NeobrutalismShowcase />
        </TabsContent>

        {/* RetroUI Library */}
        <TabsContent value="retroui" className="space-y-6">
          <RetroUIShowcase />
        </TabsContent>
      </Tabs>
    </div>
  )
}
