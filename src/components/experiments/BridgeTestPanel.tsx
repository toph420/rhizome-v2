'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/rhizome/textarea'
import { Input } from '@/components/rhizome/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/rhizome/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { testBridgePrompt, type BridgeTestResult } from '@/app/actions/experiments/test-bridge-prompt'
import { Loader2 } from 'lucide-react'

const SAMPLE_PAIRS = {
  philosophyFiction: {
    source: {
      text: `Sartre's concept of "bad faith" emerges when individuals deny their freedom and responsibility by adopting fixed social roles. The waiter who over-performs his role demonstrates bad faith by pretending his identity is determined rather than chosen.`,
      summary: "Sartre's bad faith through fixed social roles",
      domain: "philosophy"
    },
    candidate: {
      text: `The protagonist realized her entire adult life had been a performance. She'd adopted the role of dutiful employee so completely that she'd forgotten it was a choice. Now, facing the consequences of her company's actions, she couldn't hide behind "I was just following orders."`,
      summary: "Character discovers complicity through role-playing",
      domain: "fiction"
    }
  }
}

export function BridgeTestPanel() {
  // Source chunk state
  const [sourceText, setSourceText] = useState(SAMPLE_PAIRS.philosophyFiction.source.text)
  const [sourceSummary, setSourceSummary] = useState(SAMPLE_PAIRS.philosophyFiction.source.summary)
  const [sourceDomain, setSourceDomain] = useState(SAMPLE_PAIRS.philosophyFiction.source.domain)

  // Candidate chunk state
  const [candidateText, setCandidateText] = useState(SAMPLE_PAIRS.philosophyFiction.candidate.text)
  const [candidateSummary, setCandidateSummary] = useState(SAMPLE_PAIRS.philosophyFiction.candidate.summary)
  const [candidateDomain, setCandidateDomain] = useState(SAMPLE_PAIRS.philosophyFiction.candidate.domain)

  // Test state
  const [promptVersion, setPromptVersion] = useState('v1-baseline')
  const [minStrength, setMinStrength] = useState(0.6)
  const [result, setResult] = useState<BridgeTestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTest = async () => {
    setLoading(true)
    setError(null)

    try {
      const testResult = await testBridgePrompt({
        sourceText,
        sourceSummary,
        sourceDomain,
        candidateText,
        candidateSummary,
        candidateDomain,
        promptVersion,
        minStrength
      })
      setResult(testResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Source Chunk */}
      <Card>
        <CardHeader>
          <CardTitle>Source Chunk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Summary/Title"
            value={sourceSummary}
            onChange={(e) => setSourceSummary(e.target.value)}
          />

          <Select value={sourceDomain} onValueChange={setSourceDomain}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="philosophy">Philosophy</SelectItem>
              <SelectItem value="fiction">Fiction</SelectItem>
              <SelectItem value="technology">Technology</SelectItem>
            </SelectContent>
          </Select>

          <Textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            className="min-h-[100px] font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Candidate Chunk */}
      <Card>
        <CardHeader>
          <CardTitle>Candidate Chunk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Summary/Title"
            value={candidateSummary}
            onChange={(e) => setCandidateSummary(e.target.value)}
          />

          <Select value={candidateDomain} onValueChange={setCandidateDomain}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="philosophy">Philosophy</SelectItem>
              <SelectItem value="fiction">Fiction</SelectItem>
              <SelectItem value="technology">Technology</SelectItem>
            </SelectContent>
          </Select>

          <Textarea
            value={candidateText}
            onChange={(e) => setCandidateText(e.target.value)}
            className="min-h-[100px] font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Test Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Prompt Version</label>
              <Select value={promptVersion} onValueChange={setPromptVersion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v1-baseline">v1: Baseline</SelectItem>
                  <SelectItem value="v2-improved">v2: Improved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Min Strength</label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={minStrength}
                onChange={(e) => setMinStrength(parseFloat(e.target.value))}
              />
            </div>
          </div>

          <Button
            onClick={runTest}
            disabled={loading || !sourceText || !candidateText}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Bridge Detection'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card className={result.connected ? "border-green-500" : "border-gray-500"}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {result.connected ? 'Bridge Detected' : 'No Bridge'}
              <Badge variant="secondary">{result.processingTime}ms</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.connected ? (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Strength</h4>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-secondary rounded-full h-2">
                      <div
                        className="bg-green-600 rounded-full h-2"
                        style={{ width: `${result.strength * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono">{result.strength?.toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Bridge Type</h4>
                  <Badge>{result.bridgeType}</Badge>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Explanation</h4>
                  <p className="text-sm">{result.explanation}</p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Bridge Concepts</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.bridgeConcepts?.map((concept, i) => (
                      <Badge key={i} variant="outline">{concept}</Badge>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No thematic bridge found between these chunks with strength ≥ {minStrength}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
