# QuickCapture Click-Outside Fix

**Issue**: Color buttons were closing the panel prematurely due to event timing.

**Root Cause**: Native `mousedown` events fire BEFORE React synthetic events, so `stopPropagation()` happens too late.

## Solution Implemented

### 1. Defensive Click-Outside Checks
```typescript
const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement

  // Check 1: Panel ref exists
  if (!panelRef.current) return

  // Check 2: Click is inside panel (DOM contains)
  if (panelRef.current.contains(target)) {
    console.log('[QuickCapture] Click inside panel, staying open')
    return
  }

  // Check 3: Click on panel-related elements (closest)
  if (target.closest('[role="dialog"]') || target.closest('.quick-capture-panel')) {
    console.log('[QuickCapture] Click on panel-related element')
    return
  }

  // Only now close
  console.log('[QuickCapture] Click outside panel, closing')
  onClose()
}
```

### 2. Panel Attributes
```typescript
<div
  ref={panelRef}
  role="dialog"                    // ← Accessibility + defensive check
  aria-modal="true"                // ← Accessibility
  className="quick-capture-panel ..." // ← Defensive check target
  onMouseDown={(e) => e.stopPropagation()}
  onMouseUp={(e) => e.stopPropagation()}
  onClick={(e) => e.stopPropagation()}
>
```

### 3. Increased Delay
Changed from 100ms to 200ms for better safety margin.

## Debug Logging

When clicking, you'll see console logs:
- `[QuickCapture] Click-outside listener activated` - Listener started
- `[QuickCapture] Click inside panel, staying open` - Internal click detected
- `[QuickCapture] Click outside panel, closing` - External click detected
- `[QuickCapture] Click-outside listener removed` - Cleanup on unmount

## Testing

1. Open panel by selecting text
2. Click color button
3. Check console - should say "Click inside panel, staying open"
4. Panel should NOT close
5. Annotation should save
6. Panel should close AFTER save completes

## Files Modified

- `src/components/reader/QuickCapturePanel.tsx`:
  - Added defensive checks in `handleClickOutside`
  - Added `role="dialog"` and `quick-capture-panel` class
  - Added console logging for debugging
  - Increased delay to 200ms
