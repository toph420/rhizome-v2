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

🚨 CRITICAL REQUIREMENT - EXACT TEXT PRESERVATION 🚨
You MUST copy text EXACTLY as it appears. Preserve:
- Every space, tab, and whitespace character
- Every newline and line break (\\n)
- Every special character, punctuation mark
- Every formatting character
Do NOT normalize, clean, trim, or modify the text in ANY way.

If the source has "  Two  spaces\\n\\nTwo newlines", return EXACTLY "  Two  spaces\\n\\nTwo newlines"
NOT "Two spaces\\n\\nTwo newlines" or any modified version.

🚨 ABSOLUTE HARD LIMIT - CHUNK SIZE 🚨
MAXIMUM chunk size: ${maxChunkSize} characters (approximately ${Math.floor(maxChunkSize / 6)} words)
MINIMUM chunk size: 200 words

DO NOT EVER return a chunk larger than ${maxChunkSize} characters.
This is NOT a suggestion. This is a TECHNICAL CONSTRAINT.
Your response will be REJECTED if you violate this limit.

If a semantic unit would exceed ${maxChunkSize} characters:
1. STOP immediately
2. Break it into 2-3 smaller chunks
3. Each chunk gets its own themes/concepts/emotional analysis
4. Ensure each sub-chunk is semantically coherent

Example of WRONG (will be rejected):
{
  "content": "...49,000 characters of text..." ❌ TOO LARGE
}

Example of CORRECT:
{
  "content": "...3,500 characters of text..." ✅ WITHIN LIMIT
}

A semantic chunk is a COMPLETE UNIT OF THOUGHT with these constraints:
- TARGET: 500-1200 words (2500-6000 characters)
- MINIMUM: 200 words (1000 characters)
- MAXIMUM: ${maxChunkSize} characters (ABSOLUTE HARD LIMIT)
- NEVER combine multiple distinct ideas into one chunk

Semantic chunking rules:
- May span multiple paragraphs if they form one coherent idea
- May split a long paragraph if it covers multiple distinct ideas
- Should feel like a natural "node" in a knowledge graph
- If semantic completeness would exceed ${maxChunkSize} chars, split into multiple chunks at natural boundaries

MARKDOWN STRUCTURE GUIDANCE:
- Code blocks: Keep with surrounding context (don't isolate)
- Lists: Keep intact unless they span very different topics
- Tables: Usually keep as single chunks unless very large
- Headings: Good natural boundaries, but not always required
- Prioritize semantic completeness WITHIN the ${maxChunkSize} character limit

${typeSpecificGuidance}

For each chunk you identify, extract:

1. **content**: EXACT VERBATIM TEXT from DOCUMENT TEXT section below
   - Copy EXACTLY character-by-character with NO modifications
   - Preserve ALL whitespace, newlines, and special characters
   - Do NOT trim, normalize, or clean the text
   - This must match markdown.slice(start_offset, end_offset) EXACTLY
2. **start_offset**: Character position where chunk starts (relative to DOCUMENT TEXT below, starting at 0)
3. **end_offset**: Character position where chunk ends (relative to DOCUMENT TEXT below)
4. **themes**: 2-5 key themes/topics
   - Examples: ["mortality", "alienation"], ["power dynamics", "surveillance"], ["entropy", "paranoia"]
5. **concepts**: 3-5 specific concepts with importance scores
   - Format: [{"text": "concept name", "importance": 0.8}]
   - Examples:
     - Fiction: [{"text": "stream of consciousness", "importance": 0.9}, {"text": "unreliable narrator", "importance": 0.7}]
     - Philosophy: [{"text": "phenomenology", "importance": 0.85}, {"text": "dasein", "importance": 0.9}]
   - Importance: 0.0-1.0 representing how central each concept is to the chunk
6. **importance**: 0.0-1.0 score for how significant this chunk is to the overall work
   - Higher scores for key arguments, turning points, major revelations
   - Lower scores for transitional passages, descriptive interludes
7. **summary**: Brief one-sentence summary (max 100 chars)
   - Example: "Protagonist realizes the futility of his search"
8. **domain**: Domain classification
   - Options: narrative, philosophical, academic, poetic, experimental, essayistic, etc.
9. **emotional**: Emotional metadata for detecting contradictions and tensions
   - **polarity**: -1.0 (despair, nihilism, darkness) to +1.0 (hope, affirmation, transcendence)
   - **primaryEmotion**: anxiety, melancholy, joy, dread, wonder, rage, apathy, ecstasy, etc.
   - **intensity**: 0.0-1.0 (how strongly the emotion pervades the passage)
   - Examples:
     - Absurdist fiction: {polarity: -0.3, primaryEmotion: "absurdist humor", intensity: 0.6}
     - Existential crisis: {polarity: -0.8, primaryEmotion: "dread", intensity: 0.9}
     - Mystical experience: {polarity: 0.7, primaryEmotion: "awe", intensity: 0.8}

CRITICAL REQUIREMENTS:
- Identify chunk boundaries based on semantic completeness, not paragraph breaks
- ENFORCE the ${maxChunkSize} character maximum limit - this is NOT optional
- Target 500-1200 words per chunk, NEVER exceed ${maxChunkSize} characters
- Return chunks in sequential order
- start_offset and end_offset must be accurate character positions
- content must be ONLY text from DOCUMENT TEXT section below - DO NOT include instructions or examples
- Emotional polarity is CRITICAL for detecting contradictions
- IMPORTANT: Properly escape all JSON strings (quotes, newlines, backslashes)
- IMPORTANT: Ensure all JSON is well-formed and complete
- IMPORTANT: If a semantic unit would exceed ${maxChunkSize} chars, split it into multiple chunks

Return JSON in this exact format:
{
  "chunks": [
    {
      "content": "Exact text copied from DOCUMENT TEXT...",
      "start_offset": 0,
      "end_offset": 1847,
      "themes": ["theme1", "theme2"],
      "concepts": [
        {"text": "specific concept", "importance": 0.9},
        {"text": "another concept", "importance": 0.7}
      ],
      "importance": 0.8,
      "summary": "Brief summary of chunk",
      "domain": "technical",
      "emotional": {
        "polarity": 0.3,
        "primaryEmotion": "neutral",
        "intensity": 0.4
      }
    }
  ]
}

═══════════════════════════════════════════════════════════════════════════
DOCUMENT TEXT (this text starts at character ${batch.startOffset} in the full document):
═══════════════════════════════════════════════════════════════════════════

${batch.content}

═══════════════════════════════════════════════════════════════════════════

Extract semantic chunks from the DOCUMENT TEXT above. Return ONLY valid JSON.`
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
