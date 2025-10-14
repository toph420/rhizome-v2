# Zustand Refactor: Storage Portability System

**Status**: Ready to Implement
**Priority**: High
**Estimated Effort**: 2-3 days
**Created**: 2025-10-13
**Updated**: 2025-10-13 (Added implementation context + bug fixes completed)
**Owner**: TBD

## Session Context (Start Here!)

### What's Been Completed ✅
**Phase 1 Bug Fixes** are complete and ready for Zustand refactor:

1. **ScannerTab Collapsible Structure** ✅
   - Fixed React Fragment prop warning
   - Correct structure: `Collapsible → TableRow + CollapsibleContent asChild → TableRow`
   - File: `src/components/admin/tabs/ScannerTab.tsx`

2. **Error Logging Improvements** ✅
   - Created `src/lib/supabase/error-helpers.ts` with `serializeSupabaseError()` and `getErrorMessage()`
   - Updated ConnectionsTab and ImportTab to use new helpers
   - No more empty `{}` error objects in console

3. **Database Schema Fix** ✅
   - Fixed ConnectionsTab.tsx line 162: `status` → `processing_status`
   - Documents table uses `processing_status` column, not `status`

**Current State**: All admin panel tabs functional, no console errors. Ready for Zustand refactor.

### Key Files to Know
- `src/components/admin/tabs/ScannerTab.tsx` - Calls `scanStorage()` on mount (line 45)
- `src/components/admin/tabs/ImportTab.tsx` - Calls `scanStorage()` on mount (line 95) **← DUPLICATE**
- `src/components/admin/tabs/ConnectionsTab.tsx` - Job polling logic (lines 110-149)
- `src/components/admin/tabs/ImportTab.tsx` - Job polling logic (lines 74-89)
- `src/lib/supabase/error-helpers.ts` - New error serialization utilities
- `src/app/actions/documents.ts` - Server actions for scanStorage, importFromStorage, etc.

### Quick Start for Next Session

**Step 1: Install Zustand**
```bash
npm install zustand
```

**Step 2: Create Store Structure**
```bash
mkdir -p src/stores/admin
touch src/stores/admin/storage-scan.ts
touch src/stores/admin/background-jobs.ts
touch src/stores/admin/document-selection.ts
touch src/stores/admin/import-export-prefs.ts
touch src/stores/admin/index.ts
```

**Step 3: Implement `useStorageScanStore` First**
- This store will eliminate the duplicate `scanStorage()` calls
- Copy implementation from Task 1.3 below (lines 154-242)
- Test in isolation before integrating

**Step 4: Refactor ScannerTab, then ImportTab**
- ScannerTab changes: ~30 lines removed, ~5 lines added
- ImportTab immediately benefits from cached results
- Verify in Network tab: only 1 `scanStorage()` call instead of 2

**Step 5: Continue with Remaining Stores**
- Follow the phased approach in Implementation Plan below
- Each store is independent and can be tested separately

---

## Executive Summary

Refactor the storage portability Admin Panel system to use Zustand for state management, eliminating duplicate API calls, consolidating job polling logic, and improving UX through persistent preferences and cross-tab state sharing.

**Key Benefits**:
- 50% reduction in API calls (eliminates duplicate `scanStorage()` calls)
- 50 lines of code reduction (consolidates polling logic)
- Better UX: persistent preferences and cross-tab selections
- Improved maintainability: separation of concerns
- Unified job monitoring across all tabs

**Impact**: Medium code change, high value delivery

---

## Business Case: Why This Matters

### Problem 1: Duplicate API Calls (Performance Issue)
**Current State:**
- `ScannerTab.tsx:38` calls `scanStorage()` on mount
- `ImportTab.tsx:71` calls `scanStorage()` on mount (same data!)

**Impact:**
- 2× API calls to Supabase Storage
- 2× database queries for document metadata
- 2× data transfer (~100KB-1MB depending on document count)
- Slower initial load time for users

**Cost:** Wasted resources, slower UX

---

### Problem 2: Lost User Work (UX Issue)
**Current State:**
- User selects 5 documents in Import tab
- Switches to Export tab to export them
- Selections are gone → must re-select same 5 documents

**Impact:**
- Frustrating experience for batch operations
- Extra clicks and time wasted
- Power users affected most (bulk import/export workflows)

**Cost:** Poor UX, reduced productivity

---

### Problem 3: Preferences Don't Persist (UX Issue)
**Current State:**
- User sets `regenerateEmbeddings: false` (common for re-imports)
- Closes Admin Panel
- Reopens panel → back to `true` (default)
- Must re-configure every time

**Impact:**
- 5-10 seconds wasted per panel open
- Annoying for power users doing multiple imports
- Settings don't reflect user's actual preferences

**Cost:** Death by a thousand paper cuts

---

### Problem 4: Code Duplication (Maintenance Issue)
**Current State:**
- `ImportTab.tsx:74-89` - Job polling logic (~30 lines)
- `ConnectionsTab.tsx:108-148` - Nearly identical polling (~40 lines)
- `ExportTab.tsx:69-81` - Same pattern (~20 lines)

