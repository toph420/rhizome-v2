#!/bin/bash
# Direct test of Docling Python script to see raw output

# Get a test PDF path
TEST_PDF="$1"

if [ -z "$TEST_PDF" ]; then
  echo "Usage: ./test-docling-direct.sh <path-to-pdf>"
  exit 1
fi

if [ ! -f "$TEST_PDF" ]; then
  echo "Error: PDF file not found: $TEST_PDF"
  exit 1
fi

echo "================================"
echo "Testing Docling Python Script"
echo "================================"
echo "PDF: $TEST_PDF"
echo ""

# Test 1: Basic extraction (no chunking)
echo "--- Test 1: Basic Extraction (no chunking) ---"
python3 worker/scripts/docling_extract.py "$TEST_PDF" '{"enable_chunking": false}' 2>&1

echo ""
echo ""

# Test 2: With chunking
echo "--- Test 2: With Chunking ---"
python3 worker/scripts/docling_extract.py "$TEST_PDF" '{"enable_chunking": true, "chunk_size": 512, "tokenizer": "Xenova/all-mpnet-base-v2"}' 2>&1

echo ""
echo "================================"
echo "Test Complete"
echo "================================"
