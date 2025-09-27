/**
 * Tests for Edge Function helper functions.
 * Note: These tests focus on pure functions and business logic,
 * not external API calls (Gemini, Supabase).
 */

// Extract the helper function for testing
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Extract validation logic for testing
function validateRequest(body: any): { documentId?: string; storagePath?: string; error?: string } {
  const { documentId, storagePath } = body || {}
  
  if (!documentId || !storagePath) {
    return { error: 'Missing documentId or storagePath' }
  }
  
  return { documentId, storagePath }
}

// Extract chunk processing logic for testing
interface ChunkData {
  content: string
  themes: string[]
  importance_score: number
  summary: string
}

function processChunksForDatabase(chunks: ChunkData[], documentId: string, embeddings: number[][]): any[] {
  return chunks.map((chunk: ChunkData, index: number) => ({
    document_id: documentId,
    content: chunk.content,
    chunk_index: index,
    embedding: embeddings[index],
    themes: chunk.themes,
    importance_score: chunk.importance_score,
    summary: chunk.summary
  }))
}

describe('Edge Function Helper Functions', () => {
  describe('arrayBufferToBase64', () => {
    test('should convert empty ArrayBuffer correctly', () => {
      const buffer = new ArrayBuffer(0)
      const result = arrayBufferToBase64(buffer)
      
      expect(result).toBe('')
    })

    test('should convert single byte correctly', () => {
      const buffer = new ArrayBuffer(1)
      const view = new Uint8Array(buffer)
      view[0] = 65 // ASCII 'A'
      
      const result = arrayBufferToBase64(buffer)
      
      expect(result).toBe('QQ==') // Base64 for 'A'
    })

    test('should convert multiple bytes correctly', () => {
      const buffer = new ArrayBuffer(3)
      const view = new Uint8Array(buffer)
      view[0] = 72  // H
      view[1] = 105 // i
      view[2] = 33  // !
      
      const result = arrayBufferToBase64(buffer)
      
      expect(result).toBe('SGkh') // Base64 for 'Hi!'
    })

    test('should handle larger buffers', () => {
      const testString = 'Hello, World! This is a test.'
      const buffer = new TextEncoder().encode(testString).buffer
      
      const result = arrayBufferToBase64(buffer)
      
      // Verify by decoding back
      const decoded = atob(result)
      expect(decoded).toBe(testString)
    })

    test('should handle binary data', () => {
      const buffer = new ArrayBuffer(4)
      const view = new Uint8Array(buffer)
      view[0] = 0x00
      view[1] = 0xFF
      view[2] = 0x80
      view[3] = 0x7F
      
      const result = arrayBufferToBase64(buffer)
      
      // Should produce valid base64
      expect(() => atob(result)).not.toThrow()
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('validateRequest', () => {
    test('should validate correct request', () => {
      const body = {
        documentId: 'doc-123',
        storagePath: 'user-456/doc-123'
      }
      
      const result = validateRequest(body)
      
      expect(result.error).toBeUndefined()
      expect(result.documentId).toBe('doc-123')
      expect(result.storagePath).toBe('user-456/doc-123')
    })

    test('should reject missing documentId', () => {
      const body = {
        storagePath: 'user-456/doc-123'
      }
      
      const result = validateRequest(body)
      
      expect(result.error).toBe('Missing documentId or storagePath')
    })

    test('should reject missing storagePath', () => {
      const body = {
        documentId: 'doc-123'
      }
      
      const result = validateRequest(body)
      
      expect(result.error).toBe('Missing documentId or storagePath')
    })

    test('should reject empty documentId', () => {
      const body = {
        documentId: '',
        storagePath: 'user-456/doc-123'
      }
      
      const result = validateRequest(body)
      
      expect(result.error).toBe('Missing documentId or storagePath')
    })

    test('should reject null values', () => {
      const body = {
        documentId: null,
        storagePath: 'user-456/doc-123'
      }
      
      const result = validateRequest(body)
      
      expect(result.error).toBe('Missing documentId or storagePath')
    })

    test('should reject undefined body', () => {
      const result = validateRequest(undefined)
      
      expect(result.error).toBe('Missing documentId or storagePath')
    })

    test('should reject empty body', () => {
      const result = validateRequest({})
      
      expect(result.error).toBe('Missing documentId or storagePath')
    })
  })

  describe('processChunksForDatabase', () => {
    test('should process single chunk correctly', () => {
      const chunks: ChunkData[] = [
        {
          content: 'This is a test chunk.',
          themes: ['testing', 'example'],
          importance_score: 0.8,
          summary: 'A sample chunk for testing.'
        }
      ]

      const embeddings = [[0.1, 0.2, 0.3]]
      const documentId = 'doc-123'

      const result = processChunksForDatabase(chunks, documentId, embeddings)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        document_id: 'doc-123',
        content: 'This is a test chunk.',
        chunk_index: 0,
        embedding: [0.1, 0.2, 0.3],
        themes: ['testing', 'example'],
        importance_score: 0.8,
        summary: 'A sample chunk for testing.'
      })
    })

    test('should process multiple chunks with correct indexes', () => {
      const chunks: ChunkData[] = [
        {
          content: 'First chunk',
          themes: ['intro'],
          importance_score: 0.9,
          summary: 'Introduction'
        },
        {
          content: 'Second chunk',
          themes: ['body'],
          importance_score: 0.7,
          summary: 'Main content'
        },
        {
          content: 'Third chunk',
          themes: ['conclusion'],
          importance_score: 0.8,
          summary: 'Conclusion'
        }
      ]

      const embeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6]
      ]
      const documentId = 'doc-456'

      const result = processChunksForDatabase(chunks, documentId, embeddings)

      expect(result).toHaveLength(3)
      
      expect(result[0].chunk_index).toBe(0)
      expect(result[0].content).toBe('First chunk')
      expect(result[0].embedding).toEqual([0.1, 0.2])
      
      expect(result[1].chunk_index).toBe(1)
      expect(result[1].content).toBe('Second chunk')
      expect(result[1].embedding).toEqual([0.3, 0.4])
      
      expect(result[2].chunk_index).toBe(2)
      expect(result[2].content).toBe('Third chunk')
      expect(result[2].embedding).toEqual([0.5, 0.6])
    })

    test('should handle empty themes array', () => {
      const chunks: ChunkData[] = [
        {
          content: 'Chunk with no themes',
          themes: [],
          importance_score: 0.5,
          summary: 'No themes here'
        }
      ]

      const embeddings = [[0.1]]
      const documentId = 'doc-789'

      const result = processChunksForDatabase(chunks, documentId, embeddings)

      expect(result[0].themes).toEqual([])
    })

    test('should preserve importance scores', () => {
      const chunks: ChunkData[] = [
        {
          content: 'Low importance',
          themes: ['minor'],
          importance_score: 0.1,
          summary: 'Not important'
        },
        {
          content: 'High importance',
          themes: ['major'],
          importance_score: 1.0,
          summary: 'Very important'
        }
      ]

      const embeddings = [[0.1], [0.9]]
      const documentId = 'doc-importance'

      const result = processChunksForDatabase(chunks, documentId, embeddings)

      expect(result[0].importance_score).toBe(0.1)
      expect(result[1].importance_score).toBe(1.0)
    })

    test('should handle empty chunks array', () => {
      const chunks: ChunkData[] = []
      const embeddings: number[][] = []
      const documentId = 'doc-empty'

      const result = processChunksForDatabase(chunks, documentId, embeddings)

      expect(result).toEqual([])
    })

    test('should handle long content and themes', () => {
      const longContent = 'This is a very long chunk content that might appear in real documents. '.repeat(10)
      const manyThemes = ['theme1', 'theme2', 'theme3', 'theme4', 'theme5', 'theme6']
      
      const chunks: ChunkData[] = [
        {
          content: longContent,
          themes: manyThemes,
          importance_score: 0.75,
          summary: 'A long chunk with many themes'
        }
      ]

      const embeddings = [Array(768).fill(0.1)] // Typical embedding size
      const documentId = 'doc-long'

      const result = processChunksForDatabase(chunks, documentId, embeddings)

      expect(result[0].content).toBe(longContent)
      expect(result[0].themes).toEqual(manyThemes)
      expect(result[0].embedding).toHaveLength(768)
    })
  })
})