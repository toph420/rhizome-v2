'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/rhizome/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/rhizome/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { testMetadataPrompt, type MetadataTestResult } from '@/app/actions/experiments/test-metadata-prompt'
import { Loader2 } from 'lucide-react'

const SAMPLE_CHUNKS = {
  philosophy: `Foucault argues that disciplinary power operates through surveillance and normalization. The panopticon represents the ultimate expression of this power structure, where the mere possibility of observation creates self-regulation among subjects. This shift from sovereign power to disciplinary power marks a fundamental transformation in how societies organize control.`,

  fiction: `The protagonist's hands trembled as she held the letter. All these years, she'd believed her sacrifice had freed her children from the system she'd fought against. But now, staring at her daughter's name on the corporate roster, she realized her rebellion had only strengthened the very structures she'd hoped to dismantle. The irony was crushing—her greatest act of defiance had become their most effective tool of control.`,
}

export function MetadataTestPanel() {
  const [inputText, setInputText] = useState(SAMPLE_CHUNKS.philosophy)
  const [promptA, setPromptA] = useState('v1-baseline')
  const [promptB, setPromptB] = useState('v2-philosophy')
  const [resultA, setResultA] = useState<MetadataTestResult | null>(null)
  const [resultB, setResultB] = useState<MetadataTestResult | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTest = async (
    promptId: string,
    setter: (result: MetadataTestResult) => void,
    setLoading: (loading: boolean) => void
  ) => {
    setLoading(true)
    setError(null)

    try {
      const result = await testMetadataPrompt({
        text: inputText,
        promptVersion: promptId
      })
      setter(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  const runBoth = async () => {
    await Promise.all([
      runTest(promptA, setResultA, setLoadingA),
      runTest(promptB, setResultB, setLoadingB)
    ])
  }

  const exportComparison = () => {
    if (!resultA || !resultB) return

    const report = `# Metadata Extraction Comparison

**Date**: ${new Date().toISOString()}
**Prompt A**: ${promptA}
**Prompt B**: ${promptB}

## Input Text

\`\`\`
${inputText.substring(0, 200)}...
\`\`\`

## Results

### ${promptA}

- **Themes**: ${resultA.themes.join(', ')}
- **Concepts**: ${resultA.concepts.map(c => `${c.text} (${c.importance})`).join(', ')}
- **Importance**: ${resultA.importance}
- **Polarity**: ${resultA.emotional.polarity}
- **Domain**: ${resultA.domain}
- **Processing Time**: ${resultA.processingTime}ms

### ${promptB}

- **Themes**: ${resultB.themes.join(', ')}
- **Concepts**: ${resultB.concepts.map(c => `${c.text} (${c.importance})`).join(', ')}
- **Importance**: ${resultB.importance}
- **Polarity**: ${resultB.emotional.polarity}
- **Domain**: ${resultB.domain}
- **Processing Time**: ${resultB.processingTime}ms

## Key Differences

- **Importance**: ${(resultB.importance - resultA.importance).toFixed(2)}
- **Polarity**: ${(resultB.emotional.polarity - resultA.emotional.polarity).toFixed(2)}
- **Concept Count**: ${resultB.concepts.length - resultA.concepts.length}
`

    // Download as markdown file
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comparison-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Test Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste a chunk of text to analyze..."
            className="min-h-[150px] font-mono text-sm"
          />

          <div className="flex gap-2">
            <span className="text-sm text-muted-foreground">Load Sample:</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInputText(SAMPLE_CHUNKS.philosophy)}
            >
              Philosophy
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInputText(SAMPLE_CHUNKS.fiction)}
            >
              Fiction
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Selection */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prompt A</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={promptA} onValueChange={setPromptA}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="v1-baseline">v1: Baseline</SelectItem>
                <SelectItem value="v2-philosophy">v2: Philosophy/Fiction</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => runTest(promptA, setResultA, setLoadingA)}
              disabled={loadingA || !inputText}
              className="w-full"
            >
              {loadingA ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Run Test'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prompt B</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={promptB} onValueChange={setPromptB}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="v1-baseline">v1: Baseline</SelectItem>
                <SelectItem value="v2-philosophy">v2: Philosophy/Fiction</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => runTest(promptB, setResultB, setLoadingB)}
              disabled={loadingB || !inputText}
              className="w-full"
            >
              {loadingB ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Run Test'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Run Both Button */}
      <div className="flex justify-center gap-4">
        <Button
          onClick={runBoth}
          disabled={loadingA || loadingB || !inputText}
          size="lg"
        >
          Run Both Tests
        </Button>
        <Button
          onClick={exportComparison}
          disabled={!resultA || !resultB}
          variant="outline"
          size="lg"
        >
          Export Comparison
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {(resultA || resultB) && (
        <div className="grid grid-cols-2 gap-4">
          {resultA && <MetadataResultCard result={resultA} promptId={promptA} />}
          {resultB && <MetadataResultCard result={resultB} promptId={promptB} />}
        </div>
      )}
    </div>
  )
}

function MetadataResultCard({
  result,
  promptId
}: {
  result: MetadataTestResult
  promptId: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          {promptId}
          <Badge variant="secondary">{result.processingTime}ms</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Themes */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Themes ({result.themes.length})</h4>
          <div className="flex flex-wrap gap-2">
            {result.themes.map((theme, i) => (
              <Badge key={i} variant="outline">{theme}</Badge>
            ))}
          </div>
        </div>

        {/* Concepts */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Concepts ({result.concepts.length})</h4>
          <div className="space-y-1">
            {result.concepts.map((concept, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{concept.text}</span>
                <Badge variant={concept.importance >= 0.7 ? "default" : "secondary"}>
                  {concept.importance.toFixed(2)}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Importance Score */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Importance Score</h4>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-secondary rounded-full h-2">
              <div
                className="bg-primary rounded-full h-2 transition-all"
                style={{ width: `${result.importance * 100}%` }}
              />
            </div>
            <span className="text-sm font-mono">{result.importance.toFixed(2)}</span>
          </div>
        </div>

        {/* Emotional Tone */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Emotional Tone</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Polarity:</span>
              <Badge variant={Math.abs(result.emotional.polarity) > 0.3 ? "default" : "secondary"}>
                {result.emotional.polarity > 0 ? '+' : ''}{result.emotional.polarity.toFixed(2)}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>Emotion:</span>
              <Badge variant="outline">{result.emotional.primaryEmotion}</Badge>
            </div>
          </div>
        </div>

        {/* Domain */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Domain</h4>
          <Badge>{result.domain}</Badge>
        </div>

        {/* Summary */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Summary</h4>
          <p className="text-sm text-muted-foreground italic">{result.summary}</p>
        </div>
      </CardContent>
    </Card>
  )
}
