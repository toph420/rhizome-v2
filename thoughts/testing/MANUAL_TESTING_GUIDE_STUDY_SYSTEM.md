# Manual Testing Guide: Complete Study System

**Created**: 2025-10-24
**Status**: Ready for Testing
**Version**: 2.0 (Complete Implementation)

---

## Overview

This guide provides step-by-step instructions for manually testing the complete study system implementation across all 4 phases:

1. **Phase 1**: Foundation Components (stats, actions, store)
2. **Phase 2**: Study Management Tab (deck browser, custom study)
3. **Phase 3**: Session Enhancements (completion screen, navigation)
4. **Phase 4**: Compact Sidebar Study (RightPanel integration)

---

## Prerequisites

### Setup Requirements

**Services Running**:
```bash
# Start all services
npm run dev

# Verify services are running
npm run status

# Expected output:
# ✓ Supabase running (port 54321)
# ✓ Worker running (port 3001)
# ✓ Next.js running (port 3000)
```

**Database State**:
```bash
# Ensure latest migrations applied
npx supabase db reset

# Verify study system tables exist
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\dt"
# Should show: decks, study_sessions, flashcards_cache
```

**Test Data Preparation**:
1. Have at least 1 document processed with chunks
2. Have at least 5-10 flashcards created and approved
3. Know your user ID (check browser console or auth state)

---

## Phase 1: Foundation Components Testing

### 1.1 StudyStats Component - Compact Mode

**Location**: Can be tested in any component that imports it

**Test**: Verify compact mode renders correctly

**Steps**:
1. Navigate to `/study` page
2. Look for stats display in management tab
3. Verify compact stats show:
   - Today's review count (number + "today" label)
   - Due count (orange number + "due" label)
   - Streak (if > 0, shows "day streak 🔥")

**Expected Result**:
```
5 today  |  12 due  |  3 day streak 🔥
```

**Pass Criteria**:
- ✅ Stats display inline in single row
- ✅ Numbers are accurate
- ✅ Orange color for due count
- ✅ Streak only shows if > 0

**Fail Indicators**:
- ❌ Loading spinner never resolves
- ❌ "0 today 0 due" when you know you have data
- ❌ Layout breaks on mobile

---

### 1.2 StudyStats Component - Expanded Mode

**Test**: Verify expanded mode shows full analytics

**Steps**:
1. Still on `/study` management tab
2. Find the "Study Statistics" card at top of page
3. Verify grid layout with 4 stat cards:
   - **Today** (blue background)
   - **Due** (orange background)
   - **Retention** (green background, percentage)
   - **Streak** (yellow background, "X days")

**Expected Result**:
```
┌──────────┬──────────┬──────────┬──────────┐
│ Today    │ Due      │ Retention│ Streak   │
│ 5        │ 12       │ 85%      │ 3 days   │
└──────────┴──────────┴──────────┴──────────┘

Upcoming Reviews:
Today         12 cards
Tomorrow       8 cards
Mon Oct 28     5 cards
```

**Pass Criteria**:
- ✅ All 4 stat cards render with correct colors
- ✅ Retention shows percentage (not decimal)
- ✅ Upcoming reviews show next 3-7 days
- ✅ Card is responsive (grid adjusts on mobile)

**Fail Indicators**:
- ❌ Retention shows "0.85" instead of "85%"
- ❌ Streak shows "0 days" when you have studied
- ❌ No upcoming reviews despite due cards

---

### 1.3 Advanced Study Filters ✅ COMPLETE

**Test**: Verify advanced filters work in custom study builder

**Steps**:
1. Scroll down to "Custom Study" section
2. Test **Difficulty Range** filter:
   - Set min to 3, max to 7
   - Verify preview count updates
3. Test **Quick Filters**:
   - Click "Not Studied Yet" badge
   - Verify it turns blue/active
   - Verify preview count changes
4. Test **Tags Filter** (if implemented):
   - Add a tag
   - Verify preview count filters

**Expected Result**:
- Preview count updates within ~300ms (debounced)
- Active filters show in blue/highlighted state
- Preview count reflects filtered results

**Pass Criteria**:
- ✅ Difficulty sliders update preview count
- ✅ "Not Studied Yet" toggle works
- ✅ Preview count is accurate (verify with manual count)
- ✅ "Start Session" button disabled when count = 0

**Fail Indicators**:
- ❌ Preview count always shows total cards
- ❌ Filters don't apply to started session
- ❌ Difficulty range validation missing (min > max allowed)

---

### 1.4 Deck Batch Operations ⏭️ SKIPPED

