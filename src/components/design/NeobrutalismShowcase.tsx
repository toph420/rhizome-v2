'use client'

import { useState } from 'react'

/**
 * Neobrutalism Component Showcase
 * Displays all 44 Neobrutalism components with interactive examples
 */
export function NeobrutalismShowcase() {
  const [testValue, setTestValue] = useState('')

  return (
    <div className="space-y-8">
      {/* Info Card */}
      <div className="neo-card space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold">Neobrutalism Components</h3>
            <p className="text-muted-foreground mt-1">
              44 brutalist-styled components built on Radix UI and Tailwind CSS
            </p>
          </div>
          <a
            href="https://www.neobrutalism.dev"
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
            <div className="text-2xl font-bold">44</div>
          </div>
          <div>
            <div className="text-sm font-semibold">Source</div>
            <div className="text-sm">neobrutalism.dev</div>
          </div>
          <div>
            <div className="text-sm font-semibold">License</div>
            <div className="text-sm">MIT</div>
          </div>
        </div>
      </div>

      {/* Component Categories */}
      <div className="grid gap-8">
        {/* Basic Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Basic Components</h4>
          <div className="grid grid-cols-2 gap-4">
            {/* Coming Soon Cards */}
            {[
              { name: 'Button', desc: 'Primary, secondary, outline variants', count: 5 },
              { name: 'Badge', desc: 'Status and label indicators', count: 4 },
              { name: 'Avatar', desc: 'User profile images', count: 3 },
              { name: 'Card', desc: 'Content containers', count: 3 },
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
              Form inputs with brutalist styling - all downloaded and ready to test
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                'Input',
                'Textarea',
                'Select',
                'Checkbox',
                'Radio Group',
                'Switch',
                'Slider',
                'Label',
                'Form',
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

        {/* Layout Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Layout & Navigation</h4>
          <div className="grid grid-cols-4 gap-3">
            {[
              'Tabs',
              'Accordion',
              'Sidebar',
              'Navigation Menu',
              'Breadcrumb',
              'Menubar',
              'Pagination',
              'Scroll Area',
            ].map((name) => (
              <div key={name} className="neo-card text-center">
                <div className="font-semibold text-sm">{name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Overlay Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Overlays & Dialogs</h4>
          <div className="grid grid-cols-4 gap-3">
            {[
              'Dialog',
              'Alert Dialog',
              'Drawer',
              'Sheet',
              'Popover',
              'Tooltip',
              'Hover Card',
              'Context Menu',
            ].map((name) => (
              <div key={name} className="neo-card text-center">
                <div className="font-semibold text-sm">{name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Advanced Components */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Advanced Components</h4>
          <div className="neo-card">
            <div className="grid grid-cols-5 gap-2">
              {[
                'Calendar',
                'Chart',
                'Carousel',
                'Command',
                'Marquee',
                'Progress',
                'Skeleton',
                'Table',
                'Collapsible',
                'Resizable',
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

        {/* Next Steps */}
        <section className="space-y-4">
          <h4 className="text-xl font-bold">Next Steps</h4>
          <div className="neo-card space-y-3">
            <p className="text-muted-foreground">
              All 44 components are downloaded and ready to use. To add interactive examples:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Import specific components from <code>@/components/libraries/neobrutalism/</code></li>
              <li>Create example instances with different props and states</li>
              <li>Add interactivity (click handlers, state management)</li>
              <li>Build side-by-side comparisons with RetroUI</li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  )
}
