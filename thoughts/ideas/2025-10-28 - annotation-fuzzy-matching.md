One thing I'm wondering is how can I adjust my fuzzy matches to make changes to the offset or length of an annotation that it finds in the markdown. Currently when I make an annotation in the PDF and then I switch back to mark down, I see that the annotation is highlighted, but it's often just a few characters short of the full annotation and in the sidebar, the annotation is correctbut it doesn't quite match. What the markdown actually says how can we make this work?Diagnosed fuzzy matching boundary misalignment and formulated post-processing solution.The user has implemented bidirectional PDF/markdown annotation syncing and is experiencing a common fuzzy matching issue: the match is found, but the boundaries aren't quite right. The annotation gets highlighted in the markdown view, but it's a few characters short of what it should be.
This is a classic fuzzy matching boundary problem. When you do fuzzy text matching (like using a library that finds "similar" text), it often:

Finds the general location correctly
But the start/end indices it returns don't perfectly align with word boundaries or the full semantic unit

The solution is to extend the matched boundaries intelligently:

Expand to word boundaries (don't cut words mid-character)
Try to match the original annotation length approximately
Potentially look for punctuation boundaries
Maybe even do a second-pass exact substring search in the neighborhood

Let me think about what they're likely doing:

User highlights text in PDF (gets selection text + coordinates)
System does fuzzy search in markdown content to find similar text
Stores annotation with both PDF coords and markdown offset/length
When displaying in markdown, uses the stored offset/length
But the fuzzy match returned slightly wrong boundaries

The fix is to adjust the matched offset/length before storing it. This is a post-processing step on the fuzzy match result.
Let me give them a concrete solution with actual code they can use.You need to expand the fuzzy match boundaries after finding the approximate location. The fuzzy matcher gives you the neighborhood, but you need to snap to proper boundaries.
Here's the fix:
typescriptinterface FuzzyMatchResult {
  offset: number;
  length: number;
  score: number;
}

function adjustMatchBoundaries(
  markdownContent: string,
  fuzzyMatch: FuzzyMatchResult,
  originalPdfText: string
): { offset: number; length: number } {
  
  let { offset, length } = fuzzyMatch;
  
  // Step 1: Expand to word boundaries
  // Look backwards for whitespace or start of string
  while (offset > 0 && !/\s/.test(markdownContent[offset - 1])) {
    offset--;
    length++;
  }
  
  // Look forwards for whitespace or end of string
  while (
    offset + length < markdownContent.length &&
    !/\s/.test(markdownContent[offset + length])
  ) {
    length++;
  }
  
  // Step 2: Try to match original length approximately
  // If we're way off, expand further to find better boundaries
  const targetLength = originalPdfText.length;
  const currentText = markdownContent.slice(offset, offset + length);
  
  if (Math.abs(currentText.length - targetLength) > targetLength * 0.3) {
    // We're >30% off, try to find better boundaries
    // Look for sentence/phrase boundaries nearby
    const searchWindow = markdownContent.slice(
      Math.max(0, offset - 50),
      Math.min(markdownContent.length, offset + length + 50)
    );
    
    // Find punctuation boundaries that might indicate the real span
    const punctuation = /[.!?,;:—]/g;
    let bestMatch = { offset, length, score: 0 };
    
    for (let expand = -20; expand <= 20; expand += 5) {
      const testOffset = Math.max(0, offset + expand);
      const testLength = Math.max(1, length - expand);
      const testText = markdownContent.slice(testOffset, testOffset + testLength);
      
      // Score based on: length similarity + starts with capital + ends with punctuation
      const lengthScore = 1 - Math.abs(testText.length - targetLength) / targetLength;
      const startScore = /^[A-Z]/.test(testText.trim()) ? 0.1 : 0;
      const endScore = /[.!?]$/.test(testText.trim()) ? 0.1 : 0;
      const totalScore = lengthScore + startScore + endScore;
      
      if (totalScore > bestMatch.score) {
        bestMatch = { offset: testOffset, length: testLength, score: totalScore };
      }
    }
    
    if (bestMatch.score > 0) {
      offset = bestMatch.offset;
      length = bestMatch.length;
    }
  }
  
  // Step 3: Try exact substring match in the neighborhood
  // Sometimes the fuzzy match is close but an exact substring exists nearby
  const neighborhood = markdownContent.slice(
    Math.max(0, offset - 100),
    Math.min(markdownContent.length, offset + length + 100)
  );
  
  const exactMatch = neighborhood.indexOf(originalPdfText);
  if (exactMatch !== -1) {
    // Found exact match! Use it
    const neighborhoodStart = Math.max(0, offset - 100);
    return {
      offset: neighborhoodStart + exactMatch,
      length: originalPdfText.length
    };
  }
  
  // Step 4: Trim whitespace from boundaries
  while (offset < markdownContent.length && /\s/.test(markdownContent[offset])) {
    offset++;
    length--;
  }
  
  while (length > 0 && /\s/.test(markdownContent[offset + length - 1])) {
    length--;
  }
  
  return { offset, length };
}
Usage:
typescript// After fuzzy matching finds approximate location
const fuzzyResult = fuzzySearch(markdownContent, pdfAnnotationText);

// Adjust boundaries before storing
const adjusted = adjustMatchBoundaries(
  markdownContent,
  fuzzyResult,
  pdfAnnotationText
);

// Store the adjusted values
await storeAnnotation({
  ...annotation,
  markdownOffset: adjusted.offset,
  markdownLength: adjusted.length
});
Why this works:

Word boundary expansion catches partial word matches ("Darwinian selectio" → "Darwinian selection")
Length targeting finds phrase boundaries when fuzzy matcher returned substring
Exact fallback catches cases where fuzzy matcher was overly cautious but exact text exists
Whitespace trimming removes leading/trailing spaces that break highlighting

Test it on these cases:
typescript// Case 1: Partial word match
pdfText: "natural selection"
fuzzyMatch: "natural selecti" (offset: 42, length: 15)
adjusted: "natural selection" (offset: 42, length: 17)

// Case 2: Missing punctuation
pdfText: "The origin of species."
fuzzyMatch: "The origin of species" (offset: 100, length: 21)
adjusted: "The origin of species." (offset: 100, length: 22)

// Case 3: Extra whitespace
pdfText: "phenotypic variation"
fuzzyMatch: " phenotypic variation " (offset: 199, length: 22)
adjusted: "phenotypic variation" (offset: 200, length: 20)
If this still doesn't nail it:
Check your fuzzy matching library's config. Some (like fuzzysort) return match indices that are character-by-character matches, not continuous spans. You might need to:
typescript// If using character-by-character match indices
const matchIndices = fuzzyResult.indexes; // e.g. [42, 43, 44, 46, 47, 48]
const firstIdx = Math.min(...matchIndices);
const lastIdx = Math.max(...matchIndices);

// Then expand from this range
const roughMatch = {
  offset: firstIdx,
  length: lastIdx - firstIdx + 1
};

const adjusted = adjustMatchBoundaries(markdownContent, roughMatch, pdfText);
The real question: What fuzzy matching library are you using? If it's fuse.js, fuzzysort, or a custom Levenshtein implementation, the boundary adjustment strategy differs slightly.
Show me what you're using and I'll tune the adjustment logic.RetryTGAnd if it's off by a few words?Architected strategy for expanding partial matches intelligently.The user is asking about when the fuzzy match is off by a few words - meaning the annotation in PDF references a longer passage, but the fuzzy match only found part of it, or vice versa.
This is trickier because we need to:

Detect that we're missing words
Intelligently expand to capture the full phrase
Handle cases where the markdown text is slightly different (cleanup changed wording)

The key insight is: if the annotation text from PDF doesn't match what's in markdown at the fuzzy location, we need to expand the search and look for semantic boundaries (sentence starts, punctuation, etc.) while comparing against the original PDF text.
Let me provide a strategy that:

Detects significant mismatches
Expands search in both directions
Uses multiple signals (punctuation, capitalization, word overlap)
Falls back gracefully when text genuinely doesn't exist in markdown
If it's off by whole words, you need a smarter expansion strategy. The fuzzy matcher found something, but missed context words around it.
typescriptfunction expandToFullPhrase(
  markdownContent: string,
  fuzzyMatch: FuzzyMatchResult,
  originalPdfText: string
): { offset: number; length: number; confidence: number } {
  
  const { offset: initialOffset, length: initialLength } = fuzzyMatch;
  
  // Extract words from original PDF text
  const pdfWords = originalPdfText.trim().split(/\s+/);
  const pdfFirstWord = pdfWords[0];
  const pdfLastWord = pdfWords[pdfWords.length - 1];
  
  // Get the initial matched text
  let currentText = markdownContent.slice(initialOffset, initialOffset + initialLength);
  
  // Step 1: Check if we already have a good match
  const overlapScore = calculateWordOverlap(currentText, originalPdfText);
  if (overlapScore > 0.9) {
    // Good enough, just clean boundaries
    return adjustMatchBoundaries(markdownContent, fuzzyMatch, originalPdfText);
  }
  
  // Step 2: We're missing words. Expand in both directions.
  let expandedOffset = initialOffset;
  let expandedLength = initialLength;
  let bestMatch = { offset: initialOffset, length: initialLength, confidence: overlapScore };
  
  // Maximum expansion: 50 words in each direction
  const maxExpansion = 200; // characters
  
  // Try expanding backwards to find the first word
  let backwardExpansion = 0;
  while (backwardExpansion < maxExpansion && expandedOffset > 0) {
    // Expand by word boundaries
    const prevChar = markdownContent[expandedOffset - 1];
    if (/\s/.test(prevChar)) {
      // Found word boundary, check if we should include this word
      let wordStart = expandedOffset - 1;
      while (wordStart > 0 && !/\s/.test(markdownContent[wordStart - 1])) {
        wordStart--;
      }
      
      const prevWord = markdownContent.slice(wordStart, expandedOffset).trim();
      
      // Check if this word appears in original PDF text
      if (originalPdfText.includes(prevWord)) {
        expandedOffset = wordStart;
        expandedLength += (initialOffset - wordStart);
        backwardExpansion = 0; // Reset - we found something useful
      } else if (prevWord === pdfFirstWord) {
        // Exact match on first word - definitely include it
        expandedOffset = wordStart;
        expandedLength += (initialOffset - wordStart);
        break; // Found the start
      } else {
        backwardExpansion++;
      }
    }
    
    expandedOffset--;
    expandedLength++;
  }
  
  // Reset to the expanded offset
  expandedOffset = Math.max(0, expandedOffset);
  
  // Try expanding forwards to find the last word
  let forwardExpansion = 0;
  const initialEnd = initialOffset + initialLength;
  let expandedEnd = initialEnd;
  
  while (forwardExpansion < maxExpansion && expandedEnd < markdownContent.length) {
    const nextChar = markdownContent[expandedEnd];
    if (/\s/.test(nextChar)) {
      // Found word boundary, check if we should include next word
      let wordEnd = expandedEnd + 1;
      while (wordEnd < markdownContent.length && !/\s/.test(markdownContent[wordEnd])) {
        wordEnd++;
      }
      
      const nextWord = markdownContent.slice(expandedEnd, wordEnd).trim();
      
      if (originalPdfText.includes(nextWord)) {
        expandedEnd = wordEnd;
        expandedLength = expandedEnd - expandedOffset;
        forwardExpansion = 0; // Reset
      } else if (nextWord === pdfLastWord) {
        expandedEnd = wordEnd;
        expandedLength = expandedEnd - expandedOffset;
        break; // Found the end
      } else {
        forwardExpansion++;
      }
    }
    
    expandedEnd++;
  }
  
  expandedLength = expandedEnd - expandedOffset;
  
  // Step 3: Score the expanded match
  const expandedText = markdownContent.slice(expandedOffset, expandedOffset + expandedLength);
  const expandedScore = calculateWordOverlap(expandedText, originalPdfText);
  
  // Step 4: Try alternative strategy - look for sentence boundaries
  // Sometimes the annotation spans multiple sentences
  const sentenceBoundaryMatch = findBySentenceBoundaries(
    markdownContent,
    initialOffset,
    originalPdfText
  );
  
  if (sentenceBoundaryMatch.confidence > expandedScore) {
    return sentenceBoundaryMatch;
  }
  
  // Step 5: If still poor match, try sliding window
  if (expandedScore < 0.7) {
    const slidingMatch = slidingWindowSearch(
      markdownContent,
      initialOffset,
      originalPdfText
    );
    
    if (slidingMatch.confidence > expandedScore) {
      return slidingMatch;
    }
  }
  
  return {
    offset: expandedOffset,
    length: expandedLength,
    confidence: expandedScore
  };
}

function calculateWordOverlap(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size; // Jaccard similarity
}

function findBySentenceBoundaries(
  markdownContent: string,
  approximateOffset: number,
  originalPdfText: string
): { offset: number; length: number; confidence: number } {
  
  // Look for sentence boundaries around the approximate location
  const searchStart = Math.max(0, approximateOffset - 500);
  const searchEnd = Math.min(markdownContent.length, approximateOffset + 500);
  const searchWindow = markdownContent.slice(searchStart, searchEnd);
  
  // Find all sentence boundaries
  const sentencePattern = /[.!?]\s+[A-Z]|^[A-Z]/g;
  const boundaries: number[] = [0];
  
  let match;
  while ((match = sentencePattern.exec(searchWindow)) !== null) {
    boundaries.push(match.index);
  }
  boundaries.push(searchWindow.length);
  
  // Try each combination of sentence boundaries
  let bestMatch = { offset: approximateOffset, length: 0, confidence: 0 };
  
  for (let i = 0; i < boundaries.length - 1; i++) {
    for (let j = i + 1; j < boundaries.length; j++) {
      const candidateStart = searchStart + boundaries[i];
      const candidateEnd = searchStart + boundaries[j];
      const candidateText = markdownContent.slice(candidateStart, candidateEnd).trim();
      
      const score = calculateWordOverlap(candidateText, originalPdfText);
      
      if (score > bestMatch.confidence) {
        bestMatch = {
          offset: candidateStart,
          length: candidateText.length,
          confidence: score
        };
      }
    }
  }
  
  return bestMatch;
}

function slidingWindowSearch(
  markdownContent: string,
  approximateOffset: number,
  originalPdfText: string
): { offset: number; length: number; confidence: number } {
  
  const targetLength = originalPdfText.length;
  const searchStart = Math.max(0, approximateOffset - 200);
  const searchEnd = Math.min(markdownContent.length, approximateOffset + 200);
  
  let bestMatch = { offset: approximateOffset, length: targetLength, confidence: 0 };
  
  // Slide window of approximately target length
  for (let windowSize = targetLength * 0.7; windowSize <= targetLength * 1.3; windowSize += 10) {
    for (let offset = searchStart; offset <= searchEnd - windowSize; offset += 5) {
      const windowText = markdownContent.slice(offset, offset + windowSize);
      const score = calculateWordOverlap(windowText, originalPdfText);
      
      if (score > bestMatch.confidence) {
        bestMatch = {
          offset,
          length: windowSize,
          confidence: score
        };
      }
    }
  }
  
  return bestMatch;
}
Usage with confidence threshold:
typescriptconst fuzzyResult = fuzzySearch(markdownContent, pdfAnnotationText);
const expanded = expandToFullPhrase(markdownContent, fuzzyResult, pdfAnnotationText);

if (expanded.confidence < 0.6) {
  // Text doesn't really exist in markdown - mark as PDF-only annotation
  console.warn('Low confidence match:', expanded.confidence);
  
  await storeAnnotation({
    ...annotation,
    pdfOnly: true, // Flag for degraded sync
    attemptedMarkdownOffset: expanded.offset,
    attemptedMarkdownLength: expanded.length,
    matchConfidence: expanded.confidence
  });
} else {
  // Good match, store normally
  await storeAnnotation({
    ...annotation,
    markdownOffset: expanded.offset,
    markdownLength: expanded.length,
    matchConfidence: expanded.confidence
  });
}
The degraded sync UX:
When confidence < 0.6, show in the sidebar but not highlighted in markdown:
typescript// In your annotation display component
{annotation.pdfOnly ? (
  <div className="annotation-pdf-only">
    <p className="text-sm text-muted-foreground">
      From PDF (text differs in markdown)
    </p>
    <p>{annotation.text}</p>
    <button onClick={() => showInPdfView(annotation)}>
      View in PDF
    </button>
  </div>
) : (
  <AnnotationHighlight annotation={annotation} />
)}
Test on these cases:

Missing intro words: PDF has "In Darwin's view, natural selection..." but markdown just has "natural selection..."
Missing trailing words: PDF has "natural selection drives evolution" but markdown has "natural selection drives"
Reworded middle: PDF has "the theory of natural selection" but markdown has "the theory of evolution by natural selection"
Genuinely different: AI cleanup changed the text substantially - should flag as PDF-only

The key insight: Store the confidence score. Show it to yourself in console. If you're consistently getting <0.7 scores, your markdown extraction is too aggressive and you need to preserve more original text.
What's your typical confidence score on these mismatches?RetryTGGreat info. Now, how does the bidirectional annotating work. Like how do I make annotations in the markdown and have them appear in the pdfArchitected bidirectional annotation mapping between markdown and PDF coordinates.10sThis is the reverse direction - annotating in markdown view and then having those annotations appear in the PDF view. This is actually harder than PDF→markdown because:

Markdown annotations have offset/length in the text content
PDFs are page-based with rect coordinates (x, y, width, height on a specific page)
You need to map text position → PDF page + coordinates

The key challenges:

Finding which PDF page contains the text
Finding the exact position on that page (bounding box)
Handling text that spans multiple pages
Handling text that was OCR'd poorly or doesn't match exactly

Let me think about the practical approach:
Option 1: Text search in PDF

Use react-pdf's text extraction per page
Search for the annotated text
Get the text items' positions
Draw highlight over those positions

Option 2: Character position mapping

Build a map of character position → page/rect during PDF load
Use this map to translate markdown offset → PDF coordinates
More precise but expensive upfront

Option 3: Hybrid

Extract text per page (react-pdf does this)
When user annotates in markdown, search for that text in the PDF pages
Calculate bounding boxes from text items
Store those coordinates with the annotation

I think Option 3 is most practical. Here's the flow:

User highlights text in markdown (gets offset/length)
Extract that text substring
Search PDF pages for matching text
When found, get the textContent items and their transforms
Calculate bounding box from those items
Store annotation with both markdown position AND PDF coordinates
Render highlight in PDF view using those coordinates

Let me write this out practically.Markdown → PDF is the harder direction because PDFs are coordinate-based. You need to:

Find which PDF page contains the text
Get the bounding box coordinates for that text
Store both representations on the annotation

Here's how:
typescript// When user creates annotation in markdown view
async function createMarkdownAnnotation(
  documentId: string,
  markdownOffset: number,
  markdownLength: number,
  annotationText: string,
  userNote: string
) {
  // Step 1: Extract the actual text from markdown
  const doc = await getDocument(documentId);
  const highlightedText = doc.content.slice(markdownOffset, markdownOffset + markdownLength);
  
  // Step 2: Find this text in the PDF and get coordinates
  const pdfCoordinates = await findTextInPdf(doc.pdfPath, highlightedText);
  
  if (!pdfCoordinates) {
    // Text not found in PDF - store as markdown-only annotation
    console.warn('Could not locate text in PDF');
    return await storeAnnotation({
      documentId,
      markdownOffset,
      markdownLength,
      text: annotationText,
      note: userNote,
      markdownOnly: true, // Flag for degraded sync
    });
  }
  
  // Step 3: Store annotation with both representations
  return await storeAnnotation({
    documentId,
    markdownOffset,
    markdownLength,
    pdfPageNumber: pdfCoordinates.pageNumber,
    pdfRects: pdfCoordinates.rects, // Array of {x, y, width, height}
    text: annotationText,
    note: userNote,
    syncConfidence: pdfCoordinates.confidence,
  });
}
The critical function - finding text in PDF:
typescriptimport { getDocument as getPdfDocument } from 'pdfjs-dist';

interface PdfTextPosition {
  pageNumber: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  confidence: number;
}

async function findTextInPdf(
  pdfPath: string,
  searchText: string
): Promise<PdfTextPosition | null> {
  
  const loadingTask = getPdfDocument(pdfPath);
  const pdf = await loadingTask.promise;
  
  // Search through all pages
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Extract text items with their positions
    const textItems = textContent.items.map((item: any) => ({
      text: item.str,
      transform: item.transform, // [scaleX, skewY, skewX, scaleY, translateX, translateY]
      width: item.width,
      height: item.height,
    }));
    
    // Build full page text to search in
    const pageText = textItems.map(item => item.text).join('');
    
    // Try exact match first
    let matchIndex = pageText.indexOf(searchText);
    let matchType: 'exact' | 'fuzzy' | null = matchIndex !== -1 ? 'exact' : null;
    
    // If no exact match, try fuzzy
    if (matchIndex === -1) {
      const fuzzyResult = fuzzySearchInPage(pageText, searchText);
      if (fuzzyResult && fuzzyResult.score > 0.8) {
        matchIndex = fuzzyResult.index;
        matchType = 'fuzzy';
      }
    }
    
    if (matchIndex !== -1) {
      // Found the text on this page - now get bounding boxes
      const rects = calculateBoundingBoxes(
        textItems,
        matchIndex,
        searchText.length,
        page.view // [x1, y1, x2, y2] - page dimensions
      );
      
      return {
        pageNumber: pageNum,
        rects,
        confidence: matchType === 'exact' ? 1.0 : 0.8,
      };
    }
  }
  
  return null; // Text not found in PDF
}

