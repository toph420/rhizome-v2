Analysis: File-Over-App Requires Version Tracking

  You've identified a gap in the current design. Let me analyze whether fuzzy matching should
   extend to all markdown files now or later.

  ★ Insight ─────────────────────────────────────
  Two Distinct Fuzzy Matching Use Cases:
  1. YouTube (T14): Map cleaned chunks → original source (timestamps)
  2. Markdown (Future): Map new chunks → old chunks (annotation survival)
  3. PDF/Web: Not needed (immutable after extraction)
  ─────────────────────────────────────────────────

  ---
  Use Case Analysis

  YouTube Timestamps (Current T14)

  Problem: Extract timestamps from original transcript
  source-raw.md: "Hello [00:12] world [00:45]"
  content.md:    "Hello world"
  User annotates: "Hello" → Need [00:12] for video link
  Solution: Fuzzy match chunk → source-raw.md → extract timestamp

  Characteristics: Immutable (transcript doesn't change post-fetch)

  ---
  Markdown Version Migration (Not Implemented)

  Problem: Annotations break when users edit files in Obsidian

  // Version 1
  content: "React is a UI library."
  chunk_id: "chunk-2"
  annotation: { chunk_id: "chunk-2", text: "Great point!" }

  // User edits in Obsidian
  content: "React and Vue are UI libraries."

  // Version 2 - new chunks created
  chunk_id: "chunk-5"
  // annotation still references "chunk-2" which no longer exists
  // Result: Broken annotation

  Solution Requirements:
  1. Detect content changes (hash comparison)
  2. Store versions (source-v1.md, source-v2.md)
  3. Fuzzy match new chunks → old chunks
  4. Migrate annotations via chunk mapping

  // Required schema additions
  CREATE TABLE document_versions (
    version_number INTEGER,
    content_hash TEXT,
    storage_path TEXT
  );

  CREATE TABLE chunk_migrations (
    old_chunk_id UUID,
    new_chunk_id UUID,
    confidence FLOAT
  );

  Characteristics: Mutable (users actively edit files)

  ---
  Format-by-Format Assessment

  | Format   | Mutable?               | Needs Fuzzy Matching? | Timing      |
  |----------|------------------------|-----------------------|-------------|
  | YouTube  | No (static transcript) | Yes (timestamps)      | ✅ T14 (now) |
  | Markdown | Yes (Obsidian edits)   | Yes (versions)        | 🔮 Phase 2  |
  | PDF      | No (extracted once)    | No                    | Never       |
  | Web      | No (snapshot)          | No                    | Never       |

  ---
  Should T14 Include All Markdown Files?

  Arguments For Extending T14:
  - Proactive: Add infrastructure before it's needed
  - Consistent: All markdown gets position data
  - Future-proof: Ready for version tracking

  Arguments Against:
  - Different use cases: Timestamps ≠ Version migration
  - Missing dependencies: No version tables, sync detection, migration logic
  - Premature optimization: Annotations don't exist yet
  - Scope creep: T14 already defined as YouTube-only

  Technical Assessment: The fuzzy matching algorithm in T14 is designed for chunk → source
  text mapping. Version tracking needs chunk → chunk mapping, which requires:
  1. Concatenating old chunks into a pseudo-source
  2. Additional logic to determine which old chunk was matched
  3. Migration tables and workflows

  ---
  Recommended Architecture

  Phase 1: T14 as Designed (YouTube-only)

  - Complete current scope
  - Validate fuzzy matching in production
  - Unblock timestamp extraction feature

  Phase 2: Markdown Version Tracking

  Required Components:
  // Detection
  - Content hash comparison on sync
  - Trigger reprocessing on change

  // Storage
  - document_versions table
  - Versioned files: source-v1.md, source-v2.md
  - chunk_migrations table

  // Migration
  - Fuzzy match new chunks → old chunks
  - Update annotation.chunk_id references
  - Handle edge cases (chunk splits/merges)

  // Algorithm reuse
  const oldChunksSource = oldChunks.map(c => c.content).join('\n\n')
  const match = fuzzyMatchChunkToSource(newChunk.content, oldChunksSource)
  const oldChunk = findChunkAtOffset(oldChunks, match.startOffset)

  Dependencies:
  1. Annotations must exist (can't migrate what doesn't exist)
  2. Obsidian sync mechanism required
  3. Version detection system needed

  ---
  Implementation Gap Analysis

  Current State (Post-T14):
  // YouTube videos
  ✅ position_context stored
  ✅ Timestamps extractable
  ✅ Fuzzy matching validated

  // Markdown files
  ❌ No version tracking
  ❌ No sync detection
  ❌ No annotation migration
  ❌ No chunk mapping

  To Support File-Over-App:
  // New tasks needed:
  T21: Document Version Schema
  T22: Sync Detection (hash-based)
  T23: Chunk-to-Chunk Matching
  T24: Annotation Migration Logic
  T25: Version Management UI

  ---
  Conclusion

  The file-over-app philosophy does require fuzzy matching for markdown, but not in T14. The
  current implementation is scoped correctly for Phase 1 (YouTube timestamps). Version
  tracking is a separate feature requiring additional infrastructure beyond position data.

  Recommendation:
  - Complete T14 as YouTube-only
  - Document version tracking requirement in backlog
  - Implement as Phase 2 after annotations are built

  The gap you've identified is real and should be planned for, but extending T14 would mix
  two distinct use cases (timestamp extraction vs version migration) and add dependencies
  that aren't ready yet.