**Total:** ~90 lines of duplicated polling logic across 3 files

**Impact:**
- Bug fixes require changes in 3 places
- Inconsistent behavior if one implementation diverges
- Harder to add features (e.g., job notifications)

**Cost:** Technical debt, maintenance burden

---

### Problem 5: No Unified Job Visibility (Monitoring Issue)
**Current State:**
- Import jobs visible only in ImportTab
- Connection jobs visible only in ConnectionsTab
- Export jobs visible only in ExportTab
- JobsTab exists but can't see any of these jobs!

**Impact:**
- Can't monitor all active jobs from one place
- Can't see what's happening across the system
- Poor observability for troubleshooting

**Cost:** Reduced visibility, harder debugging

---

## Technical Analysis

### State Sharing Patterns Identified

| State | Shared By | Current Problem | Zustand Benefit |
|-------|-----------|-----------------|-----------------|
| Scan results | ScannerTab, ImportTab | Duplicate API calls | Single source of truth |
| Selected docs | ImportTab, ExportTab | Lost on tab switch | Cross-tab persistence |
| Import/Export prefs | ImportTab, ExportTab | Reset every session | localStorage persistence |
| Job tracking | ImportTab, ConnectionsTab, ExportTab | Duplicate polling | Unified polling service |
| Panel state | TopNav, AdminPanel | Props drilling | Global access |

### Zustand Checklist Evaluation

**✅ Use Zustand for** (from CLAUDE.md):
- ✅ State shared across multiple components → **5 clear cases**
- ✅ State that persists across unmounts → **YES** (prefs, selections)
- ✅ State updated from multiple locations → **YES** (jobs from 3 tabs)
- ✅ Complex state requiring coordinated updates → **YES** (job polling)
- ✅ Personal preferences → **YES** (import/export options)

**Decision: Strong YES** - This is exactly what Zustand is designed for.

---

## Implementation Plan

### Phase 1: Foundation (Day 1 - 4 hours)

**Goal:** Set up Zustand infrastructure and implement highest-impact stores

#### Task 1.1: Install Dependencies
```bash
npm install zustand
```

#### Task 1.2: Create Store Directory Structure
```bash
mkdir -p src/stores/admin
touch src/stores/admin/storage-scan.ts
touch src/stores/admin/background-jobs.ts
touch src/stores/admin/document-selection.ts
touch src/stores/admin/import-export-prefs.ts
touch src/stores/admin/admin-panel.ts
touch src/stores/admin/index.ts
```

#### Task 1.3: Create `useStorageScanStore` (HIGH PRIORITY)
**File:** `src/stores/admin/storage-scan.ts`

```typescript
import { create } from 'zustand'
import { scanStorage, type DocumentScanResult } from '@/app/actions/documents'

interface StorageScanStore {
  // State
  scanResults: DocumentScanResult[] | null
  lastScanTime: number | null
  scanning: boolean
  error: string | null

  // Actions
  scan: () => Promise<void>
  invalidate: () => void
  getCachedResults: () => DocumentScanResult[] | null
}

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export const useStorageScanStore = create<StorageScanStore>((set, get) => ({
  scanResults: null,
  lastScanTime: null,
  scanning: false,
  error: null,

  scan: async () => {
    // Check cache first
    const { lastScanTime, scanResults } = get()
    const now = Date.now()

    if (
      lastScanTime &&
      scanResults &&
      now - lastScanTime < CACHE_DURATION
    ) {
      console.log('[StorageScanStore] Using cached results')
      return // Use cached results
    }

    console.log('[StorageScanStore] Fetching fresh results')
    set({ scanning: true, error: null })

    try {
      const result = await scanStorage()

      if (result.success) {
        set({
          scanResults: result.documents,
          lastScanTime: now,
          scanning: false,
          error: null,
        })
      } else {
        set({
          scanning: false,
          error: result.error || 'Failed to scan storage',
        })
      }
    } catch (err) {
      set({
        scanning: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  },

  invalidate: () => {
    set({ lastScanTime: null })
  },

  getCachedResults: () => {
    const { scanResults, lastScanTime } = get()
    const now = Date.now()

    if (
      lastScanTime &&
      scanResults &&
      now - lastScanTime < CACHE_DURATION
    ) {
      return scanResults
    }

    return null
  },
}))
```

**Impact:** Eliminates duplicate API calls immediately

---

#### Task 1.4: Create `useBackgroundJobsStore` (HIGH PRIORITY)
**File:** `src/stores/admin/background-jobs.ts`