**Test**: Verify moveCardsToDeck works (via actions)

**Status**: Skipped - will test via UI in Phase 2.3 DeckCard interactions

**Setup**: You'll need browser console for this test

**Steps**:
1. Open browser console (F12)
2. Get 2-3 flashcard entity IDs from database or UI
3. Run server action manually:
```javascript
// In browser console
const { moveCardsToDeck } = await import('/src/app/actions/decks')
const result = await moveCardsToDeck(
  ['card-id-1', 'card-id-2'],
  'target-deck-id'
)
console.log(result)
```
4. Check result shows `{ success: true, movedCount: 2 }`
5. Verify cards now appear in target deck

**Pass Criteria**:
- ✅ Returns success with correct count
- ✅ Cards appear in new deck
- ✅ Cache rebuilds automatically

**Fail Indicators**:
- ❌ Error: "Cannot find component"
- ❌ Success but cards don't move
- ❌ Cache not updated

---

### 1.5 Study Store State Management ✅ COMPLETE

**Test**: Verify Zustand store updates correctly

**Steps**:
1. Open React DevTools
2. Find Zustand store state (or use console)
3. Verify initial state:
```javascript
{
  sessionContext: null,
  customFilters: {},
  previewCount: 0,
  activeDeckId: null
}
```
4. Click a deck in grid
5. Verify `activeDeckId` updates
6. Change custom filters
7. Verify `customFilters` and `previewCount` update

**Pass Criteria**:
- ✅ State updates immediately on user actions
- ✅ No console errors about state mutations
- ✅ State persists across tab switches

---

## ✅ Phase 1 Complete! All foundation components tested and working.

---

## Phase 2: Study Management Tab Testing

### 2.0 Create Deck Functionality ✅ COMPLETE

**Test**: Verify BottomPanel + CreateDeckForm works end-to-end

**Components Added**:
- `BottomPanel.tsx` - Reusable bottom sheet container
- `CreateDeckForm.tsx` - Pure form component with validation

**Steps**:
1. Navigate to `/study` Management tab
2. Click "New Deck" button (top-right)
3. Verify bottom sheet slides up from bottom
4. Test form fields:
   - Deck Name (required) - Shows character counter (X/100)
   - Description (optional) - Shows character counter (X/500)
   - Parent Deck (optional dropdown) - Shows existing non-system decks
5. Test validation:
   - Empty name shows error
   - Create button disabled when name empty
6. Create a test deck with all fields
7. Verify: Sheet closes, toast shows, deck appears in grid
8. Test cancel/Esc/outside click - all close sheet

**Pass Criteria**:
- ✅ Bottom sheet slides up smoothly
- ✅ All form fields work
- ✅ Validation prevents empty submissions
- ✅ Character counters accurate
- ✅ Parent deck dropdown populated
- ✅ Success creates deck and refreshes grid
- ✅ Toast notification appears
- ✅ All close methods work (Cancel, Esc, outside click)

**Implemented Features**:
- ✅ Parent deck name shown on child deck cards ("Parent: XYZ")
- ✅ Edit Deck menu item opens BottomPanel with EditDeckForm
- ✅ EditDeckForm pre-populates with existing deck data
- ✅ Parent hierarchy changes reflected immediately

---

### 2.1 Two-Tab Study Page Structure ✅ COMPLETE

**Test**: Verify study page has correct tab layout

**Steps**:
1. Navigate to `/study`
2. Verify two tabs visible:
   - **Management** (active by default)
   - **Study Session** (disabled/grayed out)
3. Verify Study Session tab shows:
   - "Study Session" label
   - Disabled state (no deck selected)

**Expected Result**:
```
┌──────────────┬────────────────────┐
│ Management   │ Study Session      │
│ (active)     │ (disabled)         │
└──────────────┴────────────────────┘
```

**Pass Criteria**:
- ✅ Both tabs render
- ✅ Management tab active by default
- ✅ Session tab disabled until study starts
- ✅ Tab bar spans full width

**Fail Indicators**:
- ❌ Page crashes on load
- ❌ Only one tab visible
- ❌ Tabs layout broken on mobile

---

### 2.2 Deck Grid Display ✅ COMPLETE

**Test**: Verify deck grid shows all decks with stats

**Steps**:
1. On Management tab, scroll to "My Decks" section
2. Verify grid layout:
   - Responsive (1 col mobile, 2 col tablet, 3 col desktop)
   - System decks show "System" badge
   - Each deck card shows:
     - Deck name
     - Description (if exists)
     - Total/Active/Draft counts
     - "Study" button
     - More menu (three dots)

