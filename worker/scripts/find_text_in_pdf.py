#!/usr/bin/env python3
"""
Find text in PDF using PyMuPDF and return bounding box coordinates.

Multi-strategy search with normalization and fuzzy fallbacks:
1. Exact match (fast, 95% accuracy on clean PDFs)
2. Normalized whitespace (handles formatting differences)
2.5. Aggressive normalization (quotes, dashes, hyphenation)
2.8. Fuzzy similarity matching (handles AI cleanup differences) ← NEW
3. Case-insensitive (handles capitalization differences)
4. First sentence only (handles long multi-line text)
5. Start+End anchors (precise long text highlighting)
6. First 100 chars expansion (last resort)

Usage:
    python find_text_in_pdf.py <pdf_path> <page_number> <search_text>

Returns:
    JSON array of rectangles: [{ "x": float, "y": float, "width": float, "height": float }, ...]
"""

import fitz  # PyMuPDF
import sys
import json
import re
from difflib import SequenceMatcher

def get_words_in_range(page, start_pos: int, end_pos: int, page_text: str) -> list:
    """
    Get precise word-level rectangles for text in a given character range.

    Uses page.get_text("words") for word-level precision instead of search_for().

    Args:
        page: PyMuPDF page object
        start_pos: Start character position in page text
        end_pos: End character position in page text
        page_text: Full page text (for position mapping)

    Returns:
        List of fitz.Rect objects for words in the range
    """
    # Get all words with their positions
    # Format: (x0, y0, x1, y1, "word", block_no, line_no, word_no)
    words = page.get_text("words")

    # Build character position map
    # We need to map character positions to word indices
    char_pos = 0
    word_rects = []

    for word_tuple in words:
        x0, y0, x1, y1, word_text = word_tuple[:5]

        # Calculate this word's character range in the page text
        word_start = char_pos
        word_end = char_pos + len(word_text)

        # Check if this word overlaps with our target range
        # A word is included if it has ANY overlap with the range
        if word_end > start_pos and word_start < end_pos:
            # Create rectangle for this word
            rect = fitz.Rect(x0, y0, x1, y1)
            word_rects.append(rect)

        # Move to next word position (include space)
        char_pos = word_end + 1  # +1 for space between words

    return word_rects