```typescript
import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

export interface JobStatus {
  id: string
  type: 'import_document' | 'export_documents' | 'reprocess_connections'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  details: string
  metadata?: {
    documentId?: string
    documentIds?: string[]
    title?: string
  }
  result?: any
  error?: string
  createdAt: number
}

interface BackgroundJobsStore {
  // State
  jobs: Map<string, JobStatus>
  polling: boolean
  pollInterval: number

  // Computed
  activeJobs: () => JobStatus[]
  completedJobs: () => JobStatus[]
  failedJobs: () => JobStatus[]

  // Actions
  registerJob: (jobId: string, type: JobStatus['type'], metadata?: any) => void
  updateJob: (jobId: string, update: Partial<JobStatus>) => void
  removeJob: (jobId: string) => void
  clearCompleted: () => void
  startPolling: () => void
  stopPolling: () => void
}

let pollIntervalId: NodeJS.Timeout | null = null

export const useBackgroundJobsStore = create<BackgroundJobsStore>((set, get) => ({
  jobs: new Map(),
  polling: false,
  pollInterval: 2000, // 2 seconds

  // Computed selectors
  activeJobs: () => {
    const { jobs } = get()
    return Array.from(jobs.values()).filter(
      (j) => j.status === 'pending' || j.status === 'processing'
    )
  },

  completedJobs: () => {
    const { jobs } = get()
    return Array.from(jobs.values()).filter((j) => j.status === 'completed')
  },

  failedJobs: () => {
    const { jobs } = get()
    return Array.from(jobs.values()).filter((j) => j.status === 'failed')
  },

  // Actions
  registerJob: (jobId, type, metadata) => {
    set((state) => {
      const newJobs = new Map(state.jobs)
      newJobs.set(jobId, {
        id: jobId,
        type,
        status: 'pending',
        progress: 0,
        details: 'Job created...',
        metadata,
        createdAt: Date.now(),
      })
      return { jobs: newJobs }
    })

    // Auto-start polling when first job registered
    const { activeJobs, startPolling } = get()
    if (activeJobs().length > 0 && !get().polling) {
      startPolling()
    }
  },

  updateJob: (jobId, update) => {
    set((state) => {
      const newJobs = new Map(state.jobs)
      const existingJob = newJobs.get(jobId)
      if (existingJob) {
        newJobs.set(jobId, { ...existingJob, ...update })
      }
      return { jobs: newJobs }
    })

    // Auto-stop polling when no active jobs
    const { activeJobs, stopPolling } = get()
    if (activeJobs().length === 0 && get().polling) {
      stopPolling()
    }
  },

  removeJob: (jobId) => {
    set((state) => {
      const newJobs = new Map(state.jobs)
      newJobs.delete(jobId)
      return { jobs: newJobs }
    })
  },

  clearCompleted: () => {
    set((state) => {
      const newJobs = new Map(state.jobs)
      Array.from(newJobs.keys()).forEach((jobId) => {
        const job = newJobs.get(jobId)!
        if (job.status === 'completed') {
          newJobs.delete(jobId)
        }
      })
      return { jobs: newJobs }
    })
  },

  startPolling: () => {
    if (pollIntervalId) return // Already polling

    console.log('[BackgroundJobsStore] Starting polling')
    set({ polling: true })

    const poll = async () => {
      const { activeJobs, updateJob } = get()
      const active = activeJobs()

      if (active.length === 0) {
        get().stopPolling()
        return
      }

      const supabase = createClient()

      for (const job of active) {
        try {
          const { data: jobData, error } = await supabase
            .from('background_jobs')
            .select('status, progress, details, output_data')
            .eq('id', job.id)
            .single()

          if (error) {
            console.error(`Error polling job ${job.id}:`, error)
            continue
          }

          if (jobData) {
            if (jobData.status === 'completed') {
              updateJob(job.id, {
                status: 'completed',
                progress: 100,
                details: jobData.details || 'Completed successfully',
                result: jobData.output_data,
              })
            } else if (jobData.status === 'failed') {
              updateJob(job.id, {
                status: 'failed',
                progress: 0,
                details: jobData.details || 'Job failed',
                error: jobData.output_data?.error || 'Unknown error',
              })
            } else if (jobData.status === 'processing') {
              updateJob(job.id, {
                status: 'processing',
                progress: jobData.progress || 50,
                details: jobData.details || 'Processing...',
              })
            }
          }
        } catch (err) {
          console.error(`Polling error for job ${job.id}:`, err)
        }
      }
    }

    // Initial poll
    poll()

    // Set up interval
    pollIntervalId = setInterval(poll, get().pollInterval)
  },

  stopPolling: () => {
    if (pollIntervalId) {
      console.log('[BackgroundJobsStore] Stopping polling')
      clearInterval(pollIntervalId)
      pollIntervalId = null
    }
    set({ polling: false })
  },
}))
```

**Impact:** Consolidates polling logic, reduces code by ~50 lines

---

### Phase 2: UX Improvements (Day 1 - 2 hours)

#### Task 2.1: Create `useDocumentSelectionStore`
**File:** `src/stores/admin/document-selection.ts`