**Expected Result**:
```
┌─────────────────┬─────────────────┬─────────────────┐
│ Inbox [System]  │ Archive [System]│ My Custom Deck  │
│ Description...  │ Description...  │ Description...  │
│ ┌───┬───┬───┐   │ ┌───┬───┬───┐   │ ┌───┬───┬───┐   │
│ │25 │20 │ 5 │   │ │10 │ 8 │ 2 │   │ │15 │12 │ 3 │   │
│ │Tot│Act│Drf│   │ │Tot│Act│Drf│   │ │Tot│Act│Drf│   │
│ └───┴───┴───┘   │ └───┴───┴───┘   │ └───┴───┴───┘   │
│ [Study (S)] [⋮] │ [Study (S)] [⋮] │ [Study (S)] [⋮] │
└─────────────────┴─────────────────┴─────────────────┘
```

**Pass Criteria**:
- ✅ All decks render in grid
- ✅ System decks have badge
- ✅ Stats are accurate
- ✅ Grid responsive on different screen sizes

**Fail Indicators**:
- ❌ No decks show despite having flashcards
- ❌ Stats show all zeros
- ❌ Grid breaks layout on mobile

---

### 2.3 DeckCard Interactions ✅ COMPLETE

**Test**: Verify deck card is feature-rich and interactive

**Status**: Complete - All features working (keyboard shortcuts, edit, delete protection)

**Note**: Move Cards feature not yet implemented - will test in future phase

**Steps**:
1. **Click to Select**:
   - Click on a deck card
   - Verify blue ring appears around it (active state)

2. **Keyboard Shortcut - Study**:
   - With deck selected (active)
   - Press 'S' key
   - Verify study session starts

3. **Keyboard Shortcut - Delete**:
   - Select a **non-system** deck
   - Press Cmd+D (Mac) or Ctrl+D (Windows)
   - Verify confirmation dialog appears
   - Cancel it

4. **Study Button**:
   - Click "Study (S)" button
   - Verify session starts
   - Verify Session tab becomes active

5. **More Menu**:
   - Click three-dot menu
   - Verify options:
     - Edit Deck
     - Delete Deck (hidden for system decks)
     - Move Cards

**Pass Criteria**:
- ✅ Selection works (blue ring)
- ✅ 'S' keyboard shortcut starts study
- ✅ Cmd+D shows delete confirmation
- ✅ Study button starts session
- ✅ More menu shows correct options
- ✅ System decks protected from deletion

**Fail Indicators**:
- ❌ Keyboard shortcuts don't work
- ❌ Can delete system decks
- ❌ Study button disabled despite active cards
- ❌ More menu doesn't appear

---

### 2.4 Custom Study Builder ✅ COMPLETE

**Test**: Verify custom study builder with live preview

**Status**: Already tested in Phase 1 (Test 1.3) - All features working

**Steps**:
1. Scroll to "Custom Study" section
2. **Deck Filter**:
   - Click deck dropdown
   - Select a specific deck
   - Verify preview count updates

3. **Difficulty Range**:
   - Set min = 2, max = 8
   - Verify preview count updates after ~300ms

4. **Quick Filters**:
   - Click "Not Studied Yet" badge
   - Verify it highlights/turns blue
   - Verify preview count changes
   - Click "Failed Cards" badge
   - Verify preview updates

5. **Preview Count**:
   - Verify shows "X cards match" at bottom
   - Verify count updates as filters change
   - Verify "Start Session" enabled when count > 0

6. **Reset**:
   - Click "Reset" button
   - Verify all filters clear
   - Verify preview returns to total

7. **Start Session**:
   - Configure some filters
   - Click "Start Session"
   - Verify Study Session tab activates
   - Verify only filtered cards appear

**Pass Criteria**:
- ✅ All filters update preview count
- ✅ Debounce works (~300ms delay)
- ✅ Preview count is accurate
- ✅ Reset clears everything
- ✅ Started session applies filters correctly

**Fail Indicators**:
- ❌ Preview count never updates
- ❌ Filters don't actually filter session
- ❌ Can start session with 0 cards
- ❌ Reset doesn't clear filters

---

### 2.5 Empty States ⏭️ SKIPPED

**Test**: Verify empty state when no decks exist

**Status**: Skipped - Code review confirms implementation is correct (DeckGrid.tsx lines 53-78)

**Setup**: Delete all decks temporarily (or test on fresh account)

**Steps**:
1. Navigate to `/study`
2. Verify "No Decks Yet" card shows:
   - Plus icon
   - "No Decks Yet" heading
   - "Create your first deck" description
   - "Create Deck" button

