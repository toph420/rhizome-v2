# Phase 8 Backend Supplement: API & Database Additions

**Date:** January 26, 2025  
**Purpose:** Complete backend specification for connection detection frontend features  
**Status:** Supplements existing backend implementation

---

## 1. API Endpoints Required

### 1.1 Connection Management

```typescript
// Manual connection creation by user
POST /api/connections/create
Request: {
  sourceChunkId: string;
  targetChunkId: string;
  type: 'supports' | 'contradicts' | 'extends' | 'bridges';
  reasoning?: string;
  userNotes?: string;
}
Response: {
  connectionId: string;
  entity: ConnectionEntity;
}

// Modify existing connection
PATCH /api/connections/:id
Request: {
  type?: ConnectionType;
  userNotes?: string;
  userModified: true;
}
Response: {
  success: boolean;
  connection: ConnectionEntity;
}

// Dismiss/hide connection
DELETE /api/connections/:id/dismiss
Response: {
  success: boolean;
  dismissedAt: Date;
}

// Get connection details for comparison view
GET /api/connections/:id/comparison
Response: {
  connection: ConnectionEntity;
  sourceChunk: {
    content: string;
    document: { id: string; title: string; };
    contextBefore?: string; // Previous chunk
    contextAfter?: string;  // Next chunk
  };
  targetChunk: {
    content: string;
    document: { id: string; title: string; };
    contextBefore?: string;
    contextAfter?: string;
  };
}
```

### 1.2 Connection Clipboard (Manual Creation Flow)

```typescript
// Start a manual connection
POST /api/connections/clipboard/start
Request: {
  chunkId: string;
  selectedText: string;
  documentId: string;
}
Response: {
  clipboardId: string;
  expiresAt: Date; // 30 minutes
}

// Complete the connection
POST /api/connections/clipboard/complete
Request: {
  clipboardId: string;
  targetChunkId: string;
  targetText: string;
  targetDocumentId: string;
  type: ConnectionType;
  reasoning?: string;
}
Response: {
  connectionId: string;
  entity: ConnectionEntity;
}

// Get current clipboard state
GET /api/connections/clipboard
Response: {
  active: boolean;
  sourceChunk?: {
    text: string;
    chunkId: string;
    documentTitle: string;
  };
  expiresAt?: Date;
}

// Cancel connection in progress
DELETE /api/connections/clipboard
Response: {
  success: boolean;
}
```

### 1.3 Activity Feed & Discovery

```typescript
// Get connections activity feed
GET /api/connections/feed
Query params: {
  page?: number;
  limit?: number;
  type?: ConnectionType;
  documentId?: string;
  startDate?: Date;
  endDate?: Date;
  minImportance?: number;
}
Response: {
  connections: ConnectionEntity[];
  total: number;
  page: number;
  hasMore: boolean;
}

// Get connections for a specific chunk
GET /api/chunks/:id/connections
Response: {
  connections: Array<{
    id: string;
    type: ConnectionType;
    strength: number;
    targetDocument: { id: string; title: string; };
    targetChunkPreview: string;
  }>;
  total: number;
}

// Search connections by themes or content
GET /api/connections/search
Query params: {
  query: string;
  themes?: string[];
  minStrength?: number;
}
Response: {
  connections: ConnectionEntity[];
  facets: {
    types: Record<ConnectionType, number>;
    themes: Record<string, number>;
  };
}
```

### 1.4 Notifications

```typescript
// Get unread connection notifications
GET /api/notifications/connections
Response: {
  notifications: Array<{
    id: string;
    connectionId: string;
    type: 'high_value' | 'manual_created' | 'batch_complete';
    title: string;
    body: string;
    createdAt: Date;
    read: boolean;
    data: {
      connectionType: ConnectionType;
      strength: number;
      documents: string[];
    };
  }>;
  unreadCount: number;
}

// Mark notification as read
POST /api/notifications/:id/read
Response: {
  success: boolean;
  readAt: Date;
}

// Mark all as read
POST /api/notifications/read-all
Response: {
  success: boolean;
  updatedCount: number;
}
```

