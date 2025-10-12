# Brutalist Design Migration Plan

**Status:** Ready to Execute
**Timeline:** 4 days (aggressive, no backward compatibility)
**Approach:** Nuclear replacement of current design system

## Overview

Replace the entire current design with the brutalist/retro style from Design V2 (`/design/v2`). No gradual migration, no theme toggle - just rip and replace.

**Key Principle:** The V2 showcase already has 80% of the UI built. We're just wiring up real data and replacing existing components.

---

## Day 1: Global Styling Foundation (2-3 hours)

### 1.1 Create Brutalist CSS Foundation

**File:** `src/styles/brutalist.css` (NEW)

```css
@layer base {
  * {
    @apply border-black;
  }

  :root {
    /* Kill all border-radius */
    --radius: 0rem;

    /* Pure black borders */
    --border: 0 0% 0%;

    /* Brutalist color palette */
    --brutalist-yellow: 252 100% 67%;
    --brutalist-red: 0 84% 60%;
    --brutalist-green: 120 40% 85%;
  }
}

@layer components {
  /* Brutalist shadow utilities */
  .brutalist-shadow {
    box-shadow: 6px 6px 0 0 rgba(0, 0, 0, 1);
  }

  .brutalist-shadow-lg {
    box-shadow: 12px 12px 0 0 rgba(0, 0, 0, 1);
  }

  .brutalist-shadow-sm {
    box-shadow: 3px 3px 0 0 rgba(0, 0, 0, 1);
  }

  /* Thick borders */
  .brutalist-border {
    @apply border-4 border-black;
  }

  .brutalist-border-lg {
    @apply border-8 border-black;
  }

  /* Vertical text for edge panels */
  .writing-vertical {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
  }
}
```

**Import in:** `src/app/globals.css`

```css
@import './styles/brutalist.css';
```

### 1.2 Update Tailwind Config

**File:** `tailwind.config.ts`

```typescript
export default {
  theme: {
    extend: {
      borderRadius: {
        lg: '0rem',
        md: '0rem',
        sm: '0rem',
      },
      borderWidth: {
        DEFAULT: '4px',
        lg: '8px',
      },
      fontWeight: {
        black: '900', // Ensure font-black is available
      },
    },
  },
}
```

### 1.3 Test Global Changes

- [ ] Run `npm run dev`
- [ ] Check that all rounded corners are gone
- [ ] Verify thick borders appear on buttons/cards

---

## Day 2: Replace Reader Layout (4-6 hours)

### 2.1 Create New Edge-Based Layout

**File:** `src/components/reader/BrutalistReaderLayout.tsx` (NEW)

**Source:** Copy from `src/components/design/ModernReaderShowcase.tsx`

**Changes needed:**
1. Remove sample markdown constant
2. Accept props: `documentId`, `markdownUrl`, `chunks`, `annotations`
3. Wire up real data fetching
4. Connect to existing ReaderStore (if needed)

```typescript
interface BrutalistReaderLayoutProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
}

export function BrutalistReaderLayout({
  documentId,
  markdownUrl,
  chunks,
  annotations,
}: BrutalistReaderLayoutProps) {
  const [markdown, setMarkdown] = useState('')

  // Fetch real markdown
  useEffect(() => {
    fetch(markdownUrl)
      .then(res => res.text())
      .then(setMarkdown)
  }, [markdownUrl])

  // Rest of ModernReaderShowcase code...
  // Replace SAMPLE_DOCUMENT with {markdown}
}
```

### 2.2 Extract Reusable Components

Create standalone components from the showcase:

**File:** `src/components/reader/EdgeTrigger.tsx` (NEW)

```typescript
interface EdgeTriggerProps {
  side: 'left' | 'right'
  label: string
  isOpen: boolean
  onToggle: () => void
}

export function EdgeTrigger({ side, label, isOpen, onToggle }: EdgeTriggerProps) {
  return (
    <motion.button
      className={cn(
        "w-12 bg-black text-white flex items-center justify-center hover:bg-red-600 transition-colors relative group",
        side === 'left' ? 'border-r-4 border-black' : 'border-l-4 border-black'
      )}
      onClick={onToggle}
      whileHover={{ width: 56 }}
    >
      <div className="writing-vertical text-xs font-black tracking-widest">
        {label}
      </div>
      {side === 'left' ? (
        <ChevronRight className="absolute opacity-0 group-hover:opacity-100 transition-opacity" />
      ) : (
        <ChevronLeft className="absolute opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </motion.button>
  )
}
```

