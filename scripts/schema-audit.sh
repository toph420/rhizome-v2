#!/bin/bash
# Schema Audit Script - Find potential schema assumption issues

set -e

echo "🔍 Schema Audit Tool"
echo "===================="
echo ""

# Colors
RED='\033[0:31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if in right directory
if [ ! -d "worker" ]; then
  echo "${RED}Error: Must run from project root${NC}"
  exit 1
fi

echo "📋 Checking for common schema assumption patterns..."
echo ""

# Pattern 1: user_id in chunks
echo "1. Checking for 'user_id' usage in chunks inserts..."
CHUNK_USER_ID=$(grep -rn "user_id.*:" worker/lib/managers worker/handlers 2>/dev/null | grep -i "chunk" | grep -v "document" || true)
if [ -n "$CHUNK_USER_ID" ]; then
  echo "${YELLOW}⚠️  Found potential user_id in chunks:${NC}"
  echo "$CHUNK_USER_ID"
else
  echo "${GREEN}✅ No user_id in chunks inserts${NC}"
fi
echo ""

# Pattern 2: chunk_count in documents
echo "2. Checking for 'chunk_count' in documents updates..."
CHUNK_COUNT=$(grep -rn "chunk_count" worker/lib/managers worker/handlers 2>/dev/null | grep "documents" || true)
if [ -n "$CHUNK_COUNT" ]; then
  echo "${YELLOW}⚠️  Found chunk_count references:${NC}"
  echo "$CHUNK_COUNT"
  echo "${YELLOW}NOTE: Check if 'chunk_count' field exists in documents table${NC}"
else
  echo "${GREEN}✅ No chunk_count references${NC}"
fi
echo ""

# Pattern 3: processed_at vs processing_completed_at
echo "3. Checking for 'processed_at' (should be 'processing_completed_at')..."
PROCESSED_AT=$(grep -rn "processed_at" worker/lib/managers worker/handlers 2>/dev/null | grep -v "metadata_extracted_at" || true)
if [ -n "$PROCESSED_AT" ]; then
  echo "${YELLOW}⚠️  Found processed_at usage:${NC}"
  echo "$PROCESSED_AT"
  echo "${YELLOW}NOTE: Should be 'processing_completed_at' in documents table${NC}"
else
  echo "${GREEN}✅ No processed_at references${NC}"
fi
echo ""

# Pattern 4: Direct .insert() calls without type safety
echo "4. Finding all direct database inserts..."
INSERTS=$(grep -rn "\.insert(" worker/lib/managers worker/handlers 2>/dev/null | wc -l)
echo "Found $INSERTS insert operations"
echo "${YELLOW}💡 TIP: Review these for schema accuracy${NC}"
echo ""

# Pattern 5: Direct .update() calls
echo "5. Finding all database updates..."
UPDATES=$(grep -rn "\.update(" worker/lib/managers worker/handlers 2>/dev/null | wc -l)
echo "Found $UPDATES update operations"
echo "${YELLOW}💡 TIP: Verify field names match schema${NC}"
echo ""

# Summary
echo "📊 Summary"
echo "=========="
echo "✅ = Checks passed"
echo "⚠️  = Review needed"
echo ""
echo "💡 To verify schema:"
echo "   psql postgresql://postgres:postgres@localhost:54322/postgres -c \"\\d table_name\""
echo ""
echo "📚 See: docs/SCHEMA_SAFETY_GUIDELINES.md"
