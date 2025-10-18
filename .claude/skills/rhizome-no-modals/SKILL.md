---
name: Rhizome No Modals
description: Absolute prohibition on blocking modals (Dialog, AlertDialog, Modal) in Rhizome V2. Use persistent UI patterns instead - docks, side panels, overlays, sheets (mobile only), popovers. Critical for reading workflow and state management. Use when creating UI components or implementing user interactions. Trigger keywords: Dialog, AlertDialog, Modal, modal, popup, blocking UI, ProcessingDock, RightPanel, AdminPanel, Sheet, Popover, persistent UI, shadcn/ui dialog.
---

# Rhizome No Modals Policy

NEVER use blocking modals in Rhizome. Use persistent UI patterns instead.

## Instructions

### Core Rule

**FORBIDDEN**: `Dialog`, `AlertDialog`, `Modal` from shadcn/ui

**ALLOWED**: Persistent UI patterns:
- **ProcessingDock** - Bottom-right collapsible panel for background jobs
- **RightPanel** - Side panel with 6 tabs
- **AdminPanel** - Full-screen overlay (Cmd+Shift+A)
- **Sheet** - Mobile-only slide-in drawers
- **Popover** - Contextual non-blocking menus
- **Command** - Command palette (⌘K only)

### Why No Modals?

1. Context Loss - Hides document during reading
2. Workflow Disruption - Forces action completion
3. State Complexity - Open/close state management
4. Poor Mobile UX
5. Accessibility issues

## When NOT to Use This Skill

- **QuickSparkModal (⌘K)**: This is the ONLY acceptable modal exception (uses createPortal, not Dialog component)
- **System Alerts**: Browser native alerts for critical errors
- **Third-party integrations**: External libraries that require modals (document the exception)

## Examples

### ❌ FORBIDDEN

\`\`\`typescript
import { Dialog } from '@/components/ui/dialog'
<Dialog open={open}>
  <CreateFlashcard />
</Dialog>

import { AlertDialog } from '@/components/ui/alert-dialog'
<AlertDialog>
  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
</AlertDialog>

// Modal for confirmation
<Modal isOpen={showConfirm}>
  <button onClick={handleDelete}>Confirm Delete</button>
</Modal>
\`\`\`

### ✅ CORRECT

\`\`\`typescript
// Use RightPanel tab instead
function FlashcardsTab() {
  const [editing, setEditing] = useState(false)
  return editing ? <FlashcardForm /> : <FlashcardsList />
}
\`\`\`

## Related Documentation

- `docs/UI_PATTERNS.md` - Complete UI pattern guide
