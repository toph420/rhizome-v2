/**
 * Test page for Phase 1: Annotation System
 *
 * Tests:
 * - Creating annotations
 * - Listing annotations
 * - Displaying component data
 * - Deleting annotations
 * - Page labels
 * - Persistence across refresh
 */

'use client';

import { useState } from 'react';
import { useAnnotations } from '@/hooks/useAnnotations';

export default function TestAnnotationsPage() {
  // Use a valid UUID for testing (hardcoded test document)
  const [testDocId] = useState('00000000-0000-0000-0000-000000000001');
  const { annotations, isLoading, create, remove, error } = useAnnotations(testDocId);

  const handleCreateTest = async () => {
    try {
      await create({
        documentId: testDocId,
        startOffset: 100,
        endOffset: 200,
        originalText: 'This is test highlight text that demonstrates annotation functionality',
        chunkId: '00000000-0000-0000-0000-000000000100', // Valid UUID
        chunkPosition: 0,
        type: 'highlight',
        color: 'yellow',
        note: 'Test annotation created from Phase 1 test page',
        tags: ['test', 'phase-1'],
        pageLabel: '42',
      });
      console.log('✅ Created test annotation');
    } catch (err) {
      console.error('❌ Failed to create annotation:', err);
      alert(`Failed to create annotation: ${(err as Error).message}`);
    }
  };

  const handleCreateMultiple = async () => {
    const colors: Array<'yellow' | 'green' | 'blue' | 'red' | 'purple'> = [
      'yellow', 'green', 'blue', 'red', 'purple'
    ];

    try {
      for (let i = 0; i < 5; i++) {
        await create({
          documentId: testDocId,
          startOffset: 300 + (i * 100),
          endOffset: 400 + (i * 100),
          originalText: `Sample text ${i + 1}`,
          chunkId: `00000000-0000-0000-0000-00000000010${i}`, // Valid UUID
          chunkPosition: i,
          type: 'highlight',
          color: colors[i],
          note: `Note ${i + 1}`,
          tags: ['batch-test'],
          pageLabel: `${43 + i}`,
        });
      }
      console.log('✅ Created 5 test annotations');
    } catch (err) {
      console.error('❌ Failed to create batch annotations:', err);
      alert(`Failed to create batch: ${(err as Error).message}`);
    }
  };

  if (isLoading && annotations.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-medium">Loading annotations...</div>
          <div className="text-sm text-gray-500 mt-2">Test Document ID: {testDocId}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-red-600">
          <div className="text-lg font-bold">Error</div>
          <div className="text-sm mt-2">{error.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">Phase 1: Annotation System Test</h1>
          <p className="text-gray-600 mb-4">
            Testing ECS-based annotation CRUD operations
          </p>
          <div className="bg-gray-100 p-3 rounded space-y-1">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">Test Document:</span>{' '}
              <span className="font-mono">{testDocId}</span>
            </div>
            <div className="text-sm text-gray-700">
              <span className="font-semibold">Title:</span> Test Document for Annotations
            </div>
            <div className="text-sm text-gray-700">
              <span className="font-semibold">Chunks:</span> 5 test chunks (IDs ending in 100-104)
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Actions</h2>
          <div className="flex gap-3">
            <button
              onClick={handleCreateTest}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              Create Test Annotation
            </button>
            <button
              onClick={handleCreateMultiple}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              Create 5 Annotations
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Annotations ({annotations.length})
            </h2>
            {isLoading && (
              <span className="text-sm text-gray-500">Refreshing...</span>
            )}
          </div>

          {annotations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">No annotations yet</p>
              <p className="text-sm">Click "Create Test Annotation" to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {annotations.map((ann) => {
                const pos = ann.components?.Position;
                const visual = ann.components?.Visual;
                const content = ann.components?.Content;
                const temporal = ann.components?.Temporal;
                const chunkRef = ann.components?.ChunkRef;

                // Skip if components are missing
                if (!pos || !visual || !content || !temporal || !chunkRef) {
                  console.warn('Annotation missing components:', ann.id, ann.components);
                  return null;
                }

                return (
                  <div
                    key={ann.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="font-mono text-xs text-gray-500 mb-2">
                          {ann.id}
                        </div>

                        {/* Position */}
                        <div className="mb-2">
                          <div className="text-sm font-medium text-gray-700">
                            Offset: {pos.startOffset} → {pos.endOffset}
                            {pos.pageLabel && (
                              <span className="ml-2 text-blue-600 font-semibold">
                                Page: {pos.pageLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mt-1 italic">
                            "{pos.originalText}"
                          </div>
                        </div>

                        {/* Visual */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium capitalize">
                            {visual.type}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: visual.color === 'yellow' ? '#fef3c7' :
                                               visual.color === 'green' ? '#d1fae5' :
                                               visual.color === 'blue' ? '#dbeafe' :
                                               visual.color === 'red' ? '#fee2e2' :
                                               visual.color === 'purple' ? '#f3e8ff' :
                                               visual.color === 'orange' ? '#fed7aa' :
                                               '#fce7f3',
                              color: visual.color === 'yellow' ? '#92400e' :
                                     visual.color === 'green' ? '#065f46' :
                                     visual.color === 'blue' ? '#1e40af' :
                                     visual.color === 'red' ? '#991b1b' :
                                     visual.color === 'purple' ? '#6b21a8' :
                                     visual.color === 'orange' ? '#9a3412' :
                                     '#831843',
                            }}
                          >
                            {visual.color}
                          </span>
                        </div>

                        {/* Content */}
                        {content.note && (
                          <div className="bg-gray-50 p-2 rounded text-sm mb-2">
                            {content.note}
                          </div>
                        )}
                        {content.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {content.tags.map((tag) => (
                              <span
                                key={tag}
                                className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Temporal */}
                        <div className="text-xs text-gray-500">
                          Created: {new Date(temporal.createdAt).toLocaleString()}
                          {temporal.lastViewedAt && (
                            <span className="ml-3">
                              Viewed: {new Date(temporal.lastViewedAt).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {/* ChunkRef */}
                        <div className="text-xs text-gray-500 mt-1 font-mono">
                          Chunk: {chunkRef.chunkId} (pos: {chunkRef.chunkPosition})
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => remove(ann.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium ml-4"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Test Checklist */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h3 className="font-semibold text-blue-900 mb-3">✓ Test Checklist</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>□ Click "Create Test Annotation" → annotation appears</li>
            <li>□ Page label shows "Page: 42"</li>
            <li>□ Note and tags display correctly</li>
            <li>□ Color/type display correctly</li>
            <li>□ Refresh page (⌘R) → annotations persist</li>
            <li>□ Click "Delete" → annotation disappears</li>
            <li>□ Check database: <code className="bg-blue-100 px-1 rounded">SELECT * FROM entities</code></li>
            <li>□ Check components: <code className="bg-blue-100 px-1 rounded">SELECT * FROM components</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
