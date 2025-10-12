# Zotero Import Setup Guide

Complete implementation for importing Zotero annotations into Rhizome.

## Setup

### 1. Add Environment Variables

Add to your `.env` file:

```bash
ZOTERO_USER_ID=your_user_id_here
ZOTERO_API_KEY=your_api_key_here
```

**How to get these:**

1. **User ID**: 
   - Go to https://www.zotero.org/settings/keys
   - Your user ID is shown at the top of the page

2. **API Key**:
   - Go to https://www.zotero.org/settings/keys/new
   - Give it a name (e.g., "Rhizome Import")
   - Enable "Allow library access" with "Read Only" permission
   - Click "Save Key"
   - Copy the key (you won't see it again!)

### 2. File Structure

```
workers/
├── lib/
│   └── zotero-api-client.ts          # Zotero API wrapper
└── handlers/
    └── zotero-import.ts               # Import logic (reuses Readwise)

app/api/documents/[id]/
└── import-zotero/
    └── route.ts                        # API endpoint

components/
└── ZoteroImportButton.tsx             # Frontend UI

scripts/
└── test-zotero.ts                     # Test script
```

### 3. Test Connection

```bash
# List your Zotero library
npx tsx scripts/test-zotero.ts

# Test annotations for specific item
npx tsx scripts/test-zotero.ts ABC123XYZ
```

## Usage

### Frontend

Add the button to your document viewer:

```tsx
import { ZoteroImportButton } from '@/components/ZoteroImportButton'

<ZoteroImportButton 
  documentId={documentId}
  onImportComplete={() => {
    // Refresh annotations
    refetch()
  }}
/>
```

### Finding Zotero Item Keys

**Method 1: Copy Item Link**
1. Right-click item in Zotero
2. Select "Copy Zotero URI"
3. Use the last part: `http://zotero.org/users/123456/items/ABC123XYZ` → `ABC123XYZ`

**Method 2: From Test Script**
```bash
npx tsx scripts/test-zotero.ts
# Lists all items with their keys
```

## How It Works

### Import Flow

```
1. User clicks "Import from Zotero" → enters item key
2. API fetches item metadata + annotations from Zotero
3. Filters to only highlights (skips notes-only and images)
4. Converts to ReadwiseHighlight format
5. Reuses existing fuzzy matching logic
6. Creates ECS annotations for matches
7. Returns results: imported / needs review / failed
```

### Matching Strategy

**Exact Match (Preferred)**
- Searches for highlight text in document markdown
- If found → creates annotation immediately
- ~90% success rate for clean PDFs

**Fuzzy Match (Fallback)**
- Uses chunk-bounded fuzzy matching
- Estimates chunk from page number
- Confidence > 70% → saves to `import_pending` for review
- Confidence < 70% → marks as failed

**Why Some Fail:**
- OCR differences between Zotero PDF and Rhizome processing
- Text reflow/hyphenation differences
- Highlights in images/figures (not in markdown)

## API Reference

### POST /api/documents/[id]/import-zotero

**Request:**
```json
{
  "zoteroItemKey": "ABC123XYZ"
}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "imported": 45,
    "needsReview": 3,
    "failed": 2,
    "reviewItems": [...],
    "failedItems": [...]
  }
}
```

### GET /api/documents/[id]/import-zotero

Check if document has Zotero metadata.

**Response:**
```json
{
  "hasZoteroMetadata": true,
  "zoteroItemKey": "ABC123XYZ",
  "zoteroTitle": "Gravity's Rainbow"
}
```

## Troubleshooting

### "Zotero API error: 403"
- Check your API key has "Read Only" library access enabled
- Regenerate key if needed: https://www.zotero.org/settings/keys

### "No annotations found"
- Verify item has highlights in Zotero
- Check item key is correct (should be 8-9 characters)
- Run test script: `npx tsx scripts/test-zotero.ts ABC123XYZ`

### Low success rate (<70%)
- PDF text quality issue (OCR variations)
- Try re-processing document in Rhizome with better extraction
- Check failed items to see if they're in images/figures

### Annotations appear twice
- Don't run import multiple times for same document
- Check `import_pending` table before accepting fuzzy matches

## Notes

**What Gets Imported:**
- ✅ Highlights with text
- ✅ Highlights with notes/comments
- ❌ Note-only annotations (no highlighted text)
- ❌ Image annotations
- ❌ Nested annotations (replies)

**Color Mapping:**
```
Zotero         Rhizome
#ffd400     →  yellow
#ff6666     →  red
#5fb236     →  green
#2ea8e5     →  blue
#a28ae5     →  blue (purple)
#f19837     →  orange
```

**Cost:**
- Zotero API: Free
- Fuzzy matching: Uses existing `findAnnotationMatch` logic
- No additional AI costs

## Future Enhancements

Possible additions (not implemented):
- [ ] Auto-sync on document upload (if Zotero key stored)
- [ ] Bulk import (multiple items at once)
- [ ] Background sync job (check for new annotations daily)
- [ ] Export annotations back to Zotero
- [ ] Handle nested annotations (replies to highlights)

## Comparison: Zotero vs Readwise

| Feature | Zotero | Readwise |
|---------|--------|----------|
| API | Free, public | Paid, token required |
| Source | Local PDFs | Reader web app |
| Annotations | Highlights only | Highlights + notes |
| Position | Page + coordinates | Page or location |
| Colors | Hex codes | Named colors |
| Matching | Same fuzzy logic | Same fuzzy logic |

Both use the same import pipeline → same success rates!