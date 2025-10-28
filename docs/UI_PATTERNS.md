# UI Patterns Guide - No Modals Philosophy


## Shadcn/UI Components Foundation

### Core Component Library

Shadcn/UI is our primary component library, built on Radix UI primitives with Tailwind CSS styling. All base UI components should use shadcn/ui unless a specific Magic UI enhancement is needed.

### Installation & Setup

```bash
# Initialize shadcn/ui (already done)
npx shadcn@latest init

# Add components as needed
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add command
npx shadcn@latest add dialog  # NO! We don't use modals
npx shadcn@latest add sheet   # YES! For mobile drawers
npx shadcn@latest add tabs
npx shadcn@latest add scroll-area
npx shadcn@latest add tooltip
npx shadcn@latest add popover
npx shadcn@latest add hover-card
```

### Component Usage Rules

#### ✅ ALWAYS USE Shadcn/UI For:

1. **Base UI Elements**
```tsx
// Always use shadcn/ui for standard components
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
```

2. **Form Controls**
```tsx
// All form elements from shadcn/ui
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
```

3. **Layout Components**
```tsx
// Layout and structure
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet } from "@/components/ui/sheet"  // Mobile only!
```

4. **Feedback Components**
```tsx
// User feedback (non-blocking)
import { Toast } from "@/components/ui/toast"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
```

#### ❌ NEVER USE These Shadcn Components:

```tsx
// ❌ FORBIDDEN - These create modals
import { Dialog } from "@/components/ui/dialog"        // NO MODALS!
import { AlertDialog } from "@/components/ui/alert-dialog"  // NO MODALS!

// Use these alternatives instead:
// Dialog → Sheet (mobile) or inline panels
// AlertDialog → Toast with action buttons or inline confirmation
```

### Shadcn/UI Component Patterns

#### Pattern: Command Palette (Allowed Overlay)
```tsx
// ✅ Command is allowed - it's non-blocking
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command"

// This is acceptable because:
// 1. Triggered by explicit keyboard shortcut (⌘K)
// 2. Easily dismissed with ESC
// 3. Doesn't block content permanently
```

#### Pattern: Contextual Popovers
```tsx
// ✅ Popovers for contextual actions
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Good for:
// - Color pickers
// - Date pickers  
// - Small forms
// - Quick settings
```

#### Pattern: Hover Cards for Information
```tsx
// ✅ Non-blocking information display
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

// Perfect for:
// - Connection previews
// - User info cards
// - Document metadata
// - Definition tooltips
```

#### Pattern: Tabs for Organization
```tsx
// ✅ Tabs keep everything visible
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function RightPanel() {
  return (
    <Tabs defaultValue="connections" className="h-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="connections">Connections</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="cards">Cards</TabsTrigger>
      </TabsList>
      <TabsContent value="connections">
        {/* Content stays in context */}
      </TabsContent>
    </Tabs>
  )
}
```

#### Pattern: Progress Indicators
```tsx
// ✅ Visual progress without blocking
import { Progress } from "@/components/ui/progress"

export function ProcessingIndicator({ value }) {
  return (
    <div className="w-full space-y-2">
      <Progress value={value} className="h-2" />
      <p className="text-sm text-muted-foreground">
        Processing: {value}%
      </p>
    </div>
  )
}
```

### Customizing Shadcn Components

#### Adding Variants
```tsx
// Extend button with custom variants in components/ui/button.tsx
const buttonVariants = cva(
  "base-styles",
  {
    variants: {
      variant: {
        default: "default-styles",
        destructive: "destructive-styles",
        // Add custom variants
        success: "bg-green-500 text-white hover:bg-green-600",
        study: "bg-purple-500 text-white hover:bg-purple-600",
      },
    },
  }
)
```

#### Composition Over Modification
```tsx
// ✅ Good: Compose shadcn components
export function StudyButton({ children, ...props }) {
  return (
    <Button
      className="bg-gradient-to-r from-purple-500 to-pink-500"
      {...props}
    >
      <Brain className="mr-2 h-4 w-4" />
      {children}
    </Button>
  )
}

// ❌ Bad: Modifying core shadcn components directly
// Don't edit files in components/ui/ after adding them
```

### Accessibility with Shadcn/UI

```tsx
// Shadcn components include ARIA attributes by default
<Button
  disabled={isLoading}
  aria-label="Create flashcard from selection"
  aria-busy={isLoading}
>
  {isLoading ? <Spinner /> : "Create Card"}
</Button>

// Tooltips for keyboard shortcuts
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button>Study</Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Start study session</p>
      <CommandShortcut>⌘S</CommandShortcut>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Form Handling with Shadcn/UI

```tsx
// Use shadcn form components with react-hook-form
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"

export function FlashcardForm() {
  const form = useForm()
  
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="question"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Question</FormLabel>
            <FormControl>
              <Textarea {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </Form>
  )
}
```

### Theming Shadcn/UI

```css
/* globals.css - Shadcn theme variables */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* Custom colors for Rhizome */
  --study: 271 81% 56%;      /* Purple for study mode */
  --connection: 199 89% 48%;  /* Blue for connections */
  --annotation: 43 96% 58%;   /* Yellow for highlights */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* Dark mode adjustments */
}
```

### Component Priority Order

1. **Shadcn/UI First**: Use for all standard UI needs
2. **Magic UI Enhancement**: Add when extra visual appeal needed
3. **Custom Components**: Build only when neither library provides solution

### Decision Tree for Component Selection

```
Need a UI component?
├─ Is it a basic UI element? → Use Shadcn/UI
├─ Does it need special effects? → Consider Magic UI
├─ Is it a modal/dialog? → STOP! Use alternative pattern
├─ Is it mobile-specific? → Use Sheet from Shadcn/UI
└─ Not covered? → Build custom following patterns
```

## Magic UI Components Integration

### Installation & Setup

Magic UI components are installed using the same CLI as shadcn/ui:

```bash
# Add specific Magic UI components
pnpm dlx shadcn@latest add @magicui/[component-name]

# Example:
pnpm dlx shadcn@latest add @magicui/shimmer-button
pnpm dlx shadcn@latest add @magicui/animated-beam
pnpm dlx shadcn@latest add @magicui/text-animate
```

### Available Component Categories

#### 1. Special Effects Components
Use these to enhance visual appeal without blocking content:

| Component | Use Case | Example Usage |
|-----------|----------|---------------|
| **Animated Beam** | Connection lines between elements | Showing relationships between chunks |
| **Border Beam** | Animated borders | Highlighting active sections |
| **Meteors** | Background effects | Empty state backgrounds |
| **Particles** | Ambient animations | Reading environment enhancement |
| **Confetti** | Success celebrations | Completing study sessions |
| **Shine Border** | Subtle highlights | Selected cards/panels |
| **Magic Card** | Interactive cards | Flashcard displays |

#### 2. Text Animation Components
For dynamic text displays that maintain readability:

| Component | Use Case | When to Use |
|-----------|----------|-------------|
| **Text Animate** | Smooth text transitions | Loading states, titles |
| **Number Ticker** | Animated counters | Study statistics |
| **Hyper Text** | Hover effects | Interactive keywords |
| **Scroll Based Velocity** | Speed-based effects | Document scrolling |
| **Sparkles Text** | Emphasis without modals | Important notifications |
| **Morphing Text** | Smooth transitions | Status changes |

#### 3. Interactive Buttons
Replace boring buttons with engaging alternatives:

| Component | Use Case | Implementation |
|-----------|----------|----------------|
| **Shimmer Button** | Primary CTAs | Create flashcard, Start study |
| **Rainbow Button** | Special actions | Export, Share |
| **Ripple Button** | Feedback on click | Quick actions |
| **Pulsating Button** | Attention-drawing | Due cards notification |

#### 4. Background Patterns
Non-intrusive visual enhancements:

| Component | Use Case | Where to Apply |
|-----------|----------|----------------|
| **Dot Pattern** | Subtle backgrounds | Empty library states |
| **Grid Pattern** | Structure indication | Canvas views |
| **Flickering Grid** | Dynamic backgrounds | Loading states |
| **Animated Grid Pattern** | Living backgrounds | Study environment |

### Implementation Rules for Magic UI

#### ✅ DO USE Magic UI Components When:

1. **Enhancing Visual Feedback** without modals
```tsx
// Good: Visual celebration for completing study session
import Confetti from "@/components/ui/confetti"

