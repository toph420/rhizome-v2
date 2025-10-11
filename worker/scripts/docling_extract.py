#!/usr/bin/env python3
"""
Docling PDF extraction wrapper for Node.js integration.
Usage: python3 docling_extract.py <pdf_path> [options_json]
"""

import sys
import json
from pathlib import Path
from docling.document_converter import DocumentConverter
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.document import InputFormat

def extract_pdf(pdf_path: str, options: dict = None) -> dict:
    """
    Extract PDF to markdown using Docling.

    Args:
        pdf_path: Path to PDF file
        options: Optional configuration
            - ocr: bool (enable OCR for scanned PDFs)
            - max_pages: int (limit pages for testing)
            - page_range: tuple (start, end) for partial extraction

    Returns:
        dict with markdown, pages, success status
    """
    options = options or {}

    # Create converter with simplest configuration
    # Docling will use default PDF pipeline options
    converter = DocumentConverter()

    # Extract with progress tracking
    print(json.dumps({
        'type': 'progress',
        'status': 'starting',
        'message': 'Initializing Docling converter'
    }), flush=True)

    # Only pass max_num_pages if explicitly provided
    max_pages = options.get('max_pages')
    convert_kwargs = {}
    if max_pages is not None:
        convert_kwargs['max_num_pages'] = max_pages

    result = converter.convert(pdf_path, **convert_kwargs)

    print(json.dumps({
        'type': 'progress',
        'status': 'converting',
        'message': f'Converting {len(result.document.pages)} pages to markdown'
    }), flush=True)

    markdown = result.document.export_to_markdown()

    return {
        'markdown': markdown,
        'pages': len(result.document.pages),
        'success': True,
        'metadata': {
            'page_count': len(result.document.pages),
            'has_tables': any(page.tables for page in result.document.pages if hasattr(page, 'tables')),
            'extraction_method': 'docling'
        }
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python3 docling_extract.py <pdf_path> [options_json]'
        }), file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    options = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    try:
        # Validate PDF exists
        if not Path(pdf_path).exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        # Extract
        result = extract_pdf(pdf_path, options)

        # Output result as JSON
        print(json.dumps(result), flush=True)
        sys.exit(0)

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }
        print(json.dumps(error_result), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