function calculateBoundingBoxes(
  textItems: Array<{ text: string; transform: number[]; width: number; height: number }>,
  startIndex: number,
  length: number,
  pageView: number[]
): Array<{ x: number; y: number; width: number; height: number }> {
  
  // Find which text items contain our match
  let charCount = 0;
  let startItemIndex = -1;
  let endItemIndex = -1;
  let startCharOffset = 0;
  let endCharOffset = 0;
  
  for (let i = 0; i < textItems.length; i++) {
    const itemLength = textItems[i].text.length;
    
    if (charCount <= startIndex && charCount + itemLength > startIndex) {
      startItemIndex = i;
      startCharOffset = startIndex - charCount;
    }
    
    if (charCount < startIndex + length && charCount + itemLength >= startIndex + length) {
      endItemIndex = i;
      endCharOffset = (startIndex + length) - charCount;
      break;
    }
    
    charCount += itemLength;
  }
  
  if (startItemIndex === -1 || endItemIndex === -1) {
    return []; // Couldn't map to text items
  }
  
  // Calculate bounding boxes for the matched items
  const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  const [, , , , pageWidth, pageHeight] = pageView;
  
  for (let i = startItemIndex; i <= endItemIndex; i++) {
    const item = textItems[i];
    const [scaleX, skewY, skewX, scaleY, translateX, translateY] = item.transform;
    
    // Calculate actual position
    // PDF coordinates are bottom-left origin, might need to flip Y
    let x = translateX;
    let y = pageHeight - translateY; // Flip Y coordinate
    let width = item.width;
    let height = item.height;
    
    // If this is the first or last item, adjust for partial character coverage
    if (i === startItemIndex && startCharOffset > 0) {
      const charWidth = width / item.text.length;
      x += charWidth * startCharOffset;
      width -= charWidth * startCharOffset;
    }
    
    if (i === endItemIndex && endCharOffset < item.text.length) {
      const charWidth = width / item.text.length;
      width = charWidth * endCharOffset;
    }
    
    rects.push({ x, y, width, height });
  }
  
  // Merge adjacent rects on same line
  return mergeAdjacentRects(rects);
}

