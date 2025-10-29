#!/usr/bin/env python3
"""
Find text in PDF using PyMuPDF and return bounding box coordinates.

Multi-strategy search with normalization and fuzzy fallbacks:
1. Exact match (fast, 95% accuracy on clean PDFs)
2. Normalized whitespace (handles formatting differences)
3. Case-insensitive (handles capitalization differences)
4. First sentence only (handles long multi-line text)

Usage:
    python find_text_in_pdf.py <pdf_path> <page_number> <search_text>

Returns:
    JSON array of rectangles: [{ "x": float, "y": float, "width": float, "height": float }, ...]
"""

import fitz  # PyMuPDF
import sys
import json
import re

def find_text_in_pdf(pdf_path: str, page_num: int, search_text: str) -> list[dict]:
    """
    Search for text on a PDF page using multi-strategy approach.

    Strategy 1: Exact match (fastest, most accurate)
    Strategy 2: Normalized whitespace (handles line breaks, extra spaces)
    Strategy 3: Case-insensitive (handles capitalization differences)
    Strategy 4: First sentence only (handles long text where endings differ)
    Strategy 5: First 100 chars (last resort for very long text)

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
        text_instances = page.search_for(search_text)
        if text_instances:
            print(f"[pymupdf] Strategy 1: Exact match found ({len(text_instances)} instances)", file=sys.stderr)
            sys.stderr.flush()
            return format_results(text_instances, doc)

        # Strategy 2: Normalize whitespace (handles line breaks, tabs, multiple spaces)
        normalized_search = normalize_whitespace(search_text)
        text_instances = page.search_for(normalized_search)
        if text_instances:
            print(f"[pymupdf] Strategy 2: Normalized whitespace match found ({len(text_instances)} instances)", file=sys.stderr)
            sys.stderr.flush()
            return format_results(text_instances, doc)

        # Strategy 3: Case-insensitive search
        page_text = page.get_text()
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
                    print(f"[pymupdf] Note: Searched for first sentence only (original text was {len(search_text)} chars)", file=sys.stderr)
                    sys.stderr.flush()
                    return format_results(text_instances, doc)

        # Strategy 5: Last resort - first 100 chars
        if len(search_text) > 100:
            short_text = search_text[:100]
            text_instances = page.search_for(short_text)
            if not text_instances:
                # Try normalized version
                text_instances = page.search_for(normalize_whitespace(short_text))

            if text_instances:
                print(f"[pymupdf] Strategy 5: First 100 chars match found ({len(text_instances)} instances)", file=sys.stderr)
                print(f"[pymupdf] Warning: Only searched first 100 of {len(search_text)} chars", file=sys.stderr)
                sys.stderr.flush()
                return format_results(text_instances, doc)

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

def format_results(text_instances: list, doc) -> list[dict]:
    """Format PyMuPDF Rect objects into JSON-serializable dicts."""
    results = []
    for rect in text_instances:
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