function onStudyComplete() {
  triggerConfetti() // Non-blocking celebration
}
```

2. **Creating Engaging Empty States**
```tsx
// Good: Interactive empty library
import { DotPattern } from "@/components/ui/dot-pattern"
import { ShimmerButton } from "@/components/ui/shimmer-button"

<div className="relative">
  <DotPattern className="opacity-20" />
  <ShimmerButton onClick={uploadDocument}>
    Upload Your First Document
  </ShimmerButton>
</div>
```

3. **Showing Connections/Relationships**
```tsx
// Good: Visualizing document connections
import { AnimatedBeam } from "@/components/ui/animated-beam"

<AnimatedBeam 
  from={documentRef}
  to={relatedDocRef}
  curvature={50}
/>
```

4. **Indicating Progress/Status**
```tsx
// Good: Processing status with style
import { BorderBeam } from "@/components/ui/border-beam"

<div className="relative">
  <ProcessingDock />
  <BorderBeam duration={3} /> {/* Animated border */}
</div>
```

#### ❌ DON'T USE Magic UI Components When:

1. **It Would Distract from Reading**
```tsx
// Bad: Too many effects in reader
<DocumentReader>
  <Meteors /> {/* NO: Distracting */}
  <Particles /> {/* NO: Overwhelming */}
</DocumentReader>

// Good: Subtle enhancement only
<DocumentReader>
  <HighlightWithShine /> {/* Subtle, purposeful */}
</DocumentReader>
```

2. **Performance Would Suffer**
```tsx
// Bad: Heavy animations on mobile
const isMobile = useMediaQuery('(max-width: 768px)')
{isMobile && <ComplexAnimation />} // NO

// Good: Adaptive to device
{!isMobile && <AnimatedBeam />} // Desktop only
```

3. **Accessibility Would Be Compromised**
```tsx
// Bad: Essential info in animation only
<MorphingText>{importantError}</MorphingText> // NO

// Good: Animation enhances, doesn't replace
<div>
  <span className="sr-only">{message}</span>
  <TextAnimate>{message}</TextAnimate>
</div>
```

### Magic UI Pattern Examples

#### Pattern: Enhanced Quick Capture
```tsx
import { ShimmerButton } from "@/components/ui/shimmer-button"
import { SparklesText } from "@/components/ui/sparkles-text"

export function EnhancedQuickCapture() {
  return (
    <motion.div className="quick-capture-bar">
      <SparklesText>Create from Selection</SparklesText>
      <div className="flex gap-2">
        <ShimmerButton size="sm" onClick={createFlashcard}>
          <Sparkles className="w-4 h-4 mr-1" />
          Flashcard
        </ShimmerButton>
        <RippleButton size="sm" onClick={createNote}>
          <MessageSquare className="w-4 h-4 mr-1" />
          Note
        </RippleButton>
      </div>
    </motion.div>
  )
}
```

#### Pattern: Animated Study Progress
```tsx
import { NumberTicker } from "@/components/ui/number-ticker"
import { AnimatedBeam } from "@/components/ui/animated-beam"

export function StudyProgress({ stats }) {
  return (
    <div className="study-stats">
      <NumberTicker value={stats.cardsStudied} />
      <span>cards today</span>
      
      {/* Visual connection between related cards */}
      <AnimatedBeam 
        from={currentCardRef}
        to={nextCardRef}
        show={showingConnection}
      />
    </div>
  )
}
```

#### Pattern: Document Processing Feedback
```tsx
import { BorderBeam } from "@/components/ui/border-beam"
import { TextAnimate } from "@/components/ui/text-animate"

export function ProcessingFeedback({ status }) {
  return (
    <div className="processing-dock">
      <BorderBeam duration={2} delay={0} />
      <TextAnimate>
        {status.message}
      </TextAnimate>
      {status.complete && <Confetti />}
    </div>
  )
}
```

### Component Selection Matrix

When choosing between standard shadcn/ui and Magic UI components:

| Need | Standard Choice | Magic UI Enhancement | When to Use Magic |
|------|----------------|---------------------|-------------------|
| Button | Button | ShimmerButton, RainbowButton | Primary CTAs, special actions |
| Text Display | <p>, <span> | TextAnimate, SparklesText | Titles, success messages |
| Loading | Spinner | BorderBeam, Meteors | When not distracting |
| Cards | Card | MagicCard | Interactive elements |
| Connections | Lines/SVG | AnimatedBeam | Showing relationships |
| Backgrounds | solid/gradient | DotPattern, GridPattern | Empty states, canvas views |
| Success Feedback | Toast | Confetti | Major achievements |
| Highlights | bg-color | ShineBorder | Selected states |

### Performance Guidelines

1. **Limit Concurrent Animations**: Max 2-3 Magic UI effects simultaneously
2. **Disable on Mobile**: Heavy effects should be desktop-only
3. **Use CSS Variables**: For theming Magic UI components
4. **Lazy Load**: Import effects only when needed
5. **Respect prefers-reduced-motion**: Disable or simplify for accessibility

### Accessibility Considerations

```tsx
// Always provide non-animated alternatives
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

return (
  <>
    {prefersReducedMotion ? (
      <Button>Create Flashcard</Button>
    ) : (
      <ShimmerButton>Create Flashcard</ShimmerButton>
    )}
  </>
)
```

## Feature-Rich Domain Components Pattern

**Philosophy**: Domain components (ConnectionCard, AnnotationCard, SparkCard, FlashcardCard, DeckCard) are **self-contained smart components**, not simple display components.

### Why This Pattern?

Traditional approach with prop drilling:
```tsx
// ❌ BAD: Simple display component with prop drilling
export function FlashcardCard({
  flashcard,
  onFlip,           // ❌ Prop drilling
  onReview,         // ❌ Prop drilling
  onEdit,           // ❌ Prop drilling
  isFlipped,        // ❌ Prop drilling
  isSubmitting,     // ❌ Prop drilling
  feedbackType,     // ❌ Prop drilling
  // ... 10+ more props
}) {
  return (
    <Card onClick={onFlip}>
      <p>{flashcard.front}</p>
      {isFlipped && <p>{flashcard.back}</p>}
      <button onClick={onReview}>Review</button>
    </Card>
  )
}

