#!/usr/bin/env python3
"""
Chonkie multi-strategy chunking for Rhizome V2.
Supports 9 chunker types: token, sentence, recursive, semantic, late, code, neural, slumber, table.

CRITICAL: sys.stdout.flush() after JSON write (prevents IPC hangs)

External docs: https://docs.chonkie.ai/oss/chunkers/overview

Usage:
  echo '{"markdown": "# Chapter 1\\n\\nFirst paragraph.", "config": {"chunker_type": "recursive"}}' | \
    python3 worker/scripts/chonkie_chunk.py
"""

import sys
import json
from typing import Dict, Any, List

try:
    from chonkie import (
        TokenChunker,
        SentenceChunker,
        RecursiveChunker,
        RecursiveRules,
        SemanticChunker,
        LateChunker,
        CodeChunker,
        NeuralChunker,
        SlumberChunker,
        TableChunker
    )
    from chonkie.types.recursive import RecursiveLevel
except ImportError as e:
    sys.stderr.write(f"ERROR: Failed to import chonkie: {e}\n")
    sys.stderr.write("Install with: pip install chonkie\n")
    sys.stderr.flush()
    sys.exit(1)

# Map chunker type strings to classes
CHUNKERS = {
    'token': TokenChunker,
    'sentence': SentenceChunker,
    'recursive': RecursiveChunker,
    'semantic': SemanticChunker,
    'late': LateChunker,
    'code': CodeChunker,
    'neural': NeuralChunker,
    'slumber': SlumberChunker,
    'table': TableChunker
}


def initialize_chunker(chunker_type: str, config: Dict[str, Any]) -> Any:
    """
    Initialize appropriate Chonkie chunker based on type and configuration.

    Args:
        chunker_type: One of 'token', 'sentence', 'recursive', 'semantic', 'late',
                     'code', 'neural', 'slumber', 'table'
        config: Configuration dict with chunker-specific options

    Returns:
        Initialized chunker instance

    Raises:
        ValueError: If chunker_type is unknown
    """
    # Get chunker class
    ChunkerClass = CHUNKERS.get(chunker_type)
    if not ChunkerClass:
        raise ValueError(
            f"Unknown chunker type: {chunker_type}. "
            f"Valid types: {', '.join(CHUNKERS.keys())}"
        )

    # Build common config based on chunker type
    # Different chunkers have different parameter requirements:
    #   - Token/Sentence/Recursive/Code/Table/Slumber: tokenizer + chunk_size
    #   - Semantic/Late: chunk_size only (use embedding_model, not tokenizer)
    #   - Neural: custom params only (model, device_map, min_characters_per_chunk)

    if chunker_type in ['neural']:
        # NeuralChunker: completely different API
        chunker_config = {}
    elif chunker_type in ['semantic', 'late']:
        # Embedding-based chunkers: use chunk_size but not tokenizer
        chunker_config = {
            "chunk_size": config.get("chunk_size", 512)
        }
    else:
        # Standard chunkers: use both tokenizer and chunk_size
        chunker_config = {
            "tokenizer": config.get("tokenizer", "gpt2"),
            "chunk_size": config.get("chunk_size", 512)
        }

    # Add chunker-specific configuration
    if chunker_type == 'recursive':
        # RecursiveChunker: Hierarchical splitting with custom rules
        rules_config = config.get("rules")

        if rules_config:
            # Custom rules provided
            chunker_config["rules"] = RecursiveRules(rules_config)
        elif config.get("recipe"):
            # Pre-configured recipe: "markdown" or "default"
            return RecursiveChunker(
                tokenizer=chunker_config["tokenizer"],
                chunk_size=chunker_config["chunk_size"],
                recipe=config["recipe"]
            )
        else:
            # Default rules: paragraph → sentence → token
            levels = [
                RecursiveLevel(delimiters=["\n\n"], include_delim="prev"),  # Paragraphs
                RecursiveLevel(delimiters=[". ", "! ", "? "], include_delim="prev"),  # Sentences
                RecursiveLevel()  # Token fallback
            ]
            chunker_config["rules"] = RecursiveRules(levels)

    elif chunker_type == 'semantic':
        # SemanticChunker: Topic-based boundaries using embeddings
        # Lower threshold = larger chunks, higher threshold = smaller chunks
        chunker_config["embedding_model"] = config.get(
            "embedding_model",
            "minishlab/potion-base-32M"
        )
        chunker_config["threshold"] = config.get("threshold", 0.8)

    elif chunker_type == 'late':
        # LateChunker: Contextual embeddings for high retrieval quality
        chunker_config["embedding_model"] = config.get(
            "embedding_model",
            "sentence-transformers/all-MiniLM-L6-v2"
        )

    elif chunker_type == 'neural':
        # NeuralChunker: BERT-based semantic shift detection
        chunker_config["model"] = config.get("model", "mirth/chonky_modernbert_base_1")
        chunker_config["device_map"] = config.get("device_map", "cpu")
        chunker_config["min_characters_per_chunk"] = config.get("min_characters_per_chunk", 10)

    elif chunker_type == 'slumber':
        # SlumberChunker: Agentic LLM-powered (requires GEMINI_API_KEY)
        try:
            from chonkie.genie import GeminiGenie
        except ImportError:
            raise ImportError(
                "SlumberChunker requires chonkie.genie. "
                "Install with: pip install chonkie[genie]"
            )

        # Create GeminiGenie (uses GEMINI_API_KEY from environment)
        genie_model = config.get("genie_model", "gemini-2.5-flash-lite")
        chunker_config["genie"] = GeminiGenie(model=genie_model)
        chunker_config["candidate_size"] = config.get("candidate_size", 128)
        chunker_config["verbose"] = config.get("verbose", True)

    elif chunker_type == 'code':
        # CodeChunker: AST-aware code splitting
        chunker_config["language"] = config.get("language", "python")
        chunker_config["include_nodes"] = config.get("include_nodes", False)

    elif chunker_type == 'sentence':
        # SentenceChunker: Simple sentence boundaries
        chunker_config["min_sentences_per_chunk"] = config.get("min_sentences", 1)

    # Initialize and return chunker
    return ChunkerClass(**chunker_config)


