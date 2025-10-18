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

    # Build common config (most chunkers support these)
    # Note: Some chunkers have different APIs:
    #   - NeuralChunker: does NOT use tokenizer or chunk_size
    #   - SemanticChunker: does NOT use tokenizer (uses embedding_model)
    #   - LateChunker: does NOT use tokenizer (uses embedding_model)
    if chunker_type == 'neural':
        # NeuralChunker has different API: model, device_map, min_characters_per_chunk
        chunker_config = {}
    else:
        # Most chunkers accept tokenizer and chunk_size
        # (SemanticChunker and LateChunker will ignore tokenizer via **kwargs)
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
        # Note: Lower threshold = larger chunks, higher threshold = smaller chunks
        # Note: SemanticChunker does NOT use tokenizer (uses embedding model instead)
        chunker_config["embedding_model"] = config.get(
            "embedding_model",
            "minishlab/potion-base-32M"  # Default from Chonkie
        )
        chunker_config["threshold"] = config.get("threshold", 0.8)  # Fixed: was "similarity_threshold"

    elif chunker_type == 'late':
        # LateChunker: Contextual embeddings for high retrieval quality
        # Note: LateChunker does NOT use tokenizer or mode parameters
        chunker_config["embedding_model"] = config.get(
            "embedding_model",
            "sentence-transformers/all-MiniLM-L6-v2"  # Full model name from Chonkie
        )
        # Optional: Add rules configuration if needed
        # chunker_config["rules"] = RecursiveRules() if config.get("rules") else None

    elif chunker_type == 'neural':
        # NeuralChunker: BERT-based semantic shift detection
        # Note: NeuralChunker does NOT use tokenizer or chunk_size
        chunker_config["model"] = config.get("model", "mirth/chonky_modernbert_base_1")
        chunker_config["device_map"] = config.get("device_map", "cpu")
        chunker_config["min_characters_per_chunk"] = config.get("min_characters_per_chunk", 10)

    elif chunker_type == 'slumber':
        # SlumberChunker: Agentic LLM-powered (requires API key)
        # Note: genie parameter should be a BaseGenie instance or None
        # If None, SlumberChunker will try to load default Genie configuration
        genie_type = config.get("genie", None)
        if genie_type:
            # If user specifies genie type, they need to set up the Genie instance
            # For now, we'll pass None and let SlumberChunker use defaults
            # TODO: Implement proper GeminiGenie/OpenAIGenie instantiation
            pass
        # SlumberChunker accepts: genie, tokenizer, chunk_size, rules, candidate_size, min_characters_per_chunk, verbose
        chunker_config["genie"] = None  # Let SlumberChunker use default config
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
