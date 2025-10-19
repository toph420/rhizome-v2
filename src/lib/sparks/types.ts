// Spark component (stored in ECS components table)
export interface SparkComponent {
  content: string
  createdAt: string
  updatedAt?: string
  tags: string[]
  connections: SparkConnection[]
  selections: SparkSelection[]  // NEW - multiple text selections
}

// Text selection within a spark
export interface SparkSelection {
  text: string
  chunkId: string
  startOffset: number
  endOffset: number
  textContext?: {
    before: string
    after: string
  }
}

// Connection stored within spark component (NOT connections table)
export interface SparkConnection {
  chunkId: string
  type: 'origin' | 'mention' | 'inherited'
  strength: number
  metadata?: {
    inheritedFrom?: string
    originalStrength?: number
    originalType?: string
    mentionedInContent?: boolean
    relationship?: string
  }
}

// Reading context snapshot
export interface SparkContext {
  documentId: string
  documentTitle: string
  originChunkId: string
  visibleChunks: string[]
  scrollPosition: number
  activeConnections: any[]
  engineWeights: {
    semantic: number
    contradiction: number
    bridge: number
  }
  selection?: {
    text: string
    chunkId: string
    startOffset: number
    endOffset: number
  }
}

// Complete spark data for Storage export
export interface SparkStorageJson {
  entity_id: string
  user_id: string
  component_type: 'spark'
  data: SparkComponent
  context: SparkContext
  source: {
    chunk_id: string
    document_id: string
  }
}

// Cache table row (optional, for queries)
export interface SparkCacheRow {
  entity_id: string
  user_id: string
  content: string
  created_at: string
  updated_at?: string
  origin_chunk_id: string
  document_id: string
  tags: string[]
  connections: SparkConnection[] // Added in migration 056
  embedding?: number[]
  storage_path: string
  cached_at: string
}