def fuzzy_search_in_page(page, search_text: str, threshold: float = 0.85) -> tuple[list, float]:
    """
    Find text using sliding window similarity matching.

    Handles content differences from AI cleanup (Gemini/Ollama rewording).
    Uses difflib.SequenceMatcher to find best match above threshold.

    Args:
        page: PyMuPDF page object
        search_text: Text to search for (from content.md)
        threshold: Minimum similarity ratio (0.0-1.0), default 0.85 (85%)

    Returns:
        Tuple of (rects, similarity_ratio):
        - rects: List of fitz.Rect objects if match found, empty list if not
        - similarity_ratio: Best match ratio found (0.0-1.0)
    """
    try:
        page_text = page.get_text()
        search_len = len(search_text)

        # If search text is very short, require higher threshold
        if search_len < 50:
            threshold = max(threshold, 0.90)  # 90% for short text

        best_match = None
        best_ratio = 0.0
        best_position = -1

        # Normalize both texts for better matching
        search_normalized = normalize_text_aggressive(search_text).lower()
        page_normalized = normalize_text_aggressive(page_text).lower()

        # Step size: smaller for short text, larger for long text (performance)
        step_size = min(10, max(5, search_len // 20))

        # Slide through page text with search window
        for i in range(0, len(page_normalized) - search_len + 1, step_size):
            window = page_normalized[i:i + search_len]
            ratio = SequenceMatcher(None, search_normalized, window).ratio()

            if ratio > best_ratio:
                best_ratio = ratio
                best_match = page_text[i:i + search_len]  # Original (non-normalized) text
                best_position = i

        print(f"[pymupdf] Fuzzy search: best match ratio = {best_ratio:.2%} (threshold = {threshold:.2%})", file=sys.stderr)
        sys.stderr.flush()

        if best_ratio >= threshold:
            # Found match! Use word-level precision to get exact rectangles
            print(f"[pymupdf] Fuzzy match found at position {best_position}:", file=sys.stderr)
            print(f"  Similarity: {best_ratio:.2%}", file=sys.stderr)
            print(f"  Search text (first 100): {search_text[:100]}...", file=sys.stderr)
            sys.stderr.flush()

            # IMPROVED: Use word-level rectangles for PRECISE highlighting
            # This is the PyMuPDF-recommended approach from the utilities
            word_rects = get_words_in_range(
                page,
                best_position,
                best_position + search_len,
                page_text
            )

            if word_rects and len(word_rects) > 0:
                print(f"[pymupdf] Fuzzy match: Got {len(word_rects)} precise word-level rectangles", file=sys.stderr)
                sys.stderr.flush()
                return word_rects, best_ratio
            else:
                print(f"[pymupdf] Fuzzy match: Found similarity but couldn't get word rectangles", file=sys.stderr)
                sys.stderr.flush()
                return [], best_ratio

        return [], best_ratio

    except Exception as e:
        print(f"[pymupdf] Fuzzy search error: {e}", file=sys.stderr)
        sys.stderr.flush()
        return [], 0.0

def find_text_in_pdf(pdf_path: str, page_num: int, search_text: str) -> list[dict]:
    """
    Search for text on a PDF page using multi-strategy approach.

    Strategy 1: Exact match (fastest, most accurate)
    Strategy 2: Normalized whitespace (handles line breaks, extra spaces)
    Strategy 2.5: Aggressive normalization (quotes, dashes, hyphenation)
    Strategy 2.8: Fuzzy similarity matching (handles AI cleanup differences) ← NEW
    Strategy 3: Case-insensitive (handles capitalization differences)
    Strategy 4: First sentence only (handles long text where endings differ)
    Strategy 5: Start+End anchors (precise long text highlighting)
    Strategy 6: First 100 chars (last resort for very long text)

    Args:
        pdf_path: Path to PDF file
        page_num: 1-indexed page number
        search_text: Text string to search for

    Returns:
        List of bounding box dicts with x, y, width, height
    """
    try:
        doc = fitz.open(pdf_path)
        page = doc[page_num - 1]  # PyMuPDF uses 0-based indexing

        # Strategy 1: Try exact match first (fast path)
        # IMPROVED: Use quads=True for more precise 4-corner coordinates
        text_instances = page.search_for(search_text, quads=True)
        if text_instances:
            print(f"[pymupdf] Strategy 1: Exact match found ({len(text_instances)} instances)", file=sys.stderr)
            sys.stderr.flush()
            return format_results(text_instances, doc)

        # Strategy 2: Normalize whitespace (handles line breaks, tabs, multiple spaces)
        normalized_search = normalize_whitespace(search_text)
        text_instances = page.search_for(normalized_search, quads=True)
        if text_instances:
            print(f"[pymupdf] Strategy 2: Normalized whitespace match found ({len(text_instances)} instances)", file=sys.stderr)
            sys.stderr.flush()
            return format_results(text_instances, doc)

        # Strategy 2.5: Aggressive normalization (quotes, dashes, hyphenation)
        # Get page text once for multiple strategies
        page_text = page.get_text()

        # Normalize BOTH the search text and page text, then find match
        search_aggressive = normalize_text_aggressive(search_text)
        page_aggressive = normalize_text_aggressive(page_text)

        # Debug: Show what we're comparing
        print(f"[pymupdf] Strategy 2.5 debug:", file=sys.stderr)
        print(f"  Search (normalized, first 100): {search_aggressive[:100]}...", file=sys.stderr)
        print(f"  Page text (first 500, normalized): {page_aggressive[:500]}...", file=sys.stderr)
        sys.stderr.flush()

        # Try to find normalized search in normalized page
        search_lower = search_aggressive.lower()
        page_lower = page_aggressive.lower()

        # Debug: Check if text is found
        found_at = page_lower.find(search_lower)
        print(f"[pymupdf] Strategy 2.5: Searching in normalized text...", file=sys.stderr)
        print(f"  Search length: {len(search_lower)} chars", file=sys.stderr)
        print(f"  Page length: {len(page_lower)} chars", file=sys.stderr)
        print(f"  Found at position: {found_at}", file=sys.stderr)
        sys.stderr.flush()

        if found_at >= 0:
            # Found it in normalized form - now extract actual PDF text at that position
            # We need to find where this text appears in the ORIGINAL (non-normalized) page text

            # Strategy: Find first few unique words and search for those in original text
            first_words = ' '.join(search_text.split()[:3])  # First 3 words
            last_words = ' '.join(search_text.split()[-3:])  # Last 3 words

            print(f"[pymupdf] Strategy 2.5: Found in normalized text, searching for anchors:", file=sys.stderr)
            print(f"  First words: '{first_words}'", file=sys.stderr)
            print(f"  Last words: '{last_words}'", file=sys.stderr)
            sys.stderr.flush()

            # Search for first words to find starting position
            start_instances = page.search_for(first_words)
            if not start_instances:
                # Try with normalized version
                start_instances = page.search_for(normalize_text_aggressive(first_words))

            if start_instances:
                print(f"[pymupdf] Strategy 2.5: Found start anchor, using anchor-based search", file=sys.stderr)
                sys.stderr.flush()
                # Let Strategy 5 handle this with proper anchor search
                # Don't return here, let it fall through to Strategy 5

        # Strategy 2.8: Fuzzy similarity matching (handles AI cleanup differences)
        fuzzy_rects, similarity_ratio = fuzzy_search_in_page(page, search_text, threshold=0.85)
        if fuzzy_rects:
            print(f"[pymupdf] Strategy 2.8: Fuzzy match found with {similarity_ratio:.2%} similarity ({len(fuzzy_rects)} instances)", file=sys.stderr)
            sys.stderr.flush()
            return format_results(fuzzy_rects, doc)

        # Strategy 3: Case-insensitive search
        text_instances = case_insensitive_search(page, page_text, search_text)
        if text_instances:
            print(f"[pymupdf] Strategy 3: Case-insensitive match found ({len(text_instances)} instances)", file=sys.stderr)
            sys.stderr.flush()
            return format_results(text_instances, doc)

        # Strategy 4: Try first sentence only (for long text with ending differences)
        if len(search_text) > 100:
            first_sentence = extract_first_sentence(search_text)
            if first_sentence and len(first_sentence) > 20:  # Must be substantial
                text_instances = page.search_for(first_sentence)
                if not text_instances:
                    # Try normalized version of first sentence
                    text_instances = page.search_for(normalize_whitespace(first_sentence))

                if text_instances:
                    print(f"[pymupdf] Strategy 4: First sentence match found ({len(text_instances)} instances)", file=sys.stderr)
                    print(f"[pymupdf] Note: Expanded from first sentence to approximate full text ({len(search_text)} chars)", file=sys.stderr)
                    sys.stderr.flush()

                    # Try to find the ending too for precise coverage
                    expanded_instances = find_text_by_start_and_end_anchors(
                        page,
                        search_text,
                        first_sentence,
                        len(search_text)
                    )

                    if expanded_instances:
                        return format_results(expanded_instances, doc)

                    # Fallback to expansion if anchor method fails
                    expanded_instances = expand_rectangles_for_long_text(
                        text_instances,
                        len(first_sentence),
                        len(search_text),
                        page
                    )
                    return format_results(expanded_instances, doc)

        # Strategy 5: Start + End anchor search for long text
        if len(search_text) > 100:
            # Try to find both start and end of the text
            start_text = search_text[:50]  # First 50 chars
            end_text = search_text[-50:]    # Last 50 chars

            expanded_instances = find_text_by_start_and_end_anchors(
                page,
                search_text,
                start_text,
                len(search_text),
                end_text
            )

            if expanded_instances:
                print(f"[pymupdf] Strategy 5: Start+End anchor match found ({len(expanded_instances)} instances)", file=sys.stderr)
                print(f"[pymupdf] Note: Used start and end anchors to find {len(search_text)} chars precisely", file=sys.stderr)
                sys.stderr.flush()
                return format_results(expanded_instances, doc)

        # Strategy 6: Last resort - first 100 chars with expansion
        if len(search_text) > 100:
            short_text = search_text[:100]
            text_instances = page.search_for(short_text)
            if not text_instances:
                # Try normalized version
                text_instances = page.search_for(normalize_whitespace(short_text))

            if text_instances:
                # Expand rectangles to cover approximate full text length
                expanded_instances = expand_rectangles_for_long_text(
                    text_instances,
                    100,
                    len(search_text),
                    page
                )
                print(f"[pymupdf] Strategy 6: First 100 chars match found ({len(text_instances)} instances)", file=sys.stderr)
                print(f"[pymupdf] Note: Expanded from 100 to {len(search_text)} chars (approximate)", file=sys.stderr)
                sys.stderr.flush()
                return format_results(expanded_instances, doc)

        # No matches found with any strategy
        print(f"[pymupdf] No matches found with any strategy (searched {len(search_text)} chars on page {page_num})", file=sys.stderr)
        sys.stderr.flush()
        doc.close()
        return []

    except Exception as e:
        print(f"[pymupdf] Error finding text: {e}", file=sys.stderr)
        sys.stderr.flush()
        return []

def normalize_whitespace(text: str) -> str:
    """
    Normalize whitespace: collapse multiple spaces, newlines, tabs into single space.
    Preserves leading/trailing context.
    """
    # Replace all whitespace sequences with single space
    normalized = re.sub(r'\s+', ' ', text)
    return normalized

def normalize_text_aggressive(text: str) -> str:
    """
    Aggressive normalization for fuzzy matching.

    Handles common PDF → Markdown differences:
    - Whitespace normalization (spaces, newlines, tabs)
    - Quote normalization (ALL quotes → neutral form using regex)
    - Dash normalization (-, –, —, ‐)
    - Hyphen removal (for line-break hyphenation)
    - Punctuation spacing
    """
    normalized = text

    # Normalize ALL quote-like characters using regex (catches all Unicode variants)
    # Unicode quote categories: \u2018-\u201F (smart quotes), \u0022 ("), \u0027 (')
    normalized = re.sub(r'[\u0022\u0027\u0060\u00B4\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]', '@', normalized)
    # This catches: " ' ` ´ ' ' ‚ ‛ " " „ ‟

    # Normalize dashes to simple hyphen
    normalized = re.sub(r'[\u2010-\u2015\u2212]', '-', normalized)  # All dash types
    # This catches: ‐ – — ― − (hyphen, en-dash, em-dash, horizontal bar, minus)

    # Remove soft hyphens (used for line breaks)
    normalized = normalized.replace('\u00AD', '')  # Soft hyphen

    # Normalize whitespace (including line breaks from hyphenation)
    normalized = re.sub(r'-\s+', '', normalized)  # Remove hyphen + line break (sug-\ngests → suggests)
    normalized = re.sub(r'\s+', ' ', normalized)  # All whitespace → single space

    # Normalize spacing around punctuation
    normalized = re.sub(r'\s+([,.!?;:])', r'\1', normalized)  # Remove space before punctuation
    normalized = re.sub(r'([,.!?;:])\s+', r'\1 ', normalized)  # Single space after punctuation

    # Trim leading/trailing whitespace
    normalized = normalized.strip()

    return normalized

def case_insensitive_search(page, page_text: str, search_text: str) -> list:
    """
    Find text case-insensitively by locating it in page text, then searching for actual casing.
    """
    search_lower = search_text.lower()
    page_lower = page_text.lower()

    # Find where it appears (case-insensitive)
    start_idx = page_lower.find(search_lower)
    if start_idx == -1:
        # Try with normalized whitespace
        search_normalized = normalize_whitespace(search_text).lower()
        page_normalized = normalize_whitespace(page_text).lower()
        start_idx = page_normalized.find(search_normalized)

        if start_idx == -1:
            return []

        # Find actual position in original text (approximate)
        # This is tricky because normalization changes indices
        # For now, search for normalized version directly
        return page.search_for(normalize_whitespace(search_text))

    # Extract the actual text as it appears in PDF (with original casing)
    actual_text = page_text[start_idx:start_idx + len(search_text)]

    # Search for the text with its actual PDF casing
    text_instances = page.search_for(actual_text)

    if text_instances:
        print(f"[pymupdf] Case-insensitive: searched for '{search_text[:30]}...', found as '{actual_text[:30]}...'", file=sys.stderr)
        sys.stderr.flush()

    return text_instances

def extract_first_sentence(text: str) -> str:
    """
    Extract first sentence from text (up to first period, question mark, or exclamation).
    Returns None if no sentence boundary found.
    """
    # Find first sentence boundary
    match = re.search(r'[.!?](?:\s|$)', text)
    if match:
        return text[:match.end()].strip()
    return None

def find_text_by_start_and_end_anchors(
    page,
    full_text: str,
    start_text: str,
    full_length: int,
    end_text: str = None
) -> list:
    """
    Find text by locating start and end anchors, then getting all text between.

    This is more accurate than estimation - we find where the text starts and ends,
    then extract all text blocks between those positions.

    Args:
        page: PyMuPDF page object
        full_text: Full search text
        start_text: Beginning portion to search for (anchor)
        full_length: Length of full text
        end_text: Ending portion to search for (optional, extracted if not provided)

    Returns:
        List of fitz.Rect objects covering the full text, or None if anchors not found
    """
    try:
        # Extract end text if not provided
        if end_text is None:
            if len(full_text) > 50:
                end_text = full_text[-50:]  # Last 50 chars
            else:
                return None  # Text too short for anchor method

        # Find start anchor
        start_rects = page.search_for(start_text)
        if not start_rects:
            # Try normalized version
            start_rects = page.search_for(normalize_whitespace(start_text))
        if not start_rects:
            return None

        # Find end anchor
        end_rects = page.search_for(end_text)
        if not end_rects:
            # Try normalized version
            end_rects = page.search_for(normalize_whitespace(end_text))
        if not end_rects:
            return None

        # Get page text to find the full text between anchors
        page_text = page.get_text()

        # Find full text in page (case-insensitive to be robust)
        full_text_normalized = normalize_whitespace(full_text).lower()
        page_text_normalized = normalize_whitespace(page_text).lower()

        text_start_idx = page_text_normalized.find(full_text_normalized)
        if text_start_idx == -1:
            # Try with original text (case-sensitive)
            text_start_idx = page_text.find(full_text)
            if text_start_idx == -1:
                return None

        # Extract the actual text as it appears in PDF
        actual_text = page_text[text_start_idx:text_start_idx + len(full_text)]

        # Now search for the full actual text
        full_rects = page.search_for(actual_text)

        if full_rects and len(full_rects) > 0:
            print(f"[pymupdf] Start+End anchor: Found complete text between anchors", file=sys.stderr)
            sys.stderr.flush()
            return full_rects

        # Fallback: Get all text blocks between start and end positions
        return get_text_blocks_between_rects(page, start_rects[0], end_rects[0])

    except Exception as e:
        print(f"[pymupdf] Start+End anchor error: {e}", file=sys.stderr)
        sys.stderr.flush()
        return None

def get_text_blocks_between_rects(page, start_rect, end_rect) -> list:
    """
    Get all text blocks between start and end rectangles.

    Args:
        page: PyMuPDF page object
        start_rect: Starting rectangle (from start anchor)
        end_rect: Ending rectangle (from end anchor)

    Returns:
        List of fitz.Rect objects covering text between start and end
    """
    # Get all text blocks on page with their positions
    blocks = page.get_text("dict")["blocks"]

    result_rects = []

    for block in blocks:
        if "lines" not in block:
            continue  # Skip image blocks

        for line in block["lines"]:
            line_bbox = line["bbox"]  # (x0, y0, x1, y1)

            # Check if this line is between start and end positions
            line_rect = fitz.Rect(line_bbox)

            # Vertical position check: line must be between start and end Y positions
            start_y = start_rect.y0
            end_y = end_rect.y1

            if line_rect.y0 >= start_y and line_rect.y1 <= end_y:
                # This line is in the vertical range
                result_rects.append(line_rect)

    return result_rects if result_rects else None

def expand_rectangles_for_long_text(
    text_instances: list,
    matched_length: int,
    full_length: int,
    page
) -> list:
    """
    Expand rectangles to approximate coverage of full text length.

    Strategy: When we only match first N chars, expand rectangles proportionally
    to cover the full text. This is approximate but better than only highlighting
    the beginning.

    Args:
        text_instances: List of fitz.Rect from PyMuPDF search
        matched_length: Length of text we actually searched for (e.g., 100 chars)
        full_length: Full length of original search text (e.g., 533 chars)
        page: PyMuPDF page object

    Returns:
        List of expanded fitz.Rect objects
    """
    if not text_instances:
        return []

    # Calculate expansion ratio
    expansion_ratio = full_length / matched_length

    # Get page dimensions for bounds checking
    page_rect = page.rect

    expanded = []
    for rect in text_instances:
        # Get the average character width from the matched rectangle
        char_width = rect.width / matched_length

        # Calculate additional width needed
        additional_chars = full_length - matched_length
        additional_width = char_width * additional_chars

        # Create expanded rectangle
        # Expand to the right (assuming left-to-right text)
        new_rect = fitz.Rect(
            rect.x0,
            rect.y0,
            min(rect.x1 + additional_width, page_rect.x1),  # Don't exceed page width
            rect.y1
        )

        # If expansion would go off page, try multi-line expansion
        if new_rect.x1 >= page_rect.x1 * 0.95:  # Near right edge
            # Estimate how many lines the full text spans
            chars_per_line = rect.width / char_width
            estimated_lines = int(full_length / chars_per_line) + 1

            # Create multiple rectangles for estimated lines
            # This is approximate - we don't know exact line breaks
            line_height = rect.height
            for line_num in range(estimated_lines):
                if line_num == 0:
                    # First line (the one we found)
                    expanded.append(rect)
                else:
                    # Subsequent lines (approximate)
                    # Start at left margin, extend to reasonable width
                    line_rect = fitz.Rect(
                        rect.x0,  # Same left margin as first line
                        rect.y0 + (line_height * 1.2 * line_num),  # Line spacing
                        min(rect.x0 + (chars_per_line * char_width), page_rect.x1),
                        rect.y1 + (line_height * 1.2 * line_num)
                    )

                    # Only add if within page bounds
                    if line_rect.y1 <= page_rect.y1:
                        expanded.append(line_rect)
        else:
            # Single-line expansion fits on page
            expanded.append(new_rect)

    return expanded

def format_results(text_instances: list, doc) -> list[dict]:
    """
    Format PyMuPDF Rect or Quad objects into JSON-serializable dicts.

    Handles both:
    - Rect objects (x0, y0, x1, y1) from quads=False
    - Quad objects (ul, ur, ll, lr) from quads=True

    Quads are more precise (4 corners) but we convert to simple rects for now.
    """
    results = []
    for item in text_instances:
        # Check if it's a Quad (has .rect attribute) or a Rect
        if hasattr(item, 'rect'):
            # It's a Quad - convert to Rect
            rect = item.rect
        else:
            # It's already a Rect
            rect = item

        results.append({
            'x': rect.x0,
            'y': rect.y0,
            'width': rect.x1 - rect.x0,
            'height': rect.y1 - rect.y0,
        })
    doc.close()
    return results

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python find_text_in_pdf.py <pdf_path> <page_number> <search_text>", file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)

    pdf_path = sys.argv[1]
    page_num = int(sys.argv[2])
    search_text = sys.argv[3]

    results = find_text_in_pdf(pdf_path, page_num, search_text)
    print(json.dumps(results))
    sys.stdout.flush()  # 🔴 CRITICAL: Always flush stdout for Python IPC
