-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- CORE TABLES
-- ============================================

-- Documents metadata (not content!)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  source_type TEXT DEFAULT 'pdf', -- 'pdf', 'epub', 'web'
  storage_path TEXT NOT NULL, -- 'userId/documentId/'
  
  -- Processing
  processing_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'embedding', 'complete', 'failed'
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  -- Metadata
  word_count INTEGER,
  page_count INTEGER,
  outline JSONB, -- Table of contents
  metadata JSONB, -- Extracted metadata
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Semantic chunks for synthesis
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  
  -- Content
  content TEXT NOT NULL, -- Markdown text of chunk
  chunk_index INTEGER NOT NULL, -- Order in document
  chunk_type TEXT, -- 'introduction', 'argument', 'evidence', etc
  
  -- Position in original
  start_offset INTEGER, -- Character position in markdown
  end_offset INTEGER,
  heading_path TEXT[], -- ['Chapter 1', 'Section 2']
  page_numbers INTEGER[], -- Original PDF pages
  
  -- Semantic analysis
  embedding vector(768), -- Gemini embedding
  themes JSONB, -- ['capitalism', 'control']
  entities JSONB, -- {people: [], concepts: [], works: []}
  importance_score FLOAT, -- 0-1 for synthesis ranking
  summary TEXT, -- One-line summary
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ECS ARCHITECTURE
-- ============================================

-- ECS: Entities are just IDs
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ECS: Components define behavior
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities ON DELETE CASCADE,
  component_type TEXT NOT NULL, -- 'flashcard', 'annotation', 'spark', 'study'
  data JSONB NOT NULL, -- Component-specific data
  
  -- Denormalized for performance
  chunk_id UUID REFERENCES chunks,
  document_id UUID REFERENCES documents,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SYNTHESIS & CONNECTIONS
-- ============================================

-- Connections between ideas
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  source_entity_id UUID REFERENCES entities,
  target_entity_id UUID REFERENCES entities,
  
  connection_type TEXT, -- 'supports', 'contradicts', 'extends', 'references'
  strength FLOAT, -- 0-1 similarity score
  
  auto_detected BOOLEAN DEFAULT TRUE,
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_hidden BOOLEAN DEFAULT FALSE,
  
  metadata JSONB, -- Additional connection data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STUDY SYSTEM
-- ============================================

-- Decks for flashcard organization
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Visual position for canvas view
  position JSONB DEFAULT '{"x": 0, "y": 0}',
  
  -- Source tracking
  source_document_id UUID REFERENCES documents,
  auto_created BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assign entities to decks
CREATE TABLE entity_decks (
  entity_id UUID REFERENCES entities ON DELETE CASCADE,
  deck_id UUID REFERENCES decks ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (entity_id, deck_id)
);

-- Study sessions and progress
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  deck_id UUID REFERENCES decks,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  cards_studied INTEGER DEFAULT 0,
  cards_correct INTEGER DEFAULT 0,
  
  metadata JSONB -- Session-specific data
);

-- Review log for analytics
CREATE TABLE review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities,
  user_id UUID REFERENCES auth.users,
  
  rating INTEGER, -- 1-4 (Again, Hard, Good, Easy)
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- State before review
  ease_before FLOAT,
  interval_before INTEGER,
  
  -- State after review
  ease_after FLOAT,
  interval_after INTEGER
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(processing_status);

CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX idx_entities_user ON entities(user_id);

CREATE INDEX idx_components_entity ON components(entity_id);
CREATE INDEX idx_components_type ON components(component_type);
CREATE INDEX idx_components_chunk ON components(chunk_id);
CREATE INDEX idx_components_document ON components(document_id);

CREATE INDEX idx_connections_source ON connections(source_entity_id);
CREATE INDEX idx_connections_target ON connections(target_entity_id);
CREATE INDEX idx_connections_user ON connections(user_id);

CREATE INDEX idx_decks_user ON decks(user_id);
CREATE INDEX idx_study_sessions_user ON study_sessions(user_id);
CREATE INDEX idx_review_log_entity ON review_log(entity_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE components ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_log ENABLE ROW LEVEL SECURITY;

-- Documents: Users can only see their own
CREATE POLICY "Users can view own documents" ON documents
  FOR ALL USING (auth.uid() = user_id);

-- Chunks: Accessible if user owns the document
CREATE POLICY "Users can view chunks of own documents" ON chunks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM documents 
      WHERE documents.id = chunks.document_id 
      AND documents.user_id = auth.uid()
    )
  );

-- Entities: Users can only see their own
CREATE POLICY "Users can manage own entities" ON entities
  FOR ALL USING (auth.uid() = user_id);

-- Components: Accessible if user owns the entity
CREATE POLICY "Users can manage components of own entities" ON components
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM entities 
      WHERE entities.id = components.entity_id 
      AND entities.user_id = auth.uid()
    )
  );

-- Connections: Users can only see their own
CREATE POLICY "Users can manage own connections" ON connections
  FOR ALL USING (auth.uid() = user_id);

-- Decks: Users can only see their own
CREATE POLICY "Users can manage own decks" ON decks
  FOR ALL USING (auth.uid() = user_id);

-- Entity_decks: Accessible if user owns the deck
CREATE POLICY "Users can manage own deck assignments" ON entity_decks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM decks 
      WHERE decks.id = entity_decks.deck_id 
      AND decks.user_id = auth.uid()
    )
  );

-- Study sessions: Users can only see their own
CREATE POLICY "Users can view own study sessions" ON study_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Review log: Users can only see their own
CREATE POLICY "Users can view own review log" ON review_log
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function for similarity search using pgvector
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  exclude_document_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  themes jsonb,
  summary text
) 
LANGUAGE SQL STABLE
AS $$
  SELECT 
    chunks.id,
    chunks.content,
    1 - (chunks.embedding <=> query_embedding) as similarity,
    chunks.document_id,
    chunks.themes,
    chunks.summary
  FROM chunks
  WHERE 
    1 - (chunks.embedding <=> query_embedding) > match_threshold
    AND (exclude_document_id IS NULL OR chunks.document_id != exclude_document_id)
  ORDER BY chunks.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_components_updated_at BEFORE UPDATE ON components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_decks_updated_at BEFORE UPDATE ON decks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();