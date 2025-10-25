'use client'

import { useState } from 'react'
import { Button } from '@/components/rhizome/button'
import { Input } from '@/components/rhizome/input'
import { Label } from '@/components/rhizome/label'
import { Badge } from '@/components/rhizome/badge'
import { Slider } from '@/components/rhizome/slider'
import { X, Plus, Save, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChunkMetadata } from '@/stores/chunk-store'

interface ChunkMetadataEditorProps {
  metadata: ChunkMetadata
  onSave: (metadata: Partial<ChunkMetadata>) => Promise<void>
  onCancel: () => void
  isSaving?: boolean
}

/**
 * Inline metadata editor for chunk detailed view.
 * Allows editing themes, importance score, and structured metadata.
 */
export function ChunkMetadataEditor({
  metadata,
  onSave,
  onCancel,
  isSaving = false
}: ChunkMetadataEditorProps) {
  const [themes, setThemes] = useState<string[]>(metadata.themes || [])
  const [newTheme, setNewTheme] = useState('')
  const [importanceScore, setImportanceScore] = useState(
    metadata.importance_score !== undefined ? metadata.importance_score : 0.5
  )
  const [primaryDomain, setPrimaryDomain] = useState(
    metadata.domain_metadata?.primaryDomain || ''
  )
  const [primaryEmotion, setPrimaryEmotion] = useState(
    metadata.emotional_metadata?.primaryEmotion || ''
  )

  const handleAddTheme = () => {
    if (newTheme.trim() && !themes.includes(newTheme.trim())) {
      setThemes([...themes, newTheme.trim()])
      setNewTheme('')
    }
  }

  const handleRemoveTheme = (theme: string) => {
    setThemes(themes.filter(t => t !== theme))
  }

  const handleSave = async () => {
    const updates: Partial<ChunkMetadata> = {
      themes,
      importance_score: importanceScore,
    }

    // Only include domain metadata if primaryDomain is set
    if (primaryDomain.trim()) {
      updates.domain_metadata = {
        primaryDomain: primaryDomain.trim(),
        subDomains: metadata.domain_metadata?.subDomains || [],
        confidence: metadata.domain_metadata?.confidence || 'medium'
      }
    }

    // Only include emotional metadata if primaryEmotion is set
    if (primaryEmotion.trim()) {
      updates.emotional_metadata = {
        primaryEmotion: primaryEmotion.trim(),
        polarity: metadata.emotional_metadata?.polarity || 0,
        intensity: metadata.emotional_metadata?.intensity || 0.5
      }
    }

    await onSave(updates)
  }

  return (
    <div className="space-y-4 p-4 border-2 border-border rounded-base bg-background">
      {/* Themes */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Themes</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {themes.map((theme, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              {theme}
              <button
                onClick={() => handleRemoveTheme(theme)}
                className="hover:bg-background rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Add theme..."
            value={newTheme}
            onChange={(e) => setNewTheme(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddTheme()
              }
            }}
            className="flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddTheme}
            disabled={!newTheme.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Importance Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Importance</Label>
          <span className="text-sm text-muted-foreground">
            {(importanceScore * 100).toFixed(0)}%
          </span>
        </div>
        <Slider
          value={[importanceScore]}
          onValueChange={(values) => setImportanceScore(values[0])}
          min={0}
          max={1}
          step={0.05}
          className="w-full"
        />
      </div>

      {/* Primary Domain */}
      <div className="space-y-2">
        <Label htmlFor="primary-domain" className="text-sm font-medium">
          Primary Domain
        </Label>
        <Input
          id="primary-domain"
          type="text"
          placeholder="e.g., Computer Science, Philosophy..."
          value={primaryDomain}
          onChange={(e) => setPrimaryDomain(e.target.value)}
        />
      </div>

      {/* Primary Emotion */}
      <div className="space-y-2">
        <Label htmlFor="primary-emotion" className="text-sm font-medium">
          Primary Emotion
        </Label>
        <Input
          id="primary-emotion"
          type="text"
          placeholder="e.g., Optimistic, Critical, Neutral..."
          value={primaryEmotion}
          onChange={(e) => setPrimaryEmotion(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