def chunk_markdown(markdown: str, config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Chunk markdown text using specified Chonkie strategy.

    Args:
        markdown: Markdown text to chunk
        config: Configuration dict with chunker_type and options

    Returns:
        List of chunk dicts with text, start_index, end_index, token_count
    """
    chunker_type = config.get("chunker_type", "recursive")

    # Initialize chunker
    chunker = initialize_chunker(chunker_type, config)

    # Chunk the markdown
    chunks = chunker.chunk(markdown)

    # Format output with guaranteed character offsets
    output = [
        {
            "text": chunk.text,
            "start_index": chunk.start_index,  # Character offset in original markdown
            "end_index": chunk.end_index,      # Character offset in original markdown
            "token_count": chunk.token_count,
            "chunker_type": chunker_type
        }
        for chunk in chunks
    ]

    return output


def main():
    """Main entry point for script."""
    try:
        # Read input from stdin (JSON with markdown and config)
        input_data = json.loads(sys.stdin.read())

        markdown = input_data.get("markdown")
        if markdown is None:
            raise ValueError("Missing required field: 'markdown'")

        config = input_data.get("config", {})

        # Chunk the markdown
        chunks = chunk_markdown(markdown, config)

        # Write output to stdout
        sys.stdout.write(json.dumps(chunks))
        sys.stdout.flush()  # CRITICAL: prevents IPC hangs

        sys.exit(0)

    except Exception as e:
        # Write error to stderr
        sys.stderr.write(f"ERROR: {e}\n")
        sys.stderr.flush()

        # Write stack trace for debugging
        import traceback
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()

        sys.exit(1)


if __name__ == "__main__":
    main()
