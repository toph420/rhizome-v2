# Zustand Refactor - Phase 3 Planning

**Status**: Planning
**Estimated Time**: 4-6 hours
**Priority**: Medium (nice-to-have, not critical)

---

## Overview

Phase 3 adds the remaining Zustand stores to complete the Admin Panel refactor. These stores handle cross-tab state, persistent user preferences, and panel UI state.

**Context**: Phase 1 (store creation) and Phase 2 (integration) are complete. The Admin Panel is now using Zustand for scan caching and job polling, reducing API calls by 50%.

**Phase 3 Goal**: Add stores for document selection, user preferences, and panel state to complete the Zustand migration.

---

## Stores to Build

### 1. `useDocumentSelectionStore` (Priority: HIGH)

**Purpose**: Share selected documents across Scanner, Import, and Export tabs

**Current Problem**: Each tab maintains its own `selectedDocs` state. If you select documents in Scanner tab, they're lost when you switch to Import tab.

**Benefits**:
- Select documents in Scanner → automatically selected in Import
- Bulk operations across tabs (select in Scanner, import in Import)
- Better UX: selections persist across tab switches

**State Shape**:
```typescript
interface DocumentSelectionStore {
  // State
  selectedDocuments: Set<string>           // Document IDs
  selectionMode: 'single' | 'multiple'     // Allow multi-select?

  // Actions
  selectDocument: (docId: string) => void
  deselectDocument: (docId: string) => void
  toggleDocument: (docId: string) => void
  selectAll: (docIds: string[]) => void
  clearSelection: () => void
  isSelected: (docId: string) => boolean
}
```

**Implementation Tasks**:
1. Create store with devtools
2. Add strategic console logging (`[DocumentSelection]`)
3. Write unit tests (5-7 tests)
4. Integrate into ScannerTab
5. Integrate into ImportTab
6. Integrate into ExportTab
7. Manual testing

**Estimated Time**: 2-3 hours

**Test Scenarios**:
- Select in Scanner → switch to Import → still selected ✓
- Select all → clear → none selected ✓
- Toggle mode (single vs multiple) ✓

---

### 2. `useImportExportPrefsStore` (Priority: MEDIUM)

**Purpose**: Remember user preferences for import/export operations (persist with localStorage)

**Current Problem**: User has to re-check "Regenerate Embeddings" and "Reprocess Connections" every time they import. Settings reset on page reload.

**Benefits**:
- Remember import options (regenerateEmbeddings, reprocessConnections)
- Remember export options (includeConnections, includeAnnotations)
- Remember connection reprocessing mode (smart/add_new/all)
- Persist across sessions (localStorage)

**State Shape**:
```typescript
interface ImportExportPrefsStore {
  // Import Preferences
  defaultRegenerateEmbeddings: boolean
  defaultReprocessConnections: boolean
  defaultImportStrategy: ConflictStrategy

  // Export Preferences
  defaultIncludeConnections: boolean
  defaultIncludeAnnotations: boolean
  defaultExportFormat: ExportFormat

  // Connection Reprocessing Preferences
  defaultReprocessMode: ReprocessMode
  defaultEngines: EngineType[]
  defaultPreserveValidated: boolean
  defaultBackupFirst: boolean

  // Actions
  setImportDefaults: (prefs: Partial<ImportPrefs>) => void
  setExportDefaults: (prefs: Partial<ExportPrefs>) => void
  setReprocessDefaults: (prefs: Partial<ReprocessPrefs>) => void
  resetToDefaults: () => void
}
```

**Implementation Tasks**:
1. Create store with persist middleware (localStorage)
2. Add strategic console logging (`[ImportExportPrefs]`)
3. Write unit tests (8-10 tests, including localStorage)
4. Integrate into ImportTab (default checkbox states)
5. Integrate into ExportTab (default options)
6. Integrate into ConnectionsTab (default reprocess settings)
7. Manual testing (verify persistence across page reload)

**Estimated Time**: 2-3 hours