### 1.5 Progress Tracking

```typescript
// Get connection detection progress (SSE endpoint)
GET /api/connections/progress/:documentId
Response (Server-Sent Events): {
  event: 'progress';
  data: {
    status: 'detecting' | 'analyzing' | 'complete' | 'error';
    progress: number; // 0-100
    foundCount: number;
    currentChunk: number;
    totalChunks: number;
    message?: string;
  };
}

// Trigger on-demand connection detection
POST /api/documents/:id/detect-connections
Request: {
  force?: boolean; // Re-run even if already processed
  priority?: 'low' | 'normal' | 'high';
}
Response: {
  jobId: string;
  status: 'queued' | 'processing';
  estimatedTime?: number; // seconds
}

// Get detection status for multiple documents
POST /api/documents/detection-status
Request: {
  documentIds: string[];
}
Response: {
  statuses: Record<string, {
    enabled: boolean;
    lastScan?: Date;
    connectionCount: number;
    status: 'pending' | 'processing' | 'complete' | 'error';
  }>;
}
```

### 1.6 Document Settings

```typescript
// Update document connection settings
PATCH /api/documents/:id/settings
Request: {
  connectionDetectionEnabled?: boolean;
  connectionTypes?: ConnectionType[]; // Which types to detect
  minimumStrength?: number; // 0-1 threshold
}
Response: {
  success: boolean;
  settings: DocumentSettings;
}

// Bulk update settings
POST /api/documents/settings/bulk
Request: {
  documentIds: string[];
  settings: {
    connectionDetectionEnabled?: boolean;
  };
}
Response: {
  success: boolean;
  updatedCount: number;
}
```

---

## 2. Database Schema Additions

### 2.1 New Tables

```sql
-- User dismissals/hidden connections
CREATE TABLE connection_dismissals (
  user_id UUID NOT NULL REFERENCES auth.users,
  connection_id UUID NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT, -- 'not_relevant', 'incorrect', 'duplicate', etc.
  PRIMARY KEY (user_id, connection_id)
);

-- Connection clipboard for manual creation
CREATE TABLE connection_clipboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  source_chunk_id UUID NOT NULL REFERENCES chunks,
  source_text TEXT NOT NULL,
  source_document_id UUID NOT NULL REFERENCES documents,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  type TEXT NOT NULL, -- 'connection_found', 'batch_complete', etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connection activity log for feed
CREATE TABLE connection_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  connection_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'created', 'modified', 'annotated', 'studied'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_dismissals_user ON connection_dismissals(user_id);
CREATE INDEX idx_clipboard_user ON connection_clipboard(user_id);
CREATE INDEX idx_clipboard_expires ON connection_clipboard(expires_at);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read);
CREATE INDEX idx_activity_user_date ON connection_activity(user_id, created_at DESC);
```

### 2.2 Schema Updates

```sql
-- Add settings to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS
  connection_detection_enabled BOOLEAN DEFAULT true,
  connection_types TEXT[] DEFAULT ARRAY['supports', 'contradicts', 'extends', 'bridges'],
  minimum_connection_strength FLOAT DEFAULT 0.75,
  last_connection_scan TIMESTAMPTZ,
  connection_scan_version INTEGER DEFAULT 1; -- Track algorithm version

-- Add user modifications to components table
ALTER TABLE components ADD COLUMN IF NOT EXISTS
  user_modified BOOLEAN DEFAULT false,
  user_notes TEXT,
  modified_at TIMESTAMPTZ,
  original_data JSONB; -- Store original before modification

-- Add importance and engagement to connection entities
ALTER TABLE components ADD COLUMN IF NOT EXISTS
  importance_score FLOAT GENERATED ALWAYS AS (
    CASE 
      WHEN component_type = 'connection' THEN
        COALESCE((data->>'strength')::FLOAT, 0) *
        CASE data->>'type'
          WHEN 'bridges' THEN 1.4
          WHEN 'contradicts' THEN 1.3
          WHEN 'extends' THEN 1.1
          ELSE 1.0
        END
      ELSE NULL
    END
  ) STORED,
  engagement_count INTEGER DEFAULT 0; -- Times viewed/interacted
```

