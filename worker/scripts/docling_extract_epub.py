#!/usr/bin/env python3
"""
Docling-based EPUB extraction via HTML processing (Phase 5 - Task 16)

EPUBs have NO page numbers - use section markers instead.

Architecture:
- Read HTML from stdin (unified EPUB HTML from TypeScript)
- Convert with Docling DocumentConverter
- Chunk with HybridChunker (same tokenizer as PDF)
- Extract section markers from headings
- Set page_start/page_end to NULL (EPUBs don't have pages)
- Output JSON with markdown, structure, and chunks

Usage:
  cat unified_epub.html | python3 docling_extract_epub.py '{"tokenizer": "Xenova/all-mpnet-base-v2", "chunk_size": 512}'

Critical:
- MUST set page_start/page_end to None (not 0 or inferred values)
- MUST generate section_marker from headings
- MUST flush stdout after every JSON write
- MUST match tokenizer with embeddings model (Phase 1)
"""

import sys
import json
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
import tempfile
import os
import re

def generate_section_marker(heading: str, index: int) -> str:
    """
    Generate section marker from heading.

    Phase 5 spec (lines 105-111):
    - Use heading as section marker slug
    - Format: lowercase, underscores, alphanumeric only
    - Max 50 chars
    - Fallback: "section_{index:03d}"

    Examples:
    - "Chapter 3: Introduction to Physics" → "chapter_3_introduction_to_physics"
    - "" → "section_012"
    """
    if not heading:
        return f"section_{index:03d}"

    # Convert to slug
    slug = heading.lower()
    # Replace spaces and hyphens with underscores
    slug = slug.replace(' ', '_').replace('-', '_')
    # Keep only alphanumeric and underscores
    slug = ''.join(c for c in slug if c.isalnum() or c == '_')
    # Remove consecutive underscores
    slug = re.sub(r'_+', '_', slug)
    # Remove leading/trailing underscores
    slug = slug.strip('_')

    # Limit length
    if len(slug) > 50:
        slug = slug[:50]

    # Fallback if empty after cleaning
    return slug if slug else f"section_{index:03d}"

def extract_html_structure(doc) -> dict:
    """
    Extract document structure from HTML.

    Pattern from Phase 5 spec (lines 158-192):
    - Sections (headings with levels)
    - Tables (markdown export)
    - Lists (ordered/unordered)
    """
    structure = {
        'sections': [],
        'headings': [],
        'tables': [],
        'lists': []
    }

    for item in doc.body:
        # Extract headings
        if hasattr(item, 'label') and 'title' in item.label.lower():
            # Extract level from label (e.g., "title_1" → level 1)
            level = 1
            if '_' in item.label:
                try:
                    level = int(item.label.split('_')[-1])
                except ValueError:
                    level = 1

            structure['headings'].append({
                'text': item.text,
                'level': level
            })
            structure['sections'].append({
                'title': item.text,
                'level': level
            })

        # Extract tables
        elif 'Table' in item.__class__.__name__:
            structure['tables'].append({
                'content': item.export_to_markdown()
            })

        # Extract lists
        elif hasattr(item, 'label') and 'list' in item.label.lower():
            list_type = 'ordered' if 'ol' in str(item).lower() else 'unordered'
            structure['lists'].append({
                'type': list_type
            })

    return structure