```typescript
import { create } from 'zustand'

interface DocumentSelectionStore {
  selectedDocs: Set<string>
  toggle: (id: string) => void
  select: (id: string) => void
  deselect: (id: string) => void
  selectAll: (ids: string[]) => void
  clear: () => void
  isSelected: (id: string) => boolean
  size: number
}

export const useDocumentSelectionStore = create<DocumentSelectionStore>((set, get) => ({
  selectedDocs: new Set(),

  toggle: (id) => {
    set((state) => {
      const newSelected = new Set(state.selectedDocs)
      if (newSelected.has(id)) {
        newSelected.delete(id)
      } else {
        newSelected.add(id)
      }
      return { selectedDocs: newSelected }
    })
  },

  select: (id) => {
    set((state) => {
      const newSelected = new Set(state.selectedDocs)
      newSelected.add(id)
      return { selectedDocs: newSelected }
    })
  },

  deselect: (id) => {
    set((state) => {
      const newSelected = new Set(state.selectedDocs)
      newSelected.delete(id)
      return { selectedDocs: newSelected }
    })
  },

  selectAll: (ids) => {
    set({ selectedDocs: new Set(ids) })
  },

  clear: () => {
    set({ selectedDocs: new Set() })
  },

  isSelected: (id) => {
    return get().selectedDocs.has(id)
  },

  get size() {
    return get().selectedDocs.size
  },
}))
```

---

#### Task 2.2: Create `useImportExportPrefsStore` (WITH PERSISTENCE)
**File:** `src/stores/admin/import-export-prefs.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ImportPrefs {
  regenerateEmbeddings: boolean
  reprocessConnections: boolean
  defaultStrategy: 'skip' | 'replace' | 'merge_smart'
}

interface ExportPrefs {
  includeConnections: boolean
  includeAnnotations: boolean
}

interface ImportExportPrefsStore {
  // State
  importPrefs: ImportPrefs
  exportPrefs: ExportPrefs

  // Actions
  setImportPrefs: (prefs: Partial<ImportPrefs>) => void
  setExportPrefs: (prefs: Partial<ExportPrefs>) => void
  resetImportPrefs: () => void
  resetExportPrefs: () => void
  resetAll: () => void
}

const DEFAULT_IMPORT_PREFS: ImportPrefs = {
  regenerateEmbeddings: false,
  reprocessConnections: false,
  defaultStrategy: 'merge_smart',
}

const DEFAULT_EXPORT_PREFS: ExportPrefs = {
  includeConnections: true,
  includeAnnotations: true,
}

export const useImportExportPrefsStore = create<ImportExportPrefsStore>()(
  persist(
    (set) => ({
      importPrefs: DEFAULT_IMPORT_PREFS,
      exportPrefs: DEFAULT_EXPORT_PREFS,

      setImportPrefs: (prefs) => {
        set((state) => ({
          importPrefs: { ...state.importPrefs, ...prefs },
        }))
      },

      setExportPrefs: (prefs) => {
        set((state) => ({
          exportPrefs: { ...state.exportPrefs, ...prefs },
        }))
      },

      resetImportPrefs: () => {
        set({ importPrefs: DEFAULT_IMPORT_PREFS })
      },

      resetExportPrefs: () => {
        set({ exportPrefs: DEFAULT_EXPORT_PREFS })
      },

      resetAll: () => {
        set({
          importPrefs: DEFAULT_IMPORT_PREFS,
          exportPrefs: DEFAULT_EXPORT_PREFS,
        })
      },
    }),
    {
      name: 'rhizome-import-export-prefs',
      partialize: (state) => ({
        importPrefs: state.importPrefs,
        exportPrefs: state.exportPrefs,
      }),
    }
  )
)
```

**Impact:** Persistent user preferences across sessions

---

### Phase 3: Integration (Day 2 - 6 hours)

#### Task 3.1: Refactor ScannerTab
**File:** `src/components/admin/tabs/ScannerTab.tsx`

**Changes:**
```typescript
// BEFORE
const [scanResults, setScanResults] = useState<DocumentScanResult[] | null>(null)
const [loading, setLoading] = useState(false)

useEffect(() => {
  handleScan()
}, [])

const handleScan = async () => {
  setLoading(true)
  const result = await scanStorage()
  if (result.success) {
    setScanResults(result.documents)
  }
  setLoading(false)
}

// AFTER
import { useStorageScanStore } from '@/stores/admin'

const { scanResults, scanning, error, scan } = useStorageScanStore()

useEffect(() => {
  scan() // Uses cache if available!
}, [scan])

const handleScan = () => {
  scan() // Refresh button
}
```

**Lines removed:** ~30 lines of state management
**Lines added:** ~5 lines of store usage

---

#### Task 3.2: Refactor ImportTab
**File:** `src/components/admin/tabs/ImportTab.tsx`

