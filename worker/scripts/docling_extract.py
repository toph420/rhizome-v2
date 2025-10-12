#!/usr/bin/env python3
"""
Docling PDF extraction wrapper with HybridChunker integration for Node.js.

Usage: python3 docling_extract.py <pdf_path> [options_json]

Options:
    - enable_chunking: bool (default: false)
    - chunk_size: int (default: 512 tokens)
    - tokenizer: str (default: 'Xenova/all-mpnet-base-v2')
    - ocr: bool (enable OCR for scanned PDFs)
    - max_pages: int (limit pages for testing)
"""

import sys
import json
from pathlib import Path
from typing import Optional, Dict, List, Any
import traceback

from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.document import InputFormat


def emit_progress(stage: str, percent: int, message: str):
    """Emit progress update to Node.js via stdout.

    CRITICAL: Must flush immediately or Node.js IPC will hang.
    """
    sys.stdout.write(json.dumps({
        'type': 'progress',
        'stage': stage,
        'percent': percent,
        'message': message
    }) + '\n')
    sys.stdout.flush()  # REQUIRED for IPC


def extract_document_structure(doc) -> Dict[str, Any]:
    """
    Extract heading hierarchy and structure from Docling document.

    Returns:
        {
            'headings': [{'level': int, 'text': str, 'page': int}],
            'total_pages': int,
            'sections': []
        }
    """
    structure = {
        'headings': [],
        'total_pages': 0,
        'sections': []
    }

    try:
        # Extract headings from document hierarchy
        for item in doc.iterate_items():
            # Docling labels: title, heading, section_header
            if hasattr(item, 'label') and item.label in ['title', 'heading', 'section_header']:
                heading = {
                    'text': str(item.text) if hasattr(item, 'text') else '',
                    'level': getattr(item, 'level', 1),
                    'page': None
                }

                # Extract page number from provenance
                if hasattr(item, 'prov') and item.prov:
                    try:
                        heading['page'] = item.prov[0].page
                    except (IndexError, AttributeError):
                        pass

                structure['headings'].append(heading)

        # Get total pages
        if hasattr(doc, 'pages'):
            structure['total_pages'] = len(doc.pages)

    except Exception as e:
        # Don't fail extraction if structure parsing fails
        print(f"Warning: Failed to extract structure: {e}", file=sys.stderr)

    return structure


def extract_chunk_metadata(chunk, doc) -> Dict[str, Any]:
    """
    Extract rich metadata from HybridChunker chunk.

    Args:
        chunk: HybridChunker chunk object
        doc: Docling Document object

    Returns:
        {
            'page_start': int | None,
            'page_end': int | None,
            'heading_path': list[str],
            'heading_level': int | None,
            'section_marker': str | None,
            'bboxes': list[dict]
        }
    """
    meta = {
        'page_start': None,
        'page_end': None,
        'heading_path': [],
        'heading_level': None,
        'section_marker': None,
        'bboxes': []
    }

    try:
        # Extract page numbers from chunk provenance
        if hasattr(chunk, 'meta') and 'prov' in chunk.meta:
            prov = chunk.meta['prov']
            if prov:
                # Get first and last page numbers
                pages = []
                for p in prov:
                    if hasattr(p, 'page'):
                        pages.append(p.page)

                if pages:
                    meta['page_start'] = min(pages)
                    meta['page_end'] = max(pages)

        # Extract heading path (e.g., ["Chapter 1", "Section 1.1"])
        if hasattr(chunk, 'meta') and 'headings' in chunk.meta:
            heading_data = chunk.meta['headings']
            if isinstance(heading_data, list):
                meta['heading_path'] = [str(h) for h in heading_data]
                meta['heading_level'] = len(meta['heading_path'])

        # Extract bounding boxes for PDF coordinate highlighting
        if hasattr(chunk, 'meta') and 'prov' in chunk.meta:
            for prov in chunk.meta['prov']:
                if hasattr(prov, 'bbox') and hasattr(prov, 'page'):
                    bbox = prov.bbox
                    # Only add bbox if all coordinates exist
                    if all(hasattr(bbox, attr) for attr in ['l', 't', 'r', 'b']):
                        meta['bboxes'].append({
                            'page': prov.page,
                            'l': float(bbox.l),  # left
                            't': float(bbox.t),  # top
                            'r': float(bbox.r),  # right
                            'b': float(bbox.b)   # bottom
                        })

        # section_marker would be used for EPUB support (future)
        # e.g., "chapter_003" from EPUB spine

    except Exception as e:
        # Don't fail chunking if metadata extraction fails
        print(f"Warning: Failed to extract chunk metadata: {e}", file=sys.stderr)

    return meta