**File:** `src/components/reader/BottomControlPanel.tsx` (NEW)

```typescript
interface BottomControlPanelProps {
  viewMode: 'explore' | 'focus' | 'study'
  onViewModeChange: (mode: 'explore' | 'focus' | 'study') => void
  progress: number
  onChatClick: () => void
  onSparkClick: () => void
}

export function BottomControlPanel({
  viewMode,
  onViewModeChange,
  progress,
  onChatClick,
  onSparkClick,
}: BottomControlPanelProps) {
  // Extract lines 453-532 from ModernReaderShowcase.tsx
  return (
    <motion.div
      className="fixed bottom-8 left-12 right-12 h-20 bg-white border-4 border-black z-50 flex items-center justify-between px-6 brutalist-shadow-lg"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 20, delay: 0.2 }}
    >
      {/* Chat, view modes, progress, spark */}
    </motion.div>
  )
}
```

**File:** `src/components/reader/DocumentOutlinePanel.tsx` (NEW)

```typescript
interface OutlineItem {
  level: 1 | 2 | 3
  title: string
  section: string
}

interface DocumentOutlinePanelProps {
  outline: OutlineItem[]
  onNavigate: (section: string) => void
}

export function DocumentOutlinePanel({ outline, onNavigate }: DocumentOutlinePanelProps) {
  // Extract from ModernReaderShowcase lines 280-322
}
```

**File:** `src/components/reader/ReaderSidebarPanel.tsx` (NEW)

```typescript
interface ReaderSidebarPanelProps {
  connections: Connection[]
  annotations: StoredAnnotation[]
  activeTab: 'connections' | 'annotations' | 'sparks' | 'cards' | 'review' | 'tune'
  onTabChange: (tab: string) => void
}

export function ReaderSidebarPanel({
  connections,
  annotations,
  activeTab,
  onTabChange,
}: ReaderSidebarPanelProps) {
  // Extract from ModernReaderShowcase lines 340-450
}
```

### 2.3 Update Read Page

**File:** `src/app/read/[id]/page.tsx`

```typescript
import { BrutalistReaderLayout } from '@/components/reader/BrutalistReaderLayout'

export default async function ReadPage({ params }: { params: { id: string } }) {
  const documentId = params.id

  // Existing data fetching
  const supabase = createClient()
  const { data: document } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('position')

  const { data: annotations } = await supabase
    .from('entities')
    .select(`
      *,
      components:components(*)
    `)
    .eq('document_id', documentId)

  return (
    <BrutalistReaderLayout
      documentId={documentId}
      markdownUrl={document.markdown_path}
      chunks={chunks || []}
      annotations={annotations || []}
    />
  )
}
```

### 2.4 Test Reader Layout

- [ ] Open a document at `/read/[id]`
- [ ] Verify markdown renders with brutalist styles
- [ ] Test left edge trigger (outline panel)
- [ ] Test right edge trigger (sidebar panel)
- [ ] Test bottom control panel (view modes)

---

## Day 3: Brutalist Annotation Panel (3-4 hours)

### 3.1 Update QuickCapturePanel Styling

**File:** `src/components/reader/QuickCapturePanel.tsx`

**Current state:** Already has colors, notes, tags functionality
**What to change:** Only the visual styling