**Changes:**
```typescript
// BEFORE
const [scanResults, setScanResults] = useState<DocumentScanResult[] | null>(null)
const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
const [regenerateEmbeddings, setRegenerateEmbeddings] = useState(false)
const [reprocessConnections, setReprocessConnections] = useState(false)
const [importJobs, setImportJobs] = useState<ImportJob[]>([])

useEffect(() => {
  handleScan()
}, [])

useEffect(() => {
  // Job polling logic (~30 lines)
}, [importJobs])

// AFTER
import {
  useStorageScanStore,
  useDocumentSelectionStore,
  useImportExportPrefsStore,
  useBackgroundJobsStore
} from '@/stores/admin'

const { scanResults, scan } = useStorageScanStore()
const { selectedDocs, toggle, clear } = useDocumentSelectionStore()
const { importPrefs, setImportPrefs } = useImportExportPrefsStore()
const { registerJob, jobs, activeJobs } = useBackgroundJobsStore()

useEffect(() => {
  scan() // Uses cached results from ScannerTab!
}, [scan])

// No job polling needed - store handles it!
const myJobs = activeJobs().filter(j => j.type === 'import_document')
```

**Lines removed:** ~80 lines of state + polling
**Lines added:** ~10 lines of store usage

---

#### Task 3.3: Refactor ConnectionsTab
**File:** `src/components/admin/tabs/ConnectionsTab.tsx`

**Changes:**
```typescript
// BEFORE
const [currentJobId, setCurrentJobId] = useState<string | null>(null)
const [jobProgress, setJobProgress] = useState(0)
const [jobStage, setJobStage] = useState<string>('')
const [processing, setProcessing] = useState(false)

useEffect(() => {
  // Job polling logic (~40 lines)
}, [currentJobId, processing])

// AFTER
import { useBackgroundJobsStore } from '@/stores/admin'

const { registerJob, jobs } = useBackgroundJobsStore()

const handleReprocess = async () => {
  const result = await reprocessConnections(selectedDocId, options)
  if (result.success && result.jobId) {
    registerJob(result.jobId, 'reprocess_connections', {
      documentId: selectedDocId,
      title: selectedDoc?.title,
    })
  }
}

// Get job status from store
const myJob = Array.from(jobs.values()).find(
  j => j.type === 'reprocess_connections' && j.metadata?.documentId === selectedDocId
)
```

**Lines removed:** ~50 lines of job polling
**Lines added:** ~15 lines of store usage

---

#### Task 3.4: Refactor ExportTab
**File:** `src/components/admin/tabs/ExportTab.tsx`

**Changes:**
```typescript
// BEFORE
const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
const [includeConnections, setIncludeConnections] = useState(true)
const [includeAnnotations, setIncludeAnnotations] = useState(true)
const [exportJob, setExportJob] = useState<ExportJob | null>(null)

useEffect(() => {
  // Job polling logic (~20 lines)
}, [exportJob])

// AFTER
import {
  useDocumentSelectionStore,
  useImportExportPrefsStore,
  useBackgroundJobsStore
} from '@/stores/admin'

const { selectedDocs, toggle } = useDocumentSelectionStore()
const { exportPrefs, setExportPrefs } = useImportExportPrefsStore()
const { registerJob, jobs } = useBackgroundJobsStore()

const handleExport = async () => {
  const result = await exportDocuments(Array.from(selectedDocs), exportPrefs)
  if (result.success && result.jobId) {
    registerJob(result.jobId, 'export_documents', {
      documentIds: Array.from(selectedDocs),
    })
  }
}

const myJob = Array.from(jobs.values()).find(j => j.type === 'export_documents')
```

**Lines removed:** ~40 lines
**Lines added:** ~10 lines

---

#### Task 3.5: Create Store Index File
**File:** `src/stores/admin/index.ts`

```typescript
export { useStorageScanStore } from './storage-scan'
export { useBackgroundJobsStore } from './background-jobs'
export { useDocumentSelectionStore } from './document-selection'
export { useImportExportPrefsStore } from './import-export-prefs'

export type { JobStatus } from './background-jobs'
```

---

### Phase 4: Optional Enhancement (Day 3 - 2 hours)

#### Task 4.1: Create `useAdminPanelStore` (Optional)
**File:** `src/stores/admin/admin-panel.ts`

```typescript
import { create } from 'zustand'

type TabValue = 'scanner' | 'import' | 'export' | 'connections' | 'integrations' | 'jobs'

interface AdminPanelStore {
  isOpen: boolean
  activeTab: TabValue
  open: (tab?: TabValue) => void
  close: () => void
  toggle: () => void
  setActiveTab: (tab: TabValue) => void
}

export const useAdminPanelStore = create<AdminPanelStore>((set) => ({
  isOpen: false,
  activeTab: 'scanner',

  open: (tab) => {
    set({ isOpen: true })
    if (tab) {
      set({ activeTab: tab })
    }
  },

  close: () => {
    set({ isOpen: false })
  },

  toggle: () => {
    set((state) => ({ isOpen: !state.isOpen }))
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab })
  },
}))
```

