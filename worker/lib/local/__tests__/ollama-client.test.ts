import { OllamaClient, testOllamaConnection, OOMError } from '../ollama-client'

describe('OllamaClient', () => {
  // Increase timeout for model loading
  jest.setTimeout(60000)

  it('should connect to Ollama server', async () => {
    const connected = await testOllamaConnection()
    expect(connected).toBe(true)
  })

  it('should send chat message', async () => {
    const client = new OllamaClient()
    const response = await client.chat('What is 2+2? Reply with only the number.')
    expect(response).toContain('4')
  })

  it('should generate structured JSON', async () => {
    const client = new OllamaClient()
    const result = await client.generateStructured(
      'Return JSON: {"success": true, "value": 42}'
    )
    expect(result.success).toBe(true)
    expect(result.value).toBe(42)
  })

  it('should get configuration', () => {
    const client = new OllamaClient()
    const config = client.getConfig()
    expect(config.host).toBeDefined()
    expect(config.model).toBeDefined()
    expect(config.timeout).toBeGreaterThan(0)
  })

  it('should reject streaming for simple chat', async () => {
    const client = new OllamaClient()
    await expect(
      client.chat('Test', { stream: true })
    ).rejects.toThrow('Use chat() with stream: false')
  })
})
