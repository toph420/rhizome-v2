#!/usr/bin/env python3
"""
PydanticAI Metadata Extraction Script (Phase 6)

Extracts structured metadata from chunks using Ollama (Qwen 32B).
Uses PydanticAI for type-safe outputs with automatic retry on validation failure.

Architecture:
- Reads chunks from stdin (one JSON per line)
- Extracts metadata using PydanticAI Agent
- Writes results to stdout (one JSON per line)
- CRITICAL: sys.stdout.flush() after each write (prevents IPC hang)

Usage:
  echo '{"id": "test", "content": "Machine learning is transforming AI."}' | \
    python worker/scripts/extract_metadata_pydantic.py

Expected output:
  {"chunk_id": "test", "metadata": {...}}
"""

import asyncio
import json
import sys
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from pydantic_ai import Agent

# CRITICAL: Flush stdout after EVERY write to prevent IPC hangs
# Without flush, Node.js subprocess will hang waiting for data

class ChunkMetadata(BaseModel):
    """Structured metadata extracted from a chunk of text."""

    themes: List[str] = Field(
        min_length=1,
        max_length=5,
        description="Main themes or topics discussed in this chunk (1-5 themes)"
    )

    concepts: List[Dict[str, Any]] = Field(
        min_length=1,
        max_length=10,
        description="Key concepts mentioned with importance scores (1-10 concepts)"
    )

    importance: float = Field(
        ge=0.0,
        le=1.0,
        description="Overall importance score (0.0 to 1.0)"
    )

    summary: str = Field(
        min_length=20,
        max_length=200,
        description="Brief summary of the chunk (20-200 characters)"
    )

    emotional: Dict[str, Any] = Field(
        description="Emotional metadata: {polarity, primaryEmotion, intensity}"
    )

    domain: str = Field(
        description="Primary domain or subject area (e.g., 'technology', 'philosophy', 'fiction')"
    )

# Initialize PydanticAI Agent with Ollama model
# CRITICAL: Use qwen2.5:32b format (not qwen2.5:32b-instruct-q4_K_M)
# Ollama automatically selects the installed variant
agent = Agent(
    model='ollama:qwen2.5:32b',  # PydanticAI uses 'ollama:' prefix
    result_type=ChunkMetadata,
    retries=3,  # Auto-retry if validation fails
    system_prompt="""You are a metadata extraction expert. Extract structured information from text chunks.

For each chunk, identify:
- **themes**: Main topics (1-5 items, e.g., ["machine learning", "AI ethics"])
- **concepts**: Key concepts with importance (1-10 items, e.g., [{"text": "neural networks", "importance": 0.9}])
- **importance**: Overall significance (0.0 to 1.0)
- **summary**: Brief overview (20-200 chars)
- **emotional**: Emotional tone (e.g., {"polarity": 0.5, "primaryEmotion": "curious", "intensity": 0.7})
- **domain**: Subject area (e.g., "technology", "philosophy")

Be precise and concise. Follow the schema exactly."""
)

def get_fallback_metadata() -> Dict:
    """Return minimal fallback metadata when extraction fails."""
    return {
        'themes': ['unknown'],
        'concepts': [{'text': 'general content', 'importance': 0.5}],
        'importance': 0.5,
        'summary': 'Content requires manual review',
        'emotional': {
            'polarity': 0.0,
            'primaryEmotion': 'neutral',
            'intensity': 0.0
        },
        'domain': 'general'
    }

async def process_chunks():
    """Process chunks from stdin and write metadata to stdout."""

    # Read chunks from stdin, one JSON per line
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            chunk = json.loads(line)
            chunk_id = chunk['id']
            content = chunk['content']

            # Extract metadata using PydanticAI
            # Agent automatically retries up to 3 times if validation fails
            try:
                result = await agent.run(content)  # Async execution

                # result.data is a ChunkMetadata instance
                metadata = result.data.model_dump()

                # Write successful result
                sys.stdout.write(json.dumps({
                    'chunk_id': chunk_id,
                    'metadata': metadata,
                    'status': 'success'
                }) + '\n')
                sys.stdout.flush()  # CRITICAL: Must flush after every write

            except Exception as e:
                # Extraction failed - return fallback metadata
                sys.stderr.write(f'[ERROR] Metadata extraction failed for chunk {chunk_id}: {str(e)}\n')
                sys.stderr.flush()

                sys.stdout.write(json.dumps({
                    'chunk_id': chunk_id,
                    'metadata': get_fallback_metadata(),
                    'status': 'fallback',
                    'error': str(e)
                }) + '\n')
                sys.stdout.flush()  # CRITICAL: Must flush after every write

        except json.JSONDecodeError as e:
            sys.stderr.write(f'[ERROR] Invalid JSON input: {str(e)}\n')
            sys.stderr.flush()
            continue

        except KeyError as e:
            sys.stderr.write(f'[ERROR] Missing required field: {str(e)}\n')
            sys.stderr.flush()
            continue

        except Exception as e:
            sys.stderr.write(f'[ERROR] Unexpected error: {str(e)}\n')
            sys.stderr.flush()
            continue

def main():
    """Entry point for the script."""
    asyncio.run(process_chunks())

if __name__ == '__main__':
    main()