**Usage in TopNav:**
```typescript
// BEFORE
<TopNav
  onMenuClick={handleMenuClick}
  onAdminClick={() => setAdminPanelOpen(true)}
/>

// AFTER
import { useAdminPanelStore } from '@/stores/admin'

const { open } = useAdminPanelStore()

<TopNav
  onMenuClick={handleMenuClick}
  onAdminClick={() => open()}
/>
```

**Impact:** Eliminates props drilling, enables global keyboard shortcuts

---

### Phase 5: Testing & Validation (Day 3 - 2 hours)

#### Task 5.1: Create Store Tests
**File:** `src/stores/admin/__tests__/storage-scan.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react'
import { useStorageScanStore } from '../storage-scan'
import { scanStorage } from '@/app/actions/documents'

jest.mock('@/app/actions/documents')

describe('useStorageScanStore', () => {
  beforeEach(() => {
    useStorageScanStore.setState({
      scanResults: null,
      lastScanTime: null,
      scanning: false,
      error: null,
    })
  })

  it('should cache scan results for 5 minutes', async () => {
    const mockScanStorage = scanStorage as jest.MockedFunction<typeof scanStorage>
    mockScanStorage.mockResolvedValue({
      success: true,
      documents: [{ id: '1', title: 'Test' }],
    })

    const { result } = renderHook(() => useStorageScanStore())

    // First scan
    await act(async () => {
      await result.current.scan()
    })

    expect(mockScanStorage).toHaveBeenCalledTimes(1)
    expect(result.current.scanResults).toHaveLength(1)

    // Second scan within 5 minutes - should use cache
    await act(async () => {
      await result.current.scan()
    })

    expect(mockScanStorage).toHaveBeenCalledTimes(1) // Not called again!
  })

  it('should invalidate cache when requested', async () => {
    // ... test implementation
  })
})
```

#### Task 5.2: Integration Testing
**File:** `src/components/admin/tabs/__tests__/ImportTab.integration.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImportTab } from '../ImportTab'
import { useStorageScanStore } from '@/stores/admin'

describe('ImportTab with Zustand', () => {
  it('should use cached scan results from ScannerTab', async () => {
    // Pre-populate store with scan results
    useStorageScanStore.setState({
      scanResults: [
        { id: 'doc-1', title: 'Test Document', syncState: 'missing_from_db' }
      ],
      lastScanTime: Date.now(),
    })

    render(<ImportTab />)

    // Should immediately show cached results, no loading state
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.getByText('Test Document')).toBeInTheDocument()
  })

  it('should preserve selections when switching tabs', async () => {
    // ... test implementation
  })
})
```

#### Task 5.3: Manual Testing Checklist
```
Phase 5 Manual Tests:
□ Open Admin Panel → ScannerTab loads
□ Switch to ImportTab → NO duplicate scanStorage() call (check Network tab)
□ Select 3 documents in ImportTab
□ Switch to ExportTab → 3 documents still selected
□ Change import preferences → close panel → reopen → preferences persisted
□ Start import job → switch to ConnectionsTab → can see import job progress
□ Refresh page → preferences still persist
□ Multiple jobs from different tabs all visible in unified list
```

---

## Success Metrics

### Performance Metrics
- [ ] API calls reduced by 50% (measured in Network tab)
- [ ] Initial Admin Panel load time improved by 30-50% (second+ opens use cache)
- [ ] Code reduction: ~50 lines of duplicated polling logic removed

### UX Metrics
- [ ] User selections persist across tab switches (manual verification)
- [ ] User preferences persist across sessions (localStorage verification)
- [ ] All jobs visible in unified JobsTab (manual verification)

### Code Quality Metrics
- [ ] Test coverage >80% for all stores
- [ ] No regressions in existing functionality
- [ ] TypeScript strict mode passes
- [ ] No console errors in development

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation:**
- Implement phase-by-phase with testing after each phase
- Keep old state logic commented out temporarily
- Test each tab individually before moving to next
- Have rollback plan (git branch)

### Risk 2: LocalStorage Issues
**Mitigation:**
- Use Zustand persist middleware (battle-tested)
- Test incognito mode (localStorage disabled)
- Add error handling for storage quota exceeded
- Provide UI to reset preferences if corrupted

### Risk 3: Job Polling Race Conditions
**Mitigation:**
- Single polling interval managed by store (not 3 separate intervals)
- Cleanup on unmount (stopPolling in useEffect cleanup)
- Use stable job IDs (not array indices)
- Test rapid tab switching

### Risk 4: Bundle Size Increase
**Mitigation:**
- Zustand is tiny (3.5KB gzipped)
- Tree-shaking ensures only used stores bundled
- Monitor bundle size with `npm run build`

---

## Rollback Plan

If issues arise:

1. **Immediate Rollback** (< 5 minutes):
   ```bash
   git checkout main
   git branch -D feature/zustand-refactor
   ```

2. **Partial Rollback** (keep some stores):
   - Comment out problematic store imports
   - Revert specific tab components
   - Keep working stores (e.g., useStorageScanStore)