function mergeAdjacentRects(
  rects: Array<{ x: number; y: number; width: number; height: number }>
): Array<{ x: number; y: number; width: number; height: number }> {
  
  if (rects.length === 0) return [];
  
  const merged: typeof rects = [];
  let current = { ...rects[0] };
  
  for (let i = 1; i < rects.length; i++) {
    const next = rects[i];
    
    // Check if on same line (Y coordinates close)
    const sameLineTolerance = current.height * 0.3;
    const onSameLine = Math.abs(next.y - current.y) < sameLineTolerance;
    
    // Check if adjacent (X coordinates close)
    const adjacentTolerance = current.height * 0.5; // Allow small gaps
    const isAdjacent = Math.abs((current.x + current.width) - next.x) < adjacentTolerance;
    
    if (onSameLine && isAdjacent) {
      // Merge into current rect
      current.width = (next.x + next.width) - current.x;
      current.height = Math.max(current.height, next.height);
    } else {
      // Start new rect
      merged.push(current);
      current = { ...next };
    }
  }
  
  merged.push(current);
  return merged;
}
Rendering highlights in PDF view:
typescript// In your PDF viewer component
function PdfAnnotationLayer({ 
  annotations, 
  pageNumber, 
  scale 
}: { 
  annotations: Annotation[];
  pageNumber: number;
  scale: number;
}) {
  
  // Filter to annotations on this page
  const pageAnnotations = annotations.filter(
    a => a.pdfPageNumber === pageNumber && a.pdfRects
  );
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageAnnotations.map(annotation => (
        annotation.pdfRects?.map((rect, idx) => (
          <div
            key={`${annotation.id}-${idx}`}
            className="absolute bg-yellow-200/40 border border-yellow-400 pointer-events-auto cursor-pointer"
            style={{
              left: `${rect.x * scale}px`,
              top: `${rect.y * scale}px`,
              width: `${rect.width * scale}px`,
              height: `${rect.height * scale}px`,
            }}
            onClick={() => showAnnotationDetails(annotation)}
          />
        ))
      ))}
    </div>
  );
}
The complete data model for bidirectional annotations:
typescriptinterface Annotation {
  id: string;
  documentId: string;
  
  // Markdown representation
  markdownOffset: number;
  markdownLength: number;
  
  // PDF representation (optional - might not exist)
  pdfPageNumber?: number;
  pdfRects?: Array<{ x: number; y: number; width: number; height: number }>;
  
  // The actual annotation content
  text: string; // The highlighted text
  note?: string; // User's note on the highlight
  
  // Sync metadata
  syncConfidence: number; // 0-1, how confident we are about the mapping
  markdownOnly?: boolean; // True if couldn't find in PDF
  pdfOnly?: boolean; // True if couldn't find in markdown
  
  // Chunk reference (for connections)
  chunkId?: string;
  
  createdAt: string;
  updatedAt: string;
}
Edge cases to handle:
typescript// Case 1: Text spans multiple pages
// -> Create multiple annotations, one per page
// -> Link them with a `spanGroup` ID

