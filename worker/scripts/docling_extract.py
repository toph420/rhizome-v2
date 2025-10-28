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
        # Phase 2B Debug: Check if original doc_items have formatting
        formatting_count = 0
        total_items = 0
        for idx, item in enumerate(doc.iterate_items()):
            if idx < 10:  # Check first 10 items
                has_fmt = hasattr(item, 'formatting')
                fmt_obj = getattr(item, 'formatting', None) if has_fmt else None
                total_items += 1
                if has_fmt and fmt_obj:
                    formatting_count += 1
                print(f"[Phase2B OriginalDoc] Item {idx}: type={type(item).__name__}, has_formatting={has_fmt}, formatting={fmt_obj}", file=sys.stderr)
        print(f"[Phase2B OriginalDoc] Summary: {formatting_count}/{total_items} items have formatting", file=sys.stderr)
        sys.stderr.flush()

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

    CRITICAL: Phase 2A metadata lives in chunk.meta.doc_items, NOT on chunk itself!

    Structure:
      chunk.text - text content
      chunk.meta.doc_items[] - list of DocItem objects containing:
        - content_layer: "body" | "furniture" | "background" | "invisible" | "notes"
        - label: "PARAGRAPH" | "PAGE_HEADER" | "CODE" | "FORMULA" | etc.
        - prov[]: list of ProvenanceItem objects with:
          - page_no: int
          - bbox: {l, t, r, b}
          - charspan: [start, end]

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
    # 🔍 DEBUG: Function entry point
    print(f"[Phase2A] extract_chunk_metadata() CALLED", file=sys.stderr)
    sys.stderr.flush()

    meta = {
        'page_start': None,
        'page_end': None,
        'heading_path': [],
        'heading_level': None,
        'section_marker': None,
        'bboxes': [],
        # Phase 2A enhancements (no defaults - we'll aggregate from doc_items)
        'charspan': None,
        'content_layer': None,
        'content_label': None,
        'section_level': None,
        'list_enumerated': None,
        'list_marker': None,
        'code_language': None,
        'hyperlink': None,
        # Phase 2B: Text formatting
        'formatting': None
    }

    # 🔍 DEBUG: Log chunk structure
    print(f"[Phase2A Debug] Chunk class: {chunk.__class__.__name__}", file=sys.stderr)
    sys.stderr.flush()
    print(f"[Phase2A Debug] Has meta: {hasattr(chunk, 'meta')}", file=sys.stderr)
    if hasattr(chunk, 'meta') and chunk.meta:
        print(f"[Phase2A Debug] Meta has doc_items: {hasattr(chunk.meta, 'doc_items')}", file=sys.stderr)
        if hasattr(chunk.meta, 'doc_items'):
            doc_items = chunk.meta.doc_items if chunk.meta.doc_items else []
            print(f"[Phase2A Debug] doc_items count: {len(doc_items)}", file=sys.stderr)

    try:
        # =====================================================================
        # PHASE 2A: Extract metadata from chunk.meta.doc_items
        # =====================================================================

        if hasattr(chunk, 'meta') and chunk.meta and hasattr(chunk.meta, 'doc_items'):
            doc_items = chunk.meta.doc_items

            if doc_items:
                print(f"[Phase2A Debug] Processing {len(doc_items)} doc_items", file=sys.stderr)

                # Aggregation containers
                pages = []
                charspans = []
                bboxes_list = []
                content_layers = []
                content_labels = []
                # Phase 2B: Formatting aggregation
                formatting_data = {
                    'bold': [],
                    'italic': [],
                    'underline': [],
                    'strikethrough': [],
                    'script': []
                }

                # Iterate through all doc_items in this chunk
                for idx, doc_item in enumerate(doc_items):
                    print(f"[Phase2A Debug] DocItem {idx}: class={doc_item.__class__.__name__}", file=sys.stderr)

                    # Extract content_layer (CRITICAL for noise filtering)
                    if hasattr(doc_item, 'content_layer') and doc_item.content_layer:
                        # Get enum value (e.g., "body") not string repr (e.g., "ContentLayer.body")
                        layer = doc_item.content_layer.value if hasattr(doc_item.content_layer, 'value') else str(doc_item.content_layer)
                        # Normalize to uppercase for consistency
                        layer = layer.upper()
                        content_layers.append(layer)
                        print(f"[Phase2A Debug] DocItem {idx}: content_layer={layer}", file=sys.stderr)

                    # Extract label (CRITICAL for classification)
                    if hasattr(doc_item, 'label') and doc_item.label:
                        # Get enum value (e.g., "PARAGRAPH") not string repr (e.g., "DocItemLabel.PARAGRAPH")
                        label = doc_item.label.value if hasattr(doc_item.label, 'value') else str(doc_item.label)
                        # Labels are already uppercase in Docling, but ensure consistency
                        label = label.upper()
                        content_labels.append(label)
                        print(f"[Phase2A Debug] DocItem {idx}: label={label}", file=sys.stderr)

                    # Phase 2B: Extract formatting (bold, italic, underline, etc.)
                    # Debug: Check if formatting attribute exists
                    has_formatting_attr = hasattr(doc_item, 'formatting')
                    formatting_obj = getattr(doc_item, 'formatting', None) if has_formatting_attr else None
                    print(f"[Phase2B Debug] DocItem {idx}: has_formatting={has_formatting_attr}, formatting_obj={formatting_obj}", file=sys.stderr)
                    sys.stderr.flush()

                    if has_formatting_attr and formatting_obj:
                        fmt = doc_item.formatting
                        # Extract boolean formatting flags
                        if hasattr(fmt, 'bold'):
                            formatting_data['bold'].append(fmt.bold)
                            print(f"[Phase2B Debug] DocItem {idx}: bold={fmt.bold}", file=sys.stderr)
                        if hasattr(fmt, 'italic'):
                            formatting_data['italic'].append(fmt.italic)
                            print(f"[Phase2B Debug] DocItem {idx}: italic={fmt.italic}", file=sys.stderr)
                        if hasattr(fmt, 'underline'):
                            formatting_data['underline'].append(fmt.underline)
                        if hasattr(fmt, 'strikethrough'):
                            formatting_data['strikethrough'].append(fmt.strikethrough)
                        # Extract script enum (baseline, sub, super)
                        if hasattr(fmt, 'script'):
                            script_value = fmt.script.value if hasattr(fmt.script, 'value') else str(fmt.script)
                            formatting_data['script'].append(script_value)
                        print(f"[Phase2B Debug] DocItem {idx}: formatting extracted={fmt}", file=sys.stderr)

                    # Extract provenance (page_no, bbox, charspan)
                    if hasattr(doc_item, 'prov') and doc_item.prov:
                        for prov_idx, prov in enumerate(doc_item.prov):
                            # Page number
                            if hasattr(prov, 'page_no'):
                                pages.append(prov.page_no)

                            # Charspan [start, end]
                            if hasattr(prov, 'charspan') and prov.charspan:
                                charspans.append(tuple(prov.charspan))

                            # Bounding box {l, t, r, b}
                            if hasattr(prov, 'bbox') and prov.bbox:
                                bbox = prov.bbox
                                if all(hasattr(bbox, attr) for attr in ['l', 't', 'r', 'b']):
                                    bboxes_list.append({
                                        'page': prov.page_no,
                                        'l': float(bbox.l),
                                        't': float(bbox.t),
                                        'r': float(bbox.r),
                                        'b': float(bbox.b)
                                    })

                # Aggregate Phase 2A metadata
                if pages:
                    meta['page_start'] = min(pages)
                    meta['page_end'] = max(pages)
                    print(f"[Phase2A Debug] Aggregated pages: {meta['page_start']}-{meta['page_end']}", file=sys.stderr)

                if charspans:
                    # Get earliest start, latest end
                    meta['charspan'] = (
                        min(cs[0] for cs in charspans),
                        max(cs[1] for cs in charspans)
                    )
                    print(f"[Phase2A Debug] Aggregated charspan: {meta['charspan']} (from {len(charspans)} prov items)", file=sys.stderr)

                if bboxes_list:
                    meta['bboxes'] = bboxes_list
                    print(f"[Phase2A Debug] Aggregated {len(bboxes_list)} bboxes", file=sys.stderr)

                # Use most common content_layer
                if content_layers:
                    from collections import Counter
                    most_common_layer = Counter(content_layers).most_common(1)[0][0]
                    meta['content_layer'] = most_common_layer
                    print(f"[Phase2A Debug] Most common content_layer: {most_common_layer} (from {content_layers})", file=sys.stderr)

                # Use most common content_label
                if content_labels:
                    from collections import Counter
                    most_common_label = Counter(content_labels).most_common(1)[0][0]
                    meta['content_label'] = most_common_label
                    print(f"[Phase2A Debug] Most common content_label: {most_common_label} (from {content_labels})", file=sys.stderr)

                # Phase 2B: Aggregate formatting
                # Strategy: If ANY doc_item has formatting=True, preserve it in chunk
                if any(formatting_data['bold']) or any(formatting_data['italic']) or \
                   any(formatting_data['underline']) or any(formatting_data['strikethrough']) or \
                   any(s != 'baseline' for s in formatting_data['script']):
                    meta['formatting'] = {
                        'bold': any(formatting_data['bold']),
                        'italic': any(formatting_data['italic']),
                        'underline': any(formatting_data['underline']),
                        'strikethrough': any(formatting_data['strikethrough']),
                        'script': None  # Will be set below
                    }

                    # For script, use most common non-baseline value
                    non_baseline_scripts = [s for s in formatting_data['script'] if s != 'baseline']
                    if non_baseline_scripts:
                        from collections import Counter
                        most_common_script = Counter(non_baseline_scripts).most_common(1)[0][0]
                        meta['formatting']['script'] = most_common_script
                    else:
                        meta['formatting']['script'] = 'baseline'

                    print(f"[Phase2B Debug] Aggregated formatting: {meta['formatting']}", file=sys.stderr)
            else:
                print(f"[Phase2A Debug] doc_items is empty", file=sys.stderr)
        else:
            print(f"[Phase2A Debug] No doc_items in chunk.meta", file=sys.stderr)

        # =====================================================================
        # Extract heading path (from chunk.meta.headings)
        # =====================================================================
        if hasattr(chunk, 'meta') and chunk.meta and hasattr(chunk.meta, 'headings'):
            heading_data = chunk.meta.headings
            if heading_data and isinstance(heading_data, list):
                meta['heading_path'] = [str(h) for h in heading_data]
                meta['heading_level'] = len(meta['heading_path'])
                print(f"[Phase2A Debug] Headings: {meta['heading_path']}", file=sys.stderr)

        # =====================================================================
        # Apply defaults if Phase 2A fields are still None
        # =====================================================================
        if meta['content_layer'] is None:
            meta['content_layer'] = 'BODY'  # Safe default
            print(f"[Phase2A Debug] Using default content_layer=BODY", file=sys.stderr)

        if meta['content_label'] is None:
            meta['content_label'] = 'PARAGRAPH'  # Safe default
            print(f"[Phase2A Debug] Using default content_label=PARAGRAPH", file=sys.stderr)

    except Exception as e:
        # Don't fail chunking if metadata extraction fails
        print(f"[Phase2A Error] Failed to extract chunk metadata: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

    # 🔍 DEBUG: Log final Phase 2A metadata summary
    phase2a_summary = {
        'charspan': f"{meta['charspan']}" if meta['charspan'] else 'NULL',
        'content_layer': meta['content_layer'] or 'NULL',
        'content_label': meta['content_label'] or 'NULL',
        'page_range': f"{meta['page_start']}-{meta['page_end']}" if meta['page_start'] else 'NULL',
        'bboxes': len(meta['bboxes']) if meta['bboxes'] else 0,
        'headings': len(meta['heading_path']) if meta['heading_path'] else 0
    }
    print(f"[Phase2A Summary] {phase2a_summary}", file=sys.stderr)

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
    emit_progress('extraction', 45, 'Extracting document structure + checking formatting')
    structure = extract_document_structure(doc)
    emit_progress('extraction', 46, f'Structure extracted, checked formatting on doc items')

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
