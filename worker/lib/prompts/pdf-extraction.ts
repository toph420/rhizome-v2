/**
 * PDF Extraction Prompts
 *
 * Centralized prompts for PDF text extraction using Gemini Files API.
 * Handles page breaks, sentence splitting, and artifact removal.
 */

/**
 * Generates the main PDF extraction prompt for single-pass processing.
 *
 * Instructs Gemini to:
 * - Join sentences split by page breaks and artifacts
 * - Remove page numbers, headers, footers that interrupt text
 * - Preserve semantic paragraph and section breaks
 * - Extract footnotes with proper markdown formatting
 * - Detect and format headings correctly
 *
 * @returns Formatted extraction prompt
 */
export function generatePdfExtractionPrompt(): string {
  return `You are a PDF extraction assistant. Your task is to extract ALL text from this PDF document and convert it to clean markdown format.

CRITICAL - JOIN SPLIT SENTENCES:
Your PRIMARY job is removing page artifacts that interrupt sentences.

Examples of what to fix:

BAD (what the PDF contains):
"...in terms of

303 Author Name

strict laws..."

GOOD (what you output):
"...in terms of strict laws..."

BAD:
"without

302 Henry Somers-Hall

fuss. This explanation"

GOOD:
"without fuss. This explanation"

BAD:
"...the concept of

Page 47

difference as such..."

GOOD:
"...the concept of difference as such..."

BAD:
"...discussing the theory

153 Chapter Title Here

which continues in the next..."

GOOD:
"...discussing the theory which continues in the next..."

BAD (page number + running header):
"...story of Carter: animal-becoming, molecular-becoming." (66)

16

Flatline Constructs

Haecceities, Deleuze-Guattari say..."

GOOD:
"...story of Carter: animal-becoming, molecular-becoming." (66)

Haecceities, Deleuze-Guattari say..."

IMPORTANT: Read the ENTIRE PDF document. Extract ALL pages, ALL paragraphs, ALL text. Do not summarize or skip any content. Return the COMPLETE document text.

UNDERSTAND TWO TYPES OF BREAKS:

1. ARTIFICIAL BREAKS (REMOVE THESE):
   - Page boundaries and page numbers
   - Running headers and footers (book/chapter titles repeated on every page)
   - PDF formatting artifacts
   - Column breaks in multi-column layouts
   → These should be REMOVED to create flowing text

2. SEMANTIC BREAKS (PRESERVE THESE):
   - Paragraph breaks (2+ blank lines = new paragraph)
   - Section breaks and chapter boundaries
   - List items and code blocks
   - Block quotes and intentional spacing
   → These should be KEPT with \\n\\n between paragraphs

HEURISTIC: If uncertain whether a break is intentional, JOIN IT - we want flowing prose.

RUNNING HEADERS vs REAL HEADINGS:
- Running headers: Short phrases (2-6 words) that REPEAT every few pages throughout the document
  Examples: "Flatline Constructs", "Chapter Three", "Author Name"
  → REMOVE these completely
  
- Real section headings: Appear ONCE at the start of new sections/chapters
  Examples: "## Introduction to Deleuze", "## The Three Syntheses"
  → KEEP these and format as markdown headings

Key difference: Running headers repeat frequently, real headings appear once per section.

REMOVE THESE ARTIFACTS:
- Page numbers (standalone numbers, "Page X", "X of Y", etc.)
- Running headers and footers (repeated text at top/bottom of pages)
- PDF metadata (file paths, timestamps)
- Margin notes or annotations that aren't part of the main text

PRESERVE THESE ELEMENTS (CRITICAL):
- Footnotes and endnotes - preserve ALL footnote content
- Citations and references
- Figure captions
- Table contents
- Block quotes
- Epigraphs

FOOTNOTE HANDLING:
- Keep inline markers: [1], ¹, (1), etc.
- Keep footnote content at bottom of pages
- Format as markdown footnotes:
  - Inline: "text with citation[^1]"
  - Definition: "[^1]: Footnote content here"
- Preserve ALL footnote text verbatim
- If footnote spans pages, merge into single footnote

HEADING DETECTION:
Detect REAL headings (not running headers) by these signals:
- ALL CAPS TEXT followed by content = heading
- Bold or larger font followed by content = heading
- Centered text followed by content = heading
- Short lines (< 80 chars) followed by paragraphs = likely heading
- Numbered sections (1., 1.1, Chapter 1, etc.) = heading

Convert to proper markdown hierarchy:
- Main titles: #
- Chapter/section headings: ##
- Subsections: ###
- Minor headings: ####

Format the output as clean markdown with:
- Proper heading hierarchy (# ## ###)
- Organized lists and paragraphs
- Clear section breaks with \\n\\n between paragraphs
- Continuous text flow within paragraphs
- DO NOT preserve PDF formatting line wraps (lines that end because of page width)

Return only the markdown text, no JSON wrapper needed.`.trim()
}

