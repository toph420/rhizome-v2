/**
 * Readwise Export API Client
 *
 * Client for Readwise Export API v2
 * Documentation: https://readwise.io/api_deets
 */

// ============================================
// TYPES
// ============================================

export interface ReadwiseBook {
  user_book_id: number
  title: string
  author: string
  category: 'books' | 'articles' | 'tweets' | 'podcasts' | 'supplementals'
  num_highlights: number
  last_highlight_at: string | null
  updated: string
  cover_image_url: string
  highlights_url: string
  source_url: string | null
  asin: string | null
  tags: Array<{ id: number; name: string }>
  highlights: ReadwiseHighlight[]
}

export interface ReadwiseHighlight {
  id: number
  text: string
  note: string | null
  location: number
  location_type: 'page' | 'location' | 'time' | 'order'
  highlighted_at: string
  url: string | null
  color: 'yellow' | 'blue' | 'red' | 'orange' | 'purple' | null
  updated: string
  book_id: number
  tags: Array<{ id: number; name: string }>
}

export interface ExportResponse {
  count: number
  nextPageCursor: string | null
  results: ReadwiseBook[]
}

// ============================================
// CLIENT
// ============================================

export class ReadwiseExportClient {
  private token: string
  private baseUrl = 'https://readwise.io/api/v2'

  constructor(token: string) {
    if (!token) {
      throw new Error('Readwise API token is required')
    }
    this.token = token
  }

  /**
   * Export all books with highlights
   *
   * @param options - Export options
   * @returns Export response with books and highlights
   */
  async export(options?: {
    updatedAfter?: string  // ISO 8601 date
    ids?: number[]  // User book IDs
    pageCursor?: string
  }): Promise<ExportResponse> {
    const url = new URL(`${this.baseUrl}/export/`)

    if (options?.updatedAfter) {
      url.searchParams.set('updatedAfter', options.updatedAfter)
    }
    if (options?.ids && options.ids.length > 0) {
      url.searchParams.set('ids', options.ids.join(','))
    }
    if (options?.pageCursor) {
      url.searchParams.set('pageCursor', options.pageCursor)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${this.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Readwise API error (${response.status}): ${errorText}`)
    }

    return await response.json()
  }

  /**
   * Export all books with pagination handling
   *
   * @param options - Export options
   * @returns All books from all pages
   */
  async exportAll(options?: {
    updatedAfter?: string
    ids?: number[]
  }): Promise<ReadwiseBook[]> {
    const allBooks: ReadwiseBook[] = []
    let cursor: string | null = null

    do {
      const response = await this.export({
        ...options,
        pageCursor: cursor || undefined
      })

      allBooks.push(...response.results)
      cursor = response.nextPageCursor

      // Avoid rate limits
      if (cursor) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } while (cursor)

    return allBooks
  }

  /**
   * Find book by title (case-insensitive substring match)
   *
   * @param title - Title to search for
   * @returns Matching book or null
   */
  async findBookByTitle(title: string): Promise<ReadwiseBook | null> {
    const books = await this.exportAll()
    const normalized = title.toLowerCase().trim()

    // Try exact match first
    const exactMatch = books.find(b =>
      b.title?.toLowerCase().trim() === normalized
    )
    if (exactMatch) return exactMatch

    // Try substring match
    const substringMatch = books.find(b =>
      b.title?.toLowerCase().includes(normalized) ||
      normalized.includes(b.title?.toLowerCase() || '')
    )

    return substringMatch || null
  }

  /**
   * Search books by criteria
   *
   * @param options - Search options
   * @returns Matching books
   */
  async searchBooks(options: {
    title?: string
    author?: string
    category?: string
  }): Promise<ReadwiseBook[]> {
    let books = await this.exportAll()

    if (options.title) {
      const titleLower = options.title.toLowerCase()
      books = books.filter(b =>
        b.title?.toLowerCase().includes(titleLower)
      )
    }

    if (options.author) {
      const authorLower = options.author.toLowerCase()
      books = books.filter(b =>
        b.author?.toLowerCase().includes(authorLower)
      )
    }

    if (options.category) {
      books = books.filter(b => b.category === options.category)
    }

    return books
  }
}