```typescript
// Replace the entire return statement with brutalist version
// Copy from ModernReaderShowcase lines 602-755

return typeof window !== 'undefined'
  ? createPortal(
      <AnimatePresence>
        {annotationPanelOpen && selectedText && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onClose()}
          >
            <motion.div
              className="bg-white border-8 border-black p-6 w-[500px] max-w-[90vw] brutalist-shadow-lg"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Highlighter className="h-5 w-5" />
                    <h3 className="font-black text-lg">QUICK CAPTURE</h3>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 bg-gray-100 p-2 border-2 border-black">
                    &ldquo;{selectedText}&rdquo;
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="border-2 border-black"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Color Picker - 7 colors in grid */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  <span className="text-sm font-black uppercase">Highlight Color</span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {COLOR_OPTIONS.map((option) => (
                    <motion.button
                      key={option.color}
                      onClick={() => void saveAnnotation(option.color, false)}
                      className={cn(
                        'aspect-square rounded-none border-4 border-black transition-all flex flex-col items-center justify-center',
                        option.bgClass,
                        option.hoverClass
                      )}
                      style={{
                        boxShadow:
                          selectedColor === option.color
                            ? '4px 4px 0 0 rgba(0,0,0,1)'
                            : '2px 2px 0 0 rgba(0,0,0,1)',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="text-xs font-black">{option.key.toUpperCase()}</span>
                    </motion.button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 font-mono">
                  Press letter key or click color to save
                </p>
              </div>

              {/* Note textarea - keep existing logic */}
              <div className="space-y-3 mb-6">
                <label className="text-sm font-black uppercase">Note (optional)</label>
                <Textarea
                  ref={noteRef}
                  placeholder="Add context, thoughts, questions..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={saving}
                  className="min-h-[100px] resize-none border-4 border-black focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                />
              </div>

              {/* Tags - keep existing logic */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  <label className="text-sm font-black uppercase">Tags</label>
                </div>
                <div className="flex gap-2">
                  <Input
                    ref={tagInputRef}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddTag()
                      }
                    }}
                    placeholder="Add tags (press Enter)..."
                    disabled={saving}
                    className="border-4 border-black focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                  />
                  <Button
                    onClick={handleAddTag}
                    disabled={saving}
                    className="border-4 border-black bg-black text-white hover:bg-gray-800 font-black"
                  >
                    ADD
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        className="bg-yellow-300 text-black border-2 border-black font-bold hover:bg-yellow-400 gap-2"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          disabled={saving}
                          className="hover:text-red-600 disabled:opacity-50"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions - keep existing save logic */}
              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={saving}
                  className="border-4 border-black font-black flex-1"
                >
                  CANCEL
                </Button>
                <Button
                  onClick={() => void saveAnnotation(selectedColor, true)}
                  disabled={saving}
                  className="bg-red-600 hover:bg-red-700 text-white border-4 border-black font-black flex-1 brutalist-shadow"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      SAVING...
                    </>
                  ) : (
                    'SAVE WITH NOTE'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )
  : null
```

**Key changes:**
- ✅ Keep all existing logic (saveAnnotation, handleAddTag, etc.)
- ✅ Keep keyboard shortcuts
- ✅ Keep optimistic updates
- 🔄 Update visual styling only (borders, shadows, fonts)

### 3.2 Test Annotations

- [ ] Select text in document
- [ ] QuickCapture panel appears with brutalist styling
- [ ] Test all 7 color shortcuts (Y/G/B/R/P/O/K)
- [ ] Add note and tags
- [ ] Save annotation
- [ ] Verify saved to database
- [ ] Verify optimistic update works

---

## Day 4: Shadcn Component Overrides (3-4 hours)

### 4.1 Update Button Component

**File:** `src/components/ui/button.tsx`

```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-black uppercase transition-colors focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 border-4 border-black",
  {
    variants: {
      variant: {
        default: "bg-black text-white hover:bg-gray-800",
        destructive: "bg-red-600 text-white hover:bg-red-700 brutalist-shadow",
        outline: "border-4 border-black bg-white hover:bg-gray-100",
        secondary: "bg-yellow-300 text-black hover:bg-yellow-400 brutalist-shadow",
        ghost: "border-0 hover:bg-gray-100",
        link: "border-0 text-black underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

### 4.2 Update Card Component

**File:** `src/components/ui/card.tsx`

```typescript
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "border-4 border-black bg-white text-card-foreground brutalist-shadow",
      className
    )}
    {...props}
  />
))

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6 border-b-4 border-black", className)}
    {...props}
  />
))

