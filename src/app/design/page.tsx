import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TypographyShowcase } from '@/components/design/TypographyShowcase'
import { ColorPalette } from '@/components/design/ColorPalette'
import { ColorShowcase } from '@/components/design/ColorShowcase'

/**
 * Design guide page showcasing typography, colors, components, and experimental styles.
 * @returns Design guide page component.
 */
export default function DesignGuidePage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Design Guide</h1>
        <p className="text-muted-foreground text-lg">
          Explore our design system, test components, and experiment with new styles
        </p>
      </div>

      {/* Tabs Navigation */}
      <Tabs defaultValue="typography" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto">
          <TabsTrigger value="typography">Typography</TabsTrigger>
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="spacing">Spacing</TabsTrigger>
        </TabsList>

        {/* Typography Section */}
        <TabsContent value="typography" className="space-y-6">
          <TypographyShowcase />
        </TabsContent>

        {/* Colors Section */}
        <TabsContent value="colors" className="space-y-6">
          <ColorPalette />
          <ColorShowcase />
        </TabsContent>

        {/* Spacing Section */}
        <TabsContent value="spacing" className="space-y-6">
          <div className="rounded-lg border p-6">
            <h2 className="text-2xl font-semibold mb-4">Spacing System</h2>
            <p className="text-muted-foreground mb-6">
              Tailwind&apos;s default spacing scale based on rem units
            </p>

            <div className="space-y-4">
              {[0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64].map((size) => (
                <div key={size} className="flex items-center gap-4">
                  <code className="text-sm font-mono w-20">
                    {size === 0 ? 'px' : size}
                  </code>
                  <div
                    className="h-8 bg-primary"
                    style={{ width: `${size * 0.25}rem` }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {size * 0.25}rem ({size * 4}px)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