**Test Scenarios**:
- Set preferences → reload page → preferences persisted ✓
- Reset to defaults → all settings back to initial values ✓
- Change mode → switch tabs → mode remembered ✓

---

### 3. `useAdminPanelStore` (Priority: LOW)

**Purpose**: Manage Admin Panel UI state (open/closed, active tab, keyboard shortcuts)

**Current Problem**: Admin Panel state is managed in `AdminPanelSheet.tsx` with local state. State is lost on unmount.

**Benefits**:
- Remember active tab across panel open/close
- Remember panel size/position (if we add resizing later)
- Keyboard shortcut state (Cmd+Shift+A handler)
- Could enable "minimized" panel state

**State Shape**:
```typescript
interface AdminPanelStore {
  // UI State
  isOpen: boolean
  activeTab: TabName
  lastOpenedAt: number | null

  // Actions
  open: () => void
  close: () => void
  toggle: () => void
  setActiveTab: (tab: TabName) => void

  // Keyboard shortcuts
  registerShortcut: (key: string, handler: () => void) => void
  unregisterShortcut: (key: string) => void
}

type TabName = 'scanner' | 'import' | 'export' | 'connections' | 'integrations' | 'jobs'
```

**Implementation Tasks**:
1. Create store with devtools
2. Add strategic console logging (`[AdminPanel]`)
3. Write unit tests (6-8 tests)
4. Integrate into AdminPanelSheet.tsx
5. Move Cmd+Shift+A handler to store
6. Manual testing

**Estimated Time**: 1-2 hours

**Note**: This is **optional**. The current local state approach works fine. Only implement if we want to add features like "remember last tab" or "minimized panel".

---

## Implementation Order

### Recommended Order (by value/effort):

1. **`useDocumentSelectionStore`** (HIGH priority, HIGH value)
   - Most impactful for UX
   - Enables cross-tab bulk operations
   - ~2-3 hours

2. **`useImportExportPrefsStore`** (MEDIUM priority, MEDIUM value)
   - Nice quality-of-life improvement
   - Saves repeated checkbox clicks
   - ~2-3 hours

3. **`useAdminPanelStore`** (LOW priority, LOW value)
   - Optional polish
   - Current approach works fine
   - ~1-2 hours

**Total Time**: 4-6 hours (if all 3 stores built)

---

## Testing Strategy

### Unit Tests (Same pattern as Phase 1)

**For each store**:
- Cache/persistence logic (if applicable)
- State mutations (set, toggle, clear)
- Edge cases (empty state, invalid inputs)
- localStorage integration (for prefs store)

**Location**: `src/stores/admin/__tests__/`

**Pattern**:
```typescript
describe('useDocumentSelectionStore', () => {
  it('selects a document', () => { /* ... */ })
  it('deselects a document', () => { /* ... */ })
  it('clears all selections', () => { /* ... */ })
})
```

### Manual Testing (Simple checklist)

**For DocumentSelection**:
1. Select documents in Scanner tab
2. Switch to Import tab
3. Verify selections persisted
4. Clear selections
5. Verify all tabs updated

**For ImportExportPrefs**:
1. Change import options
2. Reload page
3. Verify options persisted
4. Reset to defaults
5. Verify reset worked

**For AdminPanel** (optional):
1. Open panel with Cmd+Shift+A
2. Switch to different tab
3. Close panel
4. Reopen panel
5. Verify last tab restored

---

## Success Metrics

### Performance
- No additional API calls (stores are client-side only)
- localStorage reads: <1ms (negligible)

### Code Quality
- **Lines Added**: ~400 lines (stores + tests)
- **Lines Removed**: ~80 lines (duplicate selection state)
- **Net Change**: +320 lines

### Developer Experience
- ✅ Redux DevTools for all stores
- ✅ Strategic console logging
- ✅ TypeScript type safety
- ✅ Unit test coverage (>80%)