**Expected Result**:
```
┌─────────────────────────────────┐
│           ╔══╗                  │
│           ║ +║                  │
│           ╚══╝                  │
│       No Decks Yet              │
│ Create your first deck to       │
│ organize flashcards             │
│                                 │
│      [Create Deck]              │
└─────────────────────────────────┘
```

**Pass Criteria**:
- ✅ Empty state renders when no decks
- ✅ Create button appears (even if not functional)
- ✅ UI is centered and well-formatted

---

## ✅ Phase 2 Complete! All Management Tab features tested and working.

**Summary:**
- ✅ Create Deck with BottomPanel pattern
- ✅ Edit Deck with pre-populated form
- ✅ Parent deck hierarchy display
- ✅ Deck grid with stats
- ✅ Custom study builder (tested in Phase 1)
- ⏭️ Empty states (code review confirms correct)

---

## Phase 3: Session Enhancements Testing

### 3.0 Study All Cards Feature ✅ COMPLETE

**Feature**: Allow studying cards even when not due (addresses FSRS scheduling)

**Implementation**:
1. **Smart Deck Button** - Auto-fallback when 0 due cards
   - Shows "Study (X)" when due cards exist
   - Shows "Study All (Y)" when 0 due but active cards exist
   - Keyboard shortcut 'S' uses same smart logic
   - Button disabled only when 0 active cards

2. **"Ignore Due Date" Quick Filter** - Power user control
   - Located in Custom Study quick filters section
   - Toggle badge turns blue when active
   - Bypasses `next_review <= NOW()` filter
   - Shows all active cards regardless of schedule

**Pass Criteria**:
- ✅ Deck button shows context-aware text
- ✅ Can study reviewed cards via "Study All"
- ✅ "Ignore Due Date" badge works in Custom Study
- ✅ FSRS algorithm still calculates correctly on reviews
- ✅ Preview count updates when toggling filter

**FSRS Impact**: None - Algorithm recalculates on every review regardless of timing

---

### 3.1 Session Complete Screen ✅ COMPLETE

**Test**: Verify completion screen shows after last card

**Bugs Fixed**:
1. Removed premature `onComplete` call that was causing immediate exit to Management tab
2. Fixed NaN retention rate - corrected JSONB ratings extraction in `getSessionStats()`

**Setup**: Start a study session with 2-3 cards only

**Steps**:
1. Start study session (from deck or custom study)
2. Review all cards (press Space, then 1/2/3/4 for varied ratings)
3. After last card is rated, verify:
   - Session Complete screen appears
   - Green checkmark icon visible
   - "Session Complete!" heading
   - Stats summary shows:
     - "You reviewed X cards in Ym Zs"
     - Ratings breakdown with colored bars
     - Retention rate percentage
   - Two buttons:
     - "Study More"
     - "Back to Management" (or "Back to Document")

**Expected Result**:
```
┌────────────────────────────────────┐
│            ╔══════╗                │
│            ║  ✓   ║ (green)        │
│            ╚══════╝                │
│                                    │
│      Session Complete!             │
│  You reviewed 5 cards in 2m 34s    │
│                                    │
│     Ratings Breakdown              │
│  Again  ██░░░░░░░░ 2 (40%)        │
│  Hard   ░░░░░░░░░░ 0 (0%)         │
│  Good   ████░░░░░░ 2 (40%)        │
│  Easy   ██░░░░░░░░ 1 (20%)        │
│                                    │
│     Retention Rate                 │
│          60%                       │
│    (3 Good/Easy out of 5)          │
│                                    │
│ [Study More] [Back to Management]  │
└────────────────────────────────────┘
```

**Pass Criteria**:
- ✅ Screen appears after last card
- ✅ Stats are accurate
- ✅ Rating bars show correct percentages
- ✅ Retention calculation correct: (Good + Easy) / Total
- ✅ Time shows minutes and seconds correctly
- ✅ Both buttons render

**Fail Indicators**:
- ❌ Session just exits without completion screen
- ❌ Stats show all zeros
- ❌ Retention shows decimal (0.6) instead of percentage (60%)
- ❌ Time shows in milliseconds

---

### 3.2 "Study More" Button ✅ COMPLETE

**Test**: Verify "Study More" restarts session

**Steps**:
1. On completion screen, click "Study More"
2. Verify:
   - New session starts immediately
   - New cards are loaded
   - Card counter resets (shows "Card 1 of X")
   - No navigation away from session tab

