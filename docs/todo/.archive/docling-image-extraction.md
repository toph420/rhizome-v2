# Docling Image Extraction - Implementation Guide

**Status:** 🔵 Future Enhancement
**Priority:** Medium
**Estimated Effort:** 2-3 hours

## Overview

Add support for extracting images from PDFs using Docling's built-in image extraction capabilities.

## Current Status

✅ UI checkbox added to DocumentPreview.tsx
✅ Flag plumbing added through UploadZone → formData → pdf-processor
✅ TypeScript interfaces updated (DoclingOptions, DoclingResult)
⏳ Python script updates needed
⏳ Image storage integration needed

## Implementation Steps

### 1. Update Python Script (`worker/scripts/docling_extract.py`)

```python
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling_core.types.doc import ImageRefMode
import base64
from io import BytesIO

# Add to input schema
input_data = json.loads(sys.stdin.read())
extract_images = input_data.get('extract_images', False)
images_scale = input_data.get('images_scale', 1.5)
image_mode = input_data.get('image_mode', 'referenced')  # or 'embedded'

# Configure pipeline options
if extract_images:
    pipeline_options = PdfPipelineOptions()
    pipeline_options.generate_picture_images = True  # REQUIRED!
    pipeline_options.images_scale = images_scale

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: pipeline_options
        }
    )

# Export with images
if extract_images and image_mode == 'embedded':
    # Embed images as base64 in markdown
    markdown = result.document.export_to_markdown(
        image_mode=ImageRefMode.EMBEDDED
    )
elif extract_images and image_mode == 'referenced':
    # Save images as separate files
    images = []
    for idx, picture in enumerate(result.document.pictures):
        image = picture.get_image(result.document)
        buffer = BytesIO()
        image.save(buffer, "PNG")

        images.append({
            'index': idx,
            'filename': f'image-{idx}.png',
            'data': base64.b64encode(buffer.getvalue()).decode('utf-8')
        })

    # Return images in JSON output
    output['images'] = images
```

### 2. Update TypeScript Bridge (`worker/lib/docling-extractor.ts`)

Already updated with:
- `extractImages?: boolean` option
- `imagesScale?: number` option (1.0-2.0)
- `imageMode?: 'embedded' | 'referenced'` option
- `images?: Array<...>` in result

Need to add:
```typescript
// Parse images from Python output
if (result.images && options.extractImages) {
  doclingResult.images = result.images.map((img: any) => ({
    filename: img.filename,
    index: img.index,
    data: Buffer.from(img.data, 'base64')
  }))
}
```

### 3. Update PDF Processor (`worker/processors/pdf-processor.ts`)

```typescript
// Extract PDF with image support
const extractImages = this.job.input_data?.extractImages === true

const extractionResult = await extractPdfBuffer(
  fileBuffer,
  {
    ocr: false,
    extractImages: extractImages,
    imagesScale: 1.5,
    imageMode: 'referenced' // Separate files for large books
  },
  async (progress) => { /* ... */ }
)

// Upload images to Supabase Storage
if (extractionResult.images && extractImages) {
  console.log(`[PDFProcessor] Uploading ${extractionResult.images.length} images to storage`)

  for (const image of extractionResult.images) {
    const imagePath = `${storagePath}/images/${image.filename}`

    await this.supabase.storage
      .from('documents')
      .upload(imagePath, image.data, {
        contentType: 'image/png',
        upsert: false
      })

    console.log(`[PDFProcessor] Uploaded ${image.filename}`)
  }
}
```

### 4. Update Progress Estimates

With images enabled:
- Extraction time: 3.1s/page → 4-5s/page (~30-40% slower)
- 427-page book: 22 minutes → 29 minutes
- Cost: No AI cost increase, just storage

## Performance Impact

| Metric | Without Images | With Images | Difference |
|--------|---------------|-------------|------------|
| Speed/page | 3.1s | 4-5s | +30-40% |
| 100-page PDF | ~5 min | ~7 min | +40% |
| 427-page book | ~22 min | ~29 min | +32% |
| Storage | ~1.2MB markdown | ~1.2MB + images | Varies |

## Image Storage Strategy

**Recommended: `referenced` mode (separate PNG files)**

Pros:
- Smaller markdown files
- Easier to manage/delete images separately
- Can serve images via CDN
- Better for large books with many diagrams

Cons:
- More files to manage
- Requires separate storage logic

**Alternative: `embedded` mode (base64 in markdown)**

Pros:
- Single self-contained markdown file
- Simpler export/portability

Cons:
- Very large markdown files (can exceed MB)
- Slower to load/parse
- Not recommended for books with >10 images

## Testing Checklist

- [ ] Extract PDF without images (verify still works)
- [ ] Extract PDF with images (embedded mode)
- [ ] Extract PDF with images (referenced mode)
- [ ] Verify image quality at different scales (1.0, 1.5, 2.0)
- [ ] Verify images stored in correct Storage path
- [ ] Verify markdown references images correctly
- [ ] Test with PDF containing:
  - [ ] Diagrams
  - [ ] Photos
  - [ ] Charts/graphs
  - [ ] Complex layouts

## Future Enhancements

1. **Selective Image Extraction**
   - Only extract images above certain size threshold
   - Skip decorative images (logos, icons)

2. **Image Optimization**
   - Compress PNGs to reduce storage
   - Convert to WebP for better compression

3. **Image Analysis**
   - Add captions to images using AI
   - Extract text from diagrams with OCR

## References

- Docling Image Docs: https://docling-project.github.io/docling/examples/export_images/
- Implementation Progress: `docs/todo/docling-implementation-progress.md`

---

**Last Updated:** 2025-10-08
