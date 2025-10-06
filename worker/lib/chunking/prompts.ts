/**
 * AI prompt templates for semantic chunking.
 * Extracted from ai-chunking-batch.ts for easier iteration and testing.
 */

import type { MetadataExtractionBatch } from '../../types/chunking'

export type DocumentType =
  | 'fiction'
  | 'nonfiction_book'
  | 'academic_paper'
  | 'technical_manual'
  | 'article'
  | 'essay'

/**
 * Generates the semantic chunking prompt for Gemini AI.
 *
 * @param batch - The batch of markdown to analyze
 * @param maxChunkSize - Maximum characters per chunk (default: 10000)
 * @param documentType - Optional document type for specialized chunking (default: generic)
 * @returns Formatted prompt for AI
 */
export function generateSemanticChunkingPrompt(
  batch: MetadataExtractionBatch,
  maxChunkSize: number = 10000,
  documentType?: DocumentType
): string {
  const typeSpecificGuidance = documentType
    ? getTypeSpecificGuidance(documentType)
    : ''
  return `Analyze the DOCUMENT TEXT below and identify semantic chunks.

🚨 CRITICAL REQUIREMENT #1 - ACCURATE OFFSETS 🚨

The start_offset and end_offset you provide MUST point to where this content appears in the source.
These offsets are used for viewport tracking - incorrect offsets break the reader experience.

Your primary task:
1. Identify semantic boundaries (where thoughts begin and end)
2. Extract the text content (preserve meaning and structure)
3. Calculate ACCURATE start_offset and end_offset positions
4. Generate rich metadata (themes, concepts, emotional tone)

Acceptable content variations:
✅ Minor whitespace normalization (extra spaces, line breaks)
✅ Citation formatting (*italics* vs plain text)
✅ Markdown formatting variations

UNACCEPTABLE violations:
❌ Paraphrasing: "The author argues..." → "According to the text..."
❌ Summarizing: [500 words] → [50 word summary]
❌ Hallucinating content not in source
❌ Wrong offsets (pointing to different part of document)

VERIFICATION:
The content at markdown.slice(start_offset, end_offset) should be SIMILAR to your chunk.content.
Offsets must point to the correct location, even if formatting varies slightly.

🚨 CRITICAL REQUIREMENT #2 - CHUNK SIZE LIMIT 🚨

MAXIMUM chunk size: ${maxChunkSize} characters (approximately ${Math.floor(maxChunkSize / 6)} words)
MINIMUM chunk size: 200 words (1000 characters)

This is a TECHNICAL CONSTRAINT, not a suggestion.
If you return ANY chunk > ${maxChunkSize} chars, your batch will be REJECTED and retried.

IF YOU VIOLATE THIS LIMIT:
- Your batch will be REJECTED
- You will be called again with a stricter prompt
- After 3 rejections, this batch will be split into smaller sections
- Example of FAILURE: A 46,000 character chunk will cause IMMEDIATE REJECTION

ACCEPTABLE: Chunk with 9,500 characters
UNACCEPTABLE: Chunk with 10,001 characters (will be REJECTED)

Break long sections into 2-3 chunks rather than violating the limit.

Example of WRONG (will be rejected):
{
  "content": "...49,000 characters of text..." ❌ EXCEEDS LIMIT
}

Example of CORRECT:
{
  "content": "...3,500 characters of text..." ✅ WITHIN LIMIT
}

🚨 REQUIREMENTS SUMMARY 🚨
1. Accurate offsets that point to correct locations in source
2. Semantic content (preserve meaning, minor formatting variations OK)
3. No hallucinations - content must exist in source document
4. Every chunk ≤ ${maxChunkSize} characters
5. Rich metadata extraction (themes, concepts, emotional analysis)

Your response will be validated: offsets checked for accuracy, content checked for similarity.

═══════════════════════════════════════════════════════════════════════════

A semantic chunk is a COMPLETE UNIT OF THOUGHT:
- TARGET: 500-1200 words (2500-6000 characters)
- MINIMUM: 200 words (1000 characters)
- MAXIMUM: ${maxChunkSize} characters (ABSOLUTE HARD LIMIT)

🚨 SKIP NON-CONTENT SECTIONS 🚨
DO NOT create chunks from:
- Table of contents / chapter listings
- Cover pages / title pages
- Copyright / publisher information
- Navigation elements / links
- Dedications / acknowledgments

These are metadata, not semantic content. Start chunking at the first substantial content section.

Chunking boundaries:
- Scene changes, argument shifts, topic transitions
- May span multiple paragraphs if they form one idea
- May split long paragraphs if they cover multiple ideas
- Stop at ${maxChunkSize} chars even if mid-thought

MARKDOWN STRUCTURE:
- Code blocks: Keep with surrounding context
- Lists: Keep intact unless spanning different topics
- Tables: Usually single chunks unless very large
- Headings: Good boundaries, but not required

${typeSpecificGuidance}

For each chunk you identify, extract:

1. **content**: The EXACT, UNMODIFIED text from the source
   - Use markdown.slice(start, end) conceptually
   - Must match source character-for-character
   - Will be verified by searching in full document

2. **start_offset**: Character position where chunk starts (0-indexed from start of DOCUMENT TEXT below)

3. **end_offset**: Character position where chunk ends

4. **themes**: 2-5 key themes/topics
   - Examples: ["mortality", "alienation"], ["power dynamics", "surveillance"]

5. **concepts**: 3-5 specific concepts with importance scores
   - Format: [{"text": "concept name", "importance": 0.8}]
   - Importance: 0.0-1.0 representing centrality to the chunk

6. **importance**: 0.0-1.0 score for chunk significance
   - Higher for key arguments, turning points, revelations
   - Lower for transitions, descriptions

7. **summary**: One-sentence summary (max 100 chars)

8. **domain**: Domain classification (narrative, philosophical, academic, poetic, experimental, essayistic)

9. **emotional**: Emotional metadata for contradiction detection
   - **polarity**: -1.0 (despair, darkness) to +1.0 (hope, transcendence)
   - **primaryEmotion**: anxiety, melancholy, joy, dread, wonder, rage, apathy, ecstasy
   - **intensity**: 0.0-1.0 (how strongly emotion pervades passage)

Return JSON in this exact format:
{
  "chunks": [
    {
      "content": "EXACT unmodified text from source...",
      "start_offset": 0,
      "end_offset": 1847,
      "themes": ["theme1", "theme2"],
      "concepts": [
        {"text": "concept", "importance": 0.9}
      ],
      "importance": 0.8,
      "summary": "Brief summary",
      "domain": "academic",
      "emotional": {
        "polarity": 0.3,
        "primaryEmotion": "neutral",
        "intensity": 0.4
      }
    }
  ]
}

═══════════════════════════════════════════════════════════════════════════
DOCUMENT TEXT (starts at character ${batch.startOffset} in the full document):
═══════════════════════════════════════════════════════════════════════════

${batch.content}

═══════════════════════════════════════════════════════════════════════════

Extract semantic chunks from the DOCUMENT TEXT above.

BEFORE returning your response:
1. Verify offsets point to correct locations (validate against source positions)
2. Verify each chunk is ≤ ${maxChunkSize} characters
3. Verify no hallucinated content (all text must exist in source)

Return ONLY valid JSON. No explanations, no markdown formatting.`
}