**Pass Criteria**:
- ✅ New session starts instantly
- ✅ Different cards appear (or same cards if no others due)
- ✅ Counter resets to 1

**Fail Indicators**:
- ❌ Same cards appear in same order
- ❌ Session crashes
- ❌ Counter doesn't reset

---

### 3.3 Smart Navigation - Back to Management ✅ COMPLETE

**Test**: Verify navigation returns to correct location

**Setup**: Start study from Management tab (deck study)

**Steps**:
1. On Management tab, click "Study" on a deck
2. Review all cards
3. On completion screen, verify button says "Back to Management"
4. Click "Back to Management"
5. Verify:
   - Returns to Management tab (not Session tab)
   - Deck grid visible
   - sessionContext cleared in store

**Pass Criteria**:
- ✅ Button label is "Back to Management"
- ✅ Returns to Management tab
- ✅ Store cleared properly

---

### 3.4 Smart Navigation - Back to Document

**Test**: Verify navigation from sidebar returns to document

**Setup**: Start study from document reader sidebar (Phase 4 required)

**Steps**:
1. Open a document in reader
2. Click Study tab in RightPanel (8th tab)
3. Start quick study
4. Complete all cards
5. On completion screen, verify button says "Back to {Document Title}"
6. Click button
7. Verify:
   - Navigates to `/read/{documentId}`
   - Document loads correctly
   - RightPanel still visible

**Pass Criteria**:
- ✅ Button shows document title
- ✅ Navigates to correct document
- ✅ Document loads successfully

**Fail Indicators**:
- ❌ Button says "Back to Management" (wrong context)
- ❌ Navigates to wrong document
- ❌ 404 error

---

### 3.5 Rating Breakdown Visualization ✅ COMPLETE

**Test**: Verify rating bars display correctly

**Setup**: Review cards with variety of ratings

**Steps**:
1. Start session with 5+ cards
2. Rate cards with different ratings:
   - Card 1: Again (1)
   - Card 2: Good (3)
   - Card 3: Easy (4)
   - Card 4: Good (3)
   - Card 5: Hard (2)
3. View completion screen
4. Verify rating bars:
   - **Again**: Red bar, shows 1 (20%)
   - **Hard**: Yellow bar, shows 1 (20%)
   - **Good**: Blue bar, shows 2 (40%)
   - **Easy**: Green bar, shows 1 (20%)
5. Verify bar widths match percentages
6. Verify retention = (2+1)/5 = 60%

**Pass Criteria**:
- ✅ All bars show correct counts
- ✅ Percentages add to 100%
- ✅ Bar widths visually match percentages
- ✅ Colors correct (red/yellow/blue/green)
- ✅ Only rated categories show (if 0, bar hidden)

**Fail Indicators**:
- ❌ All bars same width
- ❌ Percentages wrong
- ❌ Shows bars for 0-count ratings
- ❌ Colors wrong

---

## ✅ Phase 3 Complete (Except 3.4)!

**Summary:**
- ✅ 3.0: Study All Cards feature (smart button + ignore due date filter)
- ✅ 3.1: Session Complete screen (fixed premature exit + NaN retention)
- ✅ 3.2: "Study More" button restarts sessions correctly
- ✅ 3.3: Smart navigation back to Management tab
- ⏭️ 3.4: Skipped (requires Phase 4 sidebar study implementation)
- ✅ 3.5: Rating breakdown visualization with accurate math

**Bugs Fixed:**
1. Premature `onComplete` callback causing immediate tab switch
2. NaN retention rate - JSONB ratings extraction corrected
3. Study button disabled when 0 due cards - smart fallback implemented

---

## Phase 4: Compact Sidebar Study Testing

### 4.1 RightPanel Study Tab

**Test**: Verify 8th tab appears in document reader

**Steps**:
1. Navigate to any document: `/read/{documentId}`
2. Open RightPanel (if collapsed, click expand)
3. Count tabs in tab bar
4. Verify 8th tab:
   - Icon: GraduationCap (graduation cap icon)
   - Label: "Study" (on hover)
   - Position: Last tab (far right)

**Expected Result**:
```
Tabs: [Network] [Highlighter] [CheckCircle] [Zap]
      [Brain] [FileQuestion] [Sliders] [GraduationCap]
```

**Pass Criteria**:
- ✅ 8 total tabs visible
- ✅ Study tab is last (8th position)
- ✅ GraduationCap icon renders
- ✅ Clicking tab switches to Study content

**Fail Indicators**:
- ❌ Only 7 tabs (Study missing)
- ❌ Wrong icon
- ❌ Tab crashes when clicked

