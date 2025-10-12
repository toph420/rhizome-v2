/**
 * Zotero API Client
 * 
 * Direct HTTP client for Zotero Web API v3
 * Docs: https://www.zotero.org/support/dev/web_api/v3/start
 * 
 * Uses ZOTERO_USER_ID and ZOTERO_API_KEY from .env
 */

const ZOTERO_API_BASE = 'https://api.zotero.org'

export interface ZoteroAnnotation {
  key: string
  version: number
  itemType: 'annotation'
  annotationType: 'highlight' | 'note' | 'image'
  annotationText: string
  annotationComment: string
  annotationColor: string
  annotationPageLabel: string
  annotationPosition: string  // JSON string with position data
  annotationSortIndex: string
  parentItem: string
  dateAdded: string
  dateModified: string
  tags: Array<{ tag: string }>
}

export interface ZoteroItem {
  key: string
  version: number
  itemType: string
  title: string
  creators: Array<{
    creatorType: string
    firstName?: string
    lastName?: string
    name?: string
  }>
  abstractNote?: string
  date?: string
  numPages?: number
  url?: string
  accessDate?: string
  tags: Array<{ tag: string }>
}

export class ZoteroClient {
  private userId: string
  private apiKey: string
  
  constructor(userId?: string, apiKey?: string) {
    this.userId = userId || process.env.ZOTERO_USER_ID!
    this.apiKey = apiKey || process.env.ZOTERO_API_KEY!
    
    if (!this.userId || !this.apiKey) {
      throw new Error('ZOTERO_USER_ID and ZOTERO_API_KEY must be set in .env')
    }
  }
  
  /**
   * Fetch a single item by key
   */
  async getItem(itemKey: string): Promise<ZoteroItem> {
    const url = `${ZOTERO_API_BASE}/users/${this.userId}/items/${itemKey}`
    
    const response = await fetch(url, {
      headers: {
        'Zotero-API-Key': this.apiKey,
        'Zotero-API-Version': '3'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.data
  }
  
  /**
   * Fetch all annotations for a parent item
   * 
   * Filters client-side since Zotero API doesn't support filtering by parentItem in query
   */
  async getAnnotations(parentItemKey: string): Promise<ZoteroAnnotation[]> {
    const url = `${ZOTERO_API_BASE}/users/${this.userId}/items?itemType=annotation&limit=100`
    
    const response = await fetch(url, {
      headers: {
        'Zotero-API-Key': this.apiKey,
        'Zotero-API-Version': '3'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status} ${response.statusText}`)
    }
    
    const items = await response.json()
    
    // Filter to only annotations for this parent item
    const annotations = items
      .filter((item: any) => item.data.parentItem === parentItemKey)
      .map((item: any) => item.data as ZoteroAnnotation)
    
    // Sort by page and position
    return annotations.sort((a, b) => {
      const pageA = parseInt(a.annotationPageLabel) || 0
      const pageB = parseInt(b.annotationPageLabel) || 0
      if (pageA !== pageB) return pageA - pageB
      
      // Secondary sort by sortIndex
      return a.annotationSortIndex.localeCompare(b.annotationSortIndex)
    })
  }
  
  /**
   * Fetch ALL items in library (for debugging/exploration)
   */
  async getAllItems(limit = 50): Promise<ZoteroItem[]> {
    const url = `${ZOTERO_API_BASE}/users/${this.userId}/items?limit=${limit}`
    
    const response = await fetch(url, {
      headers: {
        'Zotero-API-Key': this.apiKey,
        'Zotero-API-Version': '3'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status} ${response.statusText}`)
    }
    
    const items = await response.json()
    return items.map((item: any) => item.data)
  }
}

/**
 * Map Zotero hex color to Rhizome color system
 */
export function mapZoteroColor(
  hexColor: string | undefined
): 'yellow' | 'blue' | 'red' | 'green' | 'orange' {
  if (!hexColor) return 'yellow'
  
  // Zotero's default palette
  const colorMap: Record<string, 'yellow' | 'blue' | 'red' | 'green' | 'orange'> = {
    '#ffd400': 'yellow',
    '#ff6666': 'red',
    '#5fb236': 'green',
    '#2ea8e5': 'blue',
    '#a28ae5': 'blue',  // Purple → blue
    '#e56eee': 'blue',  // Magenta → blue
    '#f19837': 'orange',
    '#aaaaaa': 'yellow' // Gray → yellow
  }
  
  const normalized = hexColor.toLowerCase()
  return colorMap[normalized] || 'yellow'
}

/**
 * Format Zotero creators as author string
 */
export function formatCreators(
  creators: Array<{
    creatorType: string
    firstName?: string
    lastName?: string
    name?: string
  }>
): string {
  if (!creators || creators.length === 0) return 'Unknown'
  
  return creators
    .filter(c => c.creatorType === 'author')
    .map(c => {
      if (c.name) return c.name
      return [c.firstName, c.lastName].filter(Boolean).join(' ')
    })
    .join(', ') || 'Unknown'
}