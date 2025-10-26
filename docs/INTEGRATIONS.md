# Integrations Guide

This guide covers third-party integrations available in Rhizome V2.

## Readwise Integration

Import highlights from your Readwise library into Rhizome documents.

### Setup

1. **Get your Readwise access token**:
   - Visit: https://readwise.io/access_token
   - Copy your personal access token

2. **Add to `.env.local`**:
   ```bash
   READWISE_ACCESS_TOKEN=your_token_here
   ```

3. **Restart dev server**:
   ```bash
   npm run dev
   ```

### Usage

#### Auto-Import (Recommended)

Auto-import searches your Readwise library for a matching book and imports highlights automatically.

**From Document Header** (while reading):
1. Open any document in the reader
2. Click "Import from Readwise" button in header
3. System searches your Readwise library by title and author
4. Highlights are queued for import
5. Monitor progress in ProcessingDock (bottom-right)

**From Admin Panel** (Cmd+Shift+A):
1. Open Admin Panel > Integrations tab
2. Select a document from the dropdown
3. Click "Import from Readwise API"
4. Highlights are queued for import
5. Check job history below

**Requirements**:
- Document must have complete metadata (title + author)
- Book must exist in your Readwise library
- READWISE_ACCESS_TOKEN must be configured

**What happens**:
1. Searches Readwise library for matching book
2. Downloads all highlights for matched book
3. Creates background job for import
4. Fuzzy matches highlights to document chunks
5. Exact matches → immediate annotations
6. Fuzzy matches → import_pending table for review

#### Manual Import (Fallback)

Use manual import when auto-import can't find a match or you want more control.

**Steps**:
1. Export JSON from Readwise:
   - Visit: https://readwise.io/export
   - Select book and export format: JSON
   - Download JSON file

2. Upload via Admin Panel:
   - Open Admin Panel > Integrations tab
   - Scroll to "Manual Import" section
   - Select document
   - Upload Readwise export JSON file
   - Click "Import Highlights"

3. Review matches:
   - Check ProcessingDock for job progress
   - View annotations in document reader
   - Review fuzzy matches in Annotations tab

### Error Messages

**"READWISE_ACCESS_TOKEN not configured"**
- Add token to `.env.local` and restart server

**"No matching book found in Readwise library"**
- Book may not be in your Readwise library
- Try manual JSON export and upload instead

**"Document metadata incomplete"**
- Set title and author in document metadata first
- Auto-import requires both fields for search

**"Book found but has no highlights"**
- Book exists in Readwise but has zero highlights
- Check Readwise.io to confirm highlights exist

### Technical Details

**Auto-Import Flow**:
```
User clicks → autoImportFromReadwise(documentId)
  ↓
Fetch document metadata (title, author)
  ↓
Search Readwise library via ReadwiseExportClient
  ↓
Download highlights JSON
  ↓
Create readwise_import background job
  ↓
Worker processes with fuzzy matching
  ↓
Import complete → annotations created
```

**Background Job**: `readwise_import`
- **Handler**: `worker/handlers/readwise-import.ts`
- **Search Client**: `worker/lib/readwise-export-api.ts`
- **Fuzzy Matching**: Chunk-bounded trigram matching
- **Review**: Fuzzy matches in `import_pending` table

**Supported Formats**:
- Readwise export JSON (from https://readwise.io/export)
- Highlights from books, articles, tweets, etc.
- Preserves highlight text, notes, and metadata

---

## Obsidian Integration

Export documents to Obsidian vault and sync edits back to Rhizome.

### Setup

Configure vault path in Settings panel.

### Export to Obsidian

1. Open document in reader
2. Click "Edit in Obsidian" button
3. Background job creates vault files
4. Document opens in Obsidian

### Sync from Obsidian

1. Edit markdown in Obsidian
2. Click "Sync from Obsidian" button in Rhizome
3. Background job detects changes
4. Reprocessing pipeline runs with annotation recovery

**See**: Full Obsidian integration guide in separate documentation.

---

## Future Integrations (Planned)

- Kindle highlights import
- Instapaper integration
- Pocket integration
- Notion export