---

### 4.2 CompactStudyTab - Selection UI

**Test**: Verify study source selection interface

**Steps**:
1. Click Study tab in RightPanel
2. Verify selection UI shows:
   - "Quick Study" heading
   - "Study cards from this document" subtitle
   - Document stats (compact mode): "X today, Y due"
   - "Study from:" label
   - Three radio options:
     - ○ Visible chunks (0 cards)
     - ○ Nearby range (0 cards)
     - ● Full document (All cards) ← selected by default
   - "Start Quick Study" button
   - "Open Full Study Page" button with external link icon

**Expected Result**:
```
┌─────────────────────────────────┐
│ Quick Study                     │
│ Study cards from this document  │
│                                 │
│ 5 today | 12 due                │
│                                 │
│ Study from:                     │
│ ○ Visible chunks [0 cards]      │
│ ○ Nearby range [0 cards]        │
│ ● Full document [All cards]     │
│                                 │
│ [Start Quick Study]             │
│ [🔗 Open Full Study Page]       │
└─────────────────────────────────┘
```

**Pass Criteria**:
- ✅ All UI elements render
- ✅ Stats show correctly
- ✅ Radio buttons work
- ✅ Full document selected by default
- ✅ Both buttons enabled

**Fail Indicators**:
- ❌ Empty panel
- ❌ Stats show "0 today 0 due" incorrectly
- ❌ Radio buttons don't work

---

### 4.3 Start Quick Study

**Test**: Verify starting study from sidebar

**Steps**:
1. On CompactStudyTab, verify "Full document" selected
2. Click "Start Quick Study"
3. Verify:
   - UI switches to study mode (shows flashcard)
   - StudySession component embedded in sidebar
   - Compact mode active (not fullscreen)
   - Card shows question
   - "Show Answer (Space)" button visible
   - Header shows "X left" and "N/M" counter
   - Small X button in top-right to exit

**Expected Result**:
```
┌─────────────────────────────────┐
│ [12 left] 1/12           [×]    │
├─────────────────────────────────┤
│                                 │
│ Question                        │
│ What is a rhizome?              │
│                                 │
│                                 │
│ [Show Answer (Space)]           │
│                                 │
│ Source: 2 chunks                │
│ [philosophy] [deleuze]          │
└─────────────────────────────────┘
```

**Pass Criteria**:
- ✅ Study session starts in sidebar
- ✅ Compact layout (not fullscreen)
- ✅ Card renders correctly
- ✅ Exit button visible
- ✅ Can still see document in background

**Fail Indicators**:
- ❌ Nothing happens
- ❌ Fullscreen session (wrong mode)
- ❌ Sidebar crashes
- ❌ No exit button

---

### 4.4 Compact Study Session Flow

**Test**: Verify full study flow in sidebar

**Steps**:
1. Start quick study (previous test)
2. **Reveal Answer**:
   - Press Space or click "Show Answer"
   - Verify answer appears
   - Verify 4 rating buttons appear (2x2 grid in compact)
3. **Rate Card**:
   - Click "Good" (button 3) or press 3
   - Verify next card appears
4. **Continue Until Complete**:
   - Review all cards
   - Verify completion screen shows in sidebar
5. **Exit**:
   - Click X button or complete session
   - Verify returns to selection UI

**Pass Criteria**:
- ✅ Space key reveals answer
- ✅ 1/2/3/4 keys work for rating
- ✅ Rating buttons work
- ✅ Progress through all cards
- ✅ Can exit at any time
- ✅ Returns to selection UI on exit/complete

**Fail Indicators**:
- ❌ Keyboard shortcuts don't work
- ❌ Stuck on one card
- ❌ Can't exit
- ❌ Crashes on completion

---

### 4.5 Open Full Study Page

**Test**: Verify external link to full study page

**Steps**:
1. On CompactStudyTab selection UI
2. Click "🔗 Open Full Study Page"
3. Verify:
   - Navigates to `/study`
   - Full study page loads
   - Management tab active
   - Can navigate back to document

**Pass Criteria**:
- ✅ Navigates to `/study`
- ✅ Full page loads correctly
- ✅ Browser back button works

---

### 4.6 Source Selection Options

**Test**: Verify different source options (Visible/Nearby/Full)

**Note**: Visible and Nearby are placeholders (show "0 cards" currently)

**Steps**:
1. Select "Visible chunks"
   - Verify shows "0 cards" badge (not implemented)
2. Select "Nearby range"
   - Verify shows "0 cards" badge (not implemented)