/**
 * Get type-specific chunking guidance based on document type.
 */
function getTypeSpecificGuidance(type: DocumentType): string {
  switch (type) {
    case 'fiction':
      return `
🎭 FICTION-SPECIFIC CHUNKING GUIDANCE:
- Chunk by narrative beats (scene changes, perspective shifts, dramatic moments)
- Preserve dialogue exchanges intact - NEVER split mid-conversation
- Keep descriptions with their associated action
- Themes should capture: character development, plot progression, symbolism, atmosphere
- Concepts should extract: literary devices (metaphor, foreshadowing, irony), narrative techniques, character motivations
- Emotional tone is CRITICAL - capture mood shifts accurately with polarity
- Importance: Climactic scenes, character revelations, plot twists score higher (0.7-1.0)

Examples:
✅ Dialogue scene: Keep entire conversation in one chunk
✅ Action sequence: Group related actions, split at scene changes
✅ Internal monologue: Keep complete thoughts together`

    case 'nonfiction_book':
      return `
📚 NONFICTION BOOK CHUNKING GUIDANCE:
- Chunk by argumentative units (claim + evidence + conclusion)
- Keep examples WITH their explanations
- Preserve numbered/bulleted lists with their context
- Themes: main arguments, subtopics, evidence types
- Concepts: key ideas, theories, frameworks, methodologies
- Emotional tone: persuasive, informative, critical, inspirational
- Importance: Core arguments and original insights score higher (0.7-1.0)

Examples:
✅ Argument: "Claim → Supporting evidence → Conclusion" stays together
✅ Case study: Keep entire example with analysis
✅ Lists: Include list header + all items in chunk`

    case 'academic_paper':
      return `
🔬 ACADEMIC PAPER CHUNKING GUIDANCE:
- Chunk by logical sections (abstract, intro, methods, results, discussion)
- Keep research questions WITH their methodology
- Preserve citations with surrounding context
- Keep tables/figures with explanatory text
- Themes: research areas, methodologies, findings, implications
- Concepts: technical terms, theories, experimental designs, statistical methods
- Emotional tone: typically neutral/objective, note argumentative strength
- Importance: Novel findings, methodology innovations, conclusions score higher (0.8-1.0)

Examples:
✅ Methods section: Keep complete procedure description
✅ Results: Group related findings with statistical analysis
✅ Literature review: Chunk by thematic clusters of citations`

    case 'technical_manual':
      return `
🔧 TECHNICAL MANUAL CHUNKING GUIDANCE:
- Chunk by procedural units (complete instructions for ONE task)
- Keep ALL steps of a procedure together
- Preserve code blocks WITH their explanations
- Keep warnings/notes with relevant steps
- Themes: technical domains, component types, procedures, configurations
- Concepts: technical terms, APIs, parameters, error codes, best practices
- Emotional tone: instructional, cautionary, informative
- Importance: Critical procedures and troubleshooting score higher (0.7-1.0)

Examples:
✅ Installation: All steps from start to verification
✅ Code example: Code block + explanation + usage notes
✅ Troubleshooting: Problem + diagnosis + solution`

    case 'article':
      return `
📰 ARTICLE CHUNKING GUIDANCE:
- Chunk by journalistic sections (lede, development, conclusion)
- Keep quotes WITH full attribution and context
- Preserve "inverted pyramid" structure
- Themes: topics covered, angles taken, perspectives
- Concepts: names, events, data points, implications, expert opinions
- Emotional tone: objective, opinion, investigative, feature
- Importance: Key revelations, expert quotes, conclusions score higher (0.6-1.0)

Examples:
✅ Lede paragraph: Hook + core info stays together
✅ Quote: Full quote + speaker + context
✅ Data point: Statistic + source + interpretation`

    case 'essay':
      return `
✍️ ESSAY CHUNKING GUIDANCE:
- Chunk by argumentative movements (thesis, development, counterpoint, synthesis)
- Keep examples WITH their analysis
- Preserve rhetorical flow and transitions
- Themes: philosophical threads, arguments, counterarguments
- Concepts: ideas, references, implications, logical connections
- Emotional tone: argumentative stance (analytical, polemical, reflective, persuasive)
- Importance: Thesis statements, key arguments, synthesis score higher (0.7-1.0)

Examples:
✅ Thesis: Main claim + supporting preview
✅ Body paragraph: Point + evidence + analysis
✅ Counterargument: Opposing view + rebuttal`
  }
}