// Case 2: Text not found in PDF
// -> Store as markdownOnly: true
// -> Show in sidebar but not in PDF view

// Case 3: Low confidence match
// -> Store with warning
// -> Let user manually adjust position in PDF view

// Case 4: Text exists multiple times in PDF
// -> Use context (surrounding words) to pick correct instance
// -> Or ask user to confirm which one
The sync flow when switching views:
typescript// User annotates in markdown, switches to PDF
async function syncToPdfView(documentId: string) {
  const annotations = await getAnnotations(documentId);
  
  // Find any markdown-only annotations
  const unsyncedAnnotations = annotations.filter(a => !a.pdfRects && !a.markdownOnly);
  
  for (const annotation of unsyncedAnnotations) {
    const doc = await getDocument(documentId);
    const highlightedText = doc.content.slice(
      annotation.markdownOffset,
      annotation.markdownOffset + annotation.markdownLength
    );
    
    const pdfCoords = await findTextInPdf(doc.pdfPath, highlightedText);
    
    if (pdfCoords) {
      await updateAnnotation(annotation.id, {
        pdfPageNumber: pdfCoords.pageNumber,
        pdfRects: pdfCoords.rects,
        syncConfidence: pdfCoords.confidence,
      });
    } else {
      await updateAnnotation(annotation.id, {
        markdownOnly: true,
      });
    }
  }
}
The real challenges:

