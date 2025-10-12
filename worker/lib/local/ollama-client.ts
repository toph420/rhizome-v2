// worker/lib/local/ollama-client.ts

import { Ollama } from 'ollama'

interface OllamaOptions {
  temperature?: number
  stream?: boolean
  timeout?: number
}

interface OllamaConfig {
  host: string
  model: string
  timeout: number
}

export class OllamaClient {
  private client: Ollama
  private config: OllamaConfig

  constructor() {
    // Read from environment with defaults
    this.config = {
      host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'qwen2.5:32b',
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '600000', 10) // 10 minutes default
    }

    this.client = new Ollama({ host: this.config.host })
  }

  /**
   * Send a chat message to Ollama and get response
   *
   * @param prompt - The prompt to send
   * @param options - Temperature, streaming, etc.
   * @returns The model's text response
   */
  async chat(prompt: string, options: OllamaOptions = {}): Promise<string> {
    const { temperature = 0.3, stream = false } = options

    try {
      const response = await this.client.chat({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        stream,
        options: {
          temperature,
          num_predict: -1 // No limit on output length
        }
      })

      // CRITICAL: stream must be false for simple responses
      // Streaming breaks JSON parsing in structured outputs
      if (stream) {
        throw new Error('Use chat() with stream: false, or use chatStream() for streaming')
      }

      return response.message.content
    } catch (error: any) {
      // Enhanced error handling
      if (error.message?.includes('out of memory')) {
        throw new OOMError('Qwen model out of memory - try smaller model or reduce context')
      }
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama server not running - start with: ollama serve')
      }
      throw error
    }
  }

  /**
   * Generate structured JSON output from prompt
   * Uses format enforcement for reliable JSON responses
   *
   * @param prompt - Prompt requesting JSON response
   * @param schema - Optional JSON schema for validation
   * @returns Parsed JSON object
   */
  async generateStructured(prompt: string, schema?: object): Promise<any> {
    // CRITICAL: Must use stream: false for structured outputs
    // Streaming breaks JSON parsing
    const response = await this.client.chat({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: 'json', // Ollama will enforce JSON format
      options: {
        temperature: 0.1 // Low temperature for consistent structure
      }
    })

    try {
      const parsed = JSON.parse(response.message.content)

      // TODO: Add schema validation here if schema provided
      // Could use Zod or Ajv for validation

      return parsed
    } catch (error) {
      throw new Error(`Failed to parse JSON from Ollama response: ${error}`)
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): OllamaConfig {
    return { ...this.config }
  }
}

/**
 * Custom error for out-of-memory conditions
 * Allows graceful degradation to smaller models
 */
export class OOMError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OOMError'
  }
}

/**
 * Test connection to Ollama server
 * Useful for health checks and startup validation
 */
export async function testOllamaConnection(): Promise<boolean> {
  try {
    const client = new OllamaClient()
    const response = await client.chat('Respond with: OK', { timeout: 5000 })
    return response.toLowerCase().includes('ok')
  } catch (error) {
    console.error('[Ollama] Connection test failed:', error)
    return false
  }
}