// Update CardTitle to use font-black
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-black leading-none tracking-tight uppercase",
      className
    )}
    {...props}
  />
))
```

### 4.3 Update Input Component

**File:** `src/components/ui/input.tsx`

```typescript
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full border-4 border-black bg-white px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 rounded-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
```

### 4.4 Update Textarea Component

**File:** `src/components/ui/textarea.tsx`

```typescript
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full border-4 border-black bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 rounded-none",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
```

### 4.5 Update Badge Component

**File:** `src/components/ui/badge.tsx`

```typescript
const badgeVariants = cva(
  "inline-flex items-center border-2 border-black px-2.5 py-0.5 text-xs font-bold uppercase transition-colors focus:outline-none focus:ring-0",
  {
    variants: {
      variant: {
        default: "bg-black text-white hover:bg-gray-800",
        secondary: "bg-yellow-300 text-black hover:bg-yellow-400",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline: "bg-white text-black hover:bg-gray-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
```

### 4.6 Test All Components

- [ ] Check buttons across app (thick borders, shadows)
- [ ] Check cards (brutalist-shadow, thick borders)
- [ ] Check inputs (no rounded corners, thick borders)
- [ ] Check badges (uppercase, thick borders)
- [ ] Run through entire app to find missed components

---

## Day 5: Retro Decorations & Polish (2-3 hours)

### 5.1 Add Global Decorations

**File:** `src/components/layout/RetroBorderDecorations.tsx` (NEW)

```typescript
'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function RetroBorderDecorations() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      {/* Corner squares */}
      <div className="absolute top-4 right-4 w-3 h-3 bg-black" />
      <div className="absolute top-8 right-8 w-2 h-2 bg-black" />
      <div className="absolute top-12 right-12 w-4 h-4 bg-black" />
      <div className="absolute bottom-4 left-4 w-3 h-3 bg-black" />
      <div className="absolute bottom-8 left-8 w-2 h-2 bg-black" />

      {/* Scattered pixels */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-black"
          style={{
            top: `${20 + i * 10}%`,
            right: `${5 + (i % 3) * 15}%`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{
            duration: 2,
            delay: i * 0.2,
            repeat: Infinity,
          }}
        />
      ))}

      {/* Checkered pattern footer */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-black flex">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className={cn('flex-1', i % 2 === 0 ? 'bg-black' : 'bg-white')}
          />
        ))}
      </div>
    </div>
  )
}
```

**Add to:** `src/app/layout.tsx`

```typescript
import { RetroBorderDecorations } from '@/components/layout/RetroBorderDecorations'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <RetroBorderDecorations />
        {children}
      </body>
    </html>
  )
}
```

### 5.2 Add Header Bar

**File:** `src/components/layout/BrutalistHeader.tsx` (NEW)

```typescript
'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User } from 'lucide-react'
import Link from 'next/link'

