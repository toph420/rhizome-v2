# Phase 3: Local LLM Cleanup

## Overview
- **Tasks Covered**: Task 8-9 (Ollama Cleanup Module, PDF Integration)
- **Estimated Time**: 2-3 days
- **Risk Level**: Medium
- **Dependencies**: Phase 1 (OllamaClient), Phase 2 (Docling extraction complete)

## Prerequisites
- ✅ Phase 1 completed (OllamaClient module exists)
- ✅ Phase 2 completed (Docling extraction working)
- ✅ Ollama server running with Qwen 32B model
- Existing `worker/lib/markdown-cleanup-ai.ts` (Gemini version to adapt)

## Context & Background

### Feature Overview
Replace Gemini-based markdown cleanup with local Qwen 32B via Ollama. Mirrors existing cleanup logic but runs 100% locally. Key features:
- **Batching for large documents** (split at ## headings)
- **Multi-pass cleanup** (OCR artifacts, formatting, structure)
- **Error handling for OOM** (Out Of Memory - fall back to regex-only)
- **Progress reporting** for UI feedback

From PRP lines 563-636: Adapt existing Gemini pattern to Ollama, preserve batching strategy, add OOM recovery.

### Why This Matters
- **Cost**: Gemini cleanup costs $0.08 per document → $0.00 with Ollama
- **Privacy**: Markdown never sent to cloud
- **Control**: Can tune prompts and temperature locally

## Tasks

### Task 8: Implement Ollama Cleanup Module

**Files to Create**:
- `worker/lib/local/ollama-cleanup.ts`

**Pattern to Follow**:
- `worker/lib/markdown-cleanup-ai.ts:85-140` - Batching strategy for large docs
- `worker/lib/local/ollama-client.ts` - OllamaClient usage pattern

#### Implementation Steps

```typescript
// worker/lib/local/ollama-cleanup.ts

import { OllamaClient, OOMError } from './ollama-client'

interface CleanupOptions {
  onProgress?: (stage: string, percent: number) => void
  temperature?: number
  maxBatchSize?: number
}

/**
 * Clean markdown using local Qwen model via Ollama
 * Handles large documents via batching at ## headings
 */
export async function cleanMarkdownLocal(
  markdown: string,
  options: CleanupOptions = {}
): Promise<string> {
  const {
    onProgress,
    temperature = 0.3,  // Low temperature for consistent cleanup
    maxBatchSize = 100000  // ~100k chars per batch
  } = options

  const ollama = new OllamaClient()

  // Small documents: Single pass
  if (markdown.length < maxBatchSize) {
    onProgress?.('cleanup_ai', 10)

    try {
      const cleaned = await cleanSection(ollama, markdown, temperature)
      onProgress?.('cleanup_ai', 100)
      return cleaned
    } catch (error) {
      if (error instanceof OOMError) {
        throw error  // Propagate OOM for fallback handling
      }
      throw new Error(`Cleanup failed: ${error}`)
    }
  }

  // Large documents: Split at headings and batch
  onProgress?.('cleanup_ai', 5)
  const sections = splitAtHeadings(markdown, maxBatchSize)
  console.log(`[Cleanup] Split into ${sections.length} sections for batching`)

  const cleanedSections: string[] = []
  for (let i = 0; i < sections.length; i++) {
    try {
      const cleaned = await cleanSection(ollama, sections[i], temperature)
      cleanedSections.push(cleaned)

      const progress = 5 + Math.floor((i + 1) / sections.length * 95)
      onProgress?.('cleanup_ai', progress)
    } catch (error) {
      if (error instanceof OOMError) {
        console.error(`[Cleanup] OOM on section ${i + 1}/${sections.length}`)
        throw error  // Stop processing, trigger fallback
      }
      throw error
    }
  }

  return cleanedSections.join('\n\n')
}

/**
 * Clean a single markdown section with Qwen
 */
async function cleanSection(
  ollama: OllamaClient,
  text: string,
  temperature: number
): Promise<string> {
  const prompt = `You are a markdown cleanup assistant. Your task is to clean this markdown text extracted from a PDF.

RULES:
1. Remove OCR artifacts (misplaced characters, broken words)
2. Fix formatting issues (inconsistent spacing, line breaks)
3. Preserve all content - do not summarize or omit text
4. Preserve all headings, lists, and structure
5. Output ONLY the cleaned markdown, no explanations

Markdown to clean:

${text}

Cleaned markdown:`

  try {
    const response = await ollama.chat(prompt, {
      temperature,
      timeout: 300000  // 5 minutes per section
    })

    return response.trim()
  } catch (error: any) {
    // Check for OOM specifically
    if (error.message?.includes('out of memory') || error instanceof OOMError) {
      throw new OOMError('Qwen model out of memory during cleanup')
    }
    throw error
  }
}

/**
 * Split markdown at ## headings for batching
 * Ensures batches don't break mid-section
 * Pattern from: worker/lib/markdown-cleanup-ai.ts:85-140
 */
function splitAtHeadings(markdown: string, maxSize: number): string[] {
  const lines = markdown.split('\n')
  const sections: string[] = []
  let currentSection: string[] = []
  let currentSize = 0

  for (const line of lines) {
    const isHeading = /^#{1,6}\s/.test(line)  // Matches # through ######
    const lineSize = line.length + 1  // +1 for newline

    // Start new section if:
    // 1. Hit a ## heading AND current section is not empty
    // 2. Current section exceeds maxSize
    if ((isHeading && currentSection.length > 0 && currentSize > maxSize * 0.8) ||
        currentSize > maxSize) {
      sections.push(currentSection.join('\n'))
      currentSection = [line]
      currentSize = lineSize
    } else {
      currentSection.push(line)
      currentSize += lineSize
    }
  }

  // Add final section
  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'))
  }

  return sections
}

/**
 * Fallback: Regex-only cleanup (no AI)
 * Used when Qwen OOM occurs
 */
export function cleanMarkdownRegexOnly(markdown: string): string {
  let cleaned = markdown

  // Remove common OCR artifacts
  cleaned = cleaned.replace(/[""]/g, '"')  // Smart quotes
  cleaned = cleaned.replace(/['']/g, "'")  // Smart apostrophes
  cleaned = cleaned.replace(/–/g, '-')      // En dash
  cleaned = cleaned.replace(/—/g, '--')     // Em dash
  cleaned = cleaned.replace(/…/g, '...')    // Ellipsis

  // Fix spacing issues
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
  cleaned = cleaned.replace(/ {2,}/g, ' ')      // Max 1 space
  cleaned = cleaned.replace(/^\s+|\s+$/gm, '')  // Trim lines

  return cleaned
}
```

#### Critical Gotchas

**GOTCHA 1: OOM Must Propagate for Fallback**
```typescript
// From PRP lines 596-605:
// "ADD: Error handling for OOM (catch and mark for review)"

// ❌ WRONG - Swallow OOM, no fallback triggered
try {
  return await cleanSection(ollama, text, temp)
} catch (error) {
  return text  // Just return uncleaned - no user feedback
}

// ✅ CORRECT - Propagate OOM so processor can handle
try {
  return await cleanSection(ollama, text, temp)
} catch (error) {
  if (error instanceof OOMError) {
    throw error  // Let PDF processor catch and fallback
  }
  throw error
}
```

**GOTCHA 2: Batching Strategy Must Match Gemini**
```typescript
// From worker/lib/markdown-cleanup-ai.ts:85-140
// Key pattern: Split at ## headings, not arbitrary byte boundaries
// Why: Keeps sections semantically coherent for better LLM cleanup

// ❌ WRONG - Split at byte boundaries
const batches = markdown.match(/.{1,100000}/g)

// ✅ CORRECT - Split at heading boundaries
const batches = splitAtHeadings(markdown, 100000)
```

**GOTCHA 3: Temperature Low for Consistency**
```typescript
// Cleanup is not creative task, want consistent output
temperature: 0.3  // Not 0.7 or higher

// From PRP lines 594-596:
// "return await cleanSection(ollama, section)"
// Mirrors Gemini's low temperature approach
```

#### Validation

```bash
# Unit test
cat > worker/lib/local/__tests__/ollama-cleanup.test.ts << 'EOF'
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../ollama-cleanup'

describe('Ollama Cleanup', () => {
  it('cleans small markdown', async () => {
    const dirty = 'Some  text with   extra   spaces'
    const cleaned = await cleanMarkdownLocal(dirty)
    expect(cleaned).not.toContain('  ')  // No double spaces
  })

  it('batches large markdown', async () => {
    const large = '## Section 1\n' + 'x'.repeat(150000) + '\n## Section 2\n' + 'y'.repeat(150000)
    const cleaned = await cleanMarkdownLocal(large)
    expect(cleaned).toContain('Section 1')
    expect(cleaned).toContain('Section 2')
  })

  it('uses regex fallback for OOM', () => {
    const dirty = 'Some "smart quotes" and — dashes'
    const cleaned = cleanMarkdownRegexOnly(dirty)
    expect(cleaned).toContain('"smart quotes"')  // Converted to regular
    expect(cleaned).toContain('--')  // Em dash converted
  })
})
EOF

cd worker && npm test -- ollama-cleanup.test.ts
```

---

### Task 9: Add Cleanup to PDF Processor

**Files to Modify**:
- `worker/processors/pdf-processor.ts`

**Pattern to Follow**:
- Existing Stage 4 AI cleanup (lines 614-636 in PRP)
- Error handling with OOMError catch

#### Implementation Steps

```typescript
// worker/processors/pdf-processor.ts

import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup'
import { OOMError } from '../lib/local/ollama-client'

export class PdfProcessor extends SourceProcessor {
  async process(): Promise<ProcessResult> {
    // ... Stages 1-3 from Phase 2 ...

    // Stage 4: AI Cleanup (55-70%)
    const cleanMarkdownEnabled = this.job.input_data?.cleanMarkdown ?? true

    if (cleanMarkdownEnabled) {
      const isLocalMode = process.env.PROCESSING_MODE === 'local'

      await this.updateProgress(57, 'cleanup_ai', 'processing', 'Starting AI cleanup')

      try {
        if (isLocalMode) {
          console.log('[PDF] Using local Ollama cleanup')
          markdown = await cleanMarkdownLocal(markdown, {
            onProgress: (stage, percent) => {
              const ourPercent = 57 + Math.floor(percent * 0.13)  // 57-70
              this.updateProgress(ourPercent, 'cleanup_ai', 'processing', 'AI cleanup in progress')
            }
          })
        } else {
          console.log('[PDF] Using Gemini cleanup')
          // Existing Gemini cleanup
          markdown = await cleanPdfMarkdown(this.ai, markdown, {
            onProgress: (percent) => {
              const ourPercent = 57 + Math.floor(percent * 0.13)
              this.updateProgress(ourPercent, 'cleanup_ai', 'processing', 'AI cleanup')
            }
          })
        }

        await this.updateProgress(70, 'cleanup_ai', 'complete', 'AI cleanup done')

      } catch (error) {
        if (error instanceof OOMError) {
          console.warn('[PDF] Qwen OOM - falling back to regex-only cleanup')

          // Use regex fallback
          markdown = cleanMarkdownRegexOnly(markdown)

          // Mark for user review
          await this.markForReview('ai_cleanup_oom',
            'Qwen model out of memory. Using regex-only cleanup. Review recommended.')

          await this.updateProgress(70, 'cleanup_ai', 'skipped',
            'AI cleanup skipped (OOM) - using regex only')
        } else {
          throw error  // Other errors should fail the job
        }
      }
    } else {
      console.log('[PDF] AI cleanup disabled by user')
      await this.updateProgress(70, 'cleanup_ai', 'skipped', 'AI cleanup disabled')
    }

    // Continue with Stage 5 (chunking) and beyond...
    // ...
  }

  /**
   * Mark document for user review
   * Sets review flag in database
   */
  private async markForReview(reason: string, message: string): Promise<void> {
    await this.supabase
      .from('documents')
      .update({
        processing_status: 'completed_with_warnings',
        review_notes: message
      })
      .eq('id', this.job.document_id)

    // Also store in job metadata
    this.job.metadata = {
      ...this.job.metadata,
      warnings: [
        ...(this.job.metadata?.warnings || []),
        { reason, message, timestamp: new Date().toISOString() }
      ]
    }
  }
}
```

#### Critical Gotchas

**GOTCHA 1: Must Check PROCESSING_MODE**
```typescript
// From PRP lines 616-620:
// "ADD: Conditional for local vs Gemini cleanup"

const isLocalMode = process.env.PROCESSING_MODE === 'local'

// If PROCESSING_MODE not set, default to Gemini (backward compatible)
```

**GOTCHA 2: OOM Fallback is Critical**
```typescript
// From PRP lines 627-635:
// "if (error instanceof OOMError) {
//     // Mark for review, continue with regex-only"

// Qwen 32B can OOM on very large sections
// Must gracefully degrade, not crash entire job
```

**GOTCHA 3: Preserve cleanMarkdown Flag**
```typescript
// User can disable AI cleanup entirely
// Check job.input_data.cleanMarkdown flag (from UI)

if (!cleanMarkdownEnabled) {
  // Skip AI cleanup entirely, use regex or no cleanup
}
```

#### Validation

```bash
# Integration test
cat > worker/tests/integration/local-cleanup.test.ts << 'EOF'
import { processDocument } from '../../handlers/process-document'

describe('Local AI Cleanup', () => {
  beforeAll(() => {
    process.env.PROCESSING_MODE = 'local'
  })

  it('cleans markdown with Ollama', async () => {
    const job = createTestJob({ cleanMarkdown: true })
    const result = await processDocument(job)

    expect(result.markdown).toBeDefined()
    // Should be cleaner than input
  })

  it('falls back to regex on OOM', async () => {
    // Mock Ollama to throw OOM
    const job = createTestJob({ cleanMarkdown: true })

    // Process should complete with warnings, not fail
    const result = await processDocument(job)
    expect(result.metadata.warnings).toContainEqual(
      expect.objectContaining({ reason: 'ai_cleanup_oom' })
    )
  })

  it('skips cleanup when disabled', async () => {
    const job = createTestJob({ cleanMarkdown: false })
    const result = await processDocument(job)

    // Markdown should be unchanged
  })
})
EOF

cd worker && npm test -- local-cleanup.test.ts
```

---

## Integration Points

### Worker Module
- `worker/lib/local/ollama-cleanup.ts` - New cleanup module
- `worker/processors/pdf-processor.ts` - Stage 4 AI cleanup modified
- Uses OllamaClient from Phase 1

### Environment Variables
- `PROCESSING_MODE=local` - Enables Ollama cleanup
- `OLLAMA_HOST`, `OLLAMA_MODEL` from Phase 1

### Error Handling
- OOMError propagates to processor
- Processor falls back to regex-only cleanup
- Document marked for review (not failed)

## External References

### Codebase References
- **Batching Pattern**: `worker/lib/markdown-cleanup-ai.ts:85-140`
- **OllamaClient**: `worker/lib/local/ollama-client.ts` (created in Phase 1)
- **Error Handling**: `worker/handlers/continue-processing.ts:48-159`

## Validation Checklist

- [ ] ollama-cleanup.ts module created
- [ ] cleanMarkdownLocal() handles small documents
- [ ] splitAtHeadings() batches large documents correctly
- [ ] OOMError propagates for fallback
- [ ] cleanMarkdownRegexOnly() fallback works
- [ ] PDF processor checks PROCESSING_MODE
- [ ] PDF processor uses local cleanup in local mode
- [ ] PDF processor catches OOM and falls back
- [ ] markForReview() stores warnings in database
- [ ] Progress reporting works (57-70%)
- [ ] Tests pass: `cd worker && npm test`
- [ ] No TypeScript errors: `cd worker && npm run type-check`

## Success Criteria

✅ **Ollama Cleanup Works**
- Small documents cleaned in single pass
- Large documents batched correctly
- Output quality comparable to Gemini

✅ **OOM Handling Robust**
- OOM detected and caught
- Fallback to regex-only cleanup
- Document marked for review, not failed

✅ **Integration Complete**
- PDF processor uses local cleanup in local mode
- Progress tracking works
- User can disable AI cleanup via flag

✅ **Ready for Phase 4**
- Cleaned markdown available for matching
- Docling chunks from Phase 2 ready to remap
- No blockers for bulletproof matching

---

## Notes & Additional Context

### OOM Likelihood
From PRP lines 315-325:
- Qwen 32B Q4_K_M requires ~20-24GB RAM
- M1 Max with 64GB: Low OOM risk
- Smaller machines: Higher OOM risk

OOM more likely with:
- Very large sections (>100k chars)
- Multiple Ollama processes running
- Other memory-intensive apps running

### Performance Expectations
**Small PDFs (<50 pages)**:
- Gemini: ~30 seconds
- Ollama: ~2-3 minutes (slower but local)

**Large PDFs (500 pages)**:
- Gemini: ~2-3 minutes
- Ollama: ~10-15 minutes

Trade-off: Slower but free and private.

### Quality Comparison
Qwen 32B vs Gemini 2.0 Flash:
- **Accuracy**: Comparable for cleanup tasks
- **Speed**: Gemini 3-5x faster
- **Cost**: Gemini $0.08 vs Ollama $0.00
- **Privacy**: Gemini cloud vs Ollama local

### Next Steps
After completing Phase 3, proceed to:
- **Phase 4**: Bulletproof Matching (Tasks 10-15)
- Most complex phase: 5-layer matching system
- Uses cleaned markdown from Phase 3
- Remaps Docling chunks from Phase 2
- Guarantees 100% chunk recovery