// Parent component becomes prop drilling nightmare
function StudySession() {
  const [flipped, setFlipped] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const handleReview = async (rating) => {
    setSubmitting(true)
    await reviewFlashcard(card.id, rating)
    setSubmitting(false)
  }

  // Pass everything down
  return <FlashcardCard
    flashcard={card}
    onFlip={() => setFlipped(!flipped)}
    onReview={handleReview}
    isFlipped={flipped}
    isSubmitting={submitting}
    feedbackType={feedback}
    // ... 10+ props
  />
}
```

**Feature-Rich approach:**
```tsx
// ✅ GOOD: Self-contained smart component
export function FlashcardCard({ flashcard, isActive, onClick }) {
  // 1. Internal state (no prop drilling)
  const [flipped, setFlipped] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 2. Server actions (colocated with UI)
  const handleReview = async (rating: number) => {
    setSubmitting(true)
    await reviewFlashcard(flashcard.id, rating)
    setSubmitting(false)
  }

  // 3. Keyboard shortcuts (when active)
  useEffect(() => {
    if (!isActive) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === ' ') setFlipped(!flipped)
      if (e.key >= '1' && e.key <= '4') {
        handleReview(Number(e.key))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isActive, flipped])

  // 4. Self-contained UI with all logic
  return (
    <Card className="relative" onClick={onClick}>
      <AnimatePresence mode="wait">
        <motion.div
          key={flipped ? 'back' : 'front'}
          initial={{ rotateY: 90 }}
          animate={{ rotateY: 0 }}
          exit={{ rotateY: -90 }}
          className="p-6"
        >
          {!flipped ? (
            <div>
              <p className="text-lg font-medium">{flashcard.front}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Press Space to reveal
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Answer:</p>
              <p className="text-lg">{flashcard.back}</p>

              {/* Rating buttons with keyboard hints */}
              <div className="flex gap-2 mt-4">
                <Button onClick={() => handleReview(1)} disabled={submitting}>
                  Again <kbd className="ml-1">1</kbd>
                </Button>
                <Button onClick={() => handleReview(2)} disabled={submitting}>
                  Hard <kbd className="ml-1">2</kbd>
                </Button>
                <Button onClick={() => handleReview(3)} disabled={submitting}>
                  Good <kbd className="ml-1">3</kbd>
                </Button>
                <Button onClick={() => handleReview(4)} disabled={submitting}>
                  Easy <kbd className="ml-1">4</kbd>
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Card>
  )
}

// Parent component is clean and simple
function StudySession() {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div>
      {cards.map((card, index) => (
        <FlashcardCard
          key={card.id}
          flashcard={card}
          isActive={index === activeIndex}
          onClick={() => setActiveIndex(index)}
        />
      ))}
    </div>
  )
}
```

### Benefits of Feature-Rich Components

1. **No Prop Drilling**: Components handle their own state and actions
2. **Highly Reusable**: Same component works in study, browse, search contexts
3. **Easy to Extend**: Add features in ONE place, automatically available everywhere
4. **Consistent Behavior**: Keyboard shortcuts, animations work identically everywhere
5. **Better Testing**: Test component in isolation with all its logic
6. **Simpler Parents**: Parent components don't need to manage complex state

### Existing Feature-Rich Components

#### ConnectionCard (`components/rhizome/connection-card.tsx`)
```tsx
export function ConnectionCard({ connection, isActive, onClick }) {
  const [feedbackType, setFeedbackType] = useState(null)

  // Server actions
  const handleFeedback = async (type: 'validate' | 'reject' | 'skip') => {
    await updateConnectionFeedback(connection.id, type)
  }

  // Keyboard shortcuts (v/r/s)
  useEffect(() => {
    if (!isActive) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'v') handleFeedback('validate')
      if (e.key === 'r') handleFeedback('reject')
      if (e.key === 's') handleFeedback('skip')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isActive])

  return (
    <Card>
      <p>{connection.explanation}</p>
      <div className="flex gap-2">
        <Button onClick={() => handleFeedback('validate')}>
          Validate <kbd>V</kbd>
        </Button>
        <Button onClick={() => handleFeedback('reject')}>
          Reject <kbd>R</kbd>
        </Button>
        <Button onClick={() => handleFeedback('skip')}>
          Skip <kbd>S</kbd>
        </Button>
      </div>
    </Card>
  )
}
```

**Features:**
- v/r/s keyboard shortcuts
- Feedback capture
- Server actions for mutations
- Optimistic UI updates

#### AnnotationCard (`components/rhizome/annotation-card.tsx`)
```tsx
export function AnnotationCard({ annotation, isActive, onClick }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(annotation.note)

  const handleSave = async () => {
    await updateAnnotation(annotation.id, { note })
    setEditing(false)
  }

  return (
    <Card
      className={cn("border-l-4", {
        "border-l-yellow-500": annotation.color === "yellow",
        "border-l-blue-500": annotation.color === "blue",
        "border-l-green-500": annotation.color === "green",
      })}
      onClick={onClick}
    >
      <p className="text-sm text-muted-foreground">{annotation.text}</p>

      {editing ? (
        <div className="mt-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={handleSave} size="sm">Save</Button>
        </div>
      ) : (
        <div className="mt-2">
          <p>{note}</p>
          {isActive && (
            <Button onClick={() => setEditing(true)} size="sm">
              Edit
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
```

**Features:**
- Colored borders by type
- Hover actions
- Inline editing
- Auto-save on blur

#### SparkCard (`components/rhizome/spark-card.tsx`)
```tsx
export function SparkCard({ spark, isActive, onClick }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card onClick={onClick}>
      <div className="flex items-start justify-between">
        <p>{spark.content}</p>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp /> : <ChevronDown />}
        </button>
      </div>

      {/* Selection badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {spark.selections.map((sel, i) => (
          <Badge key={i} variant="outline">
            Selection {i + 1}
          </Badge>
        ))}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2"
          >
            {spark.selections.map((sel, i) => (
              <div key={i} className="p-2 bg-muted rounded text-sm">
                {sel.text}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-muted-foreground mt-2">
        {formatDistanceToNow(spark.created_at)} ago
      </p>
    </Card>
  )
}
```

**Features:**
- Selection badges
- Expand/collapse
- Timestamp formatting
- Smooth animations

#### DeckCard (`components/rhizome/deck-card.tsx`)
```tsx
export function DeckCard({ deck, isActive, onClick }) {
  const stats = useDeckStats(deck.id)

  return (
    <Card onClick={onClick}>
      <h3 className="font-medium">{deck.name}</h3>

      {/* Progress visualization */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span>Due today</span>
          <span className="font-medium">{stats.dueToday}</span>
        </div>
        <Progress value={(stats.completed / stats.total) * 100} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{stats.completed} completed</span>
          <span>{stats.total} total</span>
        </div>
      </div>

      {/* Quick actions */}
      {isActive && (
        <div className="flex gap-2 mt-4">
          <Button size="sm" onClick={() => startStudy(deck.id)}>
            Study Now
          </Button>
          <Button size="sm" variant="outline" onClick={() => viewCards(deck.id)}>
            View Cards
          </Button>
        </div>
      )}
    </Card>
  )
}
```

**Features:**
- Study stats
- Progress visualization
- Quick action buttons
- Real-time data hooks

### When to Use Feature-Rich Pattern

✅ **Use this pattern when:**
- Domain objects used in multiple contexts (study/browse/search)
- Complex interactions (keyboard shortcuts, animations, state)
- Server actions needed (mutations, optimistic updates)
- Component will be reused across different features

❌ **Don't use this pattern when:**
- Pure design system components (buttons, inputs)
- One-off unique UI (landing page hero)
- Simple display-only components
- Performance is critical (thousands of instances)

### Implementation Checklist

When creating a feature-rich domain component:

1. ✅ **Internal state management**
   ```tsx
   const [expanded, setExpanded] = useState(false)
   const [editing, setEditing] = useState(false)
   ```

2. ✅ **Server actions (colocated)**
   ```tsx
   const handleUpdate = async (data) => {
     await updateEntity(id, data)
     revalidatePath('/current-page')
   }
   ```

3. ✅ **Keyboard shortcuts (when active)**
   ```tsx
   useEffect(() => {
     if (!isActive) return
     const handleKey = (e: KeyboardEvent) => {
       if (e.key === 'e') setEditing(true)
     }
     window.addEventListener('keydown', handleKey)
     return () => window.removeEventListener('keydown', handleKey)
   }, [isActive])
   ```

4. ✅ **Animations and transitions**
   ```tsx
   <motion.div
     initial={{ opacity: 0, scale: 0.9 }}
     animate={{ opacity: 1, scale: 1 }}
     exit={{ opacity: 0, scale: 0.9 }}
   />
   ```

5. ✅ **Minimal props (just data + control)**
   ```tsx
   interface Props {
     entity: EntityType       // The data
     isActive: boolean        // Control state
     onClick?: () => void     // Parent communication
   }
   ```

6. ✅ **Accessibility**
   ```tsx
   <button aria-label="Edit note" aria-pressed={editing}>
     Edit
   </button>
   ```

### Migration Example

**Before (prop drilling):**
```tsx
// Parent manages everything
function ConnectionsList() {
  const [activeId, setActiveId] = useState(null)
  const [feedbackTypes, setFeedbackTypes] = useState({})
  const [submitting, setSubmitting] = useState({})

  const handleFeedback = async (id, type) => {
    setSubmitting(prev => ({ ...prev, [id]: true }))
    await updateConnection(id, type)
    setFeedbackTypes(prev => ({ ...prev, [id]: type }))
    setSubmitting(prev => ({ ...prev, [id]: false }))
  }

  return connections.map(conn => (
    <ConnectionCard
      connection={conn}
      onFeedback={(type) => handleFeedback(conn.id, type)}
      feedbackType={feedbackTypes[conn.id]}
      isSubmitting={submitting[conn.id]}
      isActive={activeId === conn.id}
      onActivate={() => setActiveId(conn.id)}
    />
  ))
}
```

**After (feature-rich):**
```tsx
// Parent is clean and simple
function ConnectionsList() {
  const [activeId, setActiveId] = useState(null)

  return connections.map(conn => (
    <ConnectionCard
      connection={conn}
      isActive={activeId === conn.id}
      onClick={() => setActiveId(conn.id)}
    />
  ))
}

// Component handles everything internally
export function ConnectionCard({ connection, isActive, onClick }) {
  const [feedbackType, setFeedbackType] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleFeedback = async (type) => {
    setSubmitting(true)
    await updateConnection(connection.id, type)
    setFeedbackType(type)
    setSubmitting(false)
  }

  useEffect(() => {
    if (!isActive) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'v') handleFeedback('validate')
      if (e.key === 'r') handleFeedback('reject')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isActive])

  return (
    <Card onClick={onClick}>
      {/* All UI and logic here */}
    </Card>
  )
}
```

### Testing Feature-Rich Components

```tsx
// test/components/flashcard-card.test.tsx
describe('FlashcardCard', () => {
  it('flips card on space key when active', async () => {
    const { getByText } = render(
      <FlashcardCard
        flashcard={mockCard}
        isActive={true}
        onClick={jest.fn()}
      />
    )

    expect(getByText(mockCard.front)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: ' ' })

    await waitFor(() => {
      expect(getByText(mockCard.back)).toBeInTheDocument()
    })
  })

  it('calls review action on number keys', async () => {
    const { getByText } = render(
      <FlashcardCard
        flashcard={mockCard}
        isActive={true}
        onClick={jest.fn()}
      />
    )

    // Flip to reveal answer
    fireEvent.keyDown(window, { key: ' ' })

    // Press '3' for "Good"
    fireEvent.keyDown(window, { key: '3' })

    await waitFor(() => {
      expect(reviewFlashcard).toHaveBeenCalledWith(mockCard.id, 3)
    })
  })

  it('does not respond to keys when inactive', () => {
    render(
      <FlashcardCard
        flashcard={mockCard}
        isActive={false}
        onClick={jest.fn()}
      />
    )

    fireEvent.keyDown(window, { key: ' ' })

    // Card should not flip
    expect(queryByText(mockCard.back)).not.toBeInTheDocument()
  })
})
```

## Summary Rules

1. **Never block the main content** - User can always read/interact
2. **Persistent over temporary** - Docks/panels over modals
3. **Contextual over global** - Show UI near relevant content
4. **Collapsible everything** - Let users control their space
5. **Keyboard accessible** - Every action has a shortcut
6. **Mobile adaptive** - Panels become sheets on small screens
7. **Smooth animations** - Use springs, avoid jarring transitions
8. **Focus management** - Trap focus in overlays, return on dismiss
9. **Magic UI Enhancement** - Use Magic UI to enhance, not replace, core functionality
10. **Performance First** - Disable heavy effects on low-end devices
11. **Accessibility Always** - Provide reduced-motion alternatives
12. **Purposeful Effects** - Every animation should have a clear UX purpose
13. **Feature-Rich Components** - Domain components are self-contained with internal state, server actions, and keyboard shortcuts


This comprehensive guide ensures Claude Code will never use modals and always implements the correct non-blocking UI patterns. Each pattern includes complete implementation code that can be directly used.


## Core Principle: Flow State Preservation
Never interrupt the user's reading or thinking with modals. Use persistent, non-blocking UI elements that enhance rather than obstruct.

## UI Component Hierarchy

```
┌─────────────────────────────────────────────────┐
│  Main Content Area (Never Blocked)              │
│  ┌──────────────────────────────────┐           │
│  │                                  │  [Panel]  │
│  │  Document Reader / Library       │     →     │
│  │  (Primary Focus)                 │  Right    │
│  │                                  │  Sidebar  │
│  └──────────────────────────────────┘           │
│                                                  │
│  [Floating Elements]                             │
│  • Quick Capture Bar (bottom-center)             │
│  • Command Palette (center overlay)              │
│                                                  │
│  ╔════════════════════════════════════════════╗ │
│  ║ Processing Dock (bottom - collapsible)     ║ │
│  ╚════════════════════════════════════════════╝ │
└─────────────────────────────────────────────────┘
```

## Pattern 1: Processing Dock (Bottom)

### When to Use
- Background tasks (document processing, imports)
- Multi-step workflows that shouldn't block
- Progress tracking
- Batch operations

### Implementation
```tsx
// components/layout/processing-dock.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, X } from 'lucide-react'

export function ProcessingDock() {
  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(200)
  const jobs = useProcessingStore(s => s.jobs)
  
  // Auto-collapse when no jobs
  useEffect(() => {
    if (jobs.length === 0) {
      setTimeout(() => setCollapsed(true), 3000)
    }
  }, [jobs.length])
  
  // Hide completely if no jobs and collapsed
  if (jobs.length === 0 && collapsed) return null
  
  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm"
      initial={{ y: 300 }}
      animate={{ 
        y: 0,
        height: collapsed ? 48 : height 
      }}
      transition={{ type: "spring", damping: 25 }}
    >
      {/* Always Visible Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-accent rounded"
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          
          <span className="text-sm font-medium">
            {jobs.length} {jobs.length === 1 ? 'task' : 'tasks'} running
          </span>
          
          {/* Mini progress bars when collapsed */}
          {collapsed && (
            <div className="flex gap-1">
              {jobs.slice(0, 3).map(job => (
                <div key={job.id} className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${job.progress}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Drag handle for resizing */}
        {!collapsed && (
          <div 
            className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-primary/20"
            onMouseDown={handleResize}
          />
        )}
      </div>
      
      {/* Expanded Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overflow-auto"
            style={{ height: height - 48 }}
          >
            <div className="p-4 space-y-2">
              {jobs.map(job => (
                <ProcessingJob key={job.id} job={job} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Individual job component
function ProcessingJob({ job }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="p-3 bg-card rounded-lg border"
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium text-sm">{job.title}</p>
          <p className="text-xs text-muted-foreground">{job.status}</p>
        </div>
        <button 
          onClick={() => cancelJob(job.id)}
          className="p-1 hover:bg-destructive/10 rounded"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      
      <Progress value={job.progress} className="h-1" />
      
      {job.error && (
        <p className="text-xs text-destructive mt-2">{job.error}</p>
      )}
    </motion.div>
  )
}
```

## Pattern 2: Right Panel (Sidebar)

### When to Use
- Contextual information (connections, notes)
- Secondary navigation
- Filters and settings
- Metadata display

### Implementation
```tsx
// components/layout/right-panel.tsx
export function RightPanel({ documentId }) {
  const [width, setWidth] = useState(400)
  const [collapsed, setCollapsed] = useState(false)
  
  return (
    <>
      {/* Resize handle */}
      <div
        className="fixed right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 z-50"
        style={{ right: collapsed ? 0 : width }}
        onMouseDown={handleResize}
      />
      
      {/* Panel */}
      <motion.aside
        className="fixed right-0 top-0 bottom-0 bg-background border-l z-40"
        animate={{ 
          width: collapsed ? 0 : width,
          opacity: collapsed ? 0 : 1
        }}
        transition={{ type: "spring", damping: 25 }}
      >
        <Tabs defaultValue="connections" className="h-full flex flex-col">
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="connections" className="flex-1">
              Connections
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              Notes
            </TabsTrigger>
            <TabsTrigger value="cards" className="flex-1">
              Cards
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="flex-1">
            <TabsContent value="connections" className="p-4">
              <ConnectionsList documentId={documentId} />
            </TabsContent>
            
            <TabsContent value="notes" className="p-4">
              <AnnotationsList documentId={documentId} />
            </TabsContent>
            
            <TabsContent value="cards" className="p-4">
              <FlashcardsList documentId={documentId} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
        
        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 bg-background border rounded"
        >
          {collapsed ? <ChevronLeft /> : <ChevronRight />}
        </button>
      </motion.aside>
    </>
  )
}
```

## Pattern 3: Quick Capture Bar (Contextual)

### When to Use
- Text selection actions
- Quick input without leaving context
- Temporary tool palettes
- In-place editing

### Implementation
```tsx
// components/reader/quick-capture-bar.tsx
export function QuickCaptureBar() {
  const selection = useTextSelection()
  const [mode, setMode] = useState<'buttons' | 'flashcard' | 'note'>('buttons')
  
  if (!selection) return null
  
  // Calculate position based on selection
  const position = getSelectionPosition(selection)
  
  return (
    <motion.div
      className="fixed z-50 bg-background border rounded-lg shadow-lg"
      style={{
        top: position.bottom + 10,
        left: position.left,
        transform: 'translateX(-50%)'
      }}
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
    >
      {mode === 'buttons' ? (
        <div className="flex items-center gap-1 p-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setMode('flashcard')}
                  className="p-2 hover:bg-accent rounded"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Create Flashcard <kbd>F</kbd>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setMode('note')}
                  className="p-2 hover:bg-accent rounded"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Add Note <kbd>N</kbd>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={createHighlight}
                  className="p-2 hover:bg-accent rounded"
                >
                  <Highlighter className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Highlight <kbd>H</kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : mode === 'flashcard' ? (
        <div className="p-3 w-96 space-y-2">
          <textarea
            autoFocus
            placeholder="Question..."
            className="w-full min-h-[60px] p-2 border rounded resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault()
                document.getElementById('answer')?.focus()
              }
            }}
          />
          <textarea
            id="answer"
            placeholder="Answer..."
            defaultValue={selection.text}
            className="w-full min-h-[60px] p-2 border rounded resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setMode('buttons')}
              className="px-3 py-1 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={createFlashcard}
              className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
            >
              Create <kbd>⌘⏎</kbd>
            </button>
          </div>
        </div>
      ) : (
        // Note mode
        <div className="p-3 w-80">
          <textarea
            autoFocus
            placeholder="Add a note..."
            className="w-full min-h-[80px] p-2 border rounded resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setMode('buttons')}>Cancel</button>
            <button onClick={saveNote}>Save</button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
```

## Pattern 4: Command Palette (Overlay)

### When to Use
- Global navigation
- Quick actions
- Search
- Keyboard-driven workflows

### Implementation
```tsx
// components/layout/command-palette.tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(open => !open)
      }
    }
    
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])
  
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => {
            uploadDocument()
            setOpen(false)
          }}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
            <CommandShortcut>⌘U</CommandShortcut>
          </CommandItem>
          
          <CommandItem onSelect={() => {
            startStudySession()
            setOpen(false)
          }}>
            <Brain className="mr-2 h-4 w-4" />
            Start Study Session
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        
        <CommandGroup heading="Navigation">
          <CommandItem>
            <FileText className="mr-2 h-4 w-4" />
            Go to Library
          </CommandItem>
          <CommandItem>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        
        <CommandSeparator />
        
        <CommandGroup heading="Recent Documents">
          {recentDocs.map(doc => (
            <CommandItem key={doc.id} onSelect={() => navigateToDoc(doc.id)}>
              <FileText className="mr-2 h-4 w-4" />
              {doc.title}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

## Pattern 5: Inline Study Overlay

### When to Use
- Quick reviews without leaving document
- Temporary focused tasks
- Interstitial content
- Non-critical interruptions

### Implementation
```tsx
// components/study/inline-study-overlay.tsx
export function InlineStudyOverlay() {
  const { active, card } = useInlineStudy()
  const [showAnswer, setShowAnswer] = useState(false)
  
  if (!active) return null
  
  return (
    <>
      {/* Backdrop - subtle, not fully opaque */}
      <motion.div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => dismissStudy()}
      />
      
      {/* Card */}
      <motion.div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <Card className="w-[600px]">
          <CardContent className="p-8">
            <div className="space-y-4">
              <p className="text-lg">{card.question}</p>
              
              {showAnswer && (
                <div className="pt-4 border-t">
                  <p>{card.answer}</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-center gap-4 mt-8">
              {!showAnswer ? (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded"
                >
                  Show Answer <kbd>Space</kbd>
                </button>
              ) : (
                <>
                  <button onClick={() => rateCard(1)}>
                    Again <kbd>1</kbd>
                  </button>
                  <button onClick={() => rateCard(2)}>
                    Hard <kbd>2</kbd>
                  </button>
                  <button onClick={() => rateCard(3)}>
                    Good <kbd>3</kbd>
                  </button>
                  <button onClick={() => rateCard(4)}>
                    Easy <kbd>4</kbd>
                  </button>
                </>
              )}
            </div>
            
            <button
              onClick={dismissStudy}
              className="absolute top-4 right-4 p-2 hover:bg-accent rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      </motion.div>
    </>
  )
}
```

## Pattern 6: Split Screen Mode

### When to Use
- Document comparison
- Study with context
- Reference while writing
- Dual-focus workflows

### Implementation
```tsx
// components/layout/split-screen.tsx
export function SplitScreen({ 
  left, 
  right, 
  defaultRatio = 0.5,
  minSize = 300 
}) {
  const [ratio, setRatio] = useState(defaultRatio)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const handleDrag = (e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const newRatio = (e.clientX - rect.left) / rect.width
    setRatio(Math.max(0.2, Math.min(0.8, newRatio)))
  }
  
  return (
    <div ref={containerRef} className="flex h-full relative">
      <div 
        className="overflow-auto"
        style={{ width: `${ratio * 100}%` }}
      >
        {left}
      </div>
      
      {/* Resizer */}
      <div
        className="w-1 bg-border hover:bg-primary/20 cursor-ew-resize relative"
        onMouseDown={(e) => {
          e.preventDefault()
          const handleMouseMove = (e: MouseEvent) => handleDrag(e)
          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
          }
          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        }}
      >
        <div className="absolute inset-y-0 -inset-x-2" />
      </div>
      
      <div 
        className="overflow-auto flex-1"
        style={{ width: `${(1 - ratio) * 100}%` }}
      >
        {right}
      </div>
    </div>
  )
}
```

## Pattern 7: Floating Action Button (FAB)

### When to Use
- Primary action always accessible
- Mobile-friendly touch targets
- Persistent tools
- Spark/idea capture

### Implementation
```tsx
// components/layout/floating-action.tsx
export function FloatingAction() {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <motion.div
      className="fixed bottom-24 right-8 z-30"
      animate={{ scale: expanded ? 1.1 : 1 }}
    >
      {expanded && (
        <motion.div
          className="absolute bottom-16 right-0 space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button className="flex items-center gap-2 px-4 py-2 bg-background border rounded-full shadow-lg">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm">Quick Spark</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-background border rounded-full shadow-lg">
            <Plus className="h-4 w-4" />
            <span className="text-sm">New Note</span>
          </button>
        </motion.div>
      )}
      
      <button
        onClick={() => setExpanded(!expanded)}
        className="p-4 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-shadow"
      >
        <motion.div
          animate={{ rotate: expanded ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          <Plus className="h-6 w-6" />
        </motion.div>
      </button>
    </motion.div>
  )
}
```

## Pattern 8: Annotation Layer (Document Overlay)

### The Challenge
Annotations must float over text, handle overlaps, survive document reflows, and remain interactive without blocking text selection.

### Implementation

```tsx
// components/reader/annotation-layer.tsx
export function AnnotationLayer({ 
  chunks, 
  annotations,
  documentId 
}) {
  return (
    <div className="relative">
      {/* Base document text */}
      <div className="prose max-w-none">
        {chunks.map(chunk => (
          <ChunkWrapper key={chunk.id} chunk={chunk}>
            <MarkdownRenderer content={chunk.content} />
          </ChunkWrapper>
        ))}
      </div>
      
      {/* Annotation overlay - absolute positioned */}
      <div className="absolute inset-0 pointer-events-none">
        {annotations.map(annotation => (
          <AnnotationHighlight
            key={annotation.id}
            annotation={annotation}
            documentId={documentId}
          />
        ))}
      </div>
      
      {/* Active annotation popover */}
      <AnnotationPopover />
    </div>
  )
}
```

### Annotation Highlight Component

```tsx
// components/reader/annotation-highlight.tsx
interface AnnotationHighlight {
  id: string
  startOffset: number
  endOffset: number
  type: 'highlight' | 'note' | 'flashcard'
  color?: string
  text: string
}

export function AnnotationHighlight({ annotation }) {
  const [showPopover, setShowPopover] = useState(false)
  const [bounds, setBounds] = useState<DOMRect | null>(null)
  
  useEffect(() => {
    // Find and highlight the text range
    const range = findTextRange(
      annotation.startOffset, 
      annotation.endOffset
    )
    
    if (!range) return
    
    // Get bounding rectangles for all lines of text
    const rects = Array.from(range.getClientRects())
    
    // Create highlight spans for each line
    rects.forEach(rect => {
      const highlight = createHighlightElement(rect, annotation)
      document.body.appendChild(highlight)
    })
    
    return () => {
      // Cleanup highlights
      document.querySelectorAll(`[data-annotation="${annotation.id}"]`)
        .forEach(el => el.remove())
    }
  }, [annotation])
  
  return null // Highlights are rendered as absolute divs
}

function createHighlightElement(
  rect: DOMRect, 
  annotation: AnnotationHighlight
) {
  const div = document.createElement('div')
  
  // Position absolutely over text
  div.style.position = 'fixed'
  div.style.left = `${rect.left + window.scrollX}px`
  div.style.top = `${rect.top + window.scrollY}px`
  div.style.width = `${rect.width}px`
  div.style.height = `${rect.height}px`
  
  // Styling based on type
  const colors = {
    highlight: 'rgba(255, 235, 59, 0.3)',  // Yellow
    note: 'rgba(156, 39, 176, 0.2)',       // Purple
    flashcard: 'rgba(76, 175, 80, 0.2)'    // Green
  }
  
  div.style.backgroundColor = colors[annotation.type]
  div.style.pointerEvents = 'auto'
  div.style.cursor = 'pointer'
  div.style.mixBlendMode = 'multiply'
  
  // Data attributes
  div.setAttribute('data-annotation', annotation.id)
  div.className = 'annotation-highlight'
  
  // Interactions
  div.addEventListener('mouseenter', () => {
    div.style.backgroundColor = colors[annotation.type].replace('0.3', '0.4')
    showAnnotationPopover(annotation)
  })
  
  div.addEventListener('mouseleave', () => {
    div.style.backgroundColor = colors[annotation.type]
  })
  
  div.addEventListener('click', (e) => {
    e.stopPropagation()
    openAnnotationEditor(annotation)
  })
  
  return div
}
```

### Text Range Mapping (Robust)

```tsx
// lib/annotations/text-range.ts

interface TextRange {
  startContainer: Node
  startOffset: number
  endContainer: Node
  endOffset: number
  text: string
}

// Store annotations with multiple strategies for resilience
interface StoredAnnotation {
  id: string
  chunkId: string          // Which chunk contains it
  
  // Strategy 1: Character offsets
  startOffset: number      // Characters from chunk start
  endOffset: number        
  
  // Strategy 2: Text snippet for fuzzy matching
  textBefore: string       // 20 chars before selection
  textContent: string      // The actual selected text
  textAfter: string        // 20 chars after selection
  
  // Strategy 3: Paragraph + sentence indices
  paragraphIndex: number   // Which paragraph in chunk
  sentenceIndex: number    // Which sentence in paragraph
  
  // Strategy 4: DOM path (backup)
  domPath: string         // CSS selector to element
  
  // User data
  note?: string
  color?: string
  type: 'highlight' | 'note' | 'flashcard'
  created: Date
}

export function createAnnotation(
  selection: Selection, 
  chunkId: string
): StoredAnnotation {
  const range = selection.getRangeAt(0)
  const text = selection.toString()
  
  // Get context for fuzzy matching
  const container = range.commonAncestorContainer
  const fullText = container.textContent || ''
  const startIdx = fullText.indexOf(text)
  
  return {
    id: nanoid(),
    chunkId,
    
    // Character offsets
    startOffset: calculateOffset(range.startContainer, range.startOffset),
    endOffset: calculateOffset(range.endContainer, range.endOffset),
    
    // Text context for fuzzy matching
    textBefore: fullText.slice(Math.max(0, startIdx - 20), startIdx),
    textContent: text,
    textAfter: fullText.slice(startIdx + text.length, startIdx + text.length + 20),
    
    // Structural indices
    paragraphIndex: getParagraphIndex(range.startContainer),
    sentenceIndex: getSentenceIndex(range.startContainer, range.startOffset),
    
    // DOM path as backup
    domPath: getDOMPath(range.startContainer),
    
    type: 'highlight',
    created: new Date()
  }
}

export function restoreAnnotation(
  annotation: StoredAnnotation,
  chunkElement: HTMLElement
): Range | null {
  // Try strategies in order of reliability
  
  // 1. Try exact character offsets
  let range = tryCharacterOffsets(annotation, chunkElement)
  if (range && validateRange(range, annotation.textContent)) {
    return range
  }
  
  // 2. Try fuzzy text matching
  range = tryFuzzyMatching(annotation, chunkElement)
  if (range) {
    return range
  }
  
  // 3. Try structural indices
  range = tryStructuralIndices(annotation, chunkElement)
  if (range) {
    return range
  }
  
  // 4. Last resort: DOM path
  range = tryDOMPath(annotation, chunkElement)
  return range
}

function tryFuzzyMatching(
  annotation: StoredAnnotation,
  element: HTMLElement
): Range | null {
  const fullText = element.textContent || ''
  
  // Look for the pattern: textBefore + textContent + textAfter
  const pattern = annotation.textBefore + annotation.textContent + annotation.textAfter
  const patternIndex = fullText.indexOf(pattern)
  
  if (patternIndex === -1) {
    // Try just the content with some context
    const contentIndex = fullText.indexOf(annotation.textContent)
    if (contentIndex !== -1) {
      return createRangeFromIndices(
        element,
        contentIndex,
        contentIndex + annotation.textContent.length
      )
    }
  } else {
    const start = patternIndex + annotation.textBefore.length
    const end = start + annotation.textContent.length
    return createRangeFromIndices(element, start, end)
  }
  
  return null
}
```

### Annotation Popover

```tsx
// components/reader/annotation-popover.tsx
export function AnnotationPopover() {
  const { activeAnnotation, position } = useAnnotationStore()
  
  if (!activeAnnotation) return null
  
  return (
    <motion.div
      className="absolute z-50 p-3 bg-background border rounded-lg shadow-lg"
      style={{
        left: position.x,
        top: position.y + 20
      }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {activeAnnotation.type === 'note' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Note</p>
          <p className="text-sm">{activeAnnotation.note}</p>
          <button className="text-xs text-primary">
            Edit
          </button>
        </div>
      )}
      
      {activeAnnotation.type === 'flashcard' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Flashcard</p>
          <p className="text-sm font-medium">Q: {activeAnnotation.question}</p>
          <button className="text-xs text-primary">
            Study
          </button>
        </div>
      )}
      
      {activeAnnotation.type === 'highlight' && (
        <div className="flex items-center gap-2">
          <button className="p-1 hover:bg-accent rounded">
            <MessageSquare className="h-4 w-4" />
          </button>
          <button className="p-1 hover:bg-accent rounded">
            <Sparkles className="h-4 w-4" />
          </button>
          <button className="p-1 hover:bg-accent rounded">
            <Trash className="h-4 w-4" />
          </button>
        </div>
      )}
    </motion.div>
  )
}
```

### Handling Overlapping Annotations

```tsx
// components/reader/annotation-merger.tsx
interface AnnotationGroup {
  id: string
  annotations: StoredAnnotation[]
  bounds: DOMRect
  maxDepth: number // For stacking
}

export function mergeOverlappingAnnotations(
  annotations: StoredAnnotation[]
): AnnotationGroup[] {
  const groups: AnnotationGroup[] = []
  
  // Sort by start position
  const sorted = [...annotations].sort((a, b) => a.startOffset - b.startOffset)
  
  for (const annotation of sorted) {
    const overlapping = groups.find(group => 
      isOverlapping(annotation, group)
    )
    
    if (overlapping) {
      overlapping.annotations.push(annotation)
      overlapping.maxDepth = Math.max(
        overlapping.maxDepth, 
        overlapping.annotations.length
      )
    } else {
      groups.push({
        id: nanoid(),
        annotations: [annotation],
        bounds: getAnnotationBounds(annotation),
        maxDepth: 1
      })
    }
  }
  
  return groups
}

// Render overlapping annotations with visual distinction
export function AnnotationGroup({ group }: { group: AnnotationGroup }) {
  return (
    <div className="relative">
      {group.annotations.map((annotation, index) => (
        <div
          key={annotation.id}
          className="absolute inset-0"
          style={{
            // Offset each layer slightly
            transform: `translateY(${index * 2}px)`,
            // Fade overlapping layers
            opacity: 1 - (index * 0.1),
            // Different mix modes for overlap visibility
            mixBlendMode: 'multiply',
            zIndex: group.maxDepth - index
          }}
        >
          <AnnotationHighlight annotation={annotation} />
        </div>
      ))}
      
      {/* Indicator for multiple annotations */}
      {group.annotations.length > 1 && (
        <div className="absolute -right-6 top-0 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">
          {group.annotations.length}
        </div>
      )}
    </div>
  )
}
```

### Virtual Scrolling with Annotations

```tsx
// components/reader/virtual-annotated-reader.tsx
export function VirtualAnnotatedReader({ chunks, annotations }) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 })
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Only render visible chunks and their annotations
  const visibleChunks = chunks.slice(visibleRange.start, visibleRange.end)
  const visibleAnnotations = annotations.filter(a => 
    visibleChunks.some(c => c.id === a.chunkId)
  )
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Update visible range based on scroll
        const firstVisible = entries.find(e => e.isIntersecting)
        if (firstVisible) {
          const index = parseInt(firstVisible.target.getAttribute('data-chunk-index')!)
          setVisibleRange({
            start: Math.max(0, index - 5),
            end: Math.min(chunks.length, index + 15)
          })
        }
      },
      { rootMargin: '100px' }
    )
    
    // Observe sentinel elements
    const sentinels = containerRef.current?.querySelectorAll('.chunk-sentinel')
    sentinels?.forEach(s => observer.observe(s))
    
    return () => observer.disconnect()
  }, [chunks])
  
  return (
    <div ref={containerRef} className="relative">
      {/* Spacer for scroll height */}
      <div style={{ height: chunks.length * 200 }} />
      
      {/* Visible chunks */}
      <div 
        className="absolute inset-x-0"
        style={{ top: visibleRange.start * 200 }}
      >
        {visibleChunks.map((chunk, index) => (
          <div
            key={chunk.id}
            data-chunk-index={visibleRange.start + index}
            className="chunk-sentinel relative"
          >
            <MarkdownRenderer content={chunk.content} />
            
            {/* Annotations for this chunk */}
            {visibleAnnotations
              .filter(a => a.chunkId === chunk.id)
              .map(annotation => (
                <AnnotationHighlight
                  key={annotation.id}
                  annotation={annotation}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Annotation Persistence

```tsx
// lib/annotations/storage.ts
export async function saveAnnotation(annotation: StoredAnnotation) {
  // Save to ECS
  const entityId = await ecs.createEntity(userId, {
    annotation: {
      text: annotation.textContent,
      note: annotation.note,
      color: annotation.color
    },
    position: {
      chunkId: annotation.chunkId,
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
      textContext: {
        before: annotation.textBefore,
        content: annotation.textContent,
        after: annotation.textAfter
      }
    },
    source: {
      chunk_id: annotation.chunkId,
      document_id: documentId
    }
  })
  
  return entityId
}

// Load and restore on document open
export async function loadAnnotations(documentId: string) {
  const annotations = await ecs.query(
    ['annotation', 'position'],
    userId,
    { document_id: documentId }
  )
  
  return annotations.map(entity => 
    restoreAnnotation(entity.components.position, chunkElement)
  )
}
```

### Mobile Touch Selection

```tsx
// components/reader/touch-selection.tsx
export function TouchSelection({ onSelect }) {
  const [selecting, setSelecting] = useState(false)
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  
  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    setStart({ x: touch.clientX, y: touch.clientY })
    setSelecting(true)
  }
  
  const handleTouchMove = (e: TouchEvent) => {
    if (!selecting) return
    const touch = e.touches[0]
    setEnd({ x: touch.clientX, y: touch.clientY })
    
    // Update selection highlight
    updateSelectionHighlight(start!, { x: touch.clientX, y: touch.clientY })
  }
  
  const handleTouchEnd = () => {
    if (!selecting) return
    
    const selection = getTextInBounds(start!, end!)
    onSelect(selection)
    
    setSelecting(false)
    setStart(null)
    setEnd(null)
  }
  
  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="select-none"
    >
      {children}
      
      {/* Selection handles for mobile */}
      {selecting && (
        <>
          <SelectionHandle position={start} type="start" />
          <SelectionHandle position={end} type="end" />
        </>
      )}
    </div>
  )
}
```

This annotation layer system provides:

1. **Robust text range mapping** that survives document changes
2. **Visual overlapping** for multiple annotations
3. **Performance optimization** with virtual scrolling
4. **Mobile support** with touch selection
5. **Multiple fallback strategies** for finding text
6. **Clean visual hierarchy** with mix-blend modes

The key insight is storing annotations with multiple strategies (offsets, text context, structural position) so they can be restored even if the document reformats.


## Layout Composition

### Standard Reader Layout
```tsx
export function ReaderLayout({ children, documentId }) {
  return (
    <div className="h-screen flex flex-col">
      {/* Optional top bar */}
      <TopBar />
      
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Primary content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        
        {/* Right panel */}
        <RightPanel documentId={documentId} />
      </div>
      
      {/* Persistent bottom elements */}
      <ProcessingDock />
      
      {/* Floating elements */}
      <QuickCaptureBar />
      <CommandPalette />
      <FloatingAction />
    </div>
  )
}
```

## Animation Patterns

### Smooth Transitions
```tsx
// Use Framer Motion for all animations
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
}

// Stagger children
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}
```

### Spring Animations
```tsx
// Natural feeling springs
const springConfig = {
  type: "spring",
  damping: 25,
  stiffness: 200
}

// Gentle ease for overlays
const overlayTransition = {
  type: "tween",
  duration: 0.2,
  ease: "easeOut"
}
```

## Keyboard Navigation

### Global Shortcuts
```typescript
const shortcuts = {
  'cmd+k': 'Open command palette',
  'cmd+/': 'Toggle right panel',
  'cmd+\\': 'Toggle split screen',
  'esc': 'Dismiss overlay/selection',
  's': 'Start inline study',
  'f': 'Create flashcard from selection',
  'n': 'Create note from selection',
  'h': 'Highlight selection'
}
```

### Focus Management
```tsx
// Trap focus in overlays
export function useFocusTrap(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement
    
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }
    
    element.addEventListener('keydown', handleTab)
    firstElement?.focus()
    
    return () => element.removeEventListener('keydown', handleTab)
  }, [ref])
}
```

## Mobile Responsiveness

### Adaptive Layouts
```tsx
// Hide panels on mobile, use sheets instead
export function ResponsivePanel({ children }) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  
  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <button className="fixed bottom-4 right-4 p-3 bg-primary rounded-full">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[80vh]">
          {children}
        </SheetContent>
      </Sheet>
    )
  }
  
  return <RightPanel>{children}</RightPanel>
}
```

### Touch Gestures
```tsx
// Swipe to dismiss
export function SwipeDismiss({ children, onDismiss }) {
  const [{ x }, api] = useSpring(() => ({ x: 0 }))
  
  const bind = useDrag(({ movement: [mx], velocity, direction, cancel }) => {
    if (mx > 200 || (velocity[0] > 0.5 && direction[0] > 0)) {
      api.start({ x: window.innerWidth })
      onDismiss()
    } else {
      api.start({ x: 0 })
    }
  })
  
  return (
    <animated.div {...bind()} style={{ x }}>
      {children}
    </animated.div>
  )
}
```

## State Management

### Dock/Panel State
```typescript
// stores/ui-store.ts
interface UIStore {
  // Panels
  rightPanelOpen: boolean
  rightPanelWidth: number
  toggleRightPanel: () => void
  
  // Dock
  processingDockOpen: boolean
  processingDockHeight: number
  toggleProcessingDock: () => void
  
  // Overlays
  commandPaletteOpen: boolean
  inlineStudyActive: boolean
  
  // Layout
  splitScreenRatio: number
  setSplitScreenRatio: (ratio: number) => void
}

export const useUIStore = create<UIStore>((set) => ({
  rightPanelOpen: true,
  rightPanelWidth: 400,
  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
  // ...
}))
```

## DO NOT USE - Modal Anti-Patterns

```tsx
// ❌ NEVER DO THIS
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <CreateFlashcard />
  </DialogContent>
</Dialog>

// ❌ NEVER DO THIS
<Modal isOpen={isOpen}>
  <ProcessingStatus />
</Modal>

// ❌ NEVER DO THIS
<AlertDialog>
  <AlertDialogContent>
    Are you sure?
  </AlertDialogContent>
</AlertDialog>
```

## Instead, Use These Patterns

```tsx
// ✅ Inline editing
<QuickCaptureBar />

// ✅ Persistent status
<ProcessingDock />

// ✅ Contextual panels
<RightPanel />

// ✅ Non-blocking overlays
<InlineStudyOverlay />

// ✅ Command palette
<CommandPalette />
```
