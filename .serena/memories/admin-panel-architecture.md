# Admin Panel Architecture Overview

## Created: 2025-10-13 (Session)

## Purpose
Centralized management interface for storage-first portability system. Provides visibility and control over document lifecycle across Storage and Database.

## UI Structure

### Sheet Component
- **Type**: shadcn Sheet (side="top")
- **Height**: 85vh
- **Trigger**: Database icon in TopNav OR Cmd+Shift+A
- **Location**: `src/components/admin/AdminPanel.tsx`

### 6 Tabs

#### 1. Scanner Tab
- **Purpose**: Compare Storage vs Database state
- **File**: `src/components/admin/tabs/ScannerTab.tsx`
- **Key Features**:
  - Auto-scan on mount (line 32-34)
  - Calls `scanStorage()` Server Action (line 40)
  - Summary statistics (6 metrics)
  - Filters: All, Missing from DB, Out of Sync, Healthy
  - Expandable rows showing Storage file details
  - Bulk actions: Import All, Sync All
- **State**: Local useState (lines 25-29)
  - `scanResults: DocumentScanResult[]`
  - `loading: boolean`
  - `error: string | null`
  - `filter: FilterType`
  - `expandedRows: Set<string>`

#### 2. Import Tab
- **Purpose**: Restore chunks from Storage to Database
- **File**: `src/components/admin/tabs/ImportTab.tsx`
- **Key Features**:
  - Auto-scan on mount (line 96: calls `scanStorage()`)
  - Document selection for import
  - Conflict resolution dialog
  - Import options: regenerateEmbeddings, reprocessConnections
  - Job progress tracking
- **State**: Local useState
  - Also calls `scanStorage()` → **DUPLICATE CALL** (Phase 2 fixes this)

#### 3. Export Tab
- **Purpose**: Download ZIP bundles with document files
- **File**: `src/components/admin/tabs/ExportTab.tsx`
- **Features**:
  - Multi-select documents
  - Export options: includeConnections, includeAnnotations
  - ZIP generation via background job

#### 4. Connections Tab
- **Purpose**: Reprocess connections with Smart Mode
- **File**: `src/components/admin/tabs/ConnectionsTab.tsx`
- **Features**:
  - 3 modes: Reprocess All, Add New, Smart Mode
  - Engine selection: Semantic, Contradiction, Thematic Bridge
  - Smart Mode preserves user-validated connections
  - Backup to Storage before deletion

#### 5. Integrations Tab
- **Purpose**: Obsidian and Readwise operations
- **File**: `src/components/admin/tabs/IntegrationsTab.tsx`
- **Features**:
  - Obsidian export/sync
  - Readwise import
  - Operation history display
- **Known Bug**: Job type naming mismatch
  - Creates: `'obsidian_export'` (snake_case)
  - ProcessingDock checks: `'obsidian-export'` (kebab-case)
  - Fix: Update ProcessingDock.tsx line 299

#### 6. Jobs Tab
- **Purpose**: Background job tracking
- **File**: `src/components/admin/tabs/JobsTab.tsx`
- **Features**:
  - Active job list with progress
  - Completed job history
  - Clear completed action

## Current Implementation Issues

### Duplicate API Calls
**Problem**: Scanner + Import tabs both call `scanStorage()` on mount
- ScannerTab: Line 40
- ImportTab: Line 96
- **Impact**: 2× API calls, 2× database queries
- **Fix**: Phase 2 Zustand refactor (useStorageScanStore with 5-min cache)

### Duplicate Polling Logic
**Problem**: Each tab implements own job polling
- ImportTab: Lines 74-89 (~30 lines)
- ConnectionsTab: Lines 108-148 (~40 lines)
- ExportTab: Lines 69-81 (~20 lines)
- **Total**: ~90 lines of duplication
- **Fix**: Phase 2 Zustand refactor (useBackgroundJobsStore)

### No State Persistence
**Problem**: Selections and preferences lost between sessions
- Document selections cleared when panel closes
- Import/Export options reset to defaults
- **Fix**: Phase 3 Zustand stores (useDocumentSelectionStore, useImportExportPrefsStore with localStorage)

## Server Actions

