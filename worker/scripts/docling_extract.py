#!/usr/bin/env python3
"""
Docling PDF extraction wrapper with HybridChunker integration for Node.js.

Usage: python3 docling_extract.py <pdf_path> [options_json]

Chunking Options:
    - enable_chunking: bool (default: false)
    - chunk_size: int (default: 512) - Smaller values (256) for granular chunks
    - tokenizer: str (default: 'Xenova/all-mpnet-base-v2')
    - max_pages: int (limit pages for testing)

Pipeline Options (PdfPipelineOptions):
    - do_picture_classification: bool (default: false) - AI classification of image types
    - do_picture_description: bool (default: false) - AI-generated image descriptions
    - do_code_enrichment: bool (default: false) - AI analysis of code blocks
    - generate_page_images: bool (default: false) - Extract page-level images
    - generate_picture_images: bool (default: false) - Extract individual figures
    - generate_table_images: bool (default: false) - Extract table images
    - images_scale: float (default: 1.0) - Image DPI scaling (1.0 = 72 DPI, 2.0 = 144 DPI)
    - page_batch_size: int (optional) - Process document in batches (for large docs)
    - ocr: bool (default: false) - OCR for scanned PDFs
    - do_table_structure: bool (default: true) - Extract table structure
"""

import sys
import json
from pathlib import Path
from typing import Optional, Dict, List, Any
import traceback

from docling.document_converter import DocumentConverter, PdfFormatOption
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
            'bboxes': list[dict],
            # Phase 2A enhancements:
            'charspan': tuple[int, int] | None,
            'content_layer': str | None,
            'content_label': str | None,
            'section_level': int | None,
            'list_enumerated': bool | None,
            'list_marker': str | None,
            'code_language': str | None,
            'hyperlink': str | None
        }
    """
    meta = {
        'page_start': None,
        'page_end': None,
        'heading_path': [],
        'heading_level': None,
        'section_marker': None,
        'bboxes': [],
        # Phase 2A enhancements
        'charspan': None,
        'content_layer': 'BODY',  # Default to BODY
        'content_label': 'PARAGRAPH',  # Default to PARAGRAPH
        'section_level': None,
        'list_enumerated': None,
        'list_marker': None,
        'code_language': None,
        'hyperlink': None
    }

    try:
        # Extract page numbers and charspan from chunk provenance
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

                # Extract character span (CRITICAL for precise annotation sync)
                charspans = []
                for p in prov:
                    if hasattr(p, 'charspan') and p.charspan:
                        charspans.append(p.charspan)

                if charspans:
                    # Get earliest start and latest end
                    meta['charspan'] = (
                        min(cs[0] for cs in charspans),
                        max(cs[1] for cs in charspans)
                    )

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

        # Extract content layer (CRITICAL for noise filtering)
        if hasattr(chunk, 'content_layer'):
            meta['content_layer'] = chunk.content_layer

        # Extract content label (CRITICAL for classification)
        if hasattr(chunk, 'label'):
            meta['content_label'] = chunk.label

        # Extract section level (enhanced TOC)
        if hasattr(chunk, '__class__') and chunk.__class__.__name__ == 'SectionHeaderItem':
            if hasattr(chunk, 'level'):
                meta['section_level'] = chunk.level

        # Extract list metadata
        if hasattr(chunk, '__class__') and chunk.__class__.__name__ == 'ListItem':
            if hasattr(chunk, 'enumerated'):
                meta['list_enumerated'] = chunk.enumerated
            if hasattr(chunk, 'marker'):
                meta['list_marker'] = chunk.marker

        # Extract code language
        if hasattr(chunk, '__class__') and chunk.__class__.__name__ == 'CodeItem':
            if hasattr(chunk, 'code_language'):
                meta['code_language'] = chunk.code_language

        # Extract hyperlink
        if hasattr(chunk, 'hyperlink') and chunk.hyperlink:
            meta['hyperlink'] = str(chunk.hyperlink)

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

    # Initialize converter with pipeline options
    emit_progress('extraction', 5, 'Initializing Docling converter with pipeline options')

    # Configure pipeline options from options dict
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_picture_classification = options.get('do_picture_classification', False)
    pipeline_options.do_picture_description = options.get('do_picture_description', False)
    pipeline_options.do_code_enrichment = options.get('do_code_enrichment', False)
    pipeline_options.generate_page_images = options.get('generate_page_images', False)
    pipeline_options.do_ocr = options.get('ocr', False)  # Note: 'ocr' key for backward compat
    pipeline_options.do_table_structure = options.get('do_table_structure', True)
    pipeline_options.generate_picture_images = options.get('generate_picture_images', False)
    pipeline_options.generate_table_images = options.get('generate_table_images', False)
    pipeline_options.images_scale = options.get('images_scale', 1.0)

    # Apply page batching if specified (for large documents)
    if 'page_batch_size' in options:
        pipeline_options.page_batch_size = options['page_batch_size']

    # Create converter with configured pipeline
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

    # Convert document
    emit_progress('extraction', 10, 'Converting PDF with Docling')

    convert_kwargs = {}
    max_pages = options.get('max_pages')
    if max_pages is not None:
        convert_kwargs['max_num_pages'] = max_pages

    result = converter.convert(pdf_path, **convert_kwargs)
    doc = result.document

    emit_progress('extraction', 40, f'Extraction complete ({len(doc.pages)} pages)')

    # Extract structure (headings, hierarchy)
    emit_progress('extraction', 45, 'Extracting document structure')
    structure = extract_document_structure(doc)

    # Optionally run chunking
    chunks = None
    markdown = None

    if options.get('enable_chunking', False):
        try:
            emit_progress('chunking', 50, 'Running HybridChunker')

            # Get chunk size from options
            # Smaller chunks (256) provide better granularity
            # Larger chunks (768) provide better semantic coherence
            chunk_size = options.get('chunk_size', 512)

            # CRITICAL: Tokenizer must match embedding model
            # Default: 'Xenova/all-mpnet-base-v2' matches Transformers.js model
            chunker = HybridChunker(
                tokenizer=options.get('tokenizer', 'Xenova/all-mpnet-base-v2'),
                max_tokens=chunk_size,
                merge_peers=True  # Merge small adjacent chunks
            )

            chunks = []

            for idx, chunk in enumerate(chunker.chunk(doc)):
                chunk_meta = extract_chunk_metadata(chunk, doc)
                chunk_data = {
                    'index': idx,
                    'content': chunk.text,
                    'meta': chunk_meta
                }
                chunks.append(chunk_data)

            # Standard markdown export
            markdown = doc.export_to_markdown()
            mode_desc = f'(granular {chunk_size}-token chunks)' if chunk_size < 512 else f'({chunk_size}-token chunks)'
            emit_progress('chunking', 90, f'HybridChunker: {len(chunks)} chunks {mode_desc}')

        except Exception as e:
            # If chunking fails, continue without chunks
            print(f"Warning: Chunking failed: {e}", file=sys.stderr)
            emit_progress('chunking', 90, f'Chunking failed, continuing without chunks')
            chunks = None
            markdown = doc.export_to_markdown()  # Fallback to standard markdown
    else:
        # No chunking requested - standard markdown export
        markdown = doc.export_to_markdown()

    return {
        'markdown': markdown,
        'structure': structure,
        'chunks': chunks,
        'chunk_size': options.get('chunk_size', 512) if options.get('enable_chunking', False) else None
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
