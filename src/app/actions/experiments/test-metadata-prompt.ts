'use server'

import { spawn } from 'child_process'
import path from 'path'

export interface MetadataTestInput {
  text: string
  promptVersion: string
}

export interface MetadataTestResult {
  themes: string[]
  concepts: { text: string; importance: number }[]
  importance: number
  summary: string
  emotional: {
    polarity: number
    primaryEmotion: string
    intensity: number
  }
  domain: string
  processingTime: number
}

/**
 * Test metadata extraction with a specific prompt version.
 * For UI experimentation only - not used in production pipeline.
 */
export async function testMetadataPrompt(
  input: MetadataTestInput
): Promise<MetadataTestResult> {
  const startTime = Date.now()

  // Validate inputs
  if (!input.text || input.text.trim().length === 0) {
    throw new Error('Text cannot be empty')
  }

  if (!input.promptVersion) {
    throw new Error('Prompt version required')
  }

  // Script path
  const scriptPath = path.join(process.cwd(), 'worker/scripts/extract_metadata_pydantic.py')

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [
      scriptPath,
      `--prompt-version=${input.promptVersion}`
    ], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        OLLAMA_BASE_URL: `${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/v1`  // OllamaProvider needs /v1 path
      }
    })

    let stdout = ''
    let stderr = ''

    // Send test chunk via stdin
    const testChunk = {
      id: 'test',
      content: input.text
    }

    python.stdin.write(JSON.stringify(testChunk) + '\n')
    python.stdin.end()

    // Collect output
    python.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    python.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // Handle completion
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${stderr}`))
        return
      }

      try {
        // Parse result (one JSON line)
        const lines = stdout.trim().split('\n')
        const lastLine = lines[lines.length - 1]
        const result = JSON.parse(lastLine)

        const processingTime = Date.now() - startTime

        resolve({
          ...result.metadata,
          processingTime
        })
      } catch (error) {
        reject(new Error(`Failed to parse result: ${error}`))
      }
    })

    // Timeout after 90 seconds (v2 prompt is verbose and needs more time)
    setTimeout(() => {
      python.kill()
      reject(new Error('Test timeout after 90 seconds'))
    }, 90000)
  })
}
