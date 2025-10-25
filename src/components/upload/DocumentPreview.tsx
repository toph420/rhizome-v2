'use client'

import { useState, useRef } from 'react'
import { Input } from '@/components/rhizome/input'
import { Label } from '@/components/rhizome/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/rhizome/select'
import { RadioGroup, RadioGroupItem } from '@/components/rhizome/radio-group'
import { Upload, X, Sparkles, Info } from 'lucide-react'
import Image from 'next/image'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'
import { Checkbox } from '@/components/rhizome/checkbox'
import { Alert, AlertDescription } from '@/components/rhizome/alert'
import type { ChunkerType } from '@/types/chunker'
import { chunkerDescriptions, chunkerTimeEstimates, chunkerLabels } from '@/types/chunker'

export type ReviewWorkflow = 'none' | 'after_extraction' | 'after_cleanup'

export interface WorkflowFlags {
  reviewDoclingExtraction: boolean
  reviewBeforeChunking: boolean
  cleanMarkdown: boolean
}

/**
 * Convert user-friendly workflow enum to backend flags
 */
export function workflowToFlags(
  workflow: ReviewWorkflow,
  cleanMarkdown: boolean
): WorkflowFlags {
  switch (workflow) {
    case 'none':
      return {
        reviewDoclingExtraction: false,
        reviewBeforeChunking: false,
        cleanMarkdown
      }

    case 'after_extraction':
      return {
        reviewDoclingExtraction: true,
        reviewBeforeChunking: false,
        cleanMarkdown: false // Deferred to resume stage
      }

    case 'after_cleanup':
      return {
        reviewDoclingExtraction: false,
        reviewBeforeChunking: true,
        cleanMarkdown
      }
  }
}

interface DocumentPreviewProps {
  metadata: DetectedMetadata
  onConfirm: (edited: DetectedMetadata, coverImage: File | null) => void
  onCancel: () => void
  reviewWorkflow?: ReviewWorkflow
  onReviewWorkflowChange?: (workflow: ReviewWorkflow) => void
  cleanMarkdown?: boolean
  onCleanMarkdownChange?: (checked: boolean) => void
  extractImages?: boolean
  onExtractImagesChange?: (checked: boolean) => void
  chunkerType?: ChunkerType
  onChunkerTypeChange?: (chunkerType: ChunkerType) => void
  detectConnections?: boolean
  onDetectConnectionsChange?: (checked: boolean) => void
  isMarkdownFile?: boolean
  markdownProcessing?: 'asis' | 'clean'
  onMarkdownProcessingChange?: (processing: 'asis' | 'clean') => void
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  fiction: 'Fiction',
  nonfiction_book: 'Nonfiction Book',
  academic_paper: 'Academic Paper',
  technical_manual: 'Technical Manual',
  article: 'Article',
  essay: 'Essay',
}

const REVIEW_WORKFLOW_OPTIONS = [
  {
    value: 'none' as const,
    label: 'Fully Automatic',
    description: 'Extract → Clean (optional) → Chunk → Done. Best for batch processing and trusted sources.'
  },
  {
    value: 'after_extraction' as const,
    label: 'Review After Extraction',
    description: 'Extract → PAUSE → Review → Choose cleanup → Chunk. Best for checking if already clean.'
  },
  {
    value: 'after_cleanup' as const,
    label: 'Review After Cleanup',
    description: 'Extract → Clean (optional) → PAUSE → Review → Chunk. Best for verifying cleanup quality.'
  }
] as const

