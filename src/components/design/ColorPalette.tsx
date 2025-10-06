'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface ColorToken {
  name: string
  variable: string
  description: string
}

const semanticColors: ColorToken[] = [
  { name: 'Background', variable: 'background', description: 'Default page background' },
  { name: 'Foreground', variable: 'foreground', description: 'Default text color' },
  { name: 'Card', variable: 'card', description: 'Card background' },
  { name: 'Card Foreground', variable: 'card-foreground', description: 'Card text' },
  { name: 'Popover', variable: 'popover', description: 'Popover background' },
  { name: 'Popover Foreground', variable: 'popover-foreground', description: 'Popover text' },
  { name: 'Primary', variable: 'primary', description: 'Primary brand color' },
  { name: 'Primary Foreground', variable: 'primary-foreground', description: 'Text on primary' },
  { name: 'Secondary', variable: 'secondary', description: 'Secondary elements' },
  { name: 'Secondary Foreground', variable: 'secondary-foreground', description: 'Text on secondary' },
  { name: 'Muted', variable: 'muted', description: 'Muted backgrounds' },
  { name: 'Muted Foreground', variable: 'muted-foreground', description: 'Muted text' },
  { name: 'Accent', variable: 'accent', description: 'Accent backgrounds' },
  { name: 'Accent Foreground', variable: 'accent-foreground', description: 'Text on accent' },
  { name: 'Destructive', variable: 'destructive', description: 'Destructive actions' },
  { name: 'Border', variable: 'border', description: 'Border color' },
  { name: 'Input', variable: 'input', description: 'Input border' },
  { name: 'Ring', variable: 'ring', description: 'Focus ring' },
]

const chartColors: ColorToken[] = [
  { name: 'Chart 1', variable: 'chart-1', description: 'Data visualization color 1' },
  { name: 'Chart 2', variable: 'chart-2', description: 'Data visualization color 2' },
  { name: 'Chart 3', variable: 'chart-3', description: 'Data visualization color 3' },
  { name: 'Chart 4', variable: 'chart-4', description: 'Data visualization color 4' },
  { name: 'Chart 5', variable: 'chart-5', description: 'Data visualization color 5' },
]

function ColorSwatch({ color, mode = 'light' }: { color: ColorToken; mode?: 'light' | 'dark' }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(`var(--${color.variable})`)
    setCopied(true)
    toast.success(`Copied ${color.variable}`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border transition-all hover:shadow-md">
      {/* Color Preview */}
      <div
        className="h-24 w-full transition-transform group-hover:scale-105"
        style={{ backgroundColor: `var(--${color.variable})` }}
      />

      {/* Color Info */}
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">{color.name}</h4>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={copyToClipboard}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{color.description}</p>
        <code className="text-xs font-mono block text-muted-foreground">
          --{color.variable}
        </code>
      </div>
    </div>
  )
}

export function ColorPalette() {
  return (
    <div className="space-y-6">
      {/* Introduction */}
      <Card>
        <CardHeader>
          <CardTitle>Color System</CardTitle>
          <CardDescription>
            OKLCH-based color tokens for consistent theming across light and dark modes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Our color system uses OKLCH (Oklab Lightness Chroma Hue) color space for perceptually
              uniform colors. All colors are defined as CSS custom properties and automatically adapt
              to light and dark themes.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge>Semantic Naming</Badge>
              <Badge>OKLCH Color Space</Badge>
              <Badge>Auto Dark Mode</Badge>
              <Badge>Accessible Contrasts</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Semantic Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Semantic Colors</CardTitle>
          <CardDescription>Purpose-driven color tokens for UI elements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {semanticColors.map((color) => (
              <ColorSwatch key={color.variable} color={color} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chart Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Chart Colors</CardTitle>
          <CardDescription>Data visualization color palette</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {chartColors.map((color) => (
              <ColorSwatch key={color.variable} color={color} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Color Usage Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Examples</CardTitle>
          <CardDescription>See how colors work together in practice</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Primary Action */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Primary Actions</p>
            <div className="flex gap-2 flex-wrap">
              <Button>Primary Button</Button>
              <Button variant="secondary">Secondary Button</Button>
              <Button variant="destructive">Destructive Button</Button>
              <Button variant="outline">Outline Button</Button>
            </div>
          </div>

          {/* Cards */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Cards & Surfaces</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-card text-card-foreground p-4 rounded-lg border">
                <h4 className="font-semibold mb-1">Card Surface</h4>
                <p className="text-sm text-muted-foreground">
                  Default card background with foreground text
                </p>
              </div>
              <div className="bg-muted text-muted-foreground p-4 rounded-lg">
                <h4 className="font-semibold mb-1">Muted Surface</h4>
                <p className="text-sm">Subdued background for secondary content</p>
              </div>
              <div className="bg-accent text-accent-foreground p-4 rounded-lg">
                <h4 className="font-semibold mb-1">Accent Surface</h4>
                <p className="text-sm">Highlighted background for emphasis</p>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Badges & Labels</p>
            <div className="flex gap-2 flex-wrap">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
