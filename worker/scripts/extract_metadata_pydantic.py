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
import argparse
import importlib.util
from pathlib import Path
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel

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

def load_prompt_version(version_id: str) -> str:
    """Load prompt from version file."""
    # Construct path relative to worker/ directory
    worker_dir = Path(__file__).parent.parent
    prompt_path = worker_dir / 'lib' / 'prompts' / 'metadata-extraction' / f'{version_id}.py'

    if not prompt_path.exists():
        raise ValueError(f'Prompt version not found: {version_id} at {prompt_path}')

    # Load module dynamically
    spec = importlib.util.spec_from_file_location("prompt_module", prompt_path)
    if spec is None or spec.loader is None:
        raise ValueError(f'Failed to load prompt module: {version_id}')

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Call get_prompt() function
    if not hasattr(module, 'get_prompt'):
        raise ValueError(f'Prompt module missing get_prompt() function: {version_id}')

    return module.get_prompt()

# Initialize Ollama model (agent created in main() with dynamic prompt)
# CRITICAL: Use OllamaProvider for proper configuration
import os
from pydantic_ai.providers.ollama import OllamaProvider

ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')

# Create OllamaProvider with base URL
ollama_provider = OllamaProvider(base_url=ollama_base_url)

# Use OpenAIChatModel with Ollama provider
ollama_model = OpenAIChatModel(
    model_name='qwen2.5:32b',
    provider=ollama_provider
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

async def process_chunks(agent: Agent):
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

                # result.output is a ChunkMetadata instance (not .data!)
                metadata = result.output.model_dump()

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
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Extract metadata with PydanticAI')
    parser.add_argument('--prompt-version', default='v1-baseline',
                       help='Prompt version to use (e.g., v1-baseline, v2-philosophy)')
    args = parser.parse_args()

    # Load prompt version
    try:
        system_prompt = load_prompt_version(args.prompt_version)
        print(f'[Metadata] Using prompt version: {args.prompt_version}', file=sys.stderr)
    except Exception as e:
        print(f'[Metadata] ERROR loading prompt: {e}', file=sys.stderr)
        sys.exit(1)

    # Create agent with dynamic prompt
    agent = Agent(
        model=ollama_model,
        output_type=ChunkMetadata,
        retries=3,
        system_prompt=system_prompt  # Now loaded from file
    )

    # Process chunks with the configured agent
    asyncio.run(process_chunks(agent))

if __name__ == '__main__':
    main()
