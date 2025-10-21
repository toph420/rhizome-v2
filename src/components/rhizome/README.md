# Rhizome Brutalist Component Library

**Forked components from various libraries, restyled with Rhizome's brutalist design system.**

## Design Principles

1. **Flat Colors**: No gradients, no glowing effects
2. **Bold Borders**: 3px solid borders (balanced)
3. **Hard Shadows**: 6px offset shadows with no blur (standard)
4. **Strategic Color**: Color for meaning (badges, highlights, tags), not decoration
5. **Geometric Shapes**: Rectangles with rounded-lg corners (8px)

## Component Origins

| Component | Forked From | Original License | Modifications | Status |
|-----------|-------------|------------------|---------------|--------|
| card.tsx | neobrutalism/card | MIT | Minimal, kept as-is | ✅ Installed |
| badge.tsx | neobrutalism/badge | MIT | Minimal, kept as-is | ✅ Installed |
| progress.tsx | neobrutalism/progress | MIT | Minimal, kept as-is | ✅ Installed |
| button.tsx | neobrutalism/button | MIT | Minimal, kept as-is | ✅ Installed |
| - | smoothui/scrollable-stack | MIT | Removed gradients, added neo-border | ⏳ Planned |
| - | magicui/number-ticker | MIT | Removed gradient text, flat colors | ⏳ Planned |
| - | kiboui/kanban | MIT | Bold borders, hard shadows | ⏳ Planned |

## Usage

Import from `@/components/rhizome/`:

```tsx
import { Card, CardHeader, CardContent } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Progress } from '@/components/rhizome/progress'
import { Button } from '@/components/rhizome/button'
```

## Customization

All components use CSS variables from `src/styles/neobrutalism.css`.

### Global Styling

Modify CSS variables to adjust brutalist styling:

```css
/* src/styles/neobrutalism.css */
:root {
  --neo-border-md: 3px;     /* Balanced border width */
  --neo-shadow-offset-md: 6px;  /* Standard shadow depth */
  --neo-radius-md: 0.5rem;  /* Modern rounded corners */
}
```

### Dual Palette System

Toggle between two color palettes:

**Palette A (OKLCH Semantic)**: Existing design system integration
- Uses `--primary`, `--success`, `--warning`, `--destructive`
- Enable with `<div className="palette-semantic">`

**Palette B (Neobrutalism Bold)**: Higher saturation for impact
- Uses `--neo-primary`, `--neo-secondary`, `--neo-accent`, `--neo-warning`, `--neo-danger`
- Default palette (no className needed)

## Testing

Test components in design playground: `/design`

Toggle between palettes to compare aesthetics before production integration.

## Maintenance

Components are **fully owned** in this codebase:
- No upstream dependencies (forked, not installed)
- Free to modify without breaking updates
- Track modifications in this README

## Installation History

### 2025-10-20: Initial Setup
- Created rhizome directory structure
- Forked core components (card, badge, progress, button)
- Set up dual palette system
- Built design playground

---

**Last Updated**: 2025-10-20 | **Maintainer**: Rhizome V2 Team