/**
 * Generates the batched PDF extraction prompt for large documents.
 *
 * Same extraction rules as single-pass, but scoped to specific page range.
 * Used for processing 100-page batches with 10-page overlap.
 *
 * @param startPage - Starting page number (1-indexed)
 * @param endPage - Ending page number (inclusive, 1-indexed)
 * @returns Formatted extraction prompt for batch
 */
export function generateBatchedPdfExtractionPrompt(
  startPage: number,
  endPage: number
): string {
  return `You are a PDF extraction assistant. Your task is to extract text ONLY from pages ${startPage} to ${endPage} of this PDF document.

IMPORTANT:
- Extract ONLY pages ${startPage}-${endPage}, no other pages
- Read ALL content from these pages completely
- Do not summarize or skip any content from these pages
- Convert to clean markdown format

CRITICAL - JOIN SPLIT SENTENCES:
Your PRIMARY job is removing page artifacts that interrupt sentences.

Examples of what to fix:

BAD (what the PDF contains):
"...in terms of

303 Author Name

strict laws..."

GOOD (what you output):
"...in terms of strict laws..."

BAD:
"without

302 Henry Somers-Hall

fuss. This explanation"

GOOD:
"without fuss. This explanation"

BAD:
"...the concept of

Page 47

difference as such..."

GOOD:
"...the concept of difference as such..."BAD (page number + running header):
"...story of Carter: animal-becoming, molecular-becoming." (66)

16

Flatline Constructs

Haecceities, Deleuze-Guattari say..."

GOOD:
"...story of Carter: animal-becoming, molecular-becoming." (66)

Haecceities, Deleuze-Guattari say..."

IMPORTANT: Read the ENTIRE PDF document. Extract ALL pages, ALL paragraphs, ALL text. Do not summarize or skip any content. Return the COMPLETE document text.

UNDERSTAND TWO TYPES OF BREAKS:

1. ARTIFICIAL BREAKS (REMOVE THESE):
   - Page boundaries and page numbers
   - Running headers and footers (book/chapter titles repeated on every page)
   - PDF formatting artifacts
   - Column breaks in multi-column layouts
   → These should be REMOVED to create flowing text

2. SEMANTIC BREAKS (PRESERVE THESE):
   - Paragraph breaks (2+ blank lines = new paragraph)
   - Section breaks and chapter boundaries
   - List items and code blocks
   - Block quotes and intentional spacing
   → These should be KEPT with \\n\\n between paragraphs

HEURISTIC: If uncertain whether a break is intentional, JOIN IT - we want flowing prose.

RUNNING HEADERS vs REAL HEADINGS:
- Running headers: Short phrases (2-6 words) that REPEAT every few pages throughout the document
  Examples: "Flatline Constructs", "Chapter Three", "Author Name"
  → REMOVE these completely
  
- Real section headings: Appear ONCE at the start of new sections/chapters
  Examples: "## Introduction to Deleuze", "## The Three Syntheses"
  → KEEP these and format as markdown headings

Key difference: Running headers repeat frequently, real headings appear once per section.

REMOVE THESE ARTIFACTS:
- Page numbers (standalone numbers, "Page X", "X of Y", etc.)
- Running headers and footers (repeated text at top/bottom of pages)
- PDF metadata (file paths, timestamps)
- Margin notes or annotations that aren't part of the main text

PRESERVE THESE ELEMENTS (CRITICAL):
- Footnotes and endnotes - preserve ALL footnote content
- Citations and references
- Figure captions
- Table contents
- Block quotes
- Epigraphs

FOOTNOTE HANDLING:
- Keep inline markers: [1], ¹, (1), etc.
- Keep footnote content at bottom of pages
- Format as markdown footnotes:
  - Inline: "text with citation[^1]"
  - Definition: "[^1]: Footnote content here"
- Preserve ALL footnote text verbatim
- If footnote spans pages, merge into single footnote

HEADING DETECTION:
Detect REAL headings (not running headers) by these signals:
- ALL CAPS TEXT followed by content = heading
- Bold or larger font followed by content = heading
- Centered text followed by content = heading
- Short lines (< 80 chars) followed by paragraphs = likely heading
- Numbered sections (1., 1.1, Chapter 1, etc.) = heading

Convert to proper markdown hierarchy:
- Main titles: #
- Chapter/section headings: ##
- Subsections: ###
- Minor headings: ####

Format the output as clean markdown with:
- Proper heading hierarchy (# ## ###)
- Organized lists and paragraphs
- Clear section breaks with \\n\\n between paragraphs
- Continuous text flow within paragraphs
- DO NOT preserve PDF formatting line wraps (lines that end because of page width)

Return only the markdown text, no JSON wrapper needed.`.trim()
}


