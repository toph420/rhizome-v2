'use server'

export interface BridgeTestInput {
  sourceText: string
  sourceSummary: string
  sourceDomain: string
  candidateText: string
  candidateSummary: string
  candidateDomain: string
  promptVersion: string
  minStrength: number
}

export interface BridgeTestResult {
  connected: boolean
  strength: number
  bridgeType?: string
  explanation?: string
  bridgeConcepts?: string[]
  processingTime: number
}

/**
 * Test thematic bridge detection with a specific prompt version.
 * For UI experimentation only - not used in production pipeline.
 */
export async function testBridgePrompt(
  input: BridgeTestInput
): Promise<BridgeTestResult> {
  const startTime = Date.now()

  // Validate inputs
  if (!input.sourceText || !input.candidateText) {
    throw new Error('Source and candidate text required')
  }

  try {
    // Build prompt based on version
    const prompt = buildBridgePrompt(input, input.promptVersion)

    // Call Ollama API directly
    const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
    const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:32b'

    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
        options: { temperature: 0.1 }
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`)
    }

    const data = await response.json()
    const result = JSON.parse(data.message.content)
    const processingTime = Date.now() - startTime

    // Parse bridge result
    if (!result.bridges || result.bridges.length === 0) {
      return {
        connected: false,
        strength: 0,
        processingTime
      }
    }

    const bridge = result.bridges[0]
    return {
      connected: true,
      strength: bridge.strength,
      bridgeType: bridge.bridgeType,
      explanation: bridge.explanation,
      bridgeConcepts: bridge.bridgeConcepts,
      processingTime
    }
  } catch (error) {
    throw new Error(`Bridge test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Helper function to build prompts (inlined to avoid worker imports)
function buildBridgePrompt(input: BridgeTestInput, version: string): string {
  if (version === 'v2-improved') {
    return buildV2ImprovedPrompt(input)
  }
  return buildV1BaselinePrompt(input)
}

function buildV1BaselinePrompt(input: BridgeTestInput): string {
  return `Analyze thematic bridges between these chunk pairs. Return JSON array with:
{
  "bridges": [
    {
      "targetIndex": 0,
      "bridgeType": "conceptual" | "causal" | "temporal" | "argumentative" | "metaphorical" | "contextual",
      "strength": 0.0-1.0,
      "explanation": "Brief explanation of the bridge",
      "bridgeConcepts": ["concept1", "concept2"]
    }
  ]
}

SOURCE CHUNK (${input.sourceDomain}):
Title/Summary: ${input.sourceSummary}
Content preview: ${input.sourceText.substring(0, 200)}

CANDIDATES:
[0] (${input.candidateDomain})
Title/Summary: ${input.candidateSummary}
Content preview: ${input.candidateText.substring(0, 200)}

Only include bridges with strength > ${input.minStrength}. Be selective.`
}

function buildV2ImprovedPrompt(input: BridgeTestInput): string {
  return `Identify thematic bridges between ideas from different domains.

A thematic bridge exists when:
1. Chunks from DIFFERENT domains address the same underlying concept
2. The connection reveals a non-obvious pattern or insight
3. Reading one chunk would genuinely enrich understanding of the other

SOURCE (${input.sourceDomain}):
${input.sourceSummary}
${input.sourceText}

CANDIDATES:
[0] ${input.candidateDomain}
${input.candidateSummary}
${input.candidateText}

STRENGTH CALIBRATION:
- 0.9-1.0: Profound insight, unexpected domains, concept appears central to both
- 0.7-0.8: Clear resonance, concept important to both, enriches understanding
- 0.5-0.6: Interesting connection, concept somewhat peripheral
- <0.5: Skip entirely

ONLY include bridges where:
- strength ≥ ${input.minStrength}
- domains are actually different
- connection is non-obvious to a reader

OUTPUT (JSON only, no markdown):
{
  "bridges": [
    {
      "targetIndex": 0,
      "bridgeType": "conceptual",
      "strength": 0.75,
      "explanation": "Both explore power through surveillance - panopticon design vs social media algorithms",
      "bridgeConcepts": ["surveillance", "distributed control"]
    }
  ]
}

Return empty array if no bridges meet criteria. No explanatory text.`
}
