#!/usr/bin/env python3
"""
Get precise word-level rectangles for PDF text selection.

Reuses same strategies from find_text_in_pdf.py for consistency:
- Strategy 1: Exact search with quads=True
- Strategy 2: Normalized whitespace
- Strategy 3: Aggressive normalization (quotes, dashes, hyphenation)
- Strategy 4: Fuzzy matching + word-level precision

Usage:
    python get_pdf_selection_rects.py <pdf_path> <page_number> <selected_text>

Returns:
    JSON array of precise word-level rectangles
"""

import fitz  # PyMuPDF
import sys
import json
import re
from difflib import SequenceMatcher


def normalize_whitespace(text: str) -> str:
    """Normalize whitespace (line breaks, tabs → single spaces)."""
    return ' '.join(text.split())


def normalize_text_aggressive(text: str) -> str:
    """Aggressive normalization matching find_text_in_pdf.py."""
    normalized = text

    # Normalize ALL Unicode quote types → @
    normalized = re.sub(r'[\u0022\u0027\u0060\u00B4\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]', '@', normalized)

    # Normalize dashes/hyphens → -
    normalized = re.sub(r'[\u2010-\u2015\u2212]', '-', normalized)

    # Remove soft hyphens
    normalized = normalized.replace('\u00AD', '')

    # Collapse whitespace
    normalized = re.sub(r'\s+', ' ', normalized)

    return normalized.strip()


def get_words_in_range(page, start_pos: int, end_pos: int, page_text: str) -> list:
    """
    Get precise word-level rectangles using page.get_text('words').

    This is the PyMuPDF utilities recommended pattern for precise highlighting.

    Returns list of fitz.Rect objects for words in character range.
    """
    words = page.get_text("words")  # (x0, y0, x1, y1, "word", block_no, line_no, word_no)

    word_rects = []
    char_pos = 0

    for word_tuple in words:
        x0, y0, x1, y1, word_text = word_tuple[:5]
        word_start = char_pos
        word_end = char_pos + len(word_text)

        # Include word if it overlaps with target range
        if word_end > start_pos and word_start < end_pos:
            rect = fitz.Rect(x0, y0, x1, y1)
            word_rects.append(rect)

        char_pos = word_end + 1  # +1 for space

    return word_rects


def fuzzy_search_in_page(page, search_text: str, threshold: float = 0.85) -> tuple:
    """
    Find text using sliding window similarity matching with word-level precision.

    Returns (word_rects, similarity_score).
    """
    page_text = page.get_text()
    search_len = len(search_text)

    # Adaptive step size for performance
    step_size = 5 if search_len < 100 else 10

    # Normalize for comparison
    search_normalized = normalize_text_aggressive(search_text).lower()
    page_normalized = normalize_text_aggressive(page_text).lower()

    best_ratio = 0.0
    best_position = -1

    # Sliding window comparison
    for i in range(0, len(page_normalized) - search_len + 1, step_size):
        window = page_normalized[i:i + search_len]
        ratio = SequenceMatcher(None, search_normalized, window).ratio()

        if ratio > best_ratio:
            best_ratio = ratio
            best_position = i

            # Early exit if excellent match
            if ratio > 0.95:
                break

    if best_ratio >= threshold:
        # Get word-level rectangles at best match position
        word_rects = get_words_in_range(page, best_position, best_position + search_len, page_text)
        return word_rects, best_ratio

    return [], best_ratio


def format_results(rects) -> list:
    """Convert PyMuPDF Rect/Quad objects to JSON-serializable format."""
    results = []
    for item in rects:
        # Handle both Rect and Quad objects
        if hasattr(item, 'rect'):  # Quad object
            rect = item.rect
        else:  # Rect object
            rect = item

        results.append({
            'x': rect.x0,
            'y': rect.y0,
            'width': rect.x1 - rect.x0,
            'height': rect.y1 - rect.y0,
        })

    return results


def get_selection_rectangles(pdf_path: str, page_num: int, selected_text: str) -> list:
    """
    Get precise word-level rectangles for selected text in PDF.

    Multi-strategy approach (same as find_text_in_pdf.py):
    1. Exact search with quads=True
    2. Normalized whitespace
    3. Aggressive normalization
    4. Fuzzy matching + word-level precision

    Returns list of rectangle dicts with x, y, width, height.
    """
    try:
        doc = fitz.open(pdf_path)
        page = doc[page_num - 1]  # 0-based indexing

        print(f"[get_pdf_selection_rects] Searching for '{selected_text[:50]}...' on page {page_num}", file=sys.stderr)

        # Strategy 1: Exact search with quads=True (4-corner precision)
        quads = page.search_for(selected_text, quads=True)
        if quads:
            print(f"[get_pdf_selection_rects] Strategy 1 (exact) found {len(quads)} instances", file=sys.stderr)
            results = format_results(quads)
            doc.close()
            return results

        # Strategy 2: Normalized whitespace
        normalized = normalize_whitespace(selected_text)
        quads = page.search_for(normalized, quads=True)
        if quads:
            print(f"[get_pdf_selection_rects] Strategy 2 (whitespace) found {len(quads)} instances", file=sys.stderr)
            results = format_results(quads)
            doc.close()
            return results

        # Strategy 3: Aggressive normalization
        aggressive_norm = normalize_text_aggressive(selected_text)
        quads = page.search_for(aggressive_norm, quads=True)
        if quads:
            print(f"[get_pdf_selection_rects] Strategy 3 (aggressive) found {len(quads)} instances", file=sys.stderr)
            results = format_results(quads)
            doc.close()
            return results

        # Strategy 4: Fuzzy matching with word-level precision
        print(f"[get_pdf_selection_rects] Trying fuzzy match...", file=sys.stderr)
        word_rects, similarity = fuzzy_search_in_page(page, selected_text)

        if word_rects:
            print(f"[get_pdf_selection_rects] Strategy 4 (fuzzy) found match with {similarity:.1%} similarity", file=sys.stderr)
            results = format_results(word_rects)
            doc.close()
            return results

        # No match found
        print(f"[get_pdf_selection_rects] No match found with any strategy", file=sys.stderr)
        doc.close()
        return []

    except Exception as e:
        print(f"[get_pdf_selection_rects] Error: {e}", file=sys.stderr)
        return []


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python get_pdf_selection_rects.py <pdf_path> <page_number> <selected_text>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    page_num = int(sys.argv[2])
    selected_text = sys.argv[3]

    results = get_selection_rectangles(pdf_path, page_num, selected_text)
    print(json.dumps(results))
