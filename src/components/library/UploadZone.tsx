'use client'

import { useState, useCallback, useEffect } from 'react'
import { uploadDocument, estimateProcessingCost } from '@/app/actions/documents'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
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
 * Determine which metadata extraction API to use for a file.
 * Returns null for types without preview (web_url, paste).
 */
function getMetadataEndpoint(file: File): string | null {
  // PDF - already working
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    return '/api/extract-metadata'
  }

  // EPUB - new
  if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) {
    return '/api/extract-epub-metadata'
  }

  // Markdown - new
  if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
    return '/api/extract-text-metadata'
  }

  // Text - new
  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    return '/api/extract-text-metadata'
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

  const [activeTab, setActiveTab] = useState<TabType>('file')

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [markdownProcessing, setMarkdownProcessing] = useState<'asis' | 'clean'>('asis')
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [detectedMetadata, setDetectedMetadata] = useState<DetectedMetadata | null>(null)
  const [uploadSource, setUploadSource] = useState<'file' | 'url' | null>(null) // Track which tab initiated upload

  // URL fetch state
  const [urlInput, setUrlInput] = useState('')
  const [urlType, setUrlType] = useState<'youtube' | 'web_url' | null>(null)

  // Paste content state
  const [pastedContent, setPastedContent] = useState('')
  const [pasteSourceUrl, setPasteSourceUrl] = useState('')

  // Shared state
  const [costEstimate, setCostEstimate] = useState<{
    tokens: number
    cost: number
    estimatedTime: number
  } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewWorkflow, setReviewWorkflow] = useState<ReviewWorkflow>('none')
  const [cleanMarkdown, setCleanMarkdown] = useState(true) // Default to true - cleanup enabled
  const [extractImages, setExtractImages] = useState(false)
  const [chunkerType, setChunkerType] = useState<ChunkerType>('recursive') // Default to recursive (recommended)
  const [detectConnections, setDetectConnections] = useState(false) // Default false - user must opt-in

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
    const endpoint = getMetadataEndpoint(file)

    if (!endpoint) {
      // No preview, proceed directly to upload (web_url, paste patterns)
      console.log('No metadata preview for this file type, skipping detection')
      return
    }

    // Extract metadata for preview
    setUploadPhase('detecting')

    try {
      const formData = new FormData()
      formData.append('file', file)

      console.log(`🔍 Extracting metadata using ${endpoint}...`)
      const startTime = Date.now()

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        // Check if response is JSON before trying to parse
        const contentType = response.headers.get('content-type')
        let errorMessage = 'Metadata extraction failed'

        if (contentType?.includes('application/json')) {
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch (jsonError) {
            console.error('Failed to parse error response as JSON:', jsonError)
            // Use default error message if JSON parsing fails
          }
        } else {
          // Non-JSON error (HTML, plain text, etc.)
          const errorText = await response.text()
          console.error('Non-JSON error response:', errorText.slice(0, 200))
          errorMessage = `Server error (${response.status}): ${response.statusText}`
        }

        throw new Error(errorMessage)
      }

      // Check if success response is JSON
      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        console.error('Expected JSON response, got:', contentType)
        throw new Error('Invalid response format from server')
      }

      const metadata = await response.json()
      const duration = Date.now() - startTime

      console.log(`✅ Metadata extracted in ${duration}ms:`, metadata.title)

      setDetectedMetadata(metadata)
      setUploadPhase('preview')
    } catch (error) {
      console.error('Metadata detection error:', error)

      // Fallback: Show preview with filename-based metadata
      setDetectedMetadata({
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        author: 'Unknown',
        type: 'article',
        description: 'Metadata extraction failed. Please edit manually.'
      })
      setUploadPhase('preview')
    }
  }, [])

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
      formData.append('detectConnections', detectConnections.toString()) // NEW: Connection detection flag

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

        // Reset state
        setSelectedFile(null)
        setCostEstimate(null)
        setDetectedMetadata(null)
        setUrlInput('')
        setUrlType(null)
        setUploadPhase('idle')
        setUploadSource(null)
      } else {
        setError(result.error || 'Upload failed')
        setUploadPhase('preview') // Return to preview on error
      }
    } catch (err) {
      console.error('❌ Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploadPhase('preview')
    } finally {
      setIsUploading(false)
    }
  }, [selectedFile, urlInput, urlType, getSourceTypeForFile, reviewWorkflow, cleanMarkdown, extractImages, chunkerType, detectConnections, registerJob])

  /**
   * Handles metadata preview cancellation.
   */
  const handlePreviewCancel = useCallback(() => {
    setSelectedFile(null)
    setCostEstimate(null)
    setDetectedMetadata(null)
    setUploadPhase('idle')
    setUploadSource(null)
    setError(null)
  }, [])

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
      formData.append('detectConnections', detectConnections.toString()) // NEW: Connection detection flag

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
  }, [selectedFile, getSourceTypeForFile, markdownProcessing, cleanMarkdown, chunkerType, detectConnections, registerJob])

  /**
   * Handle YouTube URL metadata extraction.
   */
  const handleYouTubeUrl = useCallback(async (url: string) => {
    setError(null)
    setUploadSource('url') // Track that this is a URL upload
    setUploadPhase('detecting')

    try {
      console.log('🔍 Fetching YouTube metadata...')

      const response = await fetch('/api/extract-youtube-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      if (!response.ok) {
        // Check if response is JSON before trying to parse
        const contentType = response.headers.get('content-type')
        let errorData: any = null

        if (contentType?.includes('application/json')) {
          try {
            errorData = await response.json()
          } catch (jsonError) {
            console.error('Failed to parse error response as JSON:', jsonError)
          }
        }

        // Handle different error types with specific user guidance
        const errorType = errorData?.errorType
        const errorMessage = errorData?.message || errorData?.error

        switch (errorType) {
          case 'QUOTA_EXCEEDED':
            console.warn('YouTube API quota exceeded')
            setError('YouTube API quota exceeded. Please switch to the "Paste Content" tab and paste the video transcript manually.')
            setUploadPhase('idle')
            return

          case 'API_NOT_ENABLED':
            console.warn('YouTube Data API not enabled')
            setError(`YouTube Data API v3 is not enabled. Enable it at: ${errorData?.helpUrl || 'Google Cloud Console'}`)
            setUploadPhase('idle')
            return

          case 'INVALID_API_KEY':
            console.warn('Invalid YouTube API key')
            setError('YouTube API key is invalid or restricted. Check YOUTUBE_API_KEY in .env.local')
            setUploadPhase('idle')
            return

          case 'API_FORBIDDEN':
            console.warn('YouTube API access forbidden')
            setError(errorMessage || 'Access forbidden. Check API key restrictions in Google Cloud Console.')
            setUploadPhase('idle')
            return

          default:
            throw new Error(errorMessage || `Server error (${response.status}): ${response.statusText}`)
        }
      } else {
        // Check if success response is JSON
        const contentType = response.headers.get('content-type')
        if (!contentType?.includes('application/json')) {
          console.error('Expected JSON response, got:', contentType)
          throw new Error('Invalid response format from server')
        }

        const metadata = await response.json()
        console.log('✅ YouTube metadata extracted:', metadata.title)
        setDetectedMetadata(metadata)
      }

      setUrlInput(url)
      setUploadPhase('preview')
    } catch (error) {
      console.error('YouTube metadata error:', error)

      // Show error message instead of fallback
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
      formData.append('detectConnections', detectConnections.toString()) // NEW: Connection detection flag

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
  }, [urlInput, urlType, handleYouTubeUrl, detectConnections, registerJob])

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
      formData.append('detectConnections', detectConnections.toString()) // NEW: Connection detection flag

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
  }, [pastedContent, pasteSourceUrl, detectConnections, registerJob])

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
              className={`border-2 border-dashed p-8 text-center transition-colors ${
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