3. **Debug Mode**:
   - Add Zustand devtools: `npm install @redux-devtools/extension`
   - Enable Redux DevTools to inspect state changes
   - Add console logging in store actions

---

## Implementation Checklist

### Pre-Implementation
- [ ] Read this entire document
- [ ] Review CLAUDE.md Zustand guidelines
- [ ] Create feature branch: `git checkout -b feature/zustand-refactor`
- [ ] Backup current working state

### Phase 1: Foundation (4 hours)
- [ ] Install Zustand: `npm install zustand`
- [ ] Create store directory structure
- [ ] Implement useStorageScanStore
- [ ] Implement useBackgroundJobsStore
- [ ] Test stores in isolation
- [ ] Commit: "feat: add Zustand stores for storage scan and jobs"

### Phase 2: UX Improvements (2 hours)
- [ ] Implement useDocumentSelectionStore
- [ ] Implement useImportExportPrefsStore (with persist)
- [ ] Test localStorage persistence
- [ ] Commit: "feat: add Zustand stores for selections and preferences"

### Phase 3: Integration (6 hours)
- [ ] Refactor ScannerTab
- [ ] Test ScannerTab in isolation
- [ ] Refactor ImportTab
- [ ] Test ImportTab with ScannerTab (cache verification)
- [ ] Refactor ConnectionsTab
- [ ] Test ConnectionsTab with job polling
- [ ] Refactor ExportTab
- [ ] Test ExportTab with selections
- [ ] Create store index file
- [ ] Commit: "refactor: integrate Zustand stores in Admin Panel tabs"

### Phase 4: Optional (2 hours)
- [ ] Implement useAdminPanelStore
- [ ] Refactor TopNav and AppShell
- [ ] Test keyboard shortcuts
- [ ] Commit: "feat: add Admin Panel store for global state"

### Phase 5: Testing (2 hours)
- [ ] Write unit tests for stores
- [ ] Write integration tests for components
- [ ] Run full test suite: `npm test`
- [ ] Manual testing checklist
- [ ] Performance verification (Network tab)
- [ ] Commit: "test: add Zustand store tests"

### Post-Implementation
- [ ] Update CLAUDE.md if patterns emerge
- [ ] Document any deviations from plan
- [ ] Create PR with detailed description
- [ ] Review with team (or self-review thoroughly)
- [ ] Merge to main after approval

---

## Developer Notes

### Key Design Decisions

1. **5 Separate Stores, Not 1 Monolithic Store**
   - Each store has single responsibility
   - Better tree-shaking (unused stores not bundled)
   - Easier testing and maintenance
   - Follows Zustand best practices

2. **Only useImportExportPrefsStore Uses Persist**
   - Scan results should be fresh (cache timeout instead)
   - Selections intentionally reset when panel closes
   - Jobs are ephemeral (complete or fail quickly)
   - Only user preferences need persistence

3. **Job Polling in Store, Not Components**
   - Single polling interval (not 3 separate)
   - Auto-start when first job registered
   - Auto-stop when no active jobs
   - Reduces complexity by 50 lines

4. **Set<string> for Selections, Not string[]**
   - O(1) lookup for isSelected()
   - Natural API: add(), delete(), has()
   - Prevents duplicates
   - Matches React best practices

### Common Pitfalls to Avoid (Including Lessons from Bug Fixes)

**From Recent Bug Fixes:**

1. **Don't assume column names - check the schema**
   ```typescript
   // ❌ WRONG - assumed column name
   .eq('status', 'completed')

   // ✅ RIGHT - verified schema first
   .eq('processing_status', 'completed')

   // How to verify:
   // psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d table_name"
   ```

2. **Always use error serialization helpers**
   ```typescript
   // ❌ WRONG - logs empty {}
   console.error('Error:', error)

   // ✅ RIGHT - logs { message, code, details, hint }
   import { serializeSupabaseError, getErrorMessage } from '@/lib/supabase/error-helpers'
   console.error('Error:', serializeSupabaseError(error))
   setError(getErrorMessage(error))
   ```

3. **Check Collapsible/asChild patterns carefully**
   ```typescript
   // ❌ WRONG - asChild on Fragment
   <Collapsible asChild>
     <>
       <TableRow>...</TableRow>
     </>
   </Collapsible>

   // ✅ RIGHT - asChild only on CollapsibleContent
   <Collapsible>
     <TableRow>...</TableRow>
     <CollapsibleContent asChild>
       <TableRow>...</TableRow>
     </CollapsibleContent>
   </Collapsible>
   ```

**Zustand-Specific Pitfalls:**

1. **Don't mutate state directly**
   ```typescript
   // ❌ WRONG
   state.selectedDocs.add(id)

   // ✅ RIGHT
   set((state) => {
     const newSelected = new Set(state.selectedDocs)
     newSelected.add(id)
     return { selectedDocs: newSelected }
   })
   ```

