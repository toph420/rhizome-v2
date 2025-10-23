'use client'

import { useState } from 'react'

/**
 * RetroUI Component Showcase
 * Displays all 32 RetroUI components with interactive examples
 */
export function RetroUIShowcase() {
  const [testValue, setTestValue] = useState('')

  return (
    <div className="space-y-8">
      {/* Info Card */}
      <div className="neo-card space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold">RetroUI Components</h3>
            <p className="text-muted-foreground mt-1">
              32 retro-styled components with playful neobrutalist aesthetics
            </p>
          </div>
          <a
            href="https://www.retroui.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="neo-button text-sm"
          >
            View Docs →
          </a>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div>
            <div className="text-sm font-semibold">Total Components</div>
            <div className="text-2xl font-bold">32</div>
          </div>
          <div>
            <div className="text-sm font-semibold">Source</div>
            <div className="text-sm">retroui.dev</div>
          </div>
          <div>
            <div className="text-sm font-semibold">Style</div>
            <div className="text-sm">Retro/Neobrutalist</div>
          </div>
        </div>
      </div>

      {/* Component Categories */}
      <div className="grid gap-8">
        {/* Basic Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Basic Components</h4>
          <div className="grid grid-cols-2 gap-4">
            {[
              { name: 'Button', desc: 'Default, secondary, outline, link variants', count: 4 },
              { name: 'Badge', desc: 'Status badges with retro styling', count: 3 },
              { name: 'Avatar', desc: 'Profile images with bold borders', count: 2 },
              { name: 'Card', desc: 'Content containers with Text component', count: 2 },
            ].map((component) => (
              <div key={component.name} className="neo-card">
                <div className="flex items-start justify-between mb-2">
                  <h5 className="font-bold">{component.name}</h5>
                  <span className="text-xs neo-badge">
                    {component.count} variants
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {component.desc}
                </p>
                <div className="neo-button w-full text-center text-sm">
                  View Examples
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Form Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Form Components</h4>
          <div className="neo-card space-y-4">
            <p className="text-muted-foreground">
              Form inputs with retro neobrutalist styling
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                'Input',
                'Textarea',
                'Select',
                'Checkbox',
                'Radio',
                'Switch',
                'Slider',
                'Label',
                'Toggle',
                'Toggle Group',
              ].map((name) => (
                <div
                  key={name}
                  className="neo-border p-2 rounded text-sm font-medium text-center"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Chart Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Chart Components</h4>
          <div className="grid grid-cols-4 gap-3">
            {['Area Chart', 'Bar Chart', 'Line Chart', 'Pie Chart'].map((name) => (
              <div key={name} className="neo-card text-center">
                <div className="font-semibold text-sm">{name}</div>
              </div>
            ))}
          </div>
          <div className="neo-card">
            <p className="text-sm text-muted-foreground">
              <strong>Unique Feature:</strong> RetroUI includes chart components not found in
              Neobrutalism, making it a great choice for data visualization with retro
              aesthetics.
            </p>
          </div>
        </section>

        {/* Overlay Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Overlays & Navigation</h4>
          <div className="grid grid-cols-4 gap-3">
            {[
              'Dialog',
              'Popover',
              'Tooltip',
              'Menu',
              'Context Menu',
              'Command',
              'Accordion',
              'Tab',
            ].map((name) => (
              <div key={name} className="neo-card text-center">
                <div className="font-semibold text-sm">{name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Feedback Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Feedback & Utilities</h4>
          <div className="grid grid-cols-5 gap-3">
            {['Alert', 'Progress', 'Loader', 'Sonner', 'Table', 'Text'].map((name) => (
              <div key={name} className="neo-card text-center">
                <div className="font-semibold text-sm">{name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison with Neobrutalism */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">RetroUI vs Neobrutalism</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="neo-card space-y-2">
              <h5 className="font-bold text-primary">RetroUI Advantages</h5>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Built-in chart components (4 types)</li>
                <li>Loader component for async states</li>
                <li>Text component for typography</li>
                <li>Simpler component API</li>
                <li>More playful, retro aesthetic</li>
              </ul>
            </div>
            <div className="neo-card space-y-2">
              <h5 className="font-bold text-primary">Neobrutalism Advantages</h5>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>More components (44 vs 32)</li>
                <li>Advanced layouts (Sidebar, Carousel)</li>
                <li>More form components (Input OTP, Date Picker)</li>
                <li>Better documentation</li>
                <li>Larger community</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Next Steps</h4>
          <div className="neo-card space-y-3">
            <p className="text-muted-foreground">
              All 32 components are downloaded and ready to use. To add interactive examples:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                Import specific components from <code>@/components/libraries/retroui/</code>
              </li>
              <li>Create example instances with different props and states</li>
              <li>Add interactivity (click handlers, state management)</li>
              <li>Build side-by-side comparisons with Neobrutalism</li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  )
}