### User Experience
- ✅ Selections persist across tabs
- ✅ Preferences persist across sessions
- ✅ Fewer repeated clicks (checkbox defaults)

---

## Risks & Mitigation

### Risk 1: LocalStorage Quota
**Issue**: localStorage has 5-10MB limit per domain
**Impact**: Low (preferences are <1KB)
**Mitigation**: Monitor storage size, clear old preferences

### Risk 2: State Sync Issues
**Issue**: Multiple tabs could have conflicting state
**Impact**: Low (single-user tool, one tab at a time)
**Mitigation**: Use localStorage events for cross-tab sync (if needed)

### Risk 3: Complexity Creep
**Issue**: Adding too many stores increases maintenance
**Impact**: Medium
**Mitigation**: Only build stores with clear value (skip AdminPanel if not needed)

---

## Alternative Approaches

### Option 1: Use URL State (Query Params)
**Pros**:
- Shareable URLs with selections
- No localStorage needed
- Browser back/forward works

**Cons**:
- URL gets messy with many selections
- Harder to persist complex preferences
- More complex implementation

**Verdict**: ❌ Not recommended (overkill for admin panel)

### Option 2: Use React Context
**Pros**:
- Simpler than Zustand
- Built into React

**Cons**:
- No DevTools integration
- No persistence middleware
- Inconsistent with Phase 1/2 stores

**Verdict**: ❌ Not recommended (breaks consistency)

### Option 3: Keep Local State
**Pros**:
- Simple, works fine
- No additional dependencies

**Cons**:
- Selections don't persist across tabs
- Preferences reset on page reload

**Verdict**: ✅ Acceptable for AdminPanel store (lowest priority)

---

## Phase 3 Checklist

**Before Starting**:
- [ ] Review Phase 1/2 code patterns
- [ ] Decide which stores to build (all 3 or subset?)
- [ ] Set up testing environment

**For Each Store**:
- [ ] Create store file with devtools
- [ ] Add strategic console logging
- [ ] Write unit tests (>5 tests per store)
- [ ] Integrate into relevant tabs
- [ ] Manual testing (follow checklist)
- [ ] Update this document with results

**After All Stores**:
- [ ] Run full test suite (`npm test`)
- [ ] Type check (`npm run build`)
- [ ] Manual test all tabs
- [ ] Update documentation
- [ ] Create git commit

---

## Decision: Do We Need Phase 3?

### Arguments FOR Phase 3:
- ✅ Completes the Zustand migration (consistency)
- ✅ Better UX (cross-tab selections, persistent preferences)
- ✅ Quality-of-life improvements for frequent operations

### Arguments AGAINST Phase 3:
- ❌ Current approach works fine (local state is acceptable)
- ❌ Adds ~400 lines of code for minor UX gains
- ❌ 4-6 hours of work for "nice-to-have" features
- ❌ Admin Panel is a power-user tool (used infrequently)

### Recommendation: **Partial Phase 3**

**Build Only**:
1. ✅ `useDocumentSelectionStore` (HIGH value, enables bulk operations)
2. ❌ Skip `useImportExportPrefsStore` (LOW value, rarely used)
3. ❌ Skip `useAdminPanelStore` (NO value, current state works)

**Rationale**: Focus on high-impact features only. Document selection is the only store that provides significant UX improvement. The others are polish that doesn't justify the maintenance burden.

**Revised Estimate**: 2-3 hours (just DocumentSelection store)

---

## Next Steps

1. **Decide**: Build all 3 stores OR just DocumentSelection?
2. **Create branch**: `feature/zustand-phase3`
3. **Start with DocumentSelection**: Highest priority, clearest value
4. **Test thoroughly**: Manual testing checklist
5. **Ship or iterate**: Deploy DocumentSelection, evaluate if others are needed

---

**Phase 3 Status**: 📋 Planning complete, awaiting decision

**Decision Needed**: Build all 3 stores (4-6 hours) OR just DocumentSelection (2-3 hours)?

**Recommended**: Just DocumentSelection (best value/effort ratio)
