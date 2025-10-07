/**
 * Markdown Cleanup Prompts
 *
 * Second-pass AI cleanup for extracted markdown.
 * Focuses purely on formatting polish - no content changes.
 *
 * Use after initial PDF/EPUB extraction to catch remaining artifacts
 * and improve formatting quality.
 */

/**
 * Generates the markdown cleanup prompt for post-extraction polish.
 *
 * Instructs Gemini to:
 * - Remove any remaining page artifacts (numbers, headers, footers)
 * - Fix formatting issues (excessive breaks, spacing)
 * - Preserve ALL original words and content
 * - Only adjust formatting and structure
 *
 * @returns Formatted cleanup prompt
 */
export function generateMarkdownCleanupPrompt(): string {
  return `You are a markdown formatting expert. Your task is to clean up this extracted markdown document by fixing ONLY formatting issues. DO NOT change any words or content.

CRITICAL RULES (VIOLATING THESE WILL BREAK THE SYSTEM):
1. PRESERVE ALL WORDS - Do not add, remove, or change ANY text content
2. PRESERVE ALL HEADINGS - Keep exact heading text and structure, unless they are clearly duplicates
3. PRESERVE ALL FOOTNOTES - Keep all footnote markers and definitions
4. PRESERVE HORIZONTAL RULES (---) - These mark chapter/section boundaries, NEVER remove them
5. ONLY FIX FORMATTING - Remove artifacts, fix spacing, improve structure
6. DO NOT REWORD SENTENCES - Even minor rewording breaks content matching
7. DO NOT PARAPHRASE - Keep every sentence exactly as written

If you're unsure whether something is an artifact or real content, KEEP IT.
Only remove things that are OBVIOUSLY metadata/navigation/artifacts.

YOUR ONLY JOB: Remove formatting artifacts and fix spacing issues left from PDF/EPUB extraction.

USE YOUR BEST JUDGEMENT AND BEAUTIFY THE MARKDOWN WHILE FOLLOWING THE RULES ABOVE.

ARTIFACTS TO REMOVE:
- Leftover page numbers that interrupt text flow
- Remaining running headers/footers that weren't caught in first pass
- Excessive line breaks (more than 2 consecutive \\n\\n)
- Trailing whitespace on lines
- PDF metadata or CSS that leaked through (e.g., "@page {...}", "margin: 5pt")
- Garbled text from poor OCR (all-caps with no spaces like "THEBOOKNAME")
- EPUB navigation artifacts: [Cover page](...), [Title page](...), [Contents](...), etc.
- "Unknown" headings or placeholder text
- TOC (Table of Contents) links and structure
- HTML filename references (e.g., "filename.html", "split_001.html")
- Publisher boilerplate and metadata sections

FORMATTING TO FIX:
- Join sentences split across lines that should flow together
- Normalize paragraph breaks (exactly \\n\\n between paragraphs)
- Fix heading formatting (ensure proper # symbols and spacing)
- Standardize list formatting (consistent bullet/number style)
- Remove redundant blank lines while preserving intentional breaks

WHAT TO PRESERVE:
- All paragraph content exactly as written
- All section headings exactly as written
- All footnote markers and definitions
- All citations and references
- All block quotes
- All intentional line breaks in poetry or code
- Horizontal rule separators (---) used for section/chapter boundaries

EXAMPLES:

BAD INPUT (what you might receive):
"...discussing the theory

147

which continues..."

GOOD OUTPUT (what you return):
"...discussing the theory which continues..."

---

BAD INPUT:
"## Chapter Title

Author Name Running Header

The text begins here..."

GOOD OUTPUT:
"## Chapter Title

The text begins here..."

---

BAD INPUT:
"Text here.


@page { margin: 5pt }



More text here."

GOOD OUTPUT:
"Text here.

More text here."

---

BAD INPUT:
"**THETHREESTIGMATAOFPALMERELDRITCH**

Chapter text begins..."

GOOD OUTPUT:
"Chapter text begins..."

---

BAD INPUT (chapter separator preservation):
"## Chapter One

Content of chapter one...

---

## Chapter Two

Content of chapter two..."

GOOD OUTPUT (preserve --- separators):
"## Chapter One

Content of chapter one...

---

## Chapter Two

Content of chapter two..."

---

BAD INPUT (EPUB artifacts):
"Unknown

Contents

[Cover page](filename.html#pos123)
[Title page](filename.html#pos456)
[Chapter 1](filename.html#pos789)

# Unknown

Unknown

ONE

The story begins..."

GOOD OUTPUT:
"## ONE

The story begins..."

IMPORTANT: Return ONLY the cleaned markdown. No explanations, no wrapper text, just the cleaned content.`.trim()
}