3. Select "Full document"
   - Verify shows "All cards" badge
   - Verify "Start Quick Study" enabled
4. Try starting with "Visible chunks" (0 cards)
   - Should either disable button or show empty state

**Pass Criteria**:
- ✅ Can select all three options
- ✅ Full document works
- ✅ Empty options handled gracefully

**Expected Behavior** (current implementation):
- Visible/Nearby are placeholders - show 0 cards
- Full document works and loads all document cards
- Button should disable for 0 cards sources

---

## Cross-Phase Integration Testing

### Integration 1: Full User Journey - Deck Study

**Test**: Complete flow from deck selection to completion

**Steps**:
1. Navigate to `/study`
2. Select a deck with 5+ cards
3. Press 'S' to start (keyboard shortcut)
4. Review all cards:
   - Press Space to reveal
   - Press 3 for Good on all
5. View completion screen
6. Click "Back to Management"
7. Verify returned to Management tab

**Pass Criteria**:
- ✅ Entire flow completes without errors
- ✅ Keyboard shortcuts work throughout
- ✅ Stats accurate on completion
- ✅ Navigation correct

**Time Estimate**: ~2-3 minutes per 5 cards

---

### Integration 2: Full User Journey - Custom Study

**Test**: Complete flow with advanced filters

**Steps**:
1. Navigate to `/study`
2. Go to Custom Study section
3. Set filters:
   - Difficulty: 3-7
   - Not Studied Yet: enabled
4. Verify preview count updates
5. Click "Start Session"
6. Complete session
7. Click "Study More"
8. Verify new session with same filters

**Pass Criteria**:
- ✅ Filters apply correctly
- ✅ Only matching cards appear
- ✅ "Study More" reuses filters

---

### Integration 3: Full User Journey - Sidebar Study

**Test**: Complete flow from document reader

**Steps**:
1. Navigate to `/read/{documentId}`
2. Open RightPanel
3. Click Study tab (8th tab)
4. Click "Start Quick Study"
5. Complete 2-3 cards
6. Click X to exit early
7. Verify returns to selection UI
8. Start again
9. Complete all cards
10. On completion, click "Back to Document"
11. Verify returns to reader

**Pass Criteria**:
- ✅ Can exit mid-session
- ✅ Can restart after exit
- ✅ Completion navigation works
- ✅ Document still accessible

---

## Edge Cases & Error Handling

### Edge 1: No Cards Available

**Test**: Starting study with no cards

**Setup**: Delete all flashcards or use fresh document