def extract_epub_html(markdown_content: str, options: dict = None) -> dict:
    """
    Extract EPUB via Markdown with Docling.

    CRITICAL: Input is now MARKDOWN (from Turndown.js), not HTML
    This preserves heading hierarchy (Docling has known bug with HTML headings)

    Phase 5 spec (lines 46-156):
    - Save markdown to temp file
    - Convert with Docling (markdown preserves heading hierarchy!)
    - Chunk with HybridChunker (aligned tokenizer)
    - Extract metadata (NO page numbers, use section markers)
    - Progress reporting (30% → 50% → 100%)
    """
    options = options or {}

    # Progress: Starting extraction (30%)
    print(json.dumps({
        'type': 'progress',
        'status': 'extracting',
        'message': 'Processing Markdown with Docling',
        'progress': 30
    }), flush=True)

    # Save Markdown to temp file for Docling
    # CRITICAL: Use .md extension so Docling processes as markdown (preserves headings!)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf-8') as f:
        f.write(markdown_content)
        temp_md_path = f.name

    try:
        # Convert Markdown with Docling
        # CRITICAL: Markdown input preserves heading hierarchy (HTML does not!)
        converter = DocumentConverter()
        result = converter.convert(temp_md_path)
        doc = result.document

        # Export to markdown
        markdown = doc.export_to_markdown()

        # Progress: Creating chunks (50%)
        print(json.dumps({
            'type': 'progress',
            'status': 'chunking',
            'message': 'Creating semantic chunks',
            'progress': 50
        }), flush=True)

        # Create chunks with HybridChunker
        # CRITICAL: Must use same tokenizer as embeddings (Phase 1)
        chunker = HybridChunker(
            tokenizer=options.get('tokenizer', 'Xenova/all-mpnet-base-v2'),
            max_tokens=options.get('chunk_size', 512),
            merge_peers=True,
            heading_as_metadata=True
        )

        chunk_iter = chunker.chunk(doc)
        chunks = []

        for idx, chunk in enumerate(chunk_iter):
            # CRITICAL: EPUB has NO page numbers (Phase 5 spec lines 104-111, 209-221)
            # Generate section marker from heading
            section_marker = f"section_{idx:03d}"
            if chunk.meta.headings:
                # Use last heading as section marker
                heading_text = chunk.meta.headings[-1]
                section_marker = generate_section_marker(heading_text, idx)

            # Extract offsets from provenance data
            # CRITICAL: HTML provenance is different from PDF
            # For HTML, self_ref might be a string or the structure might differ
            start_offset = 0
            end_offset = len(chunk.text)

            if chunk.meta.doc_items and len(chunk.meta.doc_items) > 0:
                first_item = chunk.meta.doc_items[0]
                last_item = chunk.meta.doc_items[-1]

                # Safely extract offsets - handle both object and string self_ref
                if hasattr(first_item, 'self_ref') and first_item.self_ref:
                    ref = first_item.self_ref
                    if hasattr(ref, 'start'):
                        start_offset = ref.start

                if hasattr(last_item, 'self_ref') and last_item.self_ref:
                    ref = last_item.self_ref
                    if hasattr(ref, 'end'):
                        end_offset = ref.end

            # Phase 5: Use standard DoclingChunk format with index + meta structure
            # Pattern from: worker/scripts/docling_extract.py (PDF version)
            chunk_data = {
                'index': idx,  # Standard field name (not chunk_index)
                'content': chunk.text,
                'meta': {
                    # CRITICAL: EPUBs have NO page numbers (always None for EPUBs)
                    'page_start': None,
                    'page_end': None,
                    # Structure metadata
                    'heading_path': chunk.meta.headings if chunk.meta.headings else [],
                    'heading_level': len(chunk.meta.headings) if chunk.meta.headings else 0,
                    'section_marker': section_marker,  # Used instead of page numbers
                    # CRITICAL: EPUBs have NO bboxes (no PDF coordinates)
                    'bboxes': None
                }
            }
            chunks.append(chunk_data)

        # Extract structure
        structure = extract_html_structure(doc)

        # Progress: Complete (100%)
        print(json.dumps({
            'type': 'progress',
            'status': 'complete',
            'message': 'Extraction complete',
            'progress': 100
        }), flush=True)

        return {
            'markdown': markdown,
            'structure': structure,
            'chunks': chunks,
            'metadata': {
                'source_format': 'epub',
                'extraction_method': 'docling',
                'chunk_count': len(chunks),
                'word_count': len(markdown.split())
            }
        }

    finally:
        # Clean up temp file
        if os.path.exists(temp_md_path):
            os.unlink(temp_md_path)

def main():
    """Process EPUB Markdown from stdin."""
    try:
        # DEBUG: Write startup message to stderr (visible in worker logs)
        print(f"[DEBUG] EPUB script started, reading from stdin...", file=sys.stderr, flush=True)

        # Read Markdown from stdin (converted from HTML by Turndown.js)
        markdown_content = sys.stdin.read()

        print(f"[DEBUG] Read {len(markdown_content)} bytes from stdin", file=sys.stderr, flush=True)

        if not markdown_content or not markdown_content.strip():
            print(json.dumps({
                'error': 'Empty markdown input'
            }), flush=True)
            sys.exit(1)

        # Parse options from command line (second argument)
        options = {}
        if len(sys.argv) > 1:
            try:
                options = json.loads(sys.argv[1])
            except json.JSONDecodeError as e:
                print(json.dumps({
                    'error': f'Invalid options JSON: {str(e)}'
                }), flush=True)
                sys.exit(1)

        # Extract and output result
        print(f"[DEBUG] Starting extraction...", file=sys.stderr, flush=True)
        result = extract_epub_html(markdown_content, options)

        print(f"[DEBUG] Extraction complete, outputting JSON...", file=sys.stderr, flush=True)

        # Output final result
        print(json.dumps(result))
        sys.stdout.flush()  # CRITICAL: Must flush for Node.js IPC (Phase 2 pattern)

        print(f"[DEBUG] JSON output complete", file=sys.stderr, flush=True)

    except Exception as e:
        # Error output to both stdout and stderr for debugging
        error_json = json.dumps({
            'error': str(e),
            'type': type(e).__name__
        })
        print(f"[DEBUG] Exception caught: {str(e)}", file=sys.stderr, flush=True)
        print(error_json, flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
