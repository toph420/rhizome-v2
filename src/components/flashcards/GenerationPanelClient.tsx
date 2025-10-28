'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Label } from '@/components/rhizome/label'
import { Slider } from '@/components/rhizome/slider'
import { Textarea } from '@/components/rhizome/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/rhizome/select'
import { generateFlashcards } from '@/app/actions/flashcards'
import { useFlashcardStore } from '@/stores/flashcard-store'
import { useReaderStore } from '@/stores/reader-store'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'

interface GenerationPanelClientProps {
  documentId: string
}

export function GenerationPanelClient({ documentId }: GenerationPanelClientProps) {
  const { prompts, decks } = useFlashcardStore()
  const { visibleChunks } = useReaderStore()
  const { registerJob } = useBackgroundJobsStore()
  const [sourceType, setSourceType] = useState<'document' | 'chunks'>('document')
  const [promptId, setPromptId] = useState('')
  const [count, setCount] = useState(5)
  const [deckId, setDeckId] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [generating, setGenerating] = useState(false)

  // Auto-select defaults
  useEffect(() => {
    if (prompts && !promptId) {
      const defaultPrompt = prompts.find(p => p.is_default)
      if (defaultPrompt) setPromptId(defaultPrompt.id)
    }
  }, [prompts, promptId])

  useEffect(() => {
    if (decks && !deckId) {
      const inbox = decks.find(d => d.name === 'Inbox' && d.is_system)
      if (inbox) setDeckId(inbox.id)
    }
  }, [decks, deckId])

  const handleGenerate = async () => {
    if (!promptId || !deckId) {
      toast.error('Please select prompt template and deck')
      return
    }

    // Get source IDs based on type
    let sourceIds: string[]
    if (sourceType === 'chunks') {
      // Use visible chunk IDs
      sourceIds = visibleChunks.map(c => c.id)
      if (sourceIds.length === 0) {
        toast.error('No visible chunks to generate from')
        return
      }
    } else {
      // Use document ID
      sourceIds = [documentId]
    }

    setGenerating(true)
    try {
      const result = await generateFlashcards({
        sourceType,
        sourceIds,
        promptTemplateId: promptId,
        cardCount: count,
        deckId,
        customInstructions: customInstructions || undefined
      })

      if (result.success && result.jobId) {
        toast.success(`Generating ${count} cards...`)

        // Register job in store so ProcessingDock and JobsTab can track it
        registerJob(result.jobId, 'generate_flashcards', {
          documentId,
          title: `${count} flashcards`,
        })
      } else {
        toast.error(result.error || 'Generation failed')
      }
    } catch (error) {
      toast.error('Failed to start generation')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Generate Flashcards</h3>
        <p className="text-sm text-muted-foreground">
          Create AI-powered flashcards from this document
        </p>
      </div>

      {/* Source type */}
      <div>
        <Label>Source</Label>
        <Select value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="document">Full Document</SelectItem>
            <SelectItem value="chunks">Visible Chunks ({visibleChunks.length})</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          {sourceType === 'document'
            ? 'Generate from entire document'
            : `Generate from ${visibleChunks.length} chunks currently visible in reader`}
        </p>
      </div>

      {/* Prompt template */}
      <div>
        <Label>Prompt Template</Label>
        <Select value={promptId} onValueChange={setPromptId}>
          <SelectTrigger>
            <SelectValue placeholder="Select prompt..." />
          </SelectTrigger>
          <SelectContent>
            {prompts?.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.is_default && '(default)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {prompts?.find(p => p.id === promptId)?.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {prompts.find(p => p.id === promptId)?.description}
          </p>
        )}
      </div>

      {/* Card count */}
      <div>
        <Label>Card Count: {count}</Label>
        <Slider
          value={[count]}
          onValueChange={([v]) => setCount(v)}
          min={1}
          max={20}
          step={1}
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          More cards = better coverage but higher cost
        </p>
      </div>

      {/* Deck */}
      <div>
        <Label>Add to Deck</Label>
        <Select value={deckId} onValueChange={setDeckId}>
          <SelectTrigger>
            <SelectValue placeholder="Select deck..." />
          </SelectTrigger>
          <SelectContent>
            {decks?.map(d => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} {d.is_system && '(system)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Custom instructions */}
      <div>
        <Label>Custom Instructions (optional)</Label>
        <Textarea
          value={customInstructions}
          onChange={e => setCustomInstructions(e.target.value)}
          placeholder="Focus on philosophical concepts..."
          rows={3}
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Add specific instructions for the AI (e.g., "Focus on X", "Avoid Y")
        </p>
      </div>

      {/* Cost estimate */}
      <Card className="p-3">
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estimated cost:</span>
            <span className="font-mono font-semibold">~$0.{Math.ceil(count / 5).toString().padStart(2, '0')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Processing time:</span>
            <span className="font-semibold">~{Math.ceil(count / 2)}-{Math.ceil(count)} min</span>
          </div>
        </div>
      </Card>

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={generating || !promptId || !deckId}
        className="w-full"
      >
        {generating ? 'Generating...' : `Generate ${count} Cards`}
      </Button>
    </Card>
  )
}