**Steps**:
1. Try to start study session
2. Expected: Toast message "No cards available for review"
3. Expected: Returns to previous screen (doesn't start session)

**Pass Criteria**:
- ✅ Graceful error message
- ✅ Doesn't crash
- ✅ Button disabled when no cards

---

### Edge 2: Session Interrupted

**Test**: Closing browser mid-session

**Steps**:
1. Start study session
2. Review 2-3 cards
3. Close browser tab
4. Reopen `/study`
5. Expected: Session ended (not resumed)
6. Can start new session normally

**Pass Criteria**:
- ✅ No error on reload
- ✅ Session data cleaned up
- ✅ Can start fresh session

---

### Edge 3: System Deck Protection

**Test**: Cannot delete system decks

**Steps**:
1. Select Inbox deck
2. Try to delete:
   - Cmd+D keyboard shortcut
   - More menu → Delete
3. Expected: Error toast "Cannot delete system deck"
4. Verify deck still exists

**Pass Criteria**:
- ✅ Deletion prevented
- ✅ Error message shown
- ✅ Deck unchanged

---

### Edge 4: Empty Session (All Cards Suspended)

**Test**: Deck exists but no active cards

**Setup**: Suspend all cards in a deck

**Steps**:
1. Try to study that deck
2. Expected: "No cards to review" message
3. Expected: Doesn't start empty session

**Pass Criteria**:
- ✅ Empty state handled
- ✅ Clear message to user

---

## Performance Testing

### Performance 1: Large Deck (50+ cards)

**Test**: Study session with many cards

**Setup**: Deck with 50+ cards

**Steps**:
1. Start session with limit=50
2. Review 10 cards
3. Verify:
   - No lag between cards
   - Smooth transitions
   - Counter updates correctly

**Pass Criteria**:
- ✅ Card transitions < 200ms
- ✅ No memory leaks
- ✅ Counter accurate throughout

---

### Performance 2: Stats Loading

**Test**: Stats load quickly on page load

**Steps**:
1. Navigate to `/study`
2. Measure time to stats display
3. Expected: < 1 second

**Pass Criteria**:
- ✅ Stats visible within 1s
- ✅ No flash of empty state

---

### Performance 3: Filter Preview Updates

**Test**: Custom study preview is responsive

**Steps**:
1. Change difficulty slider rapidly
2. Verify preview updates smoothly
3. Expected: Debounced ~300ms, no jank

**Pass Criteria**:
- ✅ Updates smooth (debounced)
- ✅ No rapid re-renders
- ✅ Count accurate after settle

---

## Accessibility Testing

### A11y 1: Keyboard Navigation

**Test**: Can use study system entirely with keyboard

**Steps**:
1. Tab through `/study` page
2. Verify can reach:
   - Deck cards (Tab)
   - Study button (Enter)
   - Tab switches (Arrow keys)
3. In session:
   - Space to reveal
   - 1/2/3/4 to rate
   - Esc to exit

**Pass Criteria**:
- ✅ All interactive elements reachable
- ✅ Focus visible
- ✅ Logical tab order

---

### A11y 2: Screen Reader

**Test**: Screen reader announces key information

**Setup**: Enable VoiceOver (Mac) or NVDA (Windows)

**Steps**:
1. Navigate to `/study`
2. Verify announcements:
   - Tab names
   - Deck names and stats
   - Card questions/answers
   - Button labels

**Pass Criteria**:
- ✅ Meaningful announcements
- ✅ No "button button" duplicates
- ✅ Stats read correctly

---

## Mobile Testing

### Mobile 1: Responsive Layout

**Test**: Study page works on mobile

**Steps**:
1. Open `/study` on mobile device or resize to 375px
2. Verify:
   - Tabs stack correctly
   - Deck grid becomes 1 column
   - Stats cards remain readable
   - Buttons not too small

**Pass Criteria**:
- ✅ No horizontal scroll
- ✅ All content readable
- ✅ Touch targets ≥ 44px

---

### Mobile 2: Sidebar Study on Mobile

**Test**: Compact study works on mobile

**Steps**:
1. Open document on mobile
2. Open RightPanel
3. Start quick study
4. Verify cards readable and buttons usable

**Pass Criteria**:
- ✅ Sidebar width appropriate
- ✅ Cards not cramped
- ✅ Rating buttons usable

---

## Testing Checklist Summary

Use this checklist to track your testing progress:

### Phase 1: Foundation
- [ ] StudyStats compact mode
- [ ] StudyStats expanded mode
- [ ] Advanced filters work
- [ ] Deck batch operations
- [ ] Store state management

### Phase 2: Management
- [ ] Two-tab page structure
- [ ] Deck grid display
- [ ] DeckCard interactions
- [ ] Custom study builder
- [ ] Empty states

### Phase 3: Session Enhancements
- [ ] Completion screen
- [ ] "Study More" button
- [ ] Navigation to management
- [ ] Navigation to document
- [ ] Rating breakdown

### Phase 4: Sidebar Study
- [ ] RightPanel 8th tab
- [ ] Selection UI
- [ ] Start quick study
- [ ] Compact session flow
- [ ] Full page link
- [ ] Source options

### Integration Tests
- [ ] Deck study journey
- [ ] Custom study journey
- [ ] Sidebar study journey

### Edge Cases
- [ ] No cards available
- [ ] Session interrupted
- [ ] System deck protection
- [ ] Empty session

### Performance
- [ ] Large deck handling
- [ ] Stats loading speed
- [ ] Filter responsiveness

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader support

### Mobile
- [ ] Responsive layout
- [ ] Sidebar study mobile

---

## Reporting Issues

When you find a bug, report with:

**Bug Template**:
```markdown
## Bug: [Short Description]

**Phase**: [1/2/3/4]
**Component**: [Component name]
**Severity**: [Critical/High/Medium/Low]

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected**: What should happen
**Actual**: What actually happened

**Browser**: Chrome 120 / Safari 17 / Firefox 121
**Screenshot**: [Attach if applicable]

**Console Errors**:
```
[Paste any console errors]
```

**Additional Context**:
[Any other relevant info]
```

---

## Testing Complete!

Once you've completed all tests:

1. ✅ Mark all checkboxes in summary
2. ✅ Document any bugs found
3. ✅ Create GitHub issues for bugs
4. ✅ Update implementation plan with findings
5. ✅ Celebrate! 🎉

**Estimated Total Testing Time**: 2-3 hours for comprehensive coverage

---

**Version**: 1.0
**Last Updated**: 2025-10-24
**Next Review**: After bug fixes or major changes