export function BrutalistHeader() {
  return (
    <motion.header
      className="fixed top-0 left-0 right-0 h-16 bg-white border-b-4 border-black z-50 flex items-center justify-between px-6"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 20 }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3">
        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
          <div className="w-6 h-6 bg-[#e8f5e9] rounded-full" />
        </div>
        <span className="text-2xl font-black tracking-tight">RHIZOME</span>
        <Badge className="bg-red-600 text-white font-bold border-2 border-black">
          V2
        </Badge>
      </Link>

      {/* Nav Links */}
      <nav className="flex items-center gap-8">
        <Link href="/library" className="font-bold text-sm hover:text-red-600 transition-colors">
          LIBRARY
        </Link>
        <Link href="/read" className="font-bold text-sm hover:text-red-600 transition-colors">
          READ
        </Link>
        <Link href="/study" className="font-bold text-sm hover:text-red-600 transition-colors">
          STUDY
        </Link>
      </nav>

      {/* Profile */}
      <Button variant="ghost" size="icon" className="rounded-full">
        <User className="h-5 w-5" />
      </Button>
    </motion.header>
  )
}
```

### 5.3 Update Root Layout

**File:** `src/app/layout.tsx`

```typescript
import { BrutalistHeader } from '@/components/layout/BrutalistHeader'
import { RetroBorderDecorations } from '@/components/layout/RetroBorderDecorations'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#e8f5e9]">
        <RetroBorderDecorations />
        <BrutalistHeader />
        <main className="pt-16">
          {children}
        </main>
      </body>
    </html>
  )
}
```

---

## Testing Checklist

### Core Reader Functionality
- [ ] Document loads and displays markdown
- [ ] Text selection works
- [ ] Annotation panel appears on selection
- [ ] All 7 color shortcuts work (Y/G/B/R/P/O/K)
- [ ] Notes and tags save correctly
- [ ] Annotations persist to database
- [ ] Optimistic updates work

### Navigation & Panels
- [ ] Left edge trigger opens outline panel
- [ ] Outline navigation works
- [ ] Right edge trigger opens sidebar
- [ ] Sidebar tabs switch correctly
- [ ] Connections display (if any exist)
- [ ] Annotations display in sidebar
- [ ] Bottom control panel appears
- [ ] View mode switches work

### Visual Polish
- [ ] All components have thick borders (4px or 8px)
- [ ] Shadows appear correctly (6px or 12px offset)
- [ ] No rounded corners anywhere
- [ ] Typography is bold/black throughout
- [ ] Color palette consistent (yellow, red, green accents)
- [ ] Retro decorations visible (corner squares, pixels, checkered footer)
- [ ] Header slides in on page load
- [ ] Bottom panel slides in on page load
- [ ] Edge panels slide smoothly with spring physics

### Cross-Browser Testing
- [ ] Chrome/Edge (main browsers)
- [ ] Safari (webkit differences)
- [ ] Firefox (if used)

### Performance
- [ ] Animations are smooth (60fps)
- [ ] No layout shift on page load
- [ ] Markdown renders quickly
- [ ] Panels open/close smoothly

---

## Rollback Plan

If things go sideways:

1. **Quick rollback:** Revert read page to old ReaderLayout
   ```bash
   git checkout HEAD -- src/app/read/[id]/page.tsx
   git checkout HEAD -- src/components/reader/
   ```

2. **Nuclear rollback:** Revert entire migration
   ```bash
   git reset --hard HEAD~N  # where N = number of commits
   ```

3. **Partial rollback:** Keep brutalist styling, revert layout
   - Keep: `src/styles/brutalist.css`, shadcn overrides
   - Revert: Layout components, edge panels, bottom control

---

## Files Changed Summary

### New Files
- `src/styles/brutalist.css`
- `src/components/reader/BrutalistReaderLayout.tsx`
- `src/components/reader/EdgeTrigger.tsx`
- `src/components/reader/BottomControlPanel.tsx`
- `src/components/reader/DocumentOutlinePanel.tsx`
- `src/components/reader/ReaderSidebarPanel.tsx`
- `src/components/layout/RetroBorderDecorations.tsx`
- `src/components/layout/BrutalistHeader.tsx`

### Modified Files
- `tailwind.config.ts` (border radius, widths)
- `src/app/globals.css` (import brutalist.css)
- `src/app/layout.tsx` (add decorations, header)
- `src/app/read/[id]/page.tsx` (use new layout)
- `src/components/reader/QuickCapturePanel.tsx` (styling only)
- `src/components/ui/button.tsx` (brutalist variants)
- `src/components/ui/card.tsx` (thick borders, shadows)
- `src/components/ui/input.tsx` (no rounded corners)
- `src/components/ui/textarea.tsx` (no rounded corners)
- `src/components/ui/badge.tsx` (thick borders, uppercase)

### Deleted Files (Optional)
- `src/components/reader/ReaderLayout.tsx` (old layout, backup first)
- Any old panel components not needed

---

## Post-Migration

### Next Steps After V2 is Live

1. **Update other pages:**
   - Library page with brutalist card grid
   - Study page with flashcard brutalist styling
   - Settings page

2. **Add more retro elements:**
   - Scanline overlay effect
   - Glitch animations on hover
   - More pixel decorations

3. **Performance optimization:**
   - Lazy load heavy animations
   - Optimize framer-motion bundle size
   - Reduce re-renders on panel open/close

4. **Accessibility:**
   - Ensure high contrast for readability
   - Test keyboard navigation
   - Add ARIA labels for panels

---

## Notes

- **Personal tool = No backward compat:** Just ship it and fix issues as they come up
- **V2 showcase has 80% done:** Most code is copy-paste, just wire up real data
- **Test in production:** It's a personal tool, you ARE the QA team
- **Iterate quickly:** If something looks off, tweak it immediately
- **Have fun:** This is the beauty of personal projects - full creative control

**Timeline is aggressive but doable.** Expect some rough edges on Day 1-2, polish by Day 4-5.