export function DocumentPreview({
  metadata,
  onConfirm,
  onCancel,
  reviewWorkflow = 'none',
  onReviewWorkflowChange,
  cleanMarkdown = true,
  onCleanMarkdownChange,
  extractImages = false,
  onExtractImagesChange,
  chunkerType = 'recursive',
  onChunkerTypeChange,
  detectConnections = false,
  onDetectConnectionsChange,
  isMarkdownFile = false,
  markdownProcessing = 'asis',
  onMarkdownProcessingChange
}: DocumentPreviewProps) {
  const [edited, setEdited] = useState(metadata)
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(
    // Initialize with metadata cover if available (EPUB base64 or YouTube URL)
    metadata.coverImage || null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCoverImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setCoverPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeCover = () => {
    setCoverImage(null)
    setCoverPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 border rounded-lg bg-card">
      <h3 className="text-xl font-semibold mb-2">Confirm Document Details</h3>
      <p className="text-sm text-muted-foreground mb-6">
        {metadata.description}
      </p>

      <div className="grid grid-cols-[200px_1fr] gap-6">
        {/* Left: Cover Upload */}
        <div className="space-y-2">
          <Label>Cover Image (Optional)</Label>
          <div className="relative aspect-[2/3] border-2 border-dashed border-border rounded-lg overflow-hidden bg-muted/20">
            {coverPreview ? (
              <>
                <Image
                  src={coverPreview}
                  alt="Cover preview"
                  fill
                  className="object-cover"
                />
                <button
                  onClick={removeCover}
                  className="absolute top-2 right-2 p-1 bg-background/80 rounded-full hover:bg-background"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Upload className="w-8 h-8" />
                <span className="text-xs">Upload Cover</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverUpload}
            className="hidden"
          />
        </div>

        {/* Right: Metadata Fields */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={edited.title}
              onChange={(e) => setEdited({ ...edited, title: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              value={edited.author}
              onChange={(e) => setEdited({ ...edited, author: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="type">Document Type</Label>
            <Select
              value={edited.type}
              onValueChange={(value: DocumentType) =>
                setEdited({ ...edited, type: value })
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="year">Year (Optional)</Label>
              <Input
                id="year"
                type="text"
                value={edited.year || ''}
                onChange={(e) =>
                  setEdited({
                    ...edited,
                    year: e.target.value || undefined,
                  })
                }
                placeholder="2024"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="publisher">Publisher (Optional)</Label>
              <Input
                id="publisher"
                value={edited.publisher || ''}
                onChange={(e) =>
                  setEdited({ ...edited, publisher: e.target.value || undefined })
                }
                placeholder="Publisher name"
                className="mt-1.5"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Processing Options */}
      <div className="mt-6 pt-4 border-t space-y-4">
        {/* Review Workflow Selector */}
        <div className="space-y-2">
          <Label htmlFor="review-workflow">Review Workflow</Label>
          <Select
            value={reviewWorkflow}
            onValueChange={(value: ReviewWorkflow) => {
              onReviewWorkflowChange?.(value)
            }}
          >
            <SelectTrigger id="review-workflow" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_WORKFLOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Markdown Processing Option - Only show for markdown files */}
        {isMarkdownFile && (
          <div className="space-y-2">
            <Label htmlFor="markdown-processing">Markdown Processing</Label>
            <RadioGroup
              value={markdownProcessing}
              onValueChange={(value: 'asis' | 'clean') => {
                onMarkdownProcessingChange?.(value)
              }}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="asis" id="markdown-asis" />
                <Label htmlFor="markdown-asis" className="font-normal cursor-pointer">
                  Save as-is (no AI processing)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="clean" id="markdown-clean" />
                <Label htmlFor="markdown-clean" className="font-normal cursor-pointer flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Clean with AI (recommended)
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {markdownProcessing === 'asis'
                ? 'Use original markdown as-is, no AI cleanup'
                : 'AI will improve formatting and structure'}
            </p>
          </div>
        )}

        {/* AI Cleanup Option - Only show for 'none' and 'after_cleanup' workflows */}
        {(reviewWorkflow === 'none' || reviewWorkflow === 'after_cleanup') && !isMarkdownFile && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="clean-markdown-preview"
              checked={cleanMarkdown}
              onCheckedChange={(checked) => {
                onCleanMarkdownChange?.(checked as boolean)
              }}
            />
            <label
              htmlFor="clean-markdown-preview"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="h-3 w-3" />
              AI cleanup markdown (recommended)
            </label>
          </div>
        )}

        {reviewWorkflow === 'after_extraction' && (
          <p className="text-xs text-muted-foreground">
            💡 You'll choose whether to run AI cleanup after reviewing the extraction
          </p>
        )}

        {/* Chunker Strategy Selection */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="chunker-strategy">Chunking Strategy</Label>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <Select
            value={chunkerType}
            onValueChange={(value: ChunkerType) => {
              onChunkerTypeChange?.(value)
            }}
          >
            <SelectTrigger id="chunker-strategy" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="token">{chunkerLabels.token} ({chunkerTimeEstimates.token})</SelectItem>
              <SelectItem value="sentence">{chunkerLabels.sentence} ({chunkerTimeEstimates.sentence})</SelectItem>
              <SelectItem value="recursive">{chunkerLabels.recursive} ({chunkerTimeEstimates.recursive})</SelectItem>
              <SelectItem value="semantic">{chunkerLabels.semantic} ({chunkerTimeEstimates.semantic})</SelectItem>
              <SelectItem value="late">{chunkerLabels.late} ({chunkerTimeEstimates.late})</SelectItem>
              <SelectItem value="code">{chunkerLabels.code} ({chunkerTimeEstimates.code})</SelectItem>
              <SelectItem value="neural">{chunkerLabels.neural} ({chunkerTimeEstimates.neural})</SelectItem>
              <SelectItem value="slumber">{chunkerLabels.slumber} ({chunkerTimeEstimates.slumber})</SelectItem>
              <SelectItem value="table">{chunkerLabels.table} ({chunkerTimeEstimates.table})</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {chunkerDescriptions[chunkerType]}
          </p>
        </div>

        {/* Non-default Chunker Warning */}
        {chunkerType !== 'recursive' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Estimated processing time: <strong>{chunkerTimeEstimates[chunkerType]}</strong> for 500-page document.
              {chunkerType === 'slumber' && ' ⚠️ Warning: Very slow, use only for critical documents.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Extract Images Option */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="extract-images-preview"
            checked={extractImages}
            onCheckedChange={(checked) => {
              onExtractImagesChange?.(checked as boolean)
            }}
          />
          <label
            htmlFor="extract-images-preview"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="h-3 w-3" />
            Extract images from PDF (slower, ~30-40% more time)
          </label>
        </div>

        {/* Connection Detection Option */}
        <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/30">
          <Checkbox
            id="detect-connections-preview"
            checked={detectConnections}
            onCheckedChange={(checked) => {
              onDetectConnectionsChange?.(checked as boolean)
            }}
          />
          <div className="flex-1">
            <label
              htmlFor="detect-connections-preview"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer block"
            >
              Detect connections after processing
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Finds semantic similarities, contradictions, and thematic bridges between chunks.
              You can detect connections later for individual chunks or all at once.
            </p>
            {process.env.NEXT_PUBLIC_PROCESSING_MODE === 'local' && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <Info className="h-3 w-3" />
                LOCAL mode: Connection detection adds 10-30 seconds per document
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(edited, coverImage)}>
            Process Document
          </Button>
        </div>
      </div>
    </div>
  )
}
