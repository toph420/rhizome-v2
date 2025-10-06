'use client'

import { useState, useCallback, useEffect } from 'react'
import { uploadDocument, estimateProcessingCost } from '@/app/actions/documents'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Upload, FileText, DollarSign, Clock, Link as LinkIcon, ClipboardPaste, Video, Globe, Loader2, Sparkles } from 'lucide-react'
import { DocumentPreview } from '@/components/upload/DocumentPreview'
import type { DetectedMetadata } from '@/types/metadata'

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
  const [activeTab, setActiveTab] = useState<TabType>('file')

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [markdownProcessing, setMarkdownProcessing] = useState<'asis' | 'clean'>('asis')
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [detectedMetadata, setDetectedMetadata] = useState<DetectedMetadata | null>(null)

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
  const [reviewBeforeChunking, setReviewBeforeChunking] = useState(false)

  // Debug: Log state changes
  useEffect(() => {
    console.log('[UploadZone] reviewBeforeChunking state changed to:', reviewBeforeChunking)
  }, [reviewBeforeChunking])

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

      // Add review before chunking flag
      console.log('[UploadZone] DEBUG reviewBeforeChunking state:', reviewBeforeChunking)
      formData.append('reviewBeforeChunking', reviewBeforeChunking.toString())
      console.log('[UploadZone] DEBUG formData value:', formData.get('reviewBeforeChunking'))

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

      if (result.success && result.documentId) {
        console.log('✅ Document uploaded with metadata, job created:', result.jobId)
        // Reset state
        setSelectedFile(null)
        setCostEstimate(null)
        setDetectedMetadata(null)
        setUrlInput('')
        setUrlType(null)
        setUploadPhase('idle')
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
  }, [selectedFile, urlInput, urlType, getSourceTypeForFile, reviewBeforeChunking])

  /**
   * Handles metadata preview cancellation.
   */
  const handlePreviewCancel = useCallback(() => {
    setSelectedFile(null)
    setCostEstimate(null)
    setDetectedMetadata(null)
    setUploadPhase('idle')
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
      console.log('[handleFileUpload] DEBUG reviewBeforeChunking state:', reviewBeforeChunking)
      formData.append('reviewBeforeChunking', reviewBeforeChunking.toString())
      console.log('[handleFileUpload] DEBUG formData value:', formData.get('reviewBeforeChunking'))

      console.log('📤 Uploading file...')
      const result = await uploadDocument(formData)
      console.log('📤 Upload result:', result)

      if (result.success && result.documentId) {
        console.log('✅ Document uploaded and job created:', result.jobId)
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
  }, [selectedFile, getSourceTypeForFile, markdownProcessing])

  /**
   * Handle YouTube URL metadata extraction.
   */
  const handleYouTubeUrl = useCallback(async (url: string) => {
    setError(null)
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

        if (response.status === 429 && errorData?.fallback) {
          // Quota exceeded - show manual entry
          console.warn('YouTube API quota exceeded, using fallback')
          setDetectedMetadata({
            title: 'YouTube Video',
            author: 'Unknown Channel',
            type: 'article',
            description: 'YouTube API quota exceeded. Please edit manually.'
          })
        } else {
          const errorMessage = errorData?.error || `Server error (${response.status}): ${response.statusText}`
          throw new Error(errorMessage)
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

      // Fallback: Show preview with placeholder
      setDetectedMetadata({
        title: 'YouTube Video',
        author: 'Unknown',
        type: 'article',
        description: 'Failed to fetch metadata. Please edit manually.'
      })
      setUrlInput(url)
      setUploadPhase('preview')
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

      console.log('🔗 Fetching from URL...')
      const result = await uploadDocument(formData)
      console.log('🔗 Fetch result:', result)

      if (result.success && result.documentId) {
        console.log('✅ Content fetched and job created:', result.jobId)
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
  }, [urlInput, urlType, handleYouTubeUrl])

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
      
      console.log('📋 Submitting pasted content...')
      const result = await uploadDocument(formData)
      console.log('📋 Paste result:', result)
      
      if (result.success && result.documentId) {
        console.log('✅ Content submitted and job created:', result.jobId)
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
  }, [pastedContent, pasteSourceUrl])

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
          {/* Show metadata preview for PDFs */}
          {uploadPhase === 'preview' && detectedMetadata ? (
            <DocumentPreview
              metadata={detectedMetadata}
              onConfirm={handlePreviewConfirm}
              onCancel={handlePreviewCancel}
              reviewBeforeChunking={reviewBeforeChunking}
              onReviewBeforeChunkingChange={setReviewBeforeChunking}
            />
          ) : uploadPhase === 'detecting' ? (
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

                  {selectedFile.name.endsWith('.md') && (
                    <div className="text-left space-y-2">
                      <Label>Markdown Processing</Label>
                      <RadioGroup value={markdownProcessing} onValueChange={(v) => setMarkdownProcessing(v as 'asis' | 'clean')}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="asis" id="asis" />
                          <Label htmlFor="asis" className="font-normal cursor-pointer">
                            Save as-is (chunk by headings)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="clean" id="clean" />
                          <Label htmlFor="clean" className="font-normal cursor-pointer">
                            Clean with AI (semantic chunking)
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                  
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
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="review-before-chunking"
                        checked={reviewBeforeChunking}
                        onCheckedChange={(checked) => {
                          console.log('[UploadZone main] Checkbox changed:', checked)
                          setReviewBeforeChunking(checked as boolean)
                        }}
                      />
                      <label
                        htmlFor="review-before-chunking"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="h-3 w-3" />
                        Review markdown before chunking
                      </label>
                    </div>
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