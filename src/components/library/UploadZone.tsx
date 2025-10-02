'use client'

import { useState, useCallback } from 'react'
import { uploadDocument, estimateProcessingCost } from '@/app/actions/documents'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, FileText, DollarSign, Clock, Link as LinkIcon, ClipboardPaste, Video, Globe } from 'lucide-react'

type SourceType = 'pdf' | 'markdown_asis' | 'markdown_clean' | 'txt' | 'youtube' | 'web_url' | 'paste'
type TabType = 'file' | 'url' | 'paste'

/**
 * Multi-method upload interface with tabs for file upload, URL fetching, and content pasting.
 * Supports PDFs, Markdown, text, YouTube videos, web articles, and pasted content.
 * @returns Upload zone component with tabbed interface.
 */
export function UploadZone() {
  const [activeTab, setActiveTab] = useState<TabType>('file')
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [markdownProcessing, setMarkdownProcessing] = useState<'asis' | 'clean'>('asis')
  
  // URL fetch state
  const [urlInput, setUrlInput] = useState('')
  const [urlType, setUrlType] = useState<'youtube' | 'web' | null>(null)
  
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
   * @param file - Selected file.
   */
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file)
    setError(null)
    
    const estimate = await estimateProcessingCost(file.size)
    setCostEstimate(estimate)
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
    if (file.type.includes('pdf')) {
      return 'pdf'
    }
    
    if (file.name.endsWith('.md')) {
      return markdownProcessing === 'asis' ? 'markdown_asis' : 'markdown_clean'
    }
    
    if (file.type.includes('text') || file.name.endsWith('.txt')) {
      return 'txt'
    }
    
    return 'pdf'
  }, [markdownProcessing])

  /**
   * Uploads file with appropriate source type.
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
   * Fetches content from URL.
   */
  const handleUrlFetch = useCallback(async () => {
    if (!urlInput || !urlType) return
    
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
  }, [urlInput, urlType])

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
                    <p className="text-lg font-medium">Drop PDF, Markdown, or text file here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
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
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={handleFileUpload}
                      disabled={isUploading}
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
              )}
            </div>
          </Card>
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