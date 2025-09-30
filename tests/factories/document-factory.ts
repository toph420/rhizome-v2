// Type definition for Document (will be imported from actual types when available)
type Document = {
  id: string
  user_id: string
  title: string
  content: string | null
  source_url: string | null
  source_type: 'pdf' | 'youtube' | 'web' | 'markdown' | 'text' | 'paste'
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'
  markdown_available: boolean
  embeddings_available: boolean
  storage_path: string | null
  error_message: string | null
  created_at: Date
  updated_at: Date
  metadata: Record<string, any>
}

interface DocumentOverrides {
  id?: string
  user_id?: string
  title?: string
  content?: string | null
  source_url?: string | null
  source_type?: 'pdf' | 'youtube' | 'web' | 'markdown' | 'text' | 'paste'
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed'
  markdown_available?: boolean
  embeddings_available?: boolean
  storage_path?: string | null
  error_message?: string | null
  created_at?: Date
  updated_at?: Date
  // metadata is JSONB
  metadata?: Record<string, any>
}

export function createDocumentFactory() {
  let idCounter = 1

  return {
    /**
     * Create a single document with default values
     */
    create(overrides: DocumentOverrides = {}): Document {
      const id = overrides.id || `doc-test-${idCounter++}`
      const now = new Date()

      return {
        id,
        user_id: overrides.user_id || 'test-user-001',
        title: overrides.title || `Test Document ${id}`,
        content: overrides.content || null,
        source_url: overrides.source_url || null,
        source_type: overrides.source_type || 'pdf',
        processing_status: overrides.processing_status || 'pending',
        markdown_available: overrides.markdown_available ?? false,
        embeddings_available: overrides.embeddings_available ?? false,
        storage_path: overrides.storage_path || `${id}/source.pdf`,
        error_message: overrides.error_message || null,
        created_at: overrides.created_at || now,
        updated_at: overrides.updated_at || now,
        metadata: overrides.metadata || {}
      }
    },

    /**
     * Create a document that has been successfully processed
     */
    createProcessed(overrides: DocumentOverrides = {}): Document {
      return this.create({
        processing_status: 'completed',
        markdown_available: true,
        embeddings_available: true,
        ...overrides
      })
    },

    /**
     * Create a document that failed processing
     */
    createFailed(overrides: DocumentOverrides = {}): Document {
      return this.create({
        processing_status: 'failed',
        error_message: 'Test error: Processing failed',
        markdown_available: false,
        embeddings_available: false,
        ...overrides
      })
    },

    /**
     * Create a PDF document
     */
    createPDF(overrides: DocumentOverrides = {}): Document {
      return this.create({
        source_type: 'pdf',
        storage_path: `${overrides.id || `doc-test-${idCounter}`}/source.pdf`,
        ...overrides
      })
    },

    /**
     * Create a YouTube document
     */
    createYouTube(overrides: DocumentOverrides = {}): Document {
      return this.create({
        source_type: 'youtube',
        source_url: 'https://youtube.com/watch?v=test123',
        ...overrides
      })
    },

    /**
     * Create a Web article document
     */
    createWeb(overrides: DocumentOverrides = {}): Document {
      return this.create({
        source_type: 'web',
        source_url: 'https://example.com/article',
        ...overrides
      })
    },

    /**
     * Create multiple documents
     */
    createMany(count: number, overrides: DocumentOverrides = {}): Document[] {
      return Array.from({ length: count }, (_, i) =>
        this.create({
          ...overrides,
          title: overrides.title || `Test Document ${i + 1}`
        })
      )
    },

    /**
     * Reset the ID counter for test isolation
     */
    reset() {
      idCounter = 1
    }
  }
}