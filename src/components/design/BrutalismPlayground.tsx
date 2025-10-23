'use client'

import { useState } from 'react'

/**
 * Brutalism Playground - Experiment with brutalist components and dual color palettes
 */
export function BrutalismPlayground() {
  const [useSemantic, setUseSemantic] = useState(false)
  const [progress, setProgress] = useState(65)

  // Brutalist styling constants - BLACK borders for true neobrutalism
  const neoBorder = '3px solid #000000'
  const neoShadow = '6px 6px 0px 0px #000000'
  const neoHoverShadow = '2px 2px 0px 0px #000000'

  // Color palette based on toggle
  const colors = useSemantic ? {
    primary: 'hsl(var(--primary))',
    secondary: 'hsl(var(--success))',
    danger: 'hsl(var(--destructive))',
    warning: 'hsl(var(--warning))',
    accent: 'hsl(var(--accent))',
  } : {
    // Authentic Neobrutalism Colors - Bold, Saturated, High-Contrast
    primary: '#2a687a',    // Ming (Teal Blue) - bold but not neon
    secondary: '#72a25e',  // Russian Green (Sage) - earthy pop
    danger: '#ff006e',     // Hot Pink - vibrant alert color
    warning: '#f9b409',    // Spanish Yellow - bright warning
    accent: '#ff6b35',     // Vibrant Orange - high energy
  }

  return (
    <div className={useSemantic ? 'palette-semantic' : ''}>
      {/* Header */}
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Brutalism Playground</h2>
            <p className="text-muted-foreground mt-2">
              Flat beauty: No gradients, no glowing effects, just geometric clarity
            </p>
          </div>

          {/* Palette Toggle */}
          <button
            onClick={() => setUseSemantic(!useSemantic)}
            style={{ border: neoBorder, boxShadow: neoShadow }}
            className="px-6 py-3 bg-background rounded-lg transition-all hover:translate-x-1 hover:translate-y-1"
          >
            <div className="text-sm font-bold">
              {useSemantic ? 'OKLCH Semantic' : 'Neobrutalism Bold'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Click to toggle palette
            </div>
          </button>
        </div>

        {/* Design Principles */}
        <div style={{ border: neoBorder, boxShadow: neoShadow }} className="bg-background p-6 rounded-lg">
          <h3 className="font-bold text-lg mb-3">Core Principles</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm font-semibold mb-1">Flat Design</div>
              <div className="text-xs text-muted-foreground">
                No gradients, no blur effects
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1">Bold Structure</div>
              <div className="text-xs text-muted-foreground">
                3px borders, 6px shadows
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1">Strategic Color</div>
              <div className="text-xs text-muted-foreground">
                Color for meaning, not decoration
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-12">
        {/* CSS Utilities Test Section */}
        <section>
          <h3 className="text-2xl font-bold mb-6">Neobrutalist CSS Utilities Test</h3>
          <div className="space-y-6">
            {/* Test neo-border */}
            <div className="neo-border p-4 bg-background rounded-lg">
              <p className="font-bold">Test 1: neo-border class</p>
              <p className="text-sm text-muted-foreground">This div has neo-border (3px solid)</p>
            </div>

            {/* Test neo-shadow */}
            <div className="neo-border neo-shadow p-4 bg-background rounded-lg">
              <p className="font-bold">Test 2: neo-border + neo-shadow</p>
              <p className="text-sm text-muted-foreground">This div has neo-border + neo-shadow (6px offset)</p>
            </div>

            {/* Test neo-hover */}
            <button className="neo-border neo-shadow neo-hover p-4 bg-background rounded-lg w-full text-left">
              <p className="font-bold">Test 3: neo-hover interactive effect</p>
              <p className="text-sm text-muted-foreground">Hover me for translation effect (moves 4px on hover)</p>
            </button>

            {/* Test neo-card utility */}
            <div className="neo-card">
              <p className="font-bold">Test 4: neo-card combined utility</p>
              <p className="text-sm text-muted-foreground">Uses neo-card class (border + shadow + radius + padding)</p>
            </div>

            {/* Test neo-button utility */}
            <button className="neo-button neo-bg-primary">
              Test 5: neo-button with colored background
            </button>

            {/* Test colored shadows */}
            <div className="grid grid-cols-2 gap-4">
              <div className="neo-border neo-shadow-primary p-4 bg-background rounded-lg">
                <p className="font-bold">Colored Shadow: Primary</p>
                <p className="text-sm text-muted-foreground">neo-shadow-primary</p>
              </div>
              <div className="neo-border neo-shadow-danger p-4 bg-background rounded-lg">
                <p className="font-bold">Colored Shadow: Danger</p>
                <p className="text-sm text-muted-foreground">neo-shadow-danger</p>
              </div>
            </div>
          </div>
        </section>

        {/* Cards Section */}
        <section>
          <h3 className="text-2xl font-bold mb-6">Cards</h3>
          <div className="grid grid-cols-3 gap-6">
            {/* Basic Card */}
            <div style={{ border: neoBorder, boxShadow: neoShadow }} className="bg-background p-6 rounded-lg">
              <h4 className="font-bold text-lg mb-2">Basic Card</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Clean, flat background with bold 3px border and 6px hard shadow
              </p>
              <div className="flex gap-2">
                <span style={{ border: neoBorder }} className="px-3 py-1 text-sm font-bold rounded-full">
                  Default
                </span>
                <span
                  style={{ border: neoBorder, backgroundColor: colors.primary, color: 'white' }}
                  className="px-3 py-1 text-sm font-bold rounded-full"
                >
                  Primary
                </span>
              </div>
            </div>

            {/* Flashcard Simulation */}
            <div
              style={{ border: neoBorder, boxShadow: neoShadow }}
              className="bg-background p-6 rounded-lg cursor-pointer transition-all hover:translate-x-1 hover:translate-y-1"
            >
              <div style={{ borderBottom: '2px solid hsl(var(--foreground))' }} className="pb-3 mb-4">
                <span
                  style={{ border: neoBorder, backgroundColor: colors.danger, color: 'white' }}
                  className="px-3 py-1 text-sm font-bold rounded-full"
                >
                  HARD
                </span>
              </div>
              <h4 className="font-bold text-lg mb-2">Flashcard Card</h4>
              <p className="text-sm text-muted-foreground">
                Hover effect with translation. Click to flip (simulated).
              </p>
            </div>

            {/* Status Card */}
            <div
              style={{ border: neoBorder, boxShadow: `6px 6px 0px 0px ${colors.primary}` }}
              className="bg-card p-6 rounded-lg"
            >
              <h4 className="font-bold text-lg mb-2">Colored Shadow</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Primary-colored shadow for strategic emphasis
              </p>
              <span
                style={{ border: neoBorder, backgroundColor: colors.primary, color: 'white' }}
                className="px-3 py-1 text-sm font-bold rounded-full"
              >
                Processing
              </span>
            </div>
          </div>
        </section>

        {/* Badges Section */}
        <section>
          <h3 className="text-2xl font-bold mb-6">Badges (Strategic Color)</h3>
          <div className="space-y-6">
            {/* Difficulty Badges */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <h4 className="font-semibold mb-4">Flashcard Difficulty</h4>
              <div className="flex gap-3">
                <span
                  style={{ border: neoBorder, backgroundColor: colors.secondary, color: 'white' }}
                  className="px-4 py-2 text-sm font-bold rounded-full"
                >
                  EASY
                </span>
                <span
                  style={{ border: neoBorder, backgroundColor: colors.warning, color: 'black' }}
                  className="px-4 py-2 text-sm font-bold rounded-full"
                >
                  MEDIUM
                </span>
                <span
                  style={{ border: neoBorder, backgroundColor: colors.danger, color: 'white' }}
                  className="px-4 py-2 text-sm font-bold rounded-full"
                >
                  HARD
                </span>
              </div>
            </div>

            {/* Status Badges */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <h4 className="font-semibold mb-4">Job Status</h4>
              <div className="flex gap-3">
                <span
                  style={{ border: neoBorder, backgroundColor: colors.primary, color: 'white' }}
                  className="px-4 py-2 text-sm font-bold rounded-full"
                >
                  PROCESSING
                </span>
                <span
                  style={{ border: neoBorder, backgroundColor: colors.secondary, color: 'white' }}
                  className="px-4 py-2 text-sm font-bold rounded-full"
                >
                  COMPLETE
                </span>
                <span
                  style={{ border: neoBorder, backgroundColor: colors.danger, color: 'white' }}
                  className="px-4 py-2 text-sm font-bold rounded-full"
                >
                  FAILED
                </span>
                <span
                  style={{ border: neoBorder, backgroundColor: colors.warning, color: 'black' }}
                  className="px-4 py-2 text-sm font-bold rounded-full"
                >
                  PAUSED
                </span>
              </div>
            </div>

            {/* Tag Pills */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <h4 className="font-semibold mb-4">Content Tags</h4>
              <div className="flex flex-wrap gap-2">
                <span
                  style={{ border: neoBorder, backgroundColor: colors.accent, color: 'black' }}
                  className="px-3 py-1 text-sm font-bold rounded-full"
                >
                  #architecture
                </span>
                <span
                  style={{ border: neoBorder, backgroundColor: colors.primary, color: 'white' }}
                  className="px-3 py-1 text-sm font-bold rounded-full"
                >
                  #performance
                </span>
                <span
                  style={{ border: neoBorder, backgroundColor: colors.secondary, color: 'white' }}
                  className="px-3 py-1 text-sm font-bold rounded-full"
                >
                  #security
                </span>
                <span
                  style={{ border: neoBorder }}
                  className="bg-muted px-3 py-1 text-sm font-bold rounded-full"
                >
                  #draft
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Progress Bars Section */}
        <section>
          <h3 className="text-2xl font-bold mb-6">Progress Indicators</h3>
          <div className="space-y-6">
            {/* Standard Progress */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">Study Session Progress</h4>
                <button
                  onClick={() => setProgress(Math.min(progress + 10, 100))}
                  style={{ border: neoBorder }}
                  className="px-3 py-1 rounded text-sm font-bold transition-all hover:translate-x-1 hover:translate-y-1"
                >
                  +10%
                </button>
              </div>
              <div style={{ border: neoBorder }} className="rounded-lg overflow-hidden bg-muted h-6">
                <div
                  style={{ backgroundColor: colors.primary, width: `${progress}%` }}
                  className="h-full transition-all duration-300"
                />
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {progress}% complete
              </div>
            </div>

            {/* Colored Progress Variants */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <h4 className="font-semibold mb-4">Progress Variants</h4>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Primary (Processing)</div>
                  <div style={{ border: neoBorder }} className="rounded-lg overflow-hidden bg-muted h-4">
                    <div style={{ backgroundColor: colors.primary, width: '75%' }} className="h-full" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Success (Complete)</div>
                  <div style={{ border: neoBorder }} className="rounded-lg overflow-hidden bg-muted h-4">
                    <div style={{ backgroundColor: colors.secondary, width: '100%' }} className="h-full" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Danger (Error)</div>
                  <div style={{ border: neoBorder }} className="rounded-lg overflow-hidden bg-muted h-4">
                    <div style={{ backgroundColor: colors.danger, width: '35%' }} className="h-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Buttons Section */}
        <section>
          <h3 className="text-2xl font-bold mb-6">Buttons</h3>
          <div className="grid grid-cols-2 gap-6">
            {/* Primary Buttons */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <h4 className="font-semibold mb-4">Primary Actions</h4>
              <div className="space-y-3">
                <button
                  style={{ border: neoBorder, boxShadow: neoShadow, backgroundColor: colors.primary, color: 'white' }}
                  className="px-6 py-3 rounded-lg font-bold w-full transition-all hover:translate-x-1 hover:translate-y-1"
                >
                  Start Study Session
                </button>
                <button
                  style={{ border: neoBorder, boxShadow: neoShadow, backgroundColor: colors.secondary, color: 'white' }}
                  className="px-6 py-3 rounded-lg font-bold w-full transition-all hover:translate-x-1 hover:translate-y-1"
                >
                  Complete
                </button>
                <button
                  style={{ border: neoBorder, boxShadow: neoShadow, backgroundColor: colors.danger, color: 'white' }}
                  className="px-6 py-3 rounded-lg font-bold w-full transition-all hover:translate-x-1 hover:translate-y-1"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Secondary Buttons */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <h4 className="font-semibold mb-4">Secondary Actions</h4>
              <div className="space-y-3">
                <button
                  style={{ border: neoBorder }}
                  className="bg-background px-6 py-3 rounded-lg font-bold w-full transition-all hover:translate-x-1 hover:translate-y-1"
                >
                  Cancel
                </button>
                <button
                  style={{ border: neoBorder }}
                  className="bg-muted px-6 py-3 rounded-lg font-bold w-full transition-all hover:translate-x-1 hover:translate-y-1"
                >
                  Settings
                </button>
                <button
                  style={{ border: neoBorder }}
                  className="bg-background px-6 py-3 rounded-lg font-bold w-full opacity-50 cursor-not-allowed"
                  disabled
                >
                  Disabled
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Flashcard Prototype */}
        <section>
          <h3 className="text-2xl font-bold mb-6">Complete Flashcard Prototype</h3>
          <div className="max-w-2xl mx-auto">
            {/* Progress Header */}
            <div style={{ border: neoBorder, boxShadow: neoShadow }} className="bg-background p-4 rounded-lg mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div style={{ border: neoBorder, backgroundColor: colors.primary }} className="px-4 py-2 rounded-lg">
                    <div className="text-2xl font-bold text-white">42</div>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    Cards studied today
                  </span>
                </div>
                <div className="text-sm font-medium">
                  15 / 30
                </div>
              </div>
              <div style={{ border: neoBorder }} className="rounded-lg overflow-hidden bg-muted h-3">
                <div style={{ backgroundColor: colors.primary, width: '50%' }} className="h-full transition-all" />
              </div>
            </div>

            {/* Flashcard */}
            <div
              style={{ border: neoBorder, boxShadow: neoShadow }}
              className="bg-background rounded-lg min-h-[400px] cursor-pointer mb-4 transition-all hover:translate-x-1 hover:translate-y-1"
            >
              <div style={{ borderBottom: '2px solid hsl(var(--foreground))' }} className="p-4">
                <span
                  style={{ border: neoBorder, backgroundColor: colors.warning, color: 'black' }}
                  className="px-3 py-1 text-sm font-bold rounded-full"
                >
                  MEDIUM
                </span>
              </div>
              <div className="p-8 flex items-center justify-center min-h-[300px]">
                <p className="text-2xl font-bold text-center">
                  What are the three engines in Rhizome V2's collision detection system?
                </p>
              </div>
            </div>

            {/* Answer Buttons */}
            <div className="grid grid-cols-3 gap-4">
              <button
                style={{ border: neoBorder, boxShadow: neoShadow, backgroundColor: colors.secondary, color: 'white' }}
                className="p-4 rounded-lg font-bold transition-all hover:translate-x-1 hover:translate-y-1"
              >
                EASY
              </button>
              <button
                style={{ border: neoBorder, boxShadow: neoShadow, backgroundColor: colors.warning, color: 'black' }}
                className="p-4 rounded-lg font-bold transition-all hover:translate-x-1 hover:translate-y-1"
              >
                MEDIUM
              </button>
              <button
                style={{ border: neoBorder, boxShadow: neoShadow, backgroundColor: colors.danger, color: 'white' }}
                className="p-4 rounded-lg font-bold transition-all hover:translate-x-1 hover:translate-y-1"
              >
                HARD
              </button>
            </div>
          </div>
        </section>

        {/* Design Specifications */}
        <section>
          <h3 className="text-2xl font-bold mb-6">Design Specifications</h3>
          <div className="grid grid-cols-2 gap-6">
            {/* Structure Specs */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <h4 className="font-bold mb-4">Brutalist Structure</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Border Width</span>
                  <code className="font-mono font-bold">3px (balanced)</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shadow Offset</span>
                  <code className="font-mono font-bold">6px (standard)</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Border Radius</span>
                  <code className="font-mono font-bold">8px (rounded-lg)</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shadow Blur</span>
                  <code className="font-mono font-bold">0px (hard shadow)</code>
                </div>
              </div>
            </div>

            {/* Color Specs */}
            <div style={{ border: neoBorder }} className="bg-background p-6 rounded-lg">
              <h4 className="font-bold mb-4">Active Color Palette</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div style={{ border: neoBorder, backgroundColor: colors.primary }} className="w-8 h-8 rounded" />
                  <div className="text-sm">
                    <div className="font-mono font-bold">--neo-primary</div>
                    <div className="text-xs text-muted-foreground">
                      {useSemantic ? 'OKLCH Semantic' : 'Bold Blue'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div style={{ border: neoBorder, backgroundColor: colors.secondary }} className="w-8 h-8 rounded" />
                  <div className="text-sm">
                    <div className="font-mono font-bold">--neo-secondary</div>
                    <div className="text-xs text-muted-foreground">
                      {useSemantic ? 'Success' : 'Bold Green'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div style={{ border: neoBorder, backgroundColor: colors.danger }} className="w-8 h-8 rounded" />
                  <div className="text-sm">
                    <div className="font-mono font-bold">--neo-danger</div>
                    <div className="text-xs text-muted-foreground">
                      {useSemantic ? 'Destructive' : 'Bold Red'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
