# Rhizome V2 User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Adding Content](#adding-content)
   - [Upload Files](#upload-files)
   - [Fetch from URLs](#fetch-from-urls)
   - [Paste Content](#paste-content)
3. [YouTube Videos](#youtube-videos)
4. [Web Articles](#web-articles)
5. [Markdown Files](#markdown-files)
6. [Processing Status](#processing-status)
7. [Error Handling & Troubleshooting](#error-handling--troubleshooting)

---

## Getting Started

Rhizome V2 is a document reader that transforms content from multiple sources into searchable, annotatable markdown. You can upload PDFs, fetch YouTube transcripts, extract web articles, or paste text directly.

### Quick Overview

- **6 Input Methods**: PDFs, Markdown, Text, YouTube, Web Articles, Pasted Content
- **AI Processing**: Automatic extraction, cleaning, and chunking
- **Fast Mode**: Save markdown as-is without AI processing
- **Background Processing**: Continue working while documents process
- **Real-time Updates**: ProcessingDock shows live progress

---

## Adding Content

### Upload Files

Upload PDF documents, markdown files, or plain text files.

**Steps**:
1. Click the **"Upload File"** tab in the upload interface
2. Drag & drop a file or click **"Browse"** to select from your computer
3. Supported formats:
   - **PDF** (`.pdf`) - Research papers, books, reports, presentations
   - **Markdown** (`.md`) - Technical docs, notes, articles
   - **Text** (`.txt`) - Plain text files
4. For markdown files, choose your processing mode:
   - **"Save as-is"**: Fast heading-based chunking (~30 seconds)
   - **"Clean with AI"**: AI cleanup and semantic chunking (~1 minute)
5. Click **"Upload"**

**Expected Processing Times**:
- PDF (10 pages): ~1-2 minutes
- Markdown (as-is): ~30 seconds
- Markdown (clean): ~1 minute
- Text file: ~1 minute

---

### Fetch from URLs

Automatically fetch content from YouTube videos or web articles.

**Steps**:
1. Click the **"Fetch from URL"** tab
2. Paste a URL into the input field:
   - YouTube video URL (any format: youtube.com/watch, youtu.be, shorts)
   - Web article URL (news sites, blogs, documentation)
3. The system automatically detects the content type:
   - 🎥 **YouTube video** - Shows "YouTube video detected"
   - 📄 **Web article** - Shows "Web article detected"
4. Click **"Fetch"**

**Supported YouTube URL Formats**:
```
https://youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://youtube.com/shorts/VIDEO_ID
https://youtube.com/embed/VIDEO_ID
```

**Expected Processing Times**:
- YouTube (10-minute video): ~45 seconds
- Web article: ~45 seconds to 2 minutes

---

### Paste Content

Paste any text content directly for quick processing.

**Steps**:
1. Click the **"Paste Content"** tab
2. Paste your content into the large textarea
3. *Optional*: Add a source URL in the "Source URL" field for attribution
4. Click **"Submit"**

**Use Cases**:
- Copy-paste YouTube transcripts (when auto-fetch fails)
- Process email content
- Convert notes or drafts
- Add content from any source

**Timestamp Detection**:
If your pasted content contains timestamps in `[MM:SS]` or `[HH:MM:SS]` format, Rhizome will:
- Automatically detect them
- Preserve them in the markdown
- Make them clickable if you provide a YouTube URL

---

## YouTube Videos

### Automatic Transcript Fetching

When you provide a YouTube URL, Rhizome automatically:
1. Extracts the video ID
2. Fetches the transcript (no API key needed)
3. Formats it to clean markdown
4. Preserves timestamps as clickable links

### Clickable Timestamps

Transcripts maintain timestamps in the format:
```markdown
[00:00] Introduction to the topic
[02:15] First main point discussion
[05:30] Examples and demonstrations
```

**How to Use Timestamps**:
- Click any timestamp in the reader
- Opens the YouTube video at that exact moment
- Timestamps are preserved in all exports

### If Transcript Is Disabled

Some videos have transcripts disabled by the creator. When this happens:

1. **Error Message**: "YouTube transcript disabled for this video"
2. **Recovery Action**: Click **"Paste transcript manually"** button
3. **Manual Steps**:
   - Open the YouTube video
   - Click the **"Show transcript"** button (three dots menu)
   - Copy the transcript text
   - Switch to **"Paste Content"** tab
   - Paste the transcript
   - Add the YouTube URL in the "Source URL" field
   - Submit

---

## Web Articles

### Clean Content Extraction

Rhizome extracts article content using Mozilla's Readability algorithm, which:
- Removes ads and navigation
- Strips promotional content
- Preserves article structure and images
- Maintains author and publication info

### Supported Sites

Works with most:
- News websites (NYTimes, Guardian, etc.)
- Blog platforms (Medium, Substack, etc.)
- Technical documentation sites
- Academic publications

### Paywalled Articles

If you encounter a paywall (HTTP 403), Rhizome suggests:

1. **Error Message**: "Content behind paywall"
2. **Recovery Action**: Click **"Try archive.ph"** button
3. **Alternative Process**:
   - Opens https://archive.ph/ in new tab
   - Search for the article URL on archive.ph
   - If archived version exists, use that URL instead
   - Or use the **"Paste Content"** tab to paste the article text

---

## Markdown Files

### Two Processing Modes

**Save As-Is (Fast)**:
- No AI processing
- Splits by heading markers (`#`, `##`, `###`, etc.)
- Preserves exact formatting
- ~30 seconds processing time
- Best for: Well-formatted docs you trust

**Clean with AI (Enhanced)**:
- AI reviews and cleans formatting
- Semantic chunking (intelligent splits)
- Corrects common markdown issues
- ~1 minute processing time
- Best for: Notes, rough drafts, or messy formatting

### When to Use Each Mode

**Use "Save as-is" when**:
- Document is already well-formatted
- You want fast processing
- You trust the existing structure
- Content is technical documentation

**Use "Clean with AI" when**:
- Document has formatting inconsistencies
- You want semantic chunking
- Content is notes or drafts
- You want AI-enhanced structure

---

## Processing Status

### ProcessingDock

The **ProcessingDock** appears at the bottom of the screen during processing and shows:

**Progress Stages**:
- **Fetching** (YouTube): Downloading transcript
- **Extracting** (Web): Getting article content
- **Reading** (Files): Loading file from storage
- **Cleaning**: AI cleanup in progress
- **Chunking**: Creating semantic segments
- **Embedding**: Generating vector embeddings

**Visual Indicators**:
- 📊 Progress bar shows completion percentage
- 🔄 Animated spinner for active processing
- ⏱️ Estimated time remaining
- ✅ Success checkmark when complete
- ❌ Error icon if processing fails

### Document Status

Documents appear in your library with status indicators:
- **Pending** (⏳): Queued for processing
- **Processing** (🔄): Currently being processed
- **Completed** (✅): Ready to read
- **Failed** (❌): Error occurred (click for details)

---

## Error Handling & Troubleshooting

### Common Errors

**1. YouTube Transcript Disabled**
- **Cause**: Video creator disabled transcripts
- **Solution**: Paste transcript manually (see YouTube section above)
- **Button**: "Paste transcript manually" appears in error message

**2. Paywalled Article**
- **Cause**: Content behind paywall (HTTP 403)
- **Solution**: Try archive.ph for archived version
- **Button**: "Try archive.ph" opens archive search

**3. Rate Limit Exceeded**
- **Cause**: Too many requests to YouTube/external services
- **Solution**: Wait a few minutes and try again
- **Type**: Transient error (auto-retry after delay)

**4. Network Timeout**
- **Cause**: Server took too long to respond
- **Solution**: Check internet connection and retry
- **Type**: Transient error (auto-retry)

**5. URL Not Found (404)**
- **Cause**: Invalid URL or content removed
- **Solution**: Verify URL is correct
- **Type**: Permanent error (cannot retry)

**6. Invalid File Format**
- **Cause**: Uploaded unsupported file type
- **Solution**: Convert to PDF, .md, or .txt
- **Type**: Permanent error

### Retry Logic

Rhizome automatically retries transient errors:
- **First retry**: 5 seconds delay
- **Second retry**: 25 seconds delay
- **Third retry**: 125 seconds delay (exponential backoff)
- **Max retries**: 3 attempts

### Getting Help

If you continue to experience issues:
1. Check the error message in ProcessingDock
2. Try the suggested recovery action
3. Review this guide for specific error types
4. Contact support with:
   - Document ID
   - Error message
   - Source type (PDF, YouTube, etc.)
   - Timestamp when error occurred

---

## Best Practices

### For Best Results

**YouTube Videos**:
- Use videos with official transcripts (higher quality)
- Longer videos (>30min) may take longer to process
- If transcript quality is poor, paste manually with corrections

**Web Articles**:
- Use direct article URLs (not homepage)
- Avoid heavily JavaScript-rendered sites (may not extract well)
- For paywalled content, use archive.ph first

**Markdown Files**:
- Use "Save as-is" for trusted, well-formatted docs
- Use "Clean with AI" for notes and drafts
- Large files (>100KB) may take longer

**Pasted Content**:
- Include source URL when possible for attribution
- Clean up obvious formatting issues before pasting
- For YouTube transcripts, include timestamps in [MM:SS] format

### Processing Tips

1. **Start Small**: Test with shorter documents first
2. **Monitor Progress**: Watch ProcessingDock for status
3. **Be Patient**: Complex documents take 1-2 minutes
4. **Check Errors**: Read error messages carefully for recovery actions
5. **Use Alternatives**: If one method fails, try paste content instead

---

## FAQ

**Q: How long does processing take?**
A: Most documents process in 30 seconds to 2 minutes. PDFs and long articles may take longer.

**Q: Can I process multiple documents at once?**
A: Yes! The background worker handles up to 10 concurrent jobs.

**Q: What happens if I close the browser during processing?**
A: Processing continues in the background. Reopen to see status.

**Q: Are YouTube transcripts always available?**
A: No. If the creator disabled transcripts, you'll need to paste manually.

**Q: Can I edit documents after processing?**
A: Not directly. You can annotate and create flashcards from the content.

**Q: How accurate is web article extraction?**
A: Very accurate for standard articles. JavaScript-heavy sites may have issues.

**Q: What's the cost per document?**
A: Average cost is <$0.05 per document using Gemini API.

**Q: Can I export my content?**
A: Yes! Export feature coming soon (Phase 4) with ZIP bundles.

---

**Need more help?** Check the project documentation at `/docs/` or open an issue on GitHub.