PDF text extraction is imperfect - OCR'd PDFs have garbled text
Coordinate systems are tricky - origin is bottom-left, might need transforms
Multi-page spans - annotation starts on page 3, ends on page 4
Performance - searching all pages is slow for 500-page books

Optimizations:
typescript// Cache PDF text content per page
const pdfTextCache = new Map<string, Map<number, TextContent>>();

async function getCachedTextContent(pdfPath: string, pageNum: number) {
  if (!pdfTextCache.has(pdfPath)) {
    pdfTextCache.set(pdfPath, new Map());
  }
  
  const pageCache = pdfTextCache.get(pdfPath)!;
  
  if (!pageCache.has(pageNum)) {
    const pdf = await getPdfDocument(pdfPath).promise;
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    pageCache.set(pageNum, textContent);
  }
  
  return pageCache.get(pageNum)!;
}

// Build full PDF text index on first load
async function buildPdfTextIndex(pdfPath: string): Promise<Map<number, string>> {
  const index = new Map<number, string>();
  const pdf = await getPdfDocument(pdfPath).promise;
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const textContent = await getCachedTextContent(pdfPath, i);
    const pageText = textContent.items.map((item: any) => item.str).join('');
    index.set(i, pageText);
  }
  
  return index;
}
Test it on:

Clean PDF with perfect text extraction
Scanned PDF with OCR errors
Annotation that spans page break
Same text appearing multiple times in document

