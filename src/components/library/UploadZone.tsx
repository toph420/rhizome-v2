'use client'

import { useState, useCallback } from 'react'
import { uploadDocument, estimateProcessingCost } from '@/app/actions/documents'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileText, DollarSign, Clock } from 'lucide-react'

/**
 * Drag-and-drop upload zone with cost estimation.
 * Shows processing cost estimate before confirming upload.
 * @returns Upload zone component.
 */
export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [costEstimate, setCostEstimate] = useState<{
    tokens: number
    cost: number
    estimatedTime: number
  } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
   * Uploads the selected file and triggers processing.
   */
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return
    
    setIsUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      console.log('📤 Uploading document...')
      const result = await uploadDocument(formData)
      console.log('📤 Upload result:', result)
      
      if (result.success && result.documentId) {
        // uploadDocument already creates the background job
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
  }, [selectedFile])

  return (
    <div className="space-y-4">
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
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex-1"
                >
                  {isUploading ? 'Uploading...' : 'Process Document'}
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
      
      {error && (
        <Card className="border-destructive bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}
    </div>
  )
}