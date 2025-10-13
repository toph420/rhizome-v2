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
export function generateMarkdownCleanupPromptOld(): string {
  return `You are a markdown formatting expert. Your task is to clean up this extracted markdown document by fixing ONLY formatting issues. DO NOT change any words or content.

CRITICAL RULES (VIOLATING THESE WILL BREAK THE SYSTEM):
1. PRESERVE ALL REAL WORDS - Do not add, remove, or change ANY actual text content
2. PRESERVE REAL HEADINGS - Keep actual chapter/section headings, DELETE filename headings
3. PRESERVE ALL FOOTNOTES - Keep all footnote markers and definitions
4. PRESERVE HORIZONTAL RULES (---) - These mark chapter/section boundaries, NEVER remove them
5. PRESERVE SMART TYPOGRAPHY - Keep curly quotes (""), em dashes (—), en dashes (–), ellipses (…), and all typographic characters
6. BE AGGRESSIVE WITH ARTIFACTS - Remove anything that looks like metadata/filenames/navigation
7. DO NOT REWORD SENTENCES - Even minor rewording breaks content matching
8. DO NOT PARAPHRASE - Keep every sentence exactly as written
9. DO NOT CONVERT TYPOGRAPHY - Never change curly quotes to straight quotes, em dashes to hyphens, or any other typographic downgrades

FILENAME ARTIFACTS TO AGGRESSIVELY REMOVE (both as headings and plain text):
- "eBook1234.html", "eBook1234-5.html", "split_001.html"
- "chapter01.xhtml", "part_003.html"
- "V4135EPUB-9", "filename-0012"
- ANY pattern matching: word/numbers + dash/underscore + numbers + .html/.xhtml

WHEN IN DOUBT: If it looks like a filename or technical artifact, DELETE IT.
Only preserve things that are clearly human-written prose, headings, or literary content.

YOUR ONLY JOB: Aggressively remove ALL formatting artifacts and technical junk left from extraction.

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



export function generateMarkdownCleanupPrompt(): string {
  return `You are a markdown formatting expert. Your task is to clean up this extracted markdown document by fixing ONLY formatting issues. DO NOT change any words or content.

CRITICAL RULES (VIOLATING THESE WILL BREAK THE SYSTEM):
1. PRESERVE ALL REAL WORDS - Do not add, remove, or change ANY actual text content
2. PRESERVE REAL HEADINGS - Keep actual chapter/section headings, DELETE filename headings
3. PRESERVE ALL FOOTNOTES - Keep footnote markers AND definitions in their EXACT positions
4. PRESERVE HORIZONTAL RULES (---) - These mark chapter/section boundaries, NEVER remove them
5. PRESERVE SMART TYPOGRAPHY - Keep curly quotes (""), em dashes (—), en dashes (–), ellipses (…), and all typographic characters
6. BE AGGRESSIVE WITH ARTIFACTS - Remove anything that looks like metadata/filenames/navigation
7. DO NOT REWORD SENTENCES - Even minor rewording breaks content matching
8. DO NOT PARAPHRASE - Keep every sentence exactly as written
9. DO NOT CONVERT TYPOGRAPHY - Never change curly quotes to straight quotes, em dashes to hyphens, or any other typographic downgrades
10. DO NOT MOVE FOOTNOTES - Footnote definitions stay where they are, do not relocate them

FOOTNOTE HANDLING (CRITICAL):
Markdown footnotes have TWO parts that work together:

1. INLINE MARKERS (in the text):
   - Format: [^1], [^2], [^note], [^author_comment]
   - Appear right after the text they reference
   - DO NOT remove these - they are intentional references
   - DO NOT move these away from their reference point

2. DEFINITIONS (where they appear in the document):
   - Format: [^1]: This is the footnote content
   - May appear at bottom of page, bottom of section, or inline
   - DO NOT move these to a different location
   - DO NOT consolidate all footnotes to document end
   - Keep definitions exactly where the author placed them

EXAMPLES OF FOOTNOTE PRESERVATION:

✅ CORRECT - Leave footnotes in place:
INPUT:
"The theory was revolutionary[^1] and changed the field.

[^1]: Smith, J. (2020). Revolutionary Theories. Academic Press.

The next paragraph continues..."

OUTPUT (unchanged):
"The theory was revolutionary[^1] and changed the field.

[^1]: Smith, J. (2020). Revolutionary Theories. Academic Press.

The next paragraph continues..."

✅ CORRECT - Multiple footnotes stay in their positions:
INPUT:
"First claim[^1] followed by second claim[^2].

[^1]: First source here.
[^2]: Second source here.

Next section begins..."

OUTPUT (unchanged):
"First claim[^1] followed by second claim[^2].

[^1]: First source here.
[^2]: Second source here.

Next section begins..."

❌ WRONG - Do not move footnotes:
INPUT:
"Text with note[^1].

[^1]: Note content.

More text..."

WRONG OUTPUT:
"Text with note[^1].

More text...

[^1]: Note content."  ← MOVED - This is wrong!

❌ WRONG - Do not remove footnote markers:
INPUT: "Text with note[^1]."
WRONG OUTPUT: "Text with note."  ← Marker removed - This is wrong!

❌ WRONG - Do not remove footnote definitions:
INPUT: "[^1]: Note content."
WRONG OUTPUT: ""  ← Definition removed - This is wrong!

FILENAME ARTIFACTS TO AGGRESSIVELY REMOVE (both as headings and plain text):
- "eBook1234.html", "eBook1234-5.html", "split_001.html"
- "chapter01.xhtml", "part_003.html"
- "V4135EPUB-9", "filename-0012"
- ANY pattern matching: word/numbers + dash/underscore + numbers + .html/.xhtml

WHEN IN DOUBT: If it looks like a filename or technical artifact, DELETE IT.
Only preserve things that are clearly human-written prose, headings, or literary content.

YOUR ONLY JOB: Aggressively remove ALL formatting artifacts and technical junk left from extraction.

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
- All footnote markers ([^1], [^note]) in their original positions
- All footnote definitions ([^1]: content) in their original positions
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

Review the document for clearly out of place entities, words that may have gotten garbled in the pdf extraction. Fix them if you're confident, but be sure to maintain the original meaning and intent of the text. If you're not sure, leave it as is.

IMPORTANT: Return ONLY the cleaned markdown. No explanations, no wrapper text, just the cleaned content.`.trim()
}

