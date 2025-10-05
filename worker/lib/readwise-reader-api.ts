/**
 * Readwise Reader API Client
 *
 * Client for Readwise Reader API v3
 * Documentation: https://readwise.io/reader_api
 */

// ============================================
// TYPES
// ============================================

export interface ReaderDocument {
  id: string
  title: string
  author: string
  category: 'article' | 'book' | 'pdf' | 'tweet' | 'video'
  source_url?: string
  created_at: string
}

export interface ReaderHighlight {
  id: string
  text: string
  note?: string
  location?: {
    type: 'page' | 'time' | 'order'
    value: number
  }
  color?: 'yellow' | 'blue' | 'red' | 'green' | 'orange'
  highlighted_at: string
}

export interface ReaderDocumentDetail extends ReaderDocument {
  highlights: ReaderHighlight[]
}

// ============================================
// CLIENT
// ============================================

export class ReadwiseReaderClient {
  private token: string
  private baseUrl = 'https://readwise.io/api/v3'

  constructor(token: string) {
    if (!token) {
      throw new Error('Readwise API token is required')
    }
    this.token = token
  }

  /**
   * List all documents in Reader library
   *
   * @param category - Optional filter by category (article, book, pdf, tweet, video)
   * @returns Array of documents
   */
  async listDocuments(category?: string): Promise<ReaderDocument[]> {
    const url = new URL(`${this.baseUrl}/list/`)
    if (category) {
      url.searchParams.set('category', category)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${this.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Reader API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return data.results || []
  }

  /**
   * Get document with all highlights
   *
   * @param documentId - Reader document ID
   * @returns Document with highlights
   */
  async getDocument(documentId: string): Promise<ReaderDocumentDetail> {
    const response = await fetch(
      `${this.baseUrl}/list/${documentId}`,
      {
        headers: {
          Authorization: `Token ${this.token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Reader API error (${response.status}): ${errorText}`)
    }

    return await response.json()
  }

  /**
   * Find document by title (fuzzy match)
   *
   * Matches if:
   * - Title contains search term (case-insensitive)
   * - Search term contains title (case-insensitive)
   *
   * @param title - Title to search for
   * @returns Matching document or null
   */
  async findDocumentByTitle(title: string): Promise<ReaderDocument | null> {
    const docs = await this.listDocuments()
    const normalized = title.toLowerCase().trim()

    // Try exact match first
    const exactMatch = docs.find(d =>
      d.title?.toLowerCase().trim() === normalized
    )
    if (exactMatch) return exactMatch

    // Try substring match
    const substringMatch = docs.find(d =>
      d.title?.toLowerCase().includes(normalized) ||
      normalized.includes(d.title?.toLowerCase() || '')
    )

    return substringMatch || null
  }

  /**
   * Search documents by multiple criteria
   *
   * @param options - Search options (title, author, category)
   * @returns Array of matching documents
   */
  async searchDocuments(options: {
    title?: string
    author?: string
    category?: string
  }): Promise<ReaderDocument[]> {
    let docs = await this.listDocuments(options.category)

    if (options.title) {
      const titleLower = options.title.toLowerCase()
      docs = docs.filter(d =>
        d.title?.toLowerCase().includes(titleLower)
      )
    }

    if (options.author) {
      const authorLower = options.author.toLowerCase()
      docs = docs.filter(d =>
        d.author?.toLowerCase().includes(authorLower)
      )
    }

    return docs
  }
}