### scanStorage()
- **Location**: `src/app/actions/documents.ts`
- **Purpose**: Compare Storage vs Database for all documents
- **Returns**: `DocumentScanResult[]`
- **Fields**:
  - documentId, title, storageFiles[]
  - inDatabase, chunkCount
  - syncState: 'healthy' | 'missing_from_db' | 'missing_from_storage' | 'out_of_sync'
  - createdAt

### importFromStorage()
- **Purpose**: Restore chunks from Storage to Database
- **Conflict Detection**: Returns conflict if chunks exist
- **Strategies**: skip, replace, merge_smart
- **Creates**: background_jobs record with type='import_document'

### exportDocuments()
- **Purpose**: Generate ZIP bundle of document files
- **Options**: includeConnections, includeAnnotations
- **Creates**: background_jobs record with type='export_documents'

### reprocessConnections()
- **Purpose**: Regenerate connections with mode selection
- **Modes**: all, add_new, smart
- **Creates**: background_jobs record with type='reprocess_connections'

## Background Jobs Integration

### ProcessingDock
- **Location**: `src/components/layout/ProcessingDock.tsx`
- **Purpose**: Show active jobs in bottom dock
- **Polling**: Each job type has own display logic
- **Issue**: Doesn't recognize 'obsidian_export' (line 299, kebab-case check)

### Job Types
- `process_document` - Document processing pipeline
- `detect-connections` - Connection detection
- `import_document` - Import from Storage
- `export_documents` - ZIP bundle generation
- `reprocess_connections` - Connection reprocessing
- `obsidian_export` - Obsidian export (naming mismatch!)
- `obsidian_sync` - Obsidian sync (naming mismatch!)
- `readwise_import` - Readwise import

## Zustand Integration Plan (Phase 2-3)

### Phase 2: Core Stores
1. **useStorageScanStore** - Eliminate duplicate scanStorage() calls
   - 5-minute cache
   - Replace ScannerTab + ImportTab state
   
2. **useBackgroundJobsStore** - Unified job polling
   - Auto-start/stop based on active jobs
   - Replace polling in Import/Export/Connections tabs

### Phase 3: UX Stores
3. **useDocumentSelectionStore** - Cross-tab selections
4. **useImportExportPrefsStore** - Persistent preferences (localStorage)
5. **useAdminPanelStore** - Optional panel state

## File Locations

```
src/components/admin/
├── AdminPanel.tsx                    - Main Sheet component
├── ConflictResolutionDialog.tsx     - Import conflict UI
├── KeyboardShortcutsDialog.tsx      - Cmd+Shift+A help
└── tabs/
    ├── ScannerTab.tsx               - Storage vs DB comparison
    ├── ImportTab.tsx                - Restore from Storage
    ├── ExportTab.tsx                - ZIP bundle download
    ├── ConnectionsTab.tsx           - Connection reprocessing
    ├── IntegrationsTab.tsx          - Obsidian/Readwise
    ├── JobsTab.tsx                  - Background job tracking
    └── index.ts                     - Tab exports

src/stores/admin/                    - Zustand stores (Phase 1 complete)
├── storage-scan.ts                  - Cache store
├── background-jobs.ts               - Polling store
├── index.ts                         - Store exports
└── __tests__/
    └── storage-scan.test.ts         - Cache logic tests
```

## Testing

### Current Testing
- **Manual**: User opens panel, verifies functionality
- **Issues Found**: Network tab shows 2 scanStorage() calls

### Phase 2 Testing
- **Network tab**: Verify only 1 scanStorage() call
- **Redux DevTools**: Verify "StorageScan" instance visible
- **Console logs**: Verify `[StorageScan] Cache hit` messages
- **Manual checklist**: `docs/admin-panel-manual-testing.md`

## Dependencies

### UI Components (shadcn)
- Sheet, Tabs, Table, Button, Badge, Tooltip
- All standard shadcn patterns

### Actions
- `scanStorage`, `importFromStorage`, `exportDocuments`, `reprocessConnections`
- All in `src/app/actions/documents.ts`

### Supabase
- Storage API for file operations
- Database queries for chunk counts and sync state
- Background jobs table for long-running operations
