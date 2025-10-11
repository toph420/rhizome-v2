'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'

export function TypographyShowcase() {
  const [scale, setScale] = useState([100])

  const fontSizes = {
    h1: { default: '2.25rem', lineHeight: '2.5rem' },
    h2: { default: '1.875rem', lineHeight: '2.25rem' },
    h3: { default: '1.5rem', lineHeight: '2rem' },
    h4: { default: '1.25rem', lineHeight: '1.75rem' },
    h5: { default: '1.125rem', lineHeight: '1.75rem' },
    h6: { default: '1rem', lineHeight: '1.5rem' },
    body: { default: '1rem', lineHeight: '1.5rem' },
    small: { default: '0.875rem', lineHeight: '1.25rem' },
    xs: { default: '0.75rem', lineHeight: '1rem' },
  }

  const scaleValue = scale[0] / 100

  return (
    <div className="space-y-6">
      {/* Font Families */}
      <Card>
        <CardHeader>
          <CardTitle>Font Families</CardTitle>
          <CardDescription>Geist Sans and Geist Mono from Vercel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Geist Sans (Primary)</p>
            <div className="font-sans space-y-2">
              <p className="text-3xl font-light">The quick brown fox jumps over the lazy dog</p>
              <p className="text-3xl font-normal">The quick brown fox jumps over the lazy dog</p>
              <p className="text-3xl font-medium">The quick brown fox jumps over the lazy dog</p>
              <p className="text-3xl font-semibold">The quick brown fox jumps over the lazy dog</p>
              <p className="text-3xl font-bold">The quick brown fox jumps over the lazy dog</p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Geist Mono (Code)</p>
            <div className="font-mono space-y-2">
              <p className="text-2xl font-normal">The quick brown fox jumps over the lazy dog</p>
              <p className="text-2xl font-medium">The quick brown fox jumps over the lazy dog</p>
              <p className="text-2xl font-semibold">The quick brown fox jumps over the lazy dog</p>
              <p className="text-2xl font-bold">The quick brown fox jumps over the lazy dog</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Typography Scale */}
      <Card>
        <CardHeader>
          <CardTitle>Typography Scale</CardTitle>
          <CardDescription>
            Interactive font size preview - adjust the scale below
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Scale Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Scale Factor</label>
              <span className="text-sm text-muted-foreground">{scale[0]}%</span>
            </div>
            <Slider
              value={scale}
              onValueChange={setScale}
              min={50}
              max={150}
              step={10}
              className="w-full"
            />
          </div>

          <Separator />

          {/* Typography Examples */}
          <div className="space-y-6">
            {Object.entries(fontSizes).map(([key, { default: size, lineHeight }]) => (
              <div key={key} className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <code className="text-xs font-mono text-muted-foreground">
                    {key}
                  </code>
                  <span className="text-xs text-muted-foreground">
                    {size} / {lineHeight}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: `calc(${size} * ${scaleValue})`,
                    lineHeight: `calc(${lineHeight} * ${scaleValue})`,
                  }}
                  className={key.startsWith('h') ? 'font-bold' : 'font-normal'}
                >
                  {key === 'body' ? 'Body text for paragraphs and general content' :
                   key === 'small' ? 'Small text for captions and metadata' :
                   key === 'xs' ? 'Extra small text for labels and minor details' :
                   `${key.toUpperCase()} - Typography Hierarchy`}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Real-world Example */}
      <Card>
        <CardHeader>
          <CardTitle>Real-world Example</CardTitle>
          <CardDescription>How typography works together in practice</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <article className="prose prose-neutral dark:prose-invert max-w-none">
            <h1>The Power of Good Typography</h1>
            <p className="lead text-lg text-muted-foreground">
              Typography is the art and technique of arranging type to make written language legible, readable, and appealing.
            </p>

            <h2>Hierarchy and Structure</h2>
            <p>
              Good typography creates a clear visual hierarchy that guides readers through content.
              It establishes relationships between different elements and helps communicate importance.
            </p>

            <h3>Font Selection</h3>
            <p>
              The choice of typeface significantly impacts readability and tone. Geist Sans provides
              excellent readability for body text, while Geist Mono is perfect for code snippets:
            </p>

            <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
              <code className="font-mono text-sm">
{`function greet(name: string) {
  return \`Hello, \${name}!\`;
}`}
              </code>
            </pre>

            <h4>Spacing and Rhythm</h4>
            <p>
              Line height, letter spacing, and margins all contribute to the readability and aesthetic
              appeal of text. Proper spacing creates breathing room and improves comprehension.
            </p>
          </article>
        </CardContent>
      </Card>
    </div>
  )
}
