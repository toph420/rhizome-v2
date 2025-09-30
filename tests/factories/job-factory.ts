interface JobOverrides {
  id?: string
  user_id?: string
  job_type?: string
  entity_type?: string
  entity_id?: string
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'permanently_failed'
  input_data?: Record<string, any>
  output_data?: Record<string, any> | null
  error?: string | null
  last_error?: string | null
  attempts?: number
  retry_count?: number
  max_retries?: number
  next_retry_at?: string | null
  progress?: Record<string, any>
  created_at?: Date
  updated_at?: Date
  started_at?: Date | null
  completed_at?: Date | null
}

export function createJobFactory() {
  let idCounter = 1

  return {
    /**
     * Create a background job
     */
    create(overrides: JobOverrides = {}) {
      const id = overrides.id || `job-test-${idCounter++}`
      const now = new Date()

      return {
        id,
        user_id: overrides.user_id || 'test-user-1',
        job_type: overrides.job_type || 'process-document',
        entity_type: overrides.entity_type || 'document',
        entity_id: overrides.entity_id || 'doc-test-001',
        status: overrides.status || 'pending',
        input_data: overrides.input_data || {
          document_id: 'doc-test-001',
          source_type: 'pdf'
        },
        output_data: overrides.output_data || null,
        error: overrides.error || null,
        last_error: overrides.last_error || null,
        attempts: overrides.attempts ?? 0,
        retry_count: overrides.retry_count ?? 0,
        max_retries: overrides.max_retries ?? 3,
        next_retry_at: overrides.next_retry_at || null,
        progress: overrides.progress || { stage: 'queued', percent: 0 },
        created_at: overrides.created_at || now,
        updated_at: overrides.updated_at || now,
        started_at: overrides.started_at || null,
        completed_at: overrides.completed_at || null
      }
    },

    /**
     * Create a completed job
     */
    createCompleted(overrides: JobOverrides = {}) {
      const now = new Date()
      return this.create({
        status: 'completed',
        started_at: new Date(now.getTime() - 60000), // 1 minute ago
        completed_at: now,
        output_data: {
          chunks_created: 10,
          embeddings_generated: true
        },
        ...overrides
      })
    },

    /**
     * Create a failed job
     */
    createFailed(overrides: JobOverrides = {}) {
      return this.create({
        status: 'failed',
        error: 'Test error: Job processing failed',
        attempts: 3,
        ...overrides
      })
    },

    /**
     * Create a processing job
     */
    createProcessing(overrides: JobOverrides = {}) {
      return this.create({
        status: 'processing',
        started_at: new Date(),
        attempts: 1,
        ...overrides
      })
    },

    /**
     * Reset the ID counter
     */
    reset() {
      idCounter = 1
    }
  }
}