What PDF library are you using for rendering? The coordinate math varies slightly between react-pdf, pdf.js raw, and react-pdf-highlighter.RetryTGWell our annotations fortunately already have a lot of the pdf metadata based on the chunk they are within. Page number is one them. We already use docling to extract from pdf initially I'm wondering if we could use it to map bounding box rectangles.Synthesized Docling's structured output to map annotation bounding boxes efficiently.Oh this is interesting - they already have PDF metadata from Docling's extraction. Docling extracts rich structural information including bounding boxes for text elements. If their chunks already have page numbers from the initial Docling extraction, they can likely reuse that pipeline.
Let me think about this:

Docling extracts PDF with bounding boxes for text elements
Chunks are created from that extraction and store page numbers
Annotations reference chunks
So annotations already know which page they're on

The question is: can they use Docling to get the bounding boxes for arbitrary text spans?
Docling returns structured data with bounding boxes for elements like paragraphs, headings, tables, etc. The format looks something like:
python{
  "pages": [
    {
      "page_no": 1,
      "elements": [
        {
          "text": "Some paragraph text...",
          "bbox": {"l": 72, "t": 100, "r": 540, "b": 120},
          "type": "paragraph"
        }
      ]
    }
  ]
}
So they could:

Store the Docling extraction output (with bboxes) alongside the markdown
When creating markdown annotation, find the corresponding text in the Docling output
Extract the bounding boxes from Docling's data
Store those on the annotation

This is actually much better than using pdf.js to search because:

Docling already parsed it once
They already have the structured output
No need to re-parse the PDF
Bounding boxes are already calculated

The challenge is mapping from markdown character offset to Docling element. But they already do this for chunks! So they can reuse that mapping logic.
Let me provide a concrete implementation.This is way better. You already have the bounding boxes from Docling - just reuse them.
Here's the approach:
typescript// Store Docling's extraction output alongside markdown
interface DoclingPage {
  page_no: number;
  size: { width: number; height: number };
  elements: Array<{
    text: string;
    bbox: { l: number; t: number; r: number; b: number }; // left, top, right, bottom
    type: 'paragraph' | 'heading' | 'table' | 'list' | string;
  }>;
}

interface DocumentStorage {
  content: string; // Clean markdown for display
  doclingOutput: DoclingPage[]; // Raw Docling extraction with bboxes
  chunks: Chunk[]; // Semantic chunks with metadata
}
When you extract with Docling, save the full output:
python# In your extraction worker
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert("document.pdf")

# Save both representations
storage = {
    "content": result.document.export_to_markdown(),
    "docling_output": result.document.export_to_dict(),  # Includes bboxes!
    "chunks": create_chunks(result.document.export_to_markdown())
}

upload_to_storage(document_id, "extraction.json", storage)
Map markdown annotation to bounding boxes:
typescriptasync function findBoundingBoxesForAnnotation(
  documentId: string,
  markdownOffset: number,
  markdownLength: number
): Promise<{
  pageNumber: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
} | null> {
  
  // Load the stored Docling output
  const doc = await loadDocumentStorage(documentId);
  const highlightedText = doc.content.slice(markdownOffset, markdownOffset + markdownLength);
  
  // Build character offset map from Docling elements to markdown
  let currentOffset = 0;
  const offsetMap: Array<{
    markdownStart: number;
    markdownEnd: number;
    element: DoclingPage['elements'][0];
    pageNumber: number;
  }> = [];
  
  for (const page of doc.doclingOutput) {
    for (const element of page.elements) {
      // Docling text might differ slightly from markdown
      // (e.g., markdown adds newlines between elements)
      const elementText = element.text;
      const markdownIndex = doc.content.indexOf(elementText, currentOffset);
      
      if (markdownIndex !== -1) {
        offsetMap.push({
          markdownStart: markdownIndex,
          markdownEnd: markdownIndex + elementText.length,
          element,
          pageNumber: page.page_no,
        });
        currentOffset = markdownIndex + elementText.length;
      }
    }
  }
  
  // Find which Docling elements overlap with the annotation
  const annotationStart = markdownOffset;
  const annotationEnd = markdownOffset + markdownLength;
  
  const overlappingElements = offsetMap.filter(entry => {
    // Check for overlap
    return !(entry.markdownEnd < annotationStart || entry.markdownStart > annotationEnd);
  });
  
  if (overlappingElements.length === 0) {
    return null; // Couldn't map to Docling elements
  }
  
  // Most annotations are within a single element
  if (overlappingElements.length === 1) {
    const entry = overlappingElements[0];
    const bbox = entry.element.bbox;
    
    // Calculate partial bbox if annotation doesn't cover full element
    const elementLength = entry.element.text.length;
    const annotationStartInElement = Math.max(0, annotationStart - entry.markdownStart);
    const annotationEndInElement = Math.min(elementLength, annotationEnd - entry.markdownStart);
    
    const startRatio = annotationStartInElement / elementLength;
    const endRatio = annotationEndInElement / elementLength;
    
    // Approximate horizontal position within element
    // (This is rough - assumes uniform character width)
    const bboxWidth = bbox.r - bbox.l;
    const annotationLeft = bbox.l + (bboxWidth * startRatio);
    const annotationRight = bbox.l + (bboxWidth * endRatio);
    
    return {
      pageNumber: entry.pageNumber,
      rects: [{
        x: annotationLeft,
        y: bbox.t,
        width: annotationRight - annotationLeft,
        height: bbox.b - bbox.t,
      }],
    };
  }
  
  // Annotation spans multiple elements (e.g., crosses paragraphs)
  const rects = overlappingElements.map(entry => {
    const bbox = entry.element.bbox;
    
    // For first/last elements, calculate partial coverage
    const isFirst = entry === overlappingElements[0];
    const isLast = entry === overlappingElements[overlappingElements.length - 1];
    
    let left = bbox.l;
    let right = bbox.r;
    
    if (isFirst) {
      const startInElement = annotationStart - entry.markdownStart;
      const ratio = startInElement / entry.element.text.length;
      left = bbox.l + ((bbox.r - bbox.l) * ratio);
    }
    
    if (isLast) {
      const endInElement = annotationEnd - entry.markdownStart;
      const ratio = endInElement / entry.element.text.length;
      right = bbox.l + ((bbox.r - bbox.l) * ratio);
    }
    
    return {
      x: left,
      y: bbox.t,
      width: right - left,
      height: bbox.b - bbox.t,
    };
  });
  
  // All elements should be on same page (or we need to handle multi-page)
  const pageNumber = overlappingElements[0].pageNumber;
  
  return { pageNumber, rects };
}
Simpler approach if you're okay with element-level granularity:
typescriptasync function findBoundingBoxesSimple(
  documentId: string,
  markdownOffset: number,
  markdownLength: number
): Promise<{
  pageNumber: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
} | null> {
  
  const doc = await loadDocumentStorage(documentId);
  const highlightedText = doc.content.slice(markdownOffset, markdownOffset + markdownLength);
  
  // Find which page(s) contain this text
  for (const page of doc.doclingOutput) {
    for (const element of page.elements) {
      if (element.text.includes(highlightedText)) {
        // Found it! Use the whole element's bbox
        const bbox = element.bbox;
        return {
          pageNumber: page.page_no,
          rects: [{
            x: bbox.l,
            y: bbox.t,
            width: bbox.r - bbox.l,
            height: bbox.b - bbox.t,
          }],
        };
      }
    }
  }
  
  return null;
}
Even simpler - leverage chunk metadata you already have:
typescript// Your chunks already have page numbers from Docling!
interface Chunk {
  id: string;
  content: string;
  pageNumber: number; // From Docling
  // ... other metadata
}

