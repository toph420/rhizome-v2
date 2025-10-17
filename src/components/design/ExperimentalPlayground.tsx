'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { TexturedCard, PlanetCardGrid } from './TexturedCard'
import { StatusBadgeShowcase } from './StatusBadge'
import { ProfileCard } from './ProfileCard'
import { ProductCardGrid } from './ProductCard'
import { IllustratedMenuTrigger } from './IllustratedMenu'
import { TestimonialCard, TestimonialGrid } from './TestimonialCard'
import {
  TacticalPanel,
  AgentProfile,
  RiskIndicator,
  OperationsList,
  TacticalMap,
  DataVisualization,
} from './TacticalComponents'
import {
  TradingPair,
  FeedbackPanel,
  BrutalistFormDemo,
  CryptoTable,
} from './BrutalistComponents'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { Palette, Sparkles, Wand2, Terminal, Square, Navigation, Layers } from 'lucide-react'
import { EdgeNavigationDemo } from './EdgeNavigationDemo'
import { PremiumEdgeNavigation } from './PremiumEdgeNavigation'

export function ExperimentalPlayground() {
  const [cardVariant, setCardVariant] = useState<'earth' | 'mars' | 'neutral'>('earth')
  const [showPlanet, setShowPlanet] = useState(true)
  const [animationSpeed, setAnimationSpeed] = useState([50])

  const sampleCards = [
    {
      id: '1',
      title: 'EARTH',
      description: 'Rocky, water-covered, life-sustaining.',
      badge: '#3',
      variant: 'earth' as const,
    },
    {
      id: '2',
      title: 'MARS',
      description: 'Red, rocky, cold, desert, thin-atmosphere.',
      badge: '#4',
      variant: 'mars' as const,
    },
    {
      id: '3',
      title: 'NEUTRAL',
      description: 'Clean, modern, minimal design aesthetic.',
      badge: '#5',
      variant: 'neutral' as const,
    },
  ]

  return (
    <div className="space-y-8">
      {/* Introduction */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Experimental Playground</CardTitle>
          </div>
          <CardDescription>
            Test and explore new design styles inspired by retro-futuristic aesthetics.
            This playground lets you experiment with textured cards, bold typography, and unique visual treatments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              <Palette className="h-3 w-3 mr-1" />
              Live Preview
            </Badge>
            <Badge variant="secondary">
              <Wand2 className="h-3 w-3 mr-1" />
              Interactive Controls
            </Badge>
            <Badge variant="outline">Framer Motion</Badge>
            <Badge variant="outline">CSS Textures</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Premium Edge Navigation - NEW! */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <CardTitle>Premium Edge Navigation ✨ (Product Card Aesthetics)</CardTitle>
          </div>
          <CardDescription>
            Beautiful edge-based navigation with glassmorphic panels, smooth animations, and product card elegance.
            Features Anti-Oedipus document with real highlights, floating annotation capture, and AI-discovered connections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-6">
            <Badge variant="secondary">
              <Sparkles className="h-3 w-3 mr-1" />
              Glassmorphism
            </Badge>
            <Badge variant="secondary">Product Card Style</Badge>
            <Badge variant="secondary">Backdrop Blur</Badge>
            <Badge variant="outline">Smooth Animations</Badge>
            <Badge variant="outline">Gradient Accents</Badge>
            <Badge variant="outline">Floating Panels</Badge>
            <Badge variant="outline">Document Highlights</Badge>
            <Badge variant="outline">Quick Capture</Badge>
          </div>

          <PremiumEdgeNavigation />

          <div className="mt-6 p-4 bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200">
            <h4 className="font-semibold mb-3 text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              Premium Design Features
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div className="space-y-2">
                <h5 className="font-semibold text-slate-900 text-xs uppercase tracking-wide">Navigation</h5>
                <ul className="space-y-1">
                  <li>• <strong>Glassmorphic Edge Panels:</strong> Backdrop blur with smooth slide animations</li>
                  <li>• <strong>Ambient Background:</strong> Animated gradient orbs for depth</li>
                  <li>• <strong>Table of Contents:</strong> Progress tracking with gradient bars</li>
                  <li>• <strong>View Mode Switcher:</strong> Explore, Focus, Study modes</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h5 className="font-semibold text-slate-900 text-xs uppercase tracking-wide">Content</h5>
                <ul className="space-y-1">
                  <li>• <strong>Real Document:</strong> Anti-Oedipus with authentic text</li>
                  <li>• <strong>Multi-Color Highlights:</strong> Yellow, pink, blue, green indicators</li>
                  <li>• <strong>AI Connections:</strong> 3 engines with gradient cards and scores</li>
                  <li>• <strong>Floating Annotation Panel:</strong> Quick capture with backdrop blur</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h5 className="font-semibold text-slate-900 text-xs uppercase tracking-wide">Interactions</h5>
                <ul className="space-y-1">
                  <li>• <strong>Hover Effects:</strong> Scale transforms and glow overlays</li>
                  <li>• <strong>Spring Animations:</strong> Natural physics-based motion</li>
                  <li>• <strong>Staggered Reveals:</strong> Sequential element animations</li>
                  <li>• <strong>Tab System:</strong> 6 categories with active indicators</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h5 className="font-semibold text-slate-900 text-xs uppercase tracking-wide">Visual Design</h5>
                <ul className="space-y-1">
                  <li>• <strong>Gradient Accents:</strong> Blue-to-purple, yellow-to-orange</li>
                  <li>• <strong>Rounded Corners:</strong> 1.5rem (24px) for premium feel</li>
                  <li>• <strong>Shadow System:</strong> Layered shadows for depth</li>
                  <li>• <strong>Typography Scale:</strong> Responsive with proper hierarchy</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
            <p className="text-sm text-yellow-900">
              <strong className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4" />
                Design Philosophy
              </strong>
              This design combines the clean elegance of the Product Card section with advanced edge-based navigation.
              It demonstrates glassmorphic UI, smooth spring animations, real document content with highlights,
              and a floating annotation system. The result is a premium, Apple-like reading experience that's both
              beautiful and functional.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Edge Navigation Demo */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            <CardTitle>Edge-Based Navigation (Retro/Brutalist)</CardTitle>
          </div>
          <CardDescription>
            Inspired by Front Line design - clickable edge panels with retro aesthetic, pixel decorations, and bold typography.
            Click the black edge panels to open document outline (left) or reader sidebar (right).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-6">
            <Badge variant="secondary">Edge Panels</Badge>
            <Badge variant="secondary">Vertical Text</Badge>
            <Badge variant="outline">Retro Aesthetic</Badge>
            <Badge variant="outline">Brutalist Borders</Badge>
            <Badge variant="outline">Pixel Decorations</Badge>
            <Badge variant="outline">Spring Animations</Badge>
          </div>

          <EdgeNavigationDemo />

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2 text-sm">Design Features</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• <strong>Edge Triggers:</strong> Clickable vertical panels with rotated text</li>
              <li>• <strong>Spring Animations:</strong> Smooth panel expansion with Framer Motion</li>
              <li>• <strong>Retro Decorations:</strong> Scattered pixels, corner squares, checkered footer</li>
              <li>• <strong>Brutalist Elements:</strong> Thick borders (4-8px), offset shadows, bold colors</li>
              <li>• <strong>Icon Tabs:</strong> 6-column grid (Connections, Annotations, Sparks, Cards, Review, Tune)</li>
              <li>• <strong>Bottom Control Panel:</strong> View modes, chat, spark, progress indicator</li>
              <li>• <strong>Chat Button:</strong> Bottom left corner (red button)</li>
              <li>• <strong>Spark Button:</strong> Bottom right corner (yellow button)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Live Card Configurator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Card Configuration</CardTitle>
            <CardDescription>Customize the card appearance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Variant Selection */}
            <div className="space-y-3">
              <Label>Card Variant</Label>
              <RadioGroup
                value={cardVariant}
                onValueChange={(v) => setCardVariant(v as typeof cardVariant)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="earth" id="earth" />
                  <Label htmlFor="earth">Earth (Blue)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mars" id="mars" />
                  <Label htmlFor="mars">Mars (Red/Orange)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="neutral" id="neutral" />
                  <Label htmlFor="neutral">Neutral (Grayscale)</Label>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            {/* Planet Toggle */}
            <div className="space-y-3">
              <Label>Display Options</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant={showPlanet ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowPlanet(!showPlanet)}
                >
                  {showPlanet ? 'Hide' : 'Show'} Planet
                </Button>
              </div>
            </div>

            <Separator />

            {/* Animation Speed */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Animation Speed</Label>
                <span className="text-sm text-muted-foreground">{animationSpeed[0]}%</span>
              </div>
              <Slider
                value={animationSpeed}
                onValueChange={setAnimationSpeed}
                min={0}
                max={100}
                step={10}
              />
            </div>

            <Separator />

            {/* CSS Classes Reference */}
            <div className="space-y-2">
              <Label>CSS Classes Used</Label>
              <div className="bg-muted rounded-lg p-3 space-y-1">
                <code className="text-xs font-mono block">.card-textured</code>
                <code className="text-xs font-mono block">.noise-filter</code>
                <code className="text-xs font-mono block">.text-display</code>
                <code className="text-xs font-mono block">.badge-textured</code>
                <code className="text-xs font-mono block">.planet-circle</code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>See your changes in real-time</CardDescription>
          </CardHeader>
          <CardContent>
            <motion.div
              key={`${cardVariant}-${showPlanet}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <TexturedCard
                title={cardVariant.toUpperCase()}
                description={
                  cardVariant === 'earth'
                    ? 'Rocky, water-covered, life-sustaining.'
                    : cardVariant === 'mars'
                    ? 'Red, rocky, cold, desert, thin-atmosphere.'
                    : 'Clean, modern, minimal design aesthetic.'
                }
                badge={`#${cardVariant === 'earth' ? '3' : cardVariant === 'mars' ? '4' : '5'}`}
                variant={cardVariant}
                showPlanet={showPlanet}
              />
            </motion.div>
          </CardContent>
        </Card>
      </div>

      {/* Full Card Gallery */}
      <Card>
        <CardHeader>
          <CardTitle>Card Gallery</CardTitle>
          <CardDescription>
            Complete set of textured card variants with animations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanetCardGrid cards={sampleCards} />
        </CardContent>
      </Card>

      {/* Style Variations */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Style Variations</CardTitle>
          <CardDescription>
            Experimental treatments and custom compositions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Texture Comparisons */}
          <div className="space-y-3">
            <Label>Texture Effects</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* No Texture */}
              <div className="card-textured card-textured-earth rounded-xl p-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white">No Texture</p>
                  <p className="text-xs text-white/80">Clean gradient only</p>
                </div>
              </div>

              {/* Noise Texture */}
              <div className="card-textured card-textured-earth noise-filter rounded-xl p-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white">Noise Filter</p>
                  <p className="text-xs text-white/80">Subtle grain texture</p>
                </div>
              </div>

              {/* Dot Texture */}
              <div className="card-textured card-textured-earth texture-dots rounded-xl p-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white">Dot Pattern</p>
                  <p className="text-xs text-white/80">Repeating dots</p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Typography Styles */}
          <div className="space-y-3">
            <Label>Typography Treatments</Label>
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-6">
                <h3 className="text-display text-display-lg">DISPLAY LARGE</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Bold, uppercase, geometric style
                </p>
              </div>

              <div className="bg-muted rounded-lg p-6">
                <h3 className="text-display text-display-md">DISPLAY MEDIUM</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Responsive sizing with clamp()
                </p>
              </div>

              <div className="bg-muted rounded-lg p-6">
                <h3 className="text-display text-display-sm">DISPLAY SMALL</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Compact heading style
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Code Export */}
      <Card>
        <CardHeader>
          <CardTitle>Using These Styles</CardTitle>
          <CardDescription>
            Copy the code below to use textured cards in your components
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm font-mono">
                <code>{`import { TexturedCard } from '@/components/design/TexturedCard'

export function MyComponent() {
  return (
    <TexturedCard
      title="CARD TITLE"
      description="Card description text"
      badge="#1"
      variant="earth"
      showPlanet
    />
  )
}`}</code>
              </pre>
            </div>

            <div className="flex gap-2">
              <Badge>experimental.css required</Badge>
              <Badge>framer-motion animations</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Badges */}
      <Card>
        <CardHeader>
          <CardTitle>Status Badges</CardTitle>
          <CardDescription>
            Icon-based status badges with filled, subtle, and outline variants
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusBadgeShowcase />
        </CardContent>
      </Card>

      {/* Profile Cards */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Cards</CardTitle>
          <CardDescription>
            User profile cards with circular progress rings and social stats
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 justify-items-center">
            <ProfileCard
              name="Noah Thompson"
              title="Product Designer who focuses on simplicity & usability."
              likes="72.9K"
              posts="828"
              views="342.9K"
              experience={65}
              variant="default"
            />
            <ProfileCard
              name="Sarah Chen"
              title="Creative Director specializing in brand identity."
              likes="94.2K"
              posts="1.2K"
              views="892.4K"
              experience={85}
              variant="minimal"
            />
          </div>
        </CardContent>
      </Card>

      {/* Product Cards */}
      <Card>
        <CardHeader>
          <CardTitle>Product Cards</CardTitle>
          <CardDescription>
            E-commerce style cards with image, pricing, and call-to-action
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductCardGrid />
        </CardContent>
      </Card>

      {/* Illustrated Menu */}
      <Card>
        <CardHeader>
          <CardTitle>Illustrated Menu</CardTitle>
          <CardDescription>
            Full-screen navigation menu with colorful icons and expandable sections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <IllustratedMenuTrigger />
          </div>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Click to see the full-screen illustrated menu experience
          </p>
        </CardContent>
      </Card>

      {/* Testimonial Cards */}
      <Card>
        <CardHeader>
          <CardTitle>Testimonial Cards</CardTitle>
          <CardDescription>
            Quote-based testimonial cards with author attribution
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <TestimonialCard
              quote="For Devin, Claude Sonnet 4.5 increased planning performance by 18% and end-to-end eval scores by 12%—the biggest jump we've seen since the release of Claude Sonnet 3.6. It excels at testing its own code, enabling Devin to run longer, handle harder tasks, and deliver production-ready code."
              author="Scott Wu"
              role="Co-Founder and CEO"
              company="Cognition"
              logo={
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-900 rounded-md flex items-center justify-center">
                    <span className="text-white text-lg">⚙️</span>
                  </div>
                  <span className="font-bold text-gray-900">Cognition</span>
                </div>
              }
              variant="cream"
            />

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-4">Multiple Variants</h4>
              <TestimonialGrid />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tactical/Command Center Components */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <CardTitle>Tactical Command Center</CardTitle>
          </div>
          <CardDescription>
            Cyber-military intelligence dashboard with dark aesthetic, monospace typography, and red accents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-black p-6 rounded-lg tactical-theme space-y-4">
            <div className="flex flex-wrap gap-2 mb-6">
              <Badge variant="destructive">Dark Theme</Badge>
              <Badge variant="secondary">Monospace Typography</Badge>
              <Badge variant="outline" className="border-red-500 text-red-500">Corner Brackets</Badge>
              <Badge variant="outline">Grid Overlays</Badge>
              <Badge variant="outline">Scanning Effects</Badge>
            </div>

            {/* Tactical Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Agent Profile */}
              <div>
                <AgentProfile
                  agentId="009X3312"
                  codeName="WHISSPERTA"
                  age={undefined}
                  activeUntil="19/02/2040"
                />
              </div>

              {/* Risk Indicator */}
              <div>
                <RiskIndicator
                  total={72}
                  success={45}
                  failed={27}
                  risks={[
                    { level: 'high', count: 30, label: 'HIGH RISK' },
                    { level: 'medium', count: 34, label: 'MEDIUM RISK' },
                    { level: 'low', count: 8, label: 'LOW RISK' },
                  ]}
                />
              </div>

              {/* Operations List */}
              <div>
                <OperationsList
                  timeRange="1 Day"
                  updateCount={4}
                  operations={[
                    { code: 'Omega', title: 'Track high-value target in Eastern Europe', location: 'Europe' },
                    { code: 'nBva', title: 'Infiltrate cybercrime network in Seoul', location: 'Asia' },
                    { code: 'Silentfire', title: 'Intercept illegal arms trade in Libya', location: 'Africa' },
                    { code: 'Omega', title: 'Track high-value target in Eastern Europe', location: 'Europe' },
                    { code: 'gh@etline', title: 'Monitor rogue agent communications in Berlin', location: 'Europe' },
                  ]}
                />
              </div>
            </div>

            {/* Full Width Components */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {/* Tactical Map */}
              <TacticalMap
                title="Target Operation ..."
                regions={['USA', 'AFRICA']}
                markers={[
                  { x: 25, y: 30, label: '', color: 'red' },
                  { x: 70, y: 60, label: '', color: 'red' },
                ]}
              />

              {/* Data Visualization */}
              <DataVisualization />
            </div>

            {/* Usage Example */}
            <div className="mt-6 pt-6 border-t border-tactical-border">
              <h4 className="tactical-text text-sm font-semibold mb-3 uppercase">Component Usage</h4>
              <div className="bg-tactical-panel rounded p-4">
                <pre className="text-xs tactical-code text-tactical-accent-green overflow-x-auto">
{`<TacticalPanel title="Mission Brief" scanning>
  <AgentProfile
    agentId="009X3312"
    codeName="WHISSPERTA"
    activeUntil="19/02/2040"
  />
</TacticalPanel>

<RiskIndicator
  total={72}
  success={45}
  failed={27}
  risks={[...]}
/>

<TacticalMap
  title="Target Operation"
  regions={['USA', 'AFRICA']}
  markers={[...]}
/>`}
                </pre>
              </div>
            </div>

            {/* CSS Classes Reference */}
            <div className="mt-4 pt-4 border-t border-tactical-border">
              <h4 className="tactical-text text-sm font-semibold mb-3 uppercase">Available CSS Classes</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  '.tactical-panel',
                  '.tactical-corners',
                  '.tactical-scan',
                  '.tactical-text',
                  '.tactical-text-red',
                  '.tactical-text-green',
                  '.tactical-code',
                  '.tactical-grid',
                  '.tactical-risk-high',
                  '.tactical-risk-medium',
                  '.tactical-risk-low',
                  '.tactical-glitch',
                ].map((className) => (
                  <code
                    key={className}
                    className="tactical-code text-xs tactical-text-dim border border-tactical-border px-2 py-1"
                  >
                    {className}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brutalist/Neobrutalism Components */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Square className="h-5 w-5 text-primary" />
            <CardTitle>Brutalist Design</CardTitle>
          </div>
          <CardDescription>
            Bold borders, vibrant colors, geometric shapes - inspired by neobrutalism and crypto trading UIs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-[#f5f1e8] p-6 rounded-lg brutalist-theme space-y-8">
            <div className="flex flex-wrap gap-2 mb-6">
              <Badge variant="secondary">Thick Borders</Badge>
              <Badge variant="secondary">Bold Colors</Badge>
              <Badge variant="outline">Shadow Offsets</Badge>
              <Badge variant="outline">Geometric Shapes</Badge>
              <Badge variant="outline">Diamond Decorators</Badge>
            </div>

            {/* Trading Cards */}
            <div>
              <h3 className="font-bold text-lg mb-4">Trading Cards</h3>
              <TradingPair />
              <p className="text-sm text-muted-foreground mt-4 text-center">
                ⚠️ A stop-limit order is a market order that has both a stop price and a limit price.
                When the stop price is reached, it triggers the limit order.
              </p>
            </div>

            <Separator />

            {/* Feedback/Callout Panel */}
            <div>
              <h3 className="font-bold text-lg mb-4">Callout Panels</h3>
              <FeedbackPanel />
            </div>

            <Separator />

            {/* Interactive Form */}
            <div>
              <h3 className="font-bold text-lg mb-4">Interactive Form</h3>
              <div className="flex justify-center">
                <BrutalistFormDemo />
              </div>
            </div>

            <Separator />

            {/* Data Table */}
            <div>
              <h3 className="font-bold text-lg mb-4">Data Table & Pagination</h3>
              <CryptoTable />
            </div>

            <Separator />

            {/* Usage Examples */}
            <div>
              <h3 className="font-bold text-lg mb-4">Component Usage</h3>
              <div className="bg-white rounded-lg p-4 border-4 border-black">
                <pre className="text-xs overflow-x-auto">
{`<TradingCard
  type="buy"
  price="165.09"
  priceUnit="(USDT)"
  amount="1.00"
  amountUnit="SUPP"
  onTrade={() => {}}
/>

<CalloutPanel
  icon={<SunIcon />}
  question="How do you feel about this?"
  subtitle="Vote to see results"
  onVote={(vote) => console.log(vote)}
/>

<BrutalistButton>
  EXECUTE
</BrutalistButton>

<BrutalistInput
  label="Price"
  value={value}
  onChange={setValue}
  suffix="USDT"
/>

<BrutalistTable
  columns={[
    { key: 'name', label: 'Name', align: 'left' },
    { key: 'price', label: 'Price', align: 'right' },
  ]}
  data={data}
/>

<BrutalistPagination
  currentPage={1}
  totalPages={5}
  onPageChange={(page) => console.log(page)}
/>`}
                </pre>
              </div>
            </div>

            {/* CSS Classes Reference */}
            <div>
              <h3 className="font-bold text-lg mb-4">Available CSS Classes</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  '.brutalist-card',
                  '.brutalist-card-buy',
                  '.brutalist-card-sell',
                  '.brutalist-button',
                  '.brutalist-icon-button',
                  '.brutalist-callout',
                  '.brutalist-input',
                  '.brutalist-border',
                  '.brutalist-shadow',
                  '.brutalist-diamond',
                  '.brutalist-heading',
                  '.brutalist-layers',
                  '.brutalist-label',
                  '.brutalist-value',
                ].map((className) => (
                  <code
                    key={className}
                    className="text-xs border-2 border-black px-2 py-1 bg-white font-mono"
                  >
                    {className}
                  </code>
                ))}
              </div>
            </div>

            {/* Design Notes */}
            <div className="brutalist-callout">
              <h4 className="font-bold mb-2">Design Philosophy</h4>
              <ul className="space-y-2 text-sm">
                <li>• <strong>Thick borders (4-6px)</strong> create strong visual separation</li>
                <li>• <strong>Offset shadows</strong> (6px) add depth without blur</li>
                <li>• <strong>Bold, vibrant colors</strong> (yellow, red/coral) for emphasis</li>
                <li>• <strong>Geometric shapes</strong> (diamonds, squares) as decorators</li>
                <li>• <strong>No border-radius</strong> - sharp corners only</li>
                <li>• <strong>Interactive feedback</strong> - shadow reduces on press</li>
                <li>• <strong>Data tables</strong> - clean rows with subtle alternating backgrounds</li>
                <li>• <strong>Color-coded pagination</strong> - red prev, white filter, yellow next</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
