'use client'

import { useState } from 'react'
import { Button as NeoButton } from '@/components/libraries/neobrutalism/button'
import { Button as RetroButton } from '@/components/libraries/retroui/Button'
import { Badge as NeoBadge } from '@/components/libraries/neobrutalism/badge'
import { Badge as RetroBadge } from '@/components/libraries/retroui/Badge'
import { Alert as NeoAlert } from '@/components/libraries/neobrutalism/alert'
import { Alert as RetroAlert } from '@/components/libraries/retroui/Alert'
import { Input as NeoInput } from '@/components/libraries/neobrutalism/input'
import { Input as RetroInput } from '@/components/libraries/retroui/Input'
import { Checkbox as NeoCheckbox } from '@/components/libraries/neobrutalism/checkbox'
import { Checkbox as RetroCheckbox } from '@/components/libraries/retroui/Checkbox'
import { NeobrutalismTheme, RetroUITheme } from './ThemeWrappers'

/**
 * Component Comparison - Side-by-side comparison of Neobrutalism vs RetroUI
 */
export function ComponentComparison() {
  const [clickCount, setClickCount] = useState({ neo: 0, retro: 0 })
  const [checked, setChecked] = useState({ neo: false, retro: false })
  const [inputValue, setInputValue] = useState({ neo: '', retro: '' })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="neo-card">
        <h3 className="text-2xl font-bold mb-2">Side-by-Side Component Comparison</h3>
        <p className="text-muted-foreground">
          Compare the same components from Neobrutalism and RetroUI to see styling differences
          and choose your preferred library
        </p>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Headers */}
        <NeobrutalismTheme>
          <div className="neo-card bg-primary/10">
            <h4 className="text-xl font-bold">Neobrutalism</h4>
            <p className="text-sm text-muted-foreground mt-1">44 components</p>
          </div>
        </NeobrutalismTheme>
        <RetroUITheme>
          <div className="neo-card bg-secondary/10">
            <h4 className="text-xl font-bold">RetroUI</h4>
            <p className="text-sm text-muted-foreground mt-1">32 components</p>
          </div>
        </RetroUITheme>

        {/* Button Comparison */}
        <NeobrutalismTheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Button</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Interactive button component with variants
              </p>
            </div>

            <div className="space-y-3">
              <NeoButton onClick={() => setClickCount({ ...clickCount, neo: clickCount.neo + 1 })}>
                Click me ({clickCount.neo})
              </NeoButton>
              <NeoButton variant="neutral">Neutral</NeoButton>
              <NeoButton variant="reverse">Reverse</NeoButton>
              <NeoButton size="sm">Small</NeoButton>
            </div>
          </div>
        </NeobrutalismTheme>

        <RetroUITheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Button</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Interactive button component with variants
              </p>
            </div>

            <div className="space-y-3">
              <RetroButton
                onClick={() => setClickCount({ ...clickCount, retro: clickCount.retro + 1 })}
              >
                Click me ({clickCount.retro})
              </RetroButton>
              <RetroButton variant="secondary">Secondary</RetroButton>
              <RetroButton variant="outline">Outline</RetroButton>
              <RetroButton size="sm">Small</RetroButton>
            </div>
          </div>
        </RetroUITheme>

        {/* Badge Comparison */}
        <NeobrutalismTheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Badge</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Small status indicators and labels
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <NeoBadge>Default</NeoBadge>
              <NeoBadge variant="secondary">Secondary</NeoBadge>
              <NeoBadge variant="destructive">Destructive</NeoBadge>
              <NeoBadge variant="outline">Outline</NeoBadge>
            </div>
          </div>
        </NeobrutalismTheme>

        <RetroUITheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Badge</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Small status indicators and labels
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <RetroBadge>Default</RetroBadge>
              <RetroBadge variant="secondary">Secondary</RetroBadge>
              <RetroBadge variant="outline">Outline</RetroBadge>
              <RetroBadge variant="solid">Solid</RetroBadge>
            </div>
          </div>
        </RetroUITheme>

        {/* Input Comparison */}
        <NeobrutalismTheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Input</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Text input with brutalist styling
              </p>
            </div>

            <div className="space-y-2">
              <NeoInput
                placeholder="Enter text..."
                value={inputValue.neo}
                onChange={(e) => setInputValue({ ...inputValue, neo: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {inputValue.neo.length > 0 ? `You typed: ${inputValue.neo}` : 'Type something...'}
              </p>
            </div>
          </div>
        </NeobrutalismTheme>

        <RetroUITheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Input</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Text input with retro styling
              </p>
            </div>

            <div className="space-y-2">
              <RetroInput
                placeholder="Enter text..."
                value={inputValue.retro}
                onChange={(e) => setInputValue({ ...inputValue, retro: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {inputValue.retro.length > 0
                  ? `You typed: ${inputValue.retro}`
                  : 'Type something...'}
              </p>
            </div>
          </div>
        </RetroUITheme>

        {/* Checkbox Comparison */}
        <NeobrutalismTheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Checkbox</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Interactive checkbox component
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <NeoCheckbox
                id="neo-check"
                checked={checked.neo}
                onCheckedChange={(val) => setChecked({ ...checked, neo: !!val })}
              />
              <label htmlFor="neo-check" className="text-sm font-medium cursor-pointer">
                {checked.neo ? 'Checked!' : 'Check me'}
              </label>
            </div>
          </div>
        </NeobrutalismTheme>

        <RetroUITheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Checkbox</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Interactive checkbox component
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <RetroCheckbox
                id="retro-check"
                checked={checked.retro}
                onCheckedChange={(val) => setChecked({ ...checked, retro: !!val })}
              />
              <label htmlFor="retro-check" className="text-sm font-medium cursor-pointer">
                {checked.retro ? 'Checked!' : 'Check me'}
              </label>
            </div>
          </div>
        </RetroUITheme>

        {/* Alert Comparison */}
        <NeobrutalismTheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Alert</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Notification and message displays
              </p>
            </div>

            <div className="space-y-3">
              <NeoAlert>
                <div className="font-bold">Default Alert</div>
                <div className="text-sm">This is a default alert message</div>
              </NeoAlert>
            </div>
          </div>
        </NeobrutalismTheme>

        <RetroUITheme>
          <div className="neo-card space-y-4">
            <div>
              <h5 className="font-bold mb-2">Alert</h5>
              <p className="text-xs text-muted-foreground mb-4">
                Notification and message displays
              </p>
            </div>

            <div className="space-y-3">
              <RetroAlert variant="default">
                <div className="font-bold">Default Alert</div>
                <div className="text-sm">This is a default alert message</div>
              </RetroAlert>
              <RetroAlert status="error">
                <div className="font-bold">Error Alert</div>
                <div className="text-sm">Something went wrong!</div>
              </RetroAlert>
            </div>
          </div>
        </RetroUITheme>
      </div>

      {/* Summary */}
      <div className="neo-card space-y-4">
        <h4 className="text-xl font-bold">Quick Comparison Summary</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <h5 className="font-semibold mb-2">Neobrutalism Style</h5>
            <ul className="space-y-1 list-disc list-inside text-muted-foreground">
              <li>Thicker borders (3-4px)</li>
              <li>Hard shadows with larger offset</li>
              <li>More pronounced brutalist aesthetic</li>
              <li>Wider component spacing</li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold mb-2">RetroUI Style</h5>
            <ul className="space-y-1 list-disc list-inside text-muted-foreground">
              <li>Medium borders (2-3px)</li>
              <li>Softer shadow styling</li>
              <li>Playful retro aesthetic</li>
              <li>Compact component sizing</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="neo-card">
        <h4 className="text-xl font-bold mb-3">Try It Yourself</h4>
        <p className="text-sm text-muted-foreground mb-4">
          All components are downloaded and ready to use in your project:
        </p>
        <div className="space-y-2">
          <div className="neo-border p-3 rounded font-mono text-xs bg-muted">
            <div>// Neobrutalism</div>
            <div>import {`{ Button }`} from '@/components/libraries/neobrutalism/button'</div>
          </div>
          <div className="neo-border p-3 rounded font-mono text-xs bg-muted">
            <div>// RetroUI</div>
            <div>import {`{ Button }`} from '@/components/libraries/retroui/Button'</div>
          </div>
        </div>
      </div>
    </div>
  )
}
