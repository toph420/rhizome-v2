'use client'

import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, X } from 'lucide-react'
import Image from 'next/image'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

interface DocumentPreviewProps {
  metadata: DetectedMetadata
  onConfirm: (edited: DetectedMetadata, coverImage: File | null) => void
  onCancel: () => void
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  fiction: 'Fiction',
  nonfiction_book: 'Nonfiction Book',
  academic_paper: 'Academic Paper',
  technical_manual: 'Technical Manual',
  article: 'Article',
  essay: 'Essay',
}

export function DocumentPreview({
  metadata,
  onConfirm,
  onCancel
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

      {/* Actions */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(edited, coverImage)}>
          Process Document
        </Button>
      </div>
    </div>
  )
}