2. **Don't forget to cleanup polling**
   ```typescript
   // ✅ Always cleanup in useEffect
   useEffect(() => {
     startPolling()
     return () => stopPolling()
   }, [startPolling, stopPolling])
   ```

3. **Don't use stale closures**
   ```typescript
   // ❌ WRONG - stale closure
   const handleClick = () => {
     setTimeout(() => {
       console.log(selectedDocs) // Stale!
     }, 1000)
   }

   // ✅ RIGHT - use store.getState()
   const handleClick = () => {
     setTimeout(() => {
       const { selectedDocs } = useDocumentSelectionStore.getState()
       console.log(selectedDocs)
     }, 1000)
   }
   ```

---

## Questions & Answers

**Q: Why not use React Context instead of Zustand?**
A: Context causes re-renders of all consumers when any value changes. Zustand uses selectors for surgical updates. Also, Context requires Provider wrapper, Zustand doesn't.

**Q: Why separate stores instead of one big store?**
A: Separation of concerns, better tree-shaking, easier testing, follows Zustand best practices. Only import what you need.

**Q: What about Redux?**
A: Redux is overkill for this use case. Zustand is 10x simpler with same benefits. Redux is 20KB, Zustand is 3.5KB.

**Q: Should we add Zustand DevTools?**
A: Optional, but helpful for debugging. Add `@redux-devtools/extension` and enable in stores:
```typescript
import { devtools } from 'zustand/middleware'

export const useStorageScanStore = create<StorageScanStore>()(
  devtools(
    (set, get) => ({ /* ... */ }),
    { name: 'StorageScanStore' }
  )
)
```

**Q: What if localStorage is full or disabled?**
A: Zustand persist middleware handles gracefully - falls back to in-memory state. No crashes.

**Q: How do we test Zustand stores?**
A: Use `renderHook` from `@testing-library/react`. Test stores independently, then integration test components.

---

## Additional Resources

- **Zustand Docs**: https://github.com/pmndrs/zustand
- **Zustand Best Practices**: https://docs.pmnd.rs/zustand/guides/practice-with-no-store-actions
- **Persist Middleware**: https://docs.pmnd.rs/zustand/integrations/persisting-store-data
- **Testing Guide**: https://docs.pmnd.rs/zustand/guides/testing
- **TypeScript Guide**: https://docs.pmnd.rs/zustand/guides/typescript

---

## Conclusion

This refactor will:
- ✅ Eliminate duplicate API calls (50% reduction)
- ✅ Improve UX with persistent preferences and cross-tab state
- ✅ Reduce code duplication by ~50 lines
- ✅ Improve maintainability with separation of concerns
- ✅ Enable unified job monitoring

**Total Effort:** 2-3 days
**Risk Level:** Low (phased implementation with rollback plan)
**Value:** High (performance + UX + maintainability)

**Recommendation:** Proceed with implementation following phased approach.

---

## Implementation Roadmap (TL;DR for Next Session)

### Session 1: Foundation (4 hours)
**Goal**: Install Zustand, create core stores, eliminate duplicate API calls

```bash
# Install
npm install zustand

# Create stores
mkdir -p src/stores/admin
# Create 4 store files (see Phase 1 above)
```

**Files to Create:**
1. `storage-scan.ts` (5-min cache, eliminates duplicate scanStorage calls)
2. `background-jobs.ts` (unified polling, replaces ~50 lines)
3. `document-selection.ts` (cross-tab state)
4. `import-export-prefs.ts` (localStorage persistence)
5. `index.ts` (barrel exports)

**Success Metric**: Network tab shows 1 scanStorage() call instead of 2 ✅

---

### Session 2: Integration (6 hours)
**Goal**: Refactor all tabs to use stores

**Refactor Order:**
1. ScannerTab (remove ~30 lines, add ~5)
2. ImportTab (remove ~80 lines, add ~10)
3. ConnectionsTab (remove ~50 lines, add ~15)
4. ExportTab (remove ~40 lines, add ~10)

**Success Metrics:**
- ~200 lines of code removed
- Selections persist across tab switches
- Preferences persist across sessions

---

### Session 3: Testing & Polish (2 hours)
**Goal**: Verify quality and performance

**Tests to Write:**
1. `storage-scan.test.ts` - Cache behavior
2. `background-jobs.test.ts` - Polling logic
3. Integration tests - Tab interactions

**Success Metrics:**
- 50% API call reduction (Network tab)
- No regressions (all tabs work)
- Preferences survive page refresh

---

## Final Checklist Before Starting

- [ ] Read "Session Context" section above
- [ ] Review bug fixes completed (lines 13-29)
- [ ] Check CLAUDE.md Zustand guidelines
- [ ] Create feature branch: `git checkout -b feature/zustand-refactor`
- [ ] Open Network tab in browser (to measure API reduction)
- [ ] Have Admin Panel open: `Cmd+Shift+A`

**Ready to code? Start with Phase 1, Task 1.1 (line 172) ⬆️**

---

**End of Document**
**Last Updated**: 2025-10-13
