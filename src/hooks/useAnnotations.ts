/**
 * React hooks for annotation operations
 *
 * Provides hooks for creating, reading, updating, and deleting annotations
 * with automatic state management and re-fetching.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { ECS } from '@/lib/ecs/ecs';
import { AnnotationOperations } from '@/lib/ecs/annotations';
import { getCurrentUser, getSupabaseClient } from '@/lib/auth';
import type {
  AnnotationEntity,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from '@/lib/ecs/annotations';

// ============================================
// MAIN ANNOTATION HOOK
// ============================================

/**
 * Hook for managing annotations within a document.
 *
 * @param documentId - Document ID to fetch annotations for
 * @returns Annotation operations and state
 *
 * @example
 * ```typescript
 * const { annotations, isLoading, create, update, remove } = useAnnotations('doc-123');
 *
 * // Create annotation
 * await create({
 *   documentId: 'doc-123',
 *   startOffset: 100,
 *   endOffset: 200,
 *   originalText: 'Selected text',
 *   chunkId: 'chunk-456',
 *   chunkPosition: 0,
 *   type: 'highlight',
 *   color: 'yellow'
 * });
 * ```
 */
export const useAnnotations = (documentId: string) => {
  const [annotations, setAnnotations] = useState<AnnotationEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [ops, setOps] = useState<AnnotationOperations | null>(null);

  // Initialize AnnotationOperations
  useEffect(() => {
    async function init() {
      try {
        const user = await getCurrentUser();
        if (!user) {
          setError(new Error('Not authenticated'));
          setIsLoading(false);
          return;
        }

        const supabase = getSupabaseClient();
        const ecs = new ECS(supabase);
        const operations = new AnnotationOperations(ecs, user.id);
        setOps(operations);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    }

    init();
  }, []);

  // Fetch annotations
  const refresh = useCallback(async () => {
    if (!ops) return;

    try {
      setIsLoading(true);
      const data = await ops.getByDocument(documentId);
      setAnnotations(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [ops, documentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Create annotation
  const create = useCallback(
    async (input: CreateAnnotationInput) => {
      if (!ops) throw new Error('Not authenticated');

      const id = await ops.create(input);
      await refresh();
      return id;
    },
    [ops, refresh]
  );

  // Update annotation
  const update = useCallback(
    async (id: string, updates: UpdateAnnotationInput) => {
      if (!ops) throw new Error('Not authenticated');

      await ops.update(id, updates);
      await refresh();
    },
    [ops, refresh]
  );

  // Delete annotation
  const remove = useCallback(
    async (id: string) => {
      if (!ops) throw new Error('Not authenticated');

      await ops.delete(id);
      await refresh();
    },
    [ops, refresh]
  );

  // Mark as viewed
  const markViewed = useCallback(
    async (id: string) => {
      if (!ops) return;
      await ops.markViewed(id);
    },
    [ops]
  );

  // Search annotations
  const search = useCallback(
    async (query: string) => {
      if (!ops) return [];
      return await ops.search(documentId, query);
    },
    [ops, documentId]
  );

  return {
    annotations,
    isLoading,
    error,
    create,
    update,
    remove,
    markViewed,
    search,
    refresh,
  };
};

// ============================================
// VIEWPORT ANNOTATION HOOK
// ============================================

/**
 * Hook for fetching annotations visible in current viewport.
 * Optimized for reader views with scrolling.
 *
 * @param documentId - Document ID
 * @param startOffset - Start of visible range
 * @param endOffset - End of visible range
 * @returns Annotations in viewport
 *
 * @example
 * ```typescript
 * const { annotations, isLoading } = useViewportAnnotations(
 *   'doc-123',
 *   1000,  // Start of viewport
 *   5000   // End of viewport
 * );
 * ```
 */
export const useViewportAnnotations = (
  documentId: string,
  startOffset: number,
  endOffset: number
) => {
  const [annotations, setAnnotations] = useState<AnnotationEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [ops, setOps] = useState<AnnotationOperations | null>(null);

  // Initialize AnnotationOperations
  useEffect(() => {
    async function init() {
      try {
        const user = await getCurrentUser();
        if (!user) return;

        const supabase = getSupabaseClient();
        const ecs = new ECS(supabase);
        const operations = new AnnotationOperations(ecs, user.id);
        setOps(operations);
      } catch (err) {
        console.error('Failed to initialize AnnotationOperations:', err);
      }
    }

    init();
  }, []);

  // Fetch annotations in range
  useEffect(() => {
    if (!ops) return;

    const fetchInRange = async () => {
      setIsLoading(true);
      try {
        const data = await ops.getInRange(documentId, startOffset, endOffset);
        setAnnotations(data);
      } catch (err) {
        console.error('Failed to fetch viewport annotations:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInRange();
  }, [ops, documentId, startOffset, endOffset]);

  return { annotations, isLoading };
};

// ============================================
// PAGE ANNOTATION HOOK
// ============================================

/**
 * Hook for fetching annotations on a specific page.
 * Useful for page-based navigation.
 *
 * @param documentId - Document ID
 * @param pageLabel - Page label (e.g., "42", "iv", "A-3")
 * @returns Annotations on this page
 *
 * @example
 * ```typescript
 * const { annotations, isLoading } = usePageAnnotations('doc-123', '42');
 * ```
 */
export const usePageAnnotations = (
  documentId: string,
  pageLabel: string | null
) => {
  const [annotations, setAnnotations] = useState<AnnotationEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [ops, setOps] = useState<AnnotationOperations | null>(null);

  // Initialize AnnotationOperations
  useEffect(() => {
    async function init() {
      try {
        const user = await getCurrentUser();
        if (!user) return;

        const supabase = getSupabaseClient();
        const ecs = new ECS(supabase);
        const operations = new AnnotationOperations(ecs, user.id);
        setOps(operations);
      } catch (err) {
        console.error('Failed to initialize AnnotationOperations:', err);
      }
    }

    init();
  }, []);

  // Fetch annotations by page
  useEffect(() => {
    if (!ops || !pageLabel) {
      setAnnotations([]);
      return;
    }

    const fetchByPage = async () => {
      setIsLoading(true);
      try {
        const data = await ops.getByPage(documentId, pageLabel);
        setAnnotations(data);
      } catch (err) {
        console.error('Failed to fetch page annotations:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchByPage();
  }, [ops, documentId, pageLabel]);

  return { annotations, isLoading };
};