---

## 3. Backend Service Updates

### 3.1 Connection Detection Service

```typescript
// lib/services/connection-detector.ts

export class ConnectionDetectorService {
  // Add methods for manual creation
  async createManualConnection(
    userId: string,
    sourceChunkId: string,
    targetChunkId: string,
    type: ConnectionType,
    reasoning?: string
  ): Promise<string> {
    // Fetch chunks
    const [sourceChunk, targetChunk] = await Promise.all([
      getChunk(sourceChunkId),
      getChunk(targetChunkId)
    ]);
    
    // Create connection entity
    const connectionId = await ecs.createEntity(userId, {
      connection: {
        type,
        strength: 1.0, // Manual connections have full strength
        reasoning: reasoning || 'User-created connection',
        auto_detected: false,
        user_created: true
      },
      source: {
        chunk_ids: [sourceChunkId, targetChunkId],
        document_ids: [sourceChunk.document_id, targetChunk.document_id]
      }
    });
    
    // Log activity
    await logActivity(userId, connectionId, 'created');
    
    // Send notification if high-value
    if (type === 'bridges') {
      await sendNotification(userId, {
        type: 'connection_created',
        title: 'New connection created',
        connectionId
      });
    }
    
    return connectionId;
  }
  
  // Method for modifying connections
  async modifyConnection(
    connectionId: string,
    userId: string,
    updates: ConnectionUpdate
  ): Promise<void> {
    const connection = await ecs.getEntity(connectionId);
    
    // Store original if first modification
    if (!connection.user_modified) {
      await storeOriginal(connectionId, connection);
    }
    
    // Apply updates
    await ecs.updateComponent(connectionId, 'connection', {
      ...connection.connection,
      ...updates,
      user_modified: true,
      modified_at: new Date()
    });
    
    await logActivity(userId, connectionId, 'modified');
  }
  
  // Progress tracking
  async trackProgress(
    documentId: string,
    callback: (progress: ProgressUpdate) => void
  ): Promise<void> {
    const chunks = await getChunks(documentId);
    const total = chunks.length;
    
    for (let i = 0; i < total; i++) {
      // Process chunk...
      
      // Send progress update
      callback({
        status: 'detecting',
        progress: Math.round((i / total) * 100),
        foundCount: this.foundConnections,
        currentChunk: i + 1,
        totalChunks: total
      });
    }
  }
}
```

### 3.2 Notification Service

```typescript
// lib/services/notifications.ts

export class NotificationService {
  async createConnectionNotification(
    userId: string,
    connection: ConnectionEntity,
    type: 'high_value' | 'batch_complete'
  ): Promise<void> {
    const notification = {
      user_id: userId,
      type: 'connection_found',
      title: this.getTitle(connection, type),
      body: this.getBody(connection, type),
      data: {
        connectionId: connection.id,
        connectionType: connection.connection.type,
        strength: connection.connection.strength,
        documents: connection.source.document_ids
      }
    };
    
    await supabase.from('notifications').insert(notification);
    
    // Send real-time update
    await supabase.channel(`notifications:${userId}`)
      .send({
        type: 'broadcast',
        event: 'new_notification',
        payload: notification
      });
  }
  
  private getTitle(connection: ConnectionEntity, type: string): string {
    if (type === 'high_value' && connection.connection.type === 'bridges') {
      return '🌉 Surprising connection discovered!';
    }
    return `New ${connection.connection.type} connection found`;
  }
  
  private getBody(connection: ConnectionEntity, type: string): string {
    const [doc1, doc2] = connection.source.document_titles;
    return `Found connection between "${doc1}" and "${doc2}"`;
  }
}
```

### 3.3 Real-time Subscriptions

```typescript
// lib/subscriptions/connection-progress.ts

export function subscribeToConnectionProgress(
  documentId: string,
  onProgress: (update: ProgressUpdate) => void
): () => void {
  const channel = supabase.channel(`progress:${documentId}`)
    .on('broadcast', { event: 'progress' }, ({ payload }) => {
      onProgress(payload);
    })
    .subscribe();
  
  // Return unsubscribe function
  return () => {
    channel.unsubscribe();
  };
}

// Server-side progress emission
export async function emitProgress(
  documentId: string,
  update: ProgressUpdate
): Promise<void> {
  await supabase.channel(`progress:${documentId}`)
    .send({
      type: 'broadcast',
      event: 'progress',
      payload: update
    });
}
```

---

## 4. API Route Examples

### 4.1 Connection Creation Endpoint

```typescript
// app/api/connections/create/route.ts

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  
  const body = await request.json();
  const { sourceChunkId, targetChunkId, type, reasoning, userNotes } = body;
  
  // Validate chunks belong to user's documents
  const validation = await validateChunkOwnership(
    session.user.id,
    [sourceChunkId, targetChunkId]
  );
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid chunks' }, { status: 403 });
  }
  
  try {
    const connectionId = await connectionDetector.createManualConnection(
      session.user.id,
      sourceChunkId,
      targetChunkId,
      type,
      reasoning
    );
    
    if (userNotes) {
      await ecs.updateComponent(connectionId, 'connection', {
        user_notes: userNotes
      });
    }
    
    const entity = await ecs.getEntity(connectionId);
    
    return NextResponse.json({
      connectionId,
      entity
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create connection' },
      { status: 500 }
    );
  }
}
```

### 4.2 Activity Feed Endpoint

```typescript
// app/api/connections/feed/route.ts

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const type = searchParams.get('type') as ConnectionType | null;
  const minImportance = parseFloat(searchParams.get('minImportance') || '0');
  
  // Build query
  let query = supabase
    .from('components')
    .select('*', { count: 'exact' })
    .eq('component_type', 'connection')
    .gte('importance_score', minImportance)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  
  if (type) {
    query = query.eq('data->type', type);
  }
  
  const { data: connections, count, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // Enrich with document titles
  const enriched = await enrichConnectionsWithDocuments(connections);
  
  return NextResponse.json({
    connections: enriched,
    total: count,
    page,
    hasMore: count > page * limit
  });
}
```

---

## 5. Performance Optimizations

### 5.1 Caching Strategy

```typescript
// Use Redis or in-memory cache for:
- Connection counts per document
- Recently accessed connections
- User dismissals
- Notification counts

// Cache invalidation on:
- New connection created
- Connection modified/dismissed
- Document deleted
```

### 5.2 Database Optimizations

```sql
-- Materialized view for connection stats
CREATE MATERIALIZED VIEW connection_stats AS
SELECT 
  d.id as document_id,
  COUNT(DISTINCT c.id) as connection_count,
  AVG((c.data->>'strength')::FLOAT) as avg_strength,
  COUNT(DISTINCT c.data->>'type') as unique_types
FROM documents d
LEFT JOIN components c ON 
  c.component_type = 'connection' AND
  (c.data->'document_ids')::jsonb ? d.id::text
GROUP BY d.id;

-- Refresh periodically
CREATE INDEX idx_connection_stats_doc ON connection_stats(document_id);
```

---

## 6. Testing Considerations

### API Testing
- Test connection creation with invalid chunks
- Test clipboard expiration
- Test notification delivery
- Test progress SSE streaming
- Test concurrent connection detection

### Performance Testing
- Load test with 1000+ connections per document
- Test feed pagination with large datasets
- Test real-time updates with multiple clients
- Test connection detection on 100+ page documents

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2025  
**Status:** Ready for Backend Implementation