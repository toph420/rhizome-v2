# Test Files for Manual Testing

Place test PDF files in this directory for manual testing of the background processing system.

## Required Test Files

### 1. Small PDF (5-10 pages) - `small.pdf`
**Purpose**: Happy path testing  
**Expected Processing Time**: 2-3 minutes  
**Tests**: Basic end-to-end flow, all processing stages

### 2. Medium PDF (50+ pages) - `medium.pdf`
**Purpose**: Progressive availability testing  
**Expected Processing Time**: 5-8 minutes  
**Tests**: User can read document before embeddings complete

### 3. Large PDF (100+ pages) - `large.pdf`
**Purpose**: Checkpoint resume testing  
**Expected Processing Time**: 10-20 minutes  
**Tests**: Worker resume from checkpoint after restart

### 4. Corrupted PDF - `corrupted.pdf`
**Purpose**: Error handling testing  
**Expected Result**: Graceful failure with user-friendly error message  
**Create with**: `echo "Not a PDF" > corrupted.pdf`

## Where to Find Test PDFs

- **Academic Papers**: [arXiv.org](https://arxiv.org) - Research papers (usually 10-30 pages)
- **Public Domain Books**: [Project Gutenberg](https://www.gutenberg.org) - Free ebooks (many available as PDF)
- **Sample PDFs**: [PDF995](https://www.pdf995.com/samples) - Various test documents
- **Technical Docs**: Open source project documentation (many are 50+ pages)

## Current Files

Check this directory for any existing test files: