import { ModernReaderShowcase } from '@/components/design/ModernReaderShowcase'

/**
 * Design V2: Modern Reader Showcase
 *
 * A complete reader experience demo featuring:
 * - Document reader with real markdown rendering
 * - Brutalist/retro navigation inspired by EdgeNavigationDemo
 * - QuickCapture annotation panel with highlight colors, notes, and tags
 * - All shadcn components with framer motion animations
 *
 * @returns Modern reader showcase page
 */
export default function DesignV2Page() {
  return (
    <div className="min-h-screen bg-background">
      <ModernReaderShowcase />
    </div>
  )
}
