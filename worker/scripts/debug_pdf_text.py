#!/usr/bin/env python3
"""
Debug script to compare PDF text vs search text.
Shows exactly what text is on the PDF page.

Usage:
    python debug_pdf_text.py <pdf_path> <page_number> <search_text>
"""

import fitz  # PyMuPDF
import sys
import json

def debug_pdf_text(pdf_path: str, page_num: int, search_text: str):
    """Debug PDF text extraction to understand search failures."""

    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]

    # Get all text from page
    page_text = page.get_text()

    # Try exact search
    exact_matches = page.search_for(search_text)

    # Try normalized search (lowercase, strip whitespace)
    normalized_search = ' '.join(search_text.lower().split())
    normalized_page = ' '.join(page_text.lower().split())
    contains_normalized = normalized_search in normalized_page

    # Get first 200 chars of page text
    page_preview = page_text[:500].replace('\n', '\\n')

    # Get first 200 chars of search text
    search_preview = search_text[:200].replace('\n', '\\n')

    result = {
        'page_number': page_num,
        'search_text_length': len(search_text),
        'page_text_length': len(page_text),
        'exact_matches': len(exact_matches),
        'normalized_matches': contains_normalized,
        'search_preview': search_preview,
        'page_preview': page_preview,
        'search_text_start': search_text[:50],
        'page_text_start': page_text[:50],
    }

    doc.close()
    return result

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python debug_pdf_text.py <pdf_path> <page_number> <search_text>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    page_num = int(sys.argv[2])
    search_text = sys.argv[3]

    result = debug_pdf_text(pdf_path, page_num, search_text)
    print(json.dumps(result, indent=2))
    sys.stdout.flush()