def extract_with_chunking(pdf_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract PDF with optional HybridChunker integration.

    Args:
        pdf_path: Path to PDF file
        options: {
            'enable_chunking': bool (default: false),
            'chunk_size': int (default: 512),
            'tokenizer': str (default: 'Xenova/all-mpnet-base-v2'),
            'max_pages': int | None
        }

    Returns:
        {
            'markdown': str,
            'structure': dict,
            'chunks': list[dict] | None (if enable_chunking=True)
        }
    """

    # Initialize converter
    emit_progress('extraction', 5, 'Initializing Docling converter')

    converter = DocumentConverter()

    # Convert document
    emit_progress('extraction', 10, 'Converting PDF with Docling')

    convert_kwargs = {}
    max_pages = options.get('max_pages')
    if max_pages is not None:
        convert_kwargs['max_num_pages'] = max_pages

    result = converter.convert(pdf_path, **convert_kwargs)
    doc = result.document

    emit_progress('extraction', 40, f'Extraction complete ({len(doc.pages)} pages)')

    # Export markdown (always needed)
    markdown = doc.export_to_markdown()

    # Extract structure (headings, hierarchy)
    emit_progress('extraction', 50, 'Extracting document structure')
    structure = extract_document_structure(doc)

    # Optionally run HybridChunker
    chunks = None
    if options.get('enable_chunking', False):
        emit_progress('chunking', 60, 'Running HybridChunker')

        try:
            # CRITICAL: Tokenizer must match embedding model
            # Default: 'Xenova/all-mpnet-base-v2' matches Transformers.js model
            chunker = HybridChunker(
                tokenizer=options.get('tokenizer', 'Xenova/all-mpnet-base-v2'),
                max_tokens=options.get('chunk_size', 512),
                merge_peers=True  # Merge small adjacent chunks
            )

            chunks = []
            for idx, chunk in enumerate(chunker.chunk(doc)):
                chunk_data = {
                    'index': idx,
                    'content': chunk.text,
                    'meta': extract_chunk_metadata(chunk, doc)
                }
                chunks.append(chunk_data)

            emit_progress('chunking', 90, f'Chunked into {len(chunks)} segments')

        except Exception as e:
            # If chunking fails, continue without chunks
            print(f"Warning: HybridChunker failed: {e}", file=sys.stderr)
            emit_progress('chunking', 90, 'Chunking failed, continuing without chunks')
            chunks = None

    return {
        'markdown': markdown,
        'structure': structure,
        'chunks': chunks
    }


def main():
    """Main entry point for script."""
    if len(sys.argv) < 2:
        sys.stdout.write(json.dumps({
            'type': 'error',
            'error': 'Usage: python3 docling_extract.py <pdf_path> [options_json]'
        }) + '\n')
        sys.stdout.flush()
        sys.exit(1)

    pdf_path = sys.argv[1]

    # Parse options (optional second argument)
    options = {}
    if len(sys.argv) > 2:
        try:
            options = json.loads(sys.argv[2])
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({
                'type': 'error',
                'error': f'Invalid JSON options: {e}'
            }) + '\n')
            sys.stdout.flush()
            sys.exit(1)

    try:
        # Validate PDF exists
        if not Path(pdf_path).exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        # Extract with optional chunking
        result = extract_with_chunking(pdf_path, options)

        # Final output
        sys.stdout.write(json.dumps({
            'type': 'result',
            'data': result
        }) + '\n')
        sys.stdout.flush()

        sys.exit(0)

    except Exception as e:
        # Structured error output
        sys.stdout.write(json.dumps({
            'type': 'error',
            'error': str(e),
            'error_type': type(e).__name__,
            'traceback': traceback.format_exc()
        }) + '\n')
        sys.stdout.flush()
        sys.exit(1)


if __name__ == '__main__':
    main()