async function findBoundingBoxesFromChunk(
  annotation: {
    chunkId: string;
    markdownOffset: number;
    markdownLength: number;
  }
): Promise<{
  pageNumber: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
} | null> {
  
  // Get the chunk
  const chunk = await getChunk(annotation.chunkId);
  
  // Already know the page number!
  const pageNumber = chunk.pageNumber;
  
  // Load Docling output for that page only
  const doc = await loadDocumentStorage(chunk.documentId);
  const page = doc.doclingOutput.find(p => p.page_no === pageNumber);
  
  if (!page) return null;
  
  // Find which element(s) on this page contain the chunk text
  const chunkText = chunk.content;
  
  for (const element of page.elements) {
    if (element.text.includes(chunkText)) {
      // Found the chunk's element - use its bbox
      const bbox = element.bbox;
      return {
        pageNumber,
        rects: [{
          x: bbox.l,
          y: bbox.t,
          width: bbox.r - bbox.l,
          height: bbox.b - bbox.t,
        }],
      };
    }
  }
  
  // Fallback: use entire page bbox
  return {
    pageNumber,
    rects: [{
      x: 0,
      y: 0,
      width: page.size.width,
      height: page.size.height,
    }],
  };
}
Storage structure:
typescript// In Supabase Storage: /documents/{documentId}/extraction.json
{
  "content": "# Chapter 1\n\nDarwin's theory...", // Clean markdown
  "docling_output": [
    {
      "page_no": 1,
      "size": { "width": 612, "height": 792 },
      "elements": [
        {
          "text": "Darwin's theory of natural selection...",
          "bbox": { "l": 72, "t": 100, "r": 540, "b": 120 },
          "type": "paragraph"
        }
      ]
    }
  ],
  "chunks": [...] // With page numbers from Docling
}
The winning strategy:
Since your annotations already reference chunks, and chunks already have page numbers:

Annotation created in markdown → already has chunkId → chunk has pageNumber
Load Docling output for that page → find element containing chunk text
Use element's bbox → store on annotation
Render in PDF view → you already have coordinates

No fuzzy text searching across 500 pages. No PDF.js parsing. Just reuse Docling's work.
The only edge case: annotation spans multiple chunks (rare). Handle by:

Storing multiple rects (one per chunk)
Or just highlighting the first chunk's bbox
Or prompting user to split annotation

What does your chunk metadata actually include from Docling? Do you store the element bboxes on chunks themselves, or would you need to look them up from the stored Docling output?