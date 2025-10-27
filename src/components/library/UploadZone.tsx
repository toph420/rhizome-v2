'use client'

import { useCallback, useEffect, useState } from 'react'
import { uploadDocument, estimateProcessingCost } from '@/app/actions/documents'
import { createClient } from '@/lib/supabase/client'
import {
  extractYoutubeMetadata,
  extractTextMetadata,
  extractEpubMetadata,
  extractPdfMetadata,
  extractPdfMetadataFromStorage
} from '@/app/actions/metadata-extraction'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { useUploadStore } from '@/stores/upload-store'
import { Card } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Input } from '@/components/rhizome/input'
import { Label } from '@/components/rhizome/label'
import { Textarea } from '@/components/rhizome/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { Checkbox } from '@/components/rhizome/checkbox'
import { Upload, FileText, DollarSign, Clock, Link as LinkIcon, ClipboardPaste, Video, Globe, Loader2, Sparkles } from 'lucide-react'
import { DocumentPreview, workflowToFlags, type ReviewWorkflow } from '@/components/upload/DocumentPreview'
import type { DetectedMetadata } from '@/types/metadata'
import type { ChunkerType } from '@/types/chunker'

type SourceType = 'pdf' | 'epub' | 'markdown_asis' | 'markdown_clean' | 'txt' | 'youtube' | 'web_url' | 'paste'
type TabType = 'file' | 'url' | 'paste'
type UploadPhase = 'idle' | 'detecting' | 'preview' | 'uploading'

/**
 * Determine which metadata extraction method to use for a file.
 * Returns the extraction type, or null for types without preview (web_url, paste).
 */
function getMetadataExtractionType(file: File): 'pdf' | 'epub' | 'text' | null {
  // PDF
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    return 'pdf'
  }

  // EPUB
  if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) {
    return 'epub'
  }

  // Markdown or Text
  if (file.name.endsWith('.md') || file.name.endsWith('.markdown') ||
      file.type === 'text/plain' || file.name.endsWith('.txt')) {
    return 'text'
  }

  // No preview for other types (web_url, paste)
  return null
}

/**
 * Multi-method upload interface with tabs for file upload, URL fetching, and content pasting.
 * Supports PDFs, EPUBs, Markdown, text, YouTube videos, web articles, and pasted content.
 * @returns Upload zone component with tabbed interface.
 */
export function UploadZone() {
  // Background jobs store for tracking upload/processing jobs
  const { registerJob } = useBackgroundJobsStore()

  // Local state for temp storage path (PDF metadata extraction)
  const [tempStoragePath, setTempStoragePath] = useState<string | null>(null)

  // Upload store - replaces 19 useState hooks
  const activeTab = useUploadStore(state => state.activeTab)
  const setActiveTab = useUploadStore(state => state.setActiveTab)
  const selectedFile = useUploadStore(state => state.selectedFile)
  const setSelectedFile = useUploadStore(state => state.setSelectedFile)
  const isDragging = useUploadStore(state => state.isDragging)
  const setIsDragging = useUploadStore(state => state.setIsDragging)
  const markdownProcessing = useUploadStore(state => state.markdownProcessing)
  const setMarkdownProcessing = useUploadStore(state => state.setMarkdownProcessing)
  const uploadPhase = useUploadStore(state => state.uploadPhase)
  const setUploadPhase = useUploadStore(state => state.setUploadPhase)
  const detectedMetadata = useUploadStore(state => state.detectedMetadata)
  const setDetectedMetadata = useUploadStore(state => state.setDetectedMetadata)
  const uploadSource = useUploadStore(state => state.uploadSource)
  const setUploadSource = useUploadStore(state => state.setUploadSource)
  const urlInput = useUploadStore(state => state.urlInput)
  const setUrlInput = useUploadStore(state => state.setUrlInput)
  const urlType = useUploadStore(state => state.urlType)
  const setUrlType = useUploadStore(state => state.setUrlType)
  const pastedContent = useUploadStore(state => state.pastedContent)
  const setPastedContent = useUploadStore(state => state.setPastedContent)
  const pasteSourceUrl = useUploadStore(state => state.pasteSourceUrl)
  const setPasteSourceUrl = useUploadStore(state => state.setPasteSourceUrl)
  const costEstimate = useUploadStore(state => state.costEstimate)
  const setCostEstimate = useUploadStore(state => state.setCostEstimate)
  const isUploading = useUploadStore(state => state.isUploading)
  const setIsUploading = useUploadStore(state => state.setIsUploading)
  const error = useUploadStore(state => state.error)
  const setError = useUploadStore(state => state.setError)
  const reviewWorkflow = useUploadStore(state => state.reviewWorkflow)
  const setReviewWorkflow = useUploadStore(state => state.setReviewWorkflow)
  const cleanMarkdown = useUploadStore(state => state.cleanMarkdown)
  const setCleanMarkdown = useUploadStore(state => state.setCleanMarkdown)
  const extractImages = useUploadStore(state => state.extractImages)
  const setExtractImages = useUploadStore(state => state.setExtractImages)
  const chunkerType = useUploadStore(state => state.chunkerType)
  const setChunkerType = useUploadStore(state => state.setChunkerType)
  const enrichChunks = useUploadStore(state => state.enrichChunks)
  const setEnrichChunks = useUploadStore(state => state.setEnrichChunks)
  const detectConnections = useUploadStore(state => state.detectConnections)
  const setDetectConnections = useUploadStore(state => state.setDetectConnections)

  /**
   * Cleanup temp storage file.
   */
  const cleanupTempFile = useCallback(async () => {
    if (!tempStoragePath) return

    try {
      console.log('🧹 Cleaning up temp file:', tempStoragePath)
      const supabase = createClient()
      await supabase.storage.from('documents').remove([tempStoragePath])
      setTempStoragePath(null)
      console.log('✅ Temp file cleaned up')
    } catch (error) {
      console.error('⚠️ Failed to cleanup temp file:', error)
      // Don't throw - cleanup failure shouldn't block the workflow
    }
  }, [tempStoragePath])

  /**
   * Detects URL type (YouTube vs web article).
   * @param url - URL to detect.
   */
  const detectUrlType = useCallback((url: string) => {
    if (!url) {
      setUrlType(null)
      return
    }
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      setUrlType('youtube')
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      setUrlType('web_url')
    } else {
      setUrlType(null)
    }
  }, [])

  /**
   * Handles file selection and generates cost estimate.
   * For supported file types, triggers metadata detection.
   * @param file - Selected file.
   */
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file)
    setError(null)
    setUploadSource('file') // Track that this is a file upload

    const estimate = await estimateProcessingCost(file.size)
    setCostEstimate(estimate)

    // Check if this file type supports metadata preview
    const extractionType = getMetadataExtractionType(file)

    if (!extractionType) {
      // No preview, proceed directly to upload (web_url, paste patterns)
      console.log('No metadata preview for this file type, skipping detection')
      return
    }

    // Extract metadata for preview using Server Actions
    setUploadPhase('detecting')

    try {
      console.log(`🔍 Extracting metadata using ${extractionType} extraction...`)
      const startTime = Date.now()

      let metadata: DetectedMetadata

      if (extractionType === 'pdf') {
        // PDF extraction - Storage-first approach to avoid 413 errors
        console.log('📤 Uploading PDF to temp storage for metadata extraction...')

        // Get Supabase client
        const supabase = createClient()

        // Get current user (needed for temp path)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('User not authenticated')
        }

        // Generate temp path
        const tempId = crypto.randomUUID()
        const tempPath = `temp/${user.id}/${tempId}.pdf`

        // Upload to storage (no HTTP body size limit)
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(tempPath, file)

        if (uploadError) {
          console.error('❌ Temp storage upload failed:', uploadError)
          throw new Error(`Failed to upload to temp storage: ${uploadError.message}`)
        }

        console.log('✅ Uploaded to temp storage:', tempPath)

        // Store temp path for later cleanup
        setTempStoragePath(tempPath)

        // Extract metadata from storage (tiny HTTP request with just the path)
        metadata = await extractPdfMetadataFromStorage(tempPath)
      } else if (extractionType === 'epub') {
        // EPUB extraction
        const fileBuffer = await file.arrayBuffer()
        metadata = await extractEpubMetadata(fileBuffer)
      } else {
        // Text/Markdown extraction
        const content = await file.text()
        metadata = await extractTextMetadata(content)
      }

      const duration = Date.now() - startTime
      console.log(`✅ Metadata extracted in ${duration}ms:`, metadata.title)

      setDetectedMetadata(metadata)
      setUploadPhase('preview')
    } catch (error) {
      console.error('Metadata detection error:', error)

      // Cleanup temp file on error
      await cleanupTempFile()

      // Fallback: Show preview with filename-based metadata
      setDetectedMetadata({
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        author: 'Unknown',
        type: 'article',
        description: 'Metadata extraction failed. Please edit manually.'
      })
      setUploadPhase('preview')
    }
  }, [cleanupTempFile])

  /**
   * Handles file drop event.
   * @param e - Drag event.
   */
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files[0]
    if (file && (file.type.includes('pdf') || file.type.includes('text') || file.name.endsWith('.md'))) {
      await handleFileSelect(file)
    } else {
      setError('Please drop a PDF, Markdown, or text file')
    }
  }, [handleFileSelect])

  /**
   * Handles file input change.
   * @param e - Change event.
   */
  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await handleFileSelect(file)
    }
  }, [handleFileSelect])

  /**
   * Determines source type based on file extension and processing preference.
   * @param file - Selected file.
   * @returns Source type.
   */
  const getSourceTypeForFile = useCallback((file: File): SourceType => {
    // Prefer MIME type
    if (file.type === 'application/epub+zip') {
      return 'epub'
    }

    if (file.type.includes('pdf')) {
      return 'pdf'
    }

    // Fallback to extension (EPUB files sometimes have incorrect MIME type)
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'epub') {
      return 'epub'
    }

    if (ext === 'pdf') {
      return 'pdf'
    }

    if (file.name.endsWith('.md')) {
      return markdownProcessing === 'asis' ? 'markdown_asis' : 'markdown_clean'
    }

    if (file.type.includes('text') || file.name.endsWith('.txt')) {
      return 'txt'
    }

    throw new Error(`Unsupported file type: ${file.type}`)
  }, [markdownProcessing])

  /**
   * Handles metadata preview confirmation.
   * Uploads cover image and document with metadata.
   */
  const handlePreviewConfirm = useCallback(async (
    editedMetadata: DetectedMetadata,
    coverImage: File | null
  ) => {
    // Handle both file uploads and YouTube URLs
    const isFileUpload = selectedFile !== null
    const isYouTubeUrl = urlInput && urlType === 'youtube'

    if (!isFileUpload && !isYouTubeUrl) return

    setUploadPhase('uploading')
    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()

      if (isFileUpload && selectedFile) {
        // File upload (PDF, EPUB, Markdown, Text)
        formData.append('file', selectedFile)
        formData.append('source_type', getSourceTypeForFile(selectedFile))
      } else if (isYouTubeUrl) {
        // YouTube URL
        formData.append('source_type', 'youtube')
        formData.append('source_url', urlInput)
      }

      // Add detected/edited metadata
      formData.append('document_type', editedMetadata.type)
      formData.append('author', editedMetadata.author)
      formData.append('title', editedMetadata.title)
      if (editedMetadata.year) {
        formData.append('publication_year', editedMetadata.year)
      }
      if (editedMetadata.publisher) {
        formData.append('publisher', editedMetadata.publisher)
      }
      if (editedMetadata.isbn) {
        formData.append('isbn', editedMetadata.isbn)
      }

      // Convert workflow to backend flags
      const flags = workflowToFlags(reviewWorkflow, cleanMarkdown)
      console.log('[UploadZone] Workflow flags:', flags)

      formData.append('reviewBeforeChunking', flags.reviewBeforeChunking.toString())
      formData.append('cleanMarkdown', flags.cleanMarkdown.toString())
      formData.append('reviewDoclingExtraction', flags.reviewDoclingExtraction.toString())
      formData.append('extractImages', extractImages.toString())
      formData.append('chunkerStrategy', chunkerType)
      formData.append('enrichChunks', enrichChunks.toString())
      formData.append('detectConnections', detectConnections.toString())

      // Handle cover images (File upload or base64/URL from metadata)
      if (coverImage) {
        // Manual file upload from DocumentPreview
        formData.append('cover_image', coverImage)
      } else if (editedMetadata.coverImage) {
        // base64 (EPUB) or URL (YouTube) from metadata extraction
        formData.append('cover_image_data', editedMetadata.coverImage)
      }

      console.log('📤 Uploading document with metadata...')
      const result = await uploadDocument(formData)
      console.log('📤 Upload result:', result)

      if (result.success && result.documentId && result.jobId) {
        console.log('✅ Document uploaded with metadata, job created:', result.jobId)

        // Register job in store for ProcessingDock tracking
        registerJob(result.jobId, 'process_document', {
          documentId: result.documentId,
          title: editedMetadata.title
        })

        // Cleanup temp file on success
        await cleanupTempFile()

        // Reset state
        setSelectedFile(null)
        setCostEstimate(null)
        setDetectedMetadata(null)
        setUrlInput('')
        setUrlType(null)
        setUploadPhase('idle')
        setUploadSource(null)
      } else {
        // Cleanup temp file on error
        await cleanupTempFile()
        setError(result.error || 'Upload failed')
        setUploadPhase('preview') // Return to preview on error
      }
    } catch (err) {
      console.error('❌ Upload error:', err)
      // Cleanup temp file on exception
      await cleanupTempFile()
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploadPhase('preview')
    } finally {
      setIsUploading(false)
    }
  }, [selectedFile, urlInput, urlType, getSourceTypeForFile, reviewWorkflow, cleanMarkdown, extractImages, chunkerType, enrichChunks, detectConnections, registerJob, cleanupTempFile])

  /**
   * Handles metadata preview cancellation.
   */
  const handlePreviewCancel = useCallback(async () => {
    // Cleanup temp file on cancel
    await cleanupTempFile()

    setSelectedFile(null)
    setCostEstimate(null)
    setDetectedMetadata(null)
    setUploadPhase('idle')
    setUploadSource(null)
    setError(null)
  }, [cleanupTempFile])

  /**
   * Uploads file with appropriate source type (non-PDF files).
   */
  const handleFileUpload = useCallback(async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('source_type', getSourceTypeForFile(selectedFile))
      formData.append('processing_requested', markdownProcessing === 'clean' ? 'true' : 'false')

      // Note: Non-PDF files don't go through DocumentPreview, so they use default workflow
      const flags = workflowToFlags('none', cleanMarkdown)
      formData.append('reviewBeforeChunking', flags.reviewBeforeChunking.toString())
      formData.append('cleanMarkdown', flags.cleanMarkdown.toString())
      formData.append('reviewDoclingExtraction', flags.reviewDoclingExtraction.toString())
      formData.append('chunkerStrategy', chunkerType)
      formData.append('enrichChunks', enrichChunks.toString())
      formData.append('detectConnections', detectConnections.toString())

      console.log('📤 Uploading file...')
      const result = await uploadDocument(formData)
      console.log('📤 Upload result:', result)

      if (result.success && result.documentId && result.jobId) {
        console.log('✅ Document uploaded and job created:', result.jobId)

        // Register job in store for ProcessingDock tracking
        registerJob(result.jobId, 'process_document', {
          documentId: result.documentId,
          title: selectedFile.name.replace(/\.[^/.]+$/, '') // Remove file extension
        })

        setSelectedFile(null)
        setCostEstimate(null)
      } else {
        setError(result.error || 'Upload failed')
      }
    } catch (err) {
      console.error('❌ Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }, [selectedFile, getSourceTypeForFile, markdownProcessing, cleanMarkdown, chunkerType, enrichChunks, detectConnections, registerJob])

  /**
   * Handle YouTube URL metadata extraction.
   */
  const handleYouTubeUrl = useCallback(async (url: string) => {
    setError(null)
    setUploadSource('url') // Track that this is a URL upload
    setUploadPhase('detecting')

    try {
      console.log('🔍 Fetching YouTube metadata...')

      const metadata = await extractYoutubeMetadata(url)
      console.log('✅ YouTube metadata extracted:', metadata.title)

      setDetectedMetadata(metadata)
      setUrlInput(url)
      setUploadPhase('preview')
    } catch (error) {
      console.error('YouTube metadata error:', error)

      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === 'QUOTA_EXCEEDED') {
          console.warn('YouTube API quota exceeded')
          setError('YouTube API quota exceeded. Please switch to the "Paste Content" tab and paste the video transcript manually.')
          setUploadPhase('idle')
          setUploadSource(null)
          return
        } else if (error.name === 'API_NOT_ENABLED') {
          console.warn('YouTube Data API not enabled')
          setError('YouTube Data API v3 is not enabled in Google Cloud Console. Please switch to the "Paste Content" tab.')
          setUploadPhase('idle')
          setUploadSource(null)
          return
        } else if (error.name === 'INVALID_API_KEY') {
          console.warn('Invalid YouTube API key')
          setError('YouTube API key is invalid or restricted. Check YOUTUBE_API_KEY in .env.local')
          setUploadPhase('idle')
          setUploadSource(null)
          return
        }
      }

      // Show error message for other errors
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch YouTube metadata'
      setError(`YouTube metadata extraction failed: ${errorMessage}. Please switch to the "Paste Content" tab and paste the transcript manually.`)
      setUploadPhase('idle')
      setUploadSource(null)
    }
  }, [])

  /**
   * Fetches content from URL.
   */
  const handleUrlFetch = useCallback(async () => {
    if (!urlInput || !urlType) return

    // For YouTube, show metadata preview first
    if (urlType === 'youtube') {
      await handleYouTubeUrl(urlInput)
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('source_type', urlType)
      formData.append('source_url', urlInput)
      formData.append('enrichChunks', enrichChunks.toString())
      formData.append('detectConnections', detectConnections.toString())

      console.log('🔗 Fetching from URL...')
      const result = await uploadDocument(formData)
      console.log('🔗 Fetch result:', result)

      if (result.success && result.documentId && result.jobId) {
        console.log('✅ Content fetched and job created:', result.jobId)

        // Register job in store for ProcessingDock tracking
        registerJob(result.jobId, 'process_document', {
          documentId: result.documentId,
          title: urlInput.split('/').pop() || urlInput // Use last part of URL or full URL
        })

        setUrlInput('')
        setUrlType(null)
      } else {
        setError(result.error || 'Fetch failed')
      }
    } catch (err) {
      console.error('❌ Fetch error:', err)
      setError(err instanceof Error ? err.message : 'Fetch failed')
    } finally {
      setIsUploading(false)
    }
  }, [urlInput, urlType, handleYouTubeUrl, enrichChunks, detectConnections, registerJob])

  /**
   * Submits pasted content.
   */
  const handlePasteSubmit = useCallback(async () => {
    if (!pastedContent) return
    
    setIsUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('source_type', 'paste')
      formData.append('pasted_content', pastedContent)
      if (pasteSourceUrl) {
        formData.append('source_url', pasteSourceUrl)
      }
      formData.append('enrichChunks', enrichChunks.toString())
      formData.append('detectConnections', detectConnections.toString())

      console.log('📋 Submitting pasted content...')
      const result = await uploadDocument(formData)
      console.log('📋 Paste result:', result)
      
      if (result.success && result.documentId && result.jobId) {
        console.log('✅ Content submitted and job created:', result.jobId)

        // Register job in store for ProcessingDock tracking
        registerJob(result.jobId, 'process_document', {
          documentId: result.documentId,
          title: pasteSourceUrl ? `Pasted: ${pasteSourceUrl.split('/').pop()}` : 'Pasted Content'
        })

        setPastedContent('')
        setPasteSourceUrl('')
      } else {
        setError(result.error || 'Submission failed')
      }
    } catch (err) {
      console.error('❌ Paste error:', err)
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setIsUploading(false)
    }
  }, [pastedContent, pasteSourceUrl, enrichChunks, detectConnections, registerJob])

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="file">
            <Upload className="h-4 w-4 mr-2" />
            Upload File
          </TabsTrigger>
          <TabsTrigger value="url">
            <LinkIcon className="h-4 w-4 mr-2" />
            Fetch from URL
          </TabsTrigger>
          <TabsTrigger value="paste">
            <ClipboardPaste className="h-4 w-4 mr-2" />
            Paste Content
          </TabsTrigger>
        </TabsList>

        <TabsContent value="file">
          {/* Show metadata preview for file uploads */}
          {uploadPhase === 'preview' && detectedMetadata && uploadSource === 'file' ? (
            <DocumentPreview
              metadata={detectedMetadata}
              onConfirm={handlePreviewConfirm}
              onCancel={handlePreviewCancel}
              reviewWorkflow={reviewWorkflow}
              onReviewWorkflowChange={setReviewWorkflow}
              cleanMarkdown={cleanMarkdown}
              onCleanMarkdownChange={setCleanMarkdown}
              extractImages={extractImages}
              onExtractImagesChange={setExtractImages}
              chunkerType={chunkerType}
              onChunkerTypeChange={setChunkerType}
              enrichChunks={enrichChunks}
              onEnrichChunksChange={setEnrichChunks}
              detectConnections={detectConnections}
              onDetectConnectionsChange={setDetectConnections}
              isMarkdownFile={selectedFile?.name.endsWith('.md') || selectedFile?.name.endsWith('.markdown')}
              markdownProcessing={markdownProcessing}
              onMarkdownProcessingChange={setMarkdownProcessing}
            />
          ) : uploadPhase === 'detecting' && uploadSource === 'file' ? (
            <Card className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">Analyzing document...</p>
                  <p className="text-sm text-muted-foreground">Extracting metadata from first 10 pages (~15 seconds)</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card
              className={`border-2 border-dashed !shadow-none p-8 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-muted p-4">
                {selectedFile ? <FileText className="h-8 w-8" /> : <Upload className="h-8 w-8" />}
              </div>
              
              {!selectedFile ? (
                <>
                  <div>
                    <p className="text-lg font-medium">Drop PDF, EPUB, Markdown, or text file here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.epub,.txt,.md"
                    onChange={handleFileInputChange}
                    className="hidden"
                    id="file-input"
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    Browse Files
                  </Button>
                </>
              ) : (
                <div className="w-full space-y-4">
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>

                  {costEstimate && (
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span>${costEstimate.cost.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{Math.round(costEstimate.estimatedTime / 1000)}s</span>
                      </div>
                      <div className="text-muted-foreground">
                        {costEstimate.tokens.toLocaleString()} tokens
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={handleFileUpload}
                      disabled={isUploading || selectedFile?.type.includes('pdf')}
                      className="flex-1"
                    >
                      {isUploading ? 'Processing...' : 'Process Document'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedFile(null)
                        setCostEstimate(null)
                      }}
                      disabled={isUploading}
                    >
                      Cancel
                    </Button>
                  </div>

                  {selectedFile?.type.includes('pdf') && (
                    <p className="text-xs text-muted-foreground text-center">
                      PDFs are processed after metadata confirmation
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="url">
          {/* Show metadata preview for URL uploads (YouTube) */}
          {uploadPhase === 'preview' && detectedMetadata && uploadSource === 'url' ? (
            <DocumentPreview
              metadata={detectedMetadata}
              onConfirm={handlePreviewConfirm}
              onCancel={handlePreviewCancel}
              reviewWorkflow={reviewWorkflow}
              onReviewWorkflowChange={setReviewWorkflow}
              cleanMarkdown={cleanMarkdown}
              onCleanMarkdownChange={setCleanMarkdown}
              extractImages={extractImages}
              onExtractImagesChange={setExtractImages}
              chunkerType={chunkerType}
              onChunkerTypeChange={setChunkerType}
              enrichChunks={enrichChunks}
              onEnrichChunksChange={setEnrichChunks}
              detectConnections={detectConnections}
              onDetectConnectionsChange={setDetectConnections}
              isMarkdownFile={false}
              markdownProcessing={markdownProcessing}
              onMarkdownProcessingChange={setMarkdownProcessing}
            />
          ) : uploadPhase === 'detecting' && uploadSource === 'url' ? (
            <Card className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">Fetching YouTube metadata...</p>
                  <p className="text-sm text-muted-foreground">Retrieving video details</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="url-input">URL</Label>
                  <Input
                    id="url-input"
                    placeholder="https://youtube.com/watch?v=... or https://example.com/article"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value)
                      detectUrlType(e.target.value)
                    }}
                    disabled={isUploading}
                  />
                </div>

                {urlType && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {urlType === 'youtube' ? (
                      <>
                        <Video className="h-4 w-4" />
                        <span>YouTube video detected - will fetch transcript</span>
                      </>
                    ) : (
                      <>
                        <Globe className="h-4 w-4" />
                        <span>Web article detected - will extract content</span>
                      </>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleUrlFetch}
                  disabled={!urlInput || !urlType || isUploading}
                  className="w-full"
                >
                  {isUploading ? 'Fetching...' : 'Fetch Content'}
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="paste">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paste-content">Content</Label>
                <Textarea
                  id="paste-content"
                  placeholder="Paste your content here..."
                  value={pastedContent}
                  onChange={(e) => setPastedContent(e.target.value)}
                  disabled={isUploading}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paste-source-url">Source URL (optional)</Label>
                <Input
                  id="paste-source-url"
                  placeholder="https://example.com (for attribution)"
                  value={pasteSourceUrl}
                  onChange={(e) => setPasteSourceUrl(e.target.value)}
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  If this is a YouTube transcript, paste the video URL here for clickable timestamps
                </p>
              </div>

              <Button
                onClick={handlePasteSubmit}
                disabled={!pastedContent || isUploading}
                className="w-full"
              >
                {isUploading ? 'Submitting...' : 'Submit Content'}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      
      {error && (
        <Card className="border-destructive bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}
    </div>
  )
}