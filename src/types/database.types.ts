Connecting to db 5432
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      background_jobs: {
        Row: {
          checkpoint_hash: string | null
          completed_at: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          error_type: string | null
          id: string
          input_data: Json | null
          job_type: string
          last_checkpoint_path: string | null
          last_checkpoint_stage: string | null
          last_error: string | null
          max_retries: number | null
          metadata: Json | null
          next_retry_at: string | null
          output_data: Json | null
          pause_reason: string | null
          paused_at: string | null
          progress: Json | null
          resume_count: number | null
          resumed_at: string | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          checkpoint_hash?: string | null
          completed_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          input_data?: Json | null
          job_type: string
          last_checkpoint_path?: string | null
          last_checkpoint_stage?: string | null
          last_error?: string | null
          max_retries?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          output_data?: Json | null
          pause_reason?: string | null
          paused_at?: string | null
          progress?: Json | null
          resume_count?: number | null
          resumed_at?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          checkpoint_hash?: string | null
          completed_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          input_data?: Json | null
          job_type?: string
          last_checkpoint_path?: string | null
          last_checkpoint_stage?: string | null
          last_error?: string | null
          max_retries?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          output_data?: Json | null
          pause_reason?: string | null
          paused_at?: string | null
          progress?: Json | null
          resume_count?: number | null
          resumed_at?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cached_chunks: {
        Row: {
          chunks: Json
          created_at: string
          docling_version: string | null
          document_id: string
          extraction_mode: string
          id: string
          markdown_hash: string
          structure: Json
          updated_at: string
        }
        Insert: {
          chunks: Json
          created_at?: string
          docling_version?: string | null
          document_id: string
          extraction_mode: string
          id?: string
          markdown_hash: string
          structure: Json
          updated_at?: string
        }
        Update: {
          chunks?: Json
          created_at?: string
          docling_version?: string | null
          document_id?: string
          extraction_mode?: string
          id?: string
          markdown_hash?: string
          structure?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cached_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      chunks: {
        Row: {
          bboxes: Json | null
          chunk_index: number
          chunker_type: string
          conceptual_metadata: Json | null
          connections_detected: boolean | null
          connections_detected_at: string | null
          content: string
          correction_history: Json | null
          created_at: string | null
          detection_skipped_reason: string | null
          document_id: string | null
          domain_metadata: Json | null
          embedding: string | null
          emotional_metadata: Json | null
          end_offset: number | null
          heading_level: number | null
          heading_path: string[] | null
          id: string
          importance_score: number | null
          is_current: boolean
          metadata_confidence: string | null
          metadata_extracted_at: string | null
          metadata_interpolated: boolean | null
          metadata_overlap_count: number | null
          overlap_corrected: boolean | null
          page_end: number | null
          page_label: string | null
          page_start: number | null
          position_confidence: string | null
          position_corrected: boolean | null
          position_method: string | null
          position_validated: boolean | null
          reprocessing_batch: string | null
          section_marker: string | null
          start_offset: number | null
          summary: string | null
          themes: Json | null
          token_count: number | null
          validation_details: Json | null
          validation_warning: string | null
          word_count: number | null
        }
        Insert: {
          bboxes?: Json | null
          chunk_index: number
          chunker_type?: string
          conceptual_metadata?: Json | null
          connections_detected?: boolean | null
          connections_detected_at?: string | null
          content: string
          correction_history?: Json | null
          created_at?: string | null
          detection_skipped_reason?: string | null
          document_id?: string | null
          domain_metadata?: Json | null
          embedding?: string | null
          emotional_metadata?: Json | null
          end_offset?: number | null
          heading_level?: number | null
          heading_path?: string[] | null
          id?: string
          importance_score?: number | null
          is_current?: boolean
          metadata_confidence?: string | null
          metadata_extracted_at?: string | null
          metadata_interpolated?: boolean | null
          metadata_overlap_count?: number | null
          overlap_corrected?: boolean | null
          page_end?: number | null
          page_label?: string | null
          page_start?: number | null
          position_confidence?: string | null
          position_corrected?: boolean | null
          position_method?: string | null
          position_validated?: boolean | null
          reprocessing_batch?: string | null
          section_marker?: string | null
          start_offset?: number | null
          summary?: string | null
          themes?: Json | null
          token_count?: number | null
          validation_details?: Json | null
          validation_warning?: string | null
          word_count?: number | null
        }
        Update: {
          bboxes?: Json | null
          chunk_index?: number
          chunker_type?: string
          conceptual_metadata?: Json | null
          connections_detected?: boolean | null
          connections_detected_at?: string | null
          content?: string
          correction_history?: Json | null
          created_at?: string | null
          detection_skipped_reason?: string | null
          document_id?: string | null
          domain_metadata?: Json | null
          embedding?: string | null
          emotional_metadata?: Json | null
          end_offset?: number | null
          heading_level?: number | null
          heading_path?: string[] | null
          id?: string
          importance_score?: number | null
          is_current?: boolean
          metadata_confidence?: string | null
          metadata_extracted_at?: string | null
          metadata_interpolated?: boolean | null
          metadata_overlap_count?: number | null
          overlap_corrected?: boolean | null
          page_end?: number | null
          page_label?: string | null
          page_start?: number | null
          position_confidence?: string | null
          position_corrected?: boolean | null
          position_method?: string | null
          position_validated?: boolean | null
          reprocessing_batch?: string | null
          section_marker?: string | null
          start_offset?: number | null
          summary?: string | null
          themes?: Json | null
          token_count?: number | null
          validation_details?: Json | null
          validation_warning?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          chunk_id: string | null
          chunk_ids: string[] | null
          component_type: string
          created_at: string | null
          data: Json
          document_id: string | null
          entity_id: string | null
          id: string
          needs_review: boolean | null
          original_chunk_index: number | null
          recovery_confidence: number | null
          recovery_method: string | null
          updated_at: string | null
        }
        Insert: {
          chunk_id?: string | null
          chunk_ids?: string[] | null
          component_type: string
          created_at?: string | null
          data: Json
          document_id?: string | null
          entity_id?: string | null
          id?: string
          needs_review?: boolean | null
          original_chunk_index?: number | null
          recovery_confidence?: number | null
          recovery_method?: string | null
          updated_at?: string | null
        }
        Update: {
          chunk_id?: string | null
          chunk_ids?: string[] | null
          component_type?: string
          created_at?: string | null
          data?: Json
          document_id?: string | null
          entity_id?: string | null
          id?: string
          needs_review?: boolean | null
          original_chunk_index?: number | null
          recovery_confidence?: number | null
          recovery_method?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "components_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks_for_engines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          auto_detected: boolean
          connection_type: string
          discovered_at: string
          id: string
          metadata: Json | null
          source_chunk_id: string
          strength: number
          target_chunk_id: string
          user_starred: boolean | null
          user_validated: boolean | null
          validated_at: string | null
        }
        Insert: {
          auto_detected?: boolean
          connection_type: string
          discovered_at?: string
          id?: string
          metadata?: Json | null
          source_chunk_id: string
          strength: number
          target_chunk_id: string
          user_starred?: boolean | null
          user_validated?: boolean | null
          validated_at?: string | null
        }
        Update: {
          auto_detected?: boolean
          connection_type?: string
          discovered_at?: string
          id?: string
          metadata?: Json | null
          source_chunk_id?: string
          strength?: number
          target_chunk_id?: string
          user_starred?: boolean | null
          user_validated?: boolean | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connections_source_chunk_id_fkey"
            columns: ["source_chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_source_chunk_id_fkey"
            columns: ["source_chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks_for_engines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_target_chunk_id_fkey"
            columns: ["target_chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_target_chunk_id_fkey"
            columns: ["target_chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks_for_engines"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          parent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          parent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          parent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          author: string | null
          chunker_type: string | null
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          detected_metadata: Json | null
          document_type: string | null
          doi: string | null
          embeddings_available: boolean | null
          id: string
          isbn: string | null
          language: string | null
          markdown_available: boolean | null
          markdown_path: string | null
          metadata: Json | null
          obsidian_path: string | null
          outline: Json | null
          page_count: number | null
          processing_completed_at: string | null
          processing_error: string | null
          processing_requested: boolean | null
          processing_stage: string | null
          processing_started_at: string | null
          processing_status: string | null
          publication_date: string | null
          publication_year: number | null
          publisher: string | null
          review_stage: string | null
          source_metadata: Json | null
          source_type: string | null
          source_url: string | null
          storage_path: string
          title: string
          updated_at: string | null
          user_id: string
          word_count: number | null
        }
        Insert: {
          author?: string | null
          chunker_type?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          detected_metadata?: Json | null
          document_type?: string | null
          doi?: string | null
          embeddings_available?: boolean | null
          id?: string
          isbn?: string | null
          language?: string | null
          markdown_available?: boolean | null
          markdown_path?: string | null
          metadata?: Json | null
          obsidian_path?: string | null
          outline?: Json | null
          page_count?: number | null
          processing_completed_at?: string | null
          processing_error?: string | null
          processing_requested?: boolean | null
          processing_stage?: string | null
          processing_started_at?: string | null
          processing_status?: string | null
          publication_date?: string | null
          publication_year?: number | null
          publisher?: string | null
          review_stage?: string | null
          source_metadata?: Json | null
          source_type?: string | null
          source_url?: string | null
          storage_path: string
          title: string
          updated_at?: string | null
          user_id: string
          word_count?: number | null
        }
        Update: {
          author?: string | null
          chunker_type?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          detected_metadata?: Json | null
          document_type?: string | null
          doi?: string | null
          embeddings_available?: boolean | null
          id?: string
          isbn?: string | null
          language?: string | null
          markdown_available?: boolean | null
          markdown_path?: string | null
          metadata?: Json | null
          obsidian_path?: string | null
          outline?: Json | null
          page_count?: number | null
          processing_completed_at?: string | null
          processing_error?: string | null
          processing_requested?: boolean | null
          processing_stage?: string | null
          processing_started_at?: string | null
          processing_status?: string | null
          publication_date?: string | null
          publication_year?: number | null
          publisher?: string | null
          review_stage?: string | null
          source_metadata?: Json | null
          source_type?: string | null
          source_url?: string | null
          storage_path?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          word_count?: number | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          created_at: string | null
          entity_type: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_type?: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      flashcards_cache: {
        Row: {
          annotation_id: string | null
          answer: string
          cached_at: string | null
          card_type: string
          chunk_ids: string[] | null
          cloze_count: number | null
          cloze_index: number | null
          connection_id: string | null
          content: string | null
          created_at: string
          deck_added_at: string | null
          deck_id: string | null
          difficulty: number | null
          document_id: string | null
          entity_id: string
          generation_job_id: string | null
          is_mature: boolean | null
          lapses: number | null
          last_review: string | null
          next_review: string | null
          question: string
          reps: number | null
          srs_state: number | null
          stability: number | null
          status: string
          storage_path: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          annotation_id?: string | null
          answer: string
          cached_at?: string | null
          card_type: string
          chunk_ids?: string[] | null
          cloze_count?: number | null
          cloze_index?: number | null
          connection_id?: string | null
          content?: string | null
          created_at: string
          deck_added_at?: string | null
          deck_id?: string | null
          difficulty?: number | null
          document_id?: string | null
          entity_id: string
          generation_job_id?: string | null
          is_mature?: boolean | null
          lapses?: number | null
          last_review?: string | null
          next_review?: string | null
          question: string
          reps?: number | null
          srs_state?: number | null
          stability?: number | null
          status: string
          storage_path: string
          tags?: string[] | null
          updated_at: string
          user_id: string
        }
        Update: {
          annotation_id?: string | null
          answer?: string
          cached_at?: string | null
          card_type?: string
          chunk_ids?: string[] | null
          cloze_count?: number | null
          cloze_index?: number | null
          connection_id?: string | null
          content?: string | null
          created_at?: string
          deck_added_at?: string | null
          deck_id?: string | null
          difficulty?: number | null
          document_id?: string | null
          entity_id?: string
          generation_job_id?: string | null
          is_mature?: boolean | null
          lapses?: number | null
          last_review?: string | null
          next_review?: string | null
          question?: string
          reps?: number | null
          srs_state?: number | null
          stability?: number | null
          status?: string
          storage_path?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_cache_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_cache_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_cache_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_cache_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_pending: {
        Row: {
          confidence: number
          created_at: string | null
          created_entity_id: string | null
          document_id: string
          highlight_data: Json
          id: string
          reviewed_at: string | null
          source: string
          status: string
          suggested_match: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string | null
          created_entity_id?: string | null
          document_id: string
          highlight_data: Json
          id?: string
          reviewed_at?: string | null
          source: string
          status?: string
          suggested_match: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string | null
          created_entity_id?: string | null
          document_id?: string
          highlight_data?: Json
          id?: string
          reviewed_at?: string | null
          source?: string
          status?: string
          suggested_match?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_pending_created_entity_id_fkey"
            columns: ["created_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_pending_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      obsidian_sync_state: {
        Row: {
          conflict_state: string | null
          created_at: string | null
          document_id: string
          id: string
          last_sync_at: string | null
          last_sync_direction: string | null
          storage_hash: string | null
          storage_modified_at: string | null
          updated_at: string | null
          user_id: string
          vault_hash: string | null
          vault_modified_at: string | null
          vault_path: string
        }
        Insert: {
          conflict_state?: string | null
          created_at?: string | null
          document_id: string
          id?: string
          last_sync_at?: string | null
          last_sync_direction?: string | null
          storage_hash?: string | null
          storage_modified_at?: string | null
          updated_at?: string | null
          user_id: string
          vault_hash?: string | null
          vault_modified_at?: string | null
          vault_path: string
        }
        Update: {
          conflict_state?: string | null
          created_at?: string | null
          document_id?: string
          id?: string
          last_sync_at?: string | null
          last_sync_direction?: string | null
          storage_hash?: string | null
          storage_modified_at?: string | null
          updated_at?: string | null
          user_id?: string
          vault_hash?: string | null
          vault_modified_at?: string | null
          vault_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "obsidian_sync_state_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          is_system: boolean | null
          last_used_at: string | null
          name: string
          template: string
          updated_at: string
          usage_count: number
          user_id: string
          variables: string[]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          last_used_at?: string | null
          name: string
          template: string
          updated_at?: string
          usage_count?: number
          user_id: string
          variables?: string[]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          last_used_at?: string | null
          name?: string
          template?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
          variables?: string[]
        }
        Relationships: []
      }
      review_log: {
        Row: {
          ease_after: number | null
          ease_before: number | null
          entity_id: string | null
          id: string
          interval_after: number | null
          interval_before: number | null
          rating: number | null
          reviewed_at: string | null
          user_id: string | null
        }
        Insert: {
          ease_after?: number | null
          ease_before?: number | null
          entity_id?: string | null
          id?: string
          interval_after?: number | null
          interval_before?: number | null
          rating?: number | null
          reviewed_at?: string | null
          user_id?: string | null
        }
        Update: {
          ease_after?: number | null
          ease_before?: number | null
          entity_id?: string | null
          id?: string
          interval_after?: number | null
          interval_before?: number | null
          rating?: number | null
          reviewed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_log_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      sparks_cache: {
        Row: {
          annotation_refs: string[] | null
          cached_at: string | null
          connections: Json | null
          content: string
          created_at: string
          document_id: string | null
          embedding: string | null
          entity_id: string
          origin_chunk_id: string | null
          selections: Json | null
          storage_path: string
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          annotation_refs?: string[] | null
          cached_at?: string | null
          connections?: Json | null
          content: string
          created_at: string
          document_id?: string | null
          embedding?: string | null
          entity_id: string
          origin_chunk_id?: string | null
          selections?: Json | null
          storage_path: string
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          annotation_refs?: string[] | null
          cached_at?: string | null
          connections?: Json | null
          content?: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          entity_id?: string
          origin_chunk_id?: string | null
          selections?: Json | null
          storage_path?: string
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sparks_cache_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sparks_cache_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sparks_cache_origin_chunk_id_fkey"
            columns: ["origin_chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sparks_cache_origin_chunk_id_fkey"
            columns: ["origin_chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks_for_engines"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          average_time_per_card_ms: number | null
          cards_reviewed: number | null
          deck_id: string | null
          ended_at: string | null
          filters_applied: Json | null
          id: string
          ratings: Json | null
          started_at: string
          total_time_ms: number | null
          user_id: string
        }
        Insert: {
          average_time_per_card_ms?: number | null
          cards_reviewed?: number | null
          deck_id?: string | null
          ended_at?: string | null
          filters_applied?: Json | null
          id?: string
          ratings?: Json | null
          started_at: string
          total_time_ms?: number | null
          user_id: string
        }
        Update: {
          average_time_per_card_ms?: number | null
          cards_reviewed?: number | null
          deck_id?: string | null
          ended_at?: string | null
          filters_applied?: Json | null
          id?: string
          ratings?: Json | null
          started_at?: string
          total_time_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          custom_presets: Json | null
          default_chunker_type: string | null
          engine_weights: Json
          id: string
          last_modified: string
          normalization_method: string
          preset_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_presets?: Json | null
          default_chunker_type?: string | null
          engine_weights?: Json
          id?: string
          last_modified?: string
          normalization_method?: string
          preset_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          custom_presets?: Json | null
          default_chunker_type?: string | null
          engine_weights?: Json
          id?: string
          last_modified?: string
          normalization_method?: string
          preset_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          obsidian_settings: Json | null
          preferences: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          obsidian_settings?: Json | null
          preferences?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          obsidian_settings?: Json | null
          preferences?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      chunks_for_engines: {
        Row: {
          chunk_index: number | null
          concept_count: number | null
          conceptual_metadata: Json | null
          content: string | null
          created_at: string | null
          document_id: string | null
          domain_metadata: Json | null
          embedding: string | null
          emotional_metadata: Json | null
          emotional_polarity: number | null
          end_offset: number | null
          id: string | null
          importance_score: number | null
          metadata_extracted_at: string | null
          primary_domain: string | null
          primary_emotion: string | null
          start_offset: number | null
          summary: string | null
          themes: Json | null
          word_count: number | null
        }
        Insert: {
          chunk_index?: number | null
          concept_count?: never
          conceptual_metadata?: Json | null
          content?: string | null
          created_at?: string | null
          document_id?: string | null
          domain_metadata?: Json | null
          embedding?: string | null
          emotional_metadata?: Json | null
          emotional_polarity?: never
          end_offset?: number | null
          id?: string | null
          importance_score?: number | null
          metadata_extracted_at?: string | null
          primary_domain?: never
          primary_emotion?: never
          start_offset?: number | null
          summary?: string | null
          themes?: Json | null
          word_count?: number | null
        }
        Update: {
          chunk_index?: number | null
          concept_count?: never
          conceptual_metadata?: Json | null
          content?: string | null
          created_at?: string | null
          document_id?: string | null
          domain_metadata?: Json | null
          embedding?: string | null
          emotional_metadata?: Json | null
          emotional_polarity?: never
          end_offset?: number | null
          id?: string | null
          importance_score?: number | null
          metadata_extracted_at?: string | null
          primary_domain?: never
          primary_emotion?: never
          start_offset?: number | null
          summary?: string | null
          themes?: Json | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      count_connections_for_document: {
        Args: { doc_id: string }
        Returns: {
          total_connections: number
          validated_connections: number
        }[]
      }
      estimate_page_from_offset: {
        Args: { char_offset: number; doc_id: string }
        Returns: number
      }
      find_annotation_connections: {
        Args: { chunk_ids: string[] }
        Returns: {
          connection_type: string
          id: string
          source_chunk_id: string
          strength: number
          target_chunk_id: string
        }[]
      }
      find_annotations_in_range: {
        Args: { doc_id: string; end_offset: number; start_offset: number }
        Returns: {
          color: string
          end_pos: number
          entity_id: string
          note: string
          original_text: string
          start_pos: number
        }[]
      }
      get_chunk_detection_stats: {
        Args: { doc_id: string }
        Returns: {
          avg_connections_per_chunk: number
          detected_chunks: number
          detection_rate: number
          total_chunks: number
          undetected_chunks: number
        }[]
      }
      get_chunk_video_timestamp: {
        Args: { chunk_id: string }
        Returns: {
          has_video_link: boolean
          seconds: number
          video_url: string
        }[]
      }
      get_undetected_chunk_ids: {
        Args: { doc_id: string }
        Returns: {
          chunk_id: string
        }[]
      }
      get_user_preferences: {
        Args: { p_user_id: string }
        Returns: {
          custom_presets: Json
          engine_weights: Json
          id: string
          last_modified: string
          normalization_method: string
          preset_name: string
          user_id: string
        }[]
      }
      has_youtube_timestamps: { Args: { doc_id: string }; Returns: boolean }
      increment_prompt_usage: {
        Args: { prompt_id: string }
        Returns: undefined
      }
      match_chunks: {
        Args: {
          exclude_document_id?: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          similarity: number
          summary: string
          themes: Json
        }[]
      }
      rebuild_flashcards_cache: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      save_custom_preset: {
        Args: {
          p_preset_config: Json
          p_preset_name: string
          p_user_id: string
        }
        Returns: boolean
      }
      update_engine_weights: {
        Args: {
          p_normalization_method?: string
          p_preset_name?: string
          p_user_id: string
          p_weights: Json
        }
        Returns: Json
      }
      update_study_session: {
        Args: { p_rating: number; p_session_id: string; p_time_ms: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

