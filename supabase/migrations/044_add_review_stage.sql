-- Migration 044: Add review_stage to documents table
-- Tracks which review checkpoint the document is at

-- Add review_stage column
-- Values: 'docling_extraction' (after Docling + regex), 'ai_cleanup' (after AI cleanup), NULL (not in review)
ALTER TABLE public.documents
ADD COLUMN review_stage TEXT CHECK (review_stage IN ('docling_extraction', 'ai_cleanup'));

-- Add index for querying documents in review
CREATE INDEX idx_documents_review_stage ON public.documents(review_stage)
WHERE review_stage IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.documents.review_stage IS
'Review checkpoint: docling_extraction (after Docling+regex, before AI cleanup) or ai_cleanup (after AI cleanup, before chunking)';
