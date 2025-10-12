/**
 * Zotero Import Button Component
 * 
 * Add this to your document viewer/settings page
 * Opens modal to enter Zotero item key and trigger import
 */

import React, { useState } from 'react'
import { BookMarked, Check, AlertTriangle, X } from 'lucide-react'

interface ZoteroImportButtonProps {
  documentId: string
  onImportComplete?: () => void
}

export function ZoteroImportButton({ documentId, onImportComplete }: ZoteroImportButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [zoteroItemKey, setZoteroItemKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{
    imported: number
    needsReview: number
    failed: number
    reviewItems: Array<{ text: string; confidence: number }>
    failedItems: Array<{ text: string; reason: string }>
  } | null>(null)

  const handleImport = async () => {
    if (!zoteroItemKey.trim()) return

    setLoading(true)
    setResults(null)

    try {
      const response = await fetch(`/api/documents/${documentId}/import-zotero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoteroItemKey: zoteroItemKey.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Import failed')
      }

      setResults(data.results)
      
      if (onImportComplete) {
        onImportComplete()
      }
    } catch (error) {
      console.error('Zotero import failed:', error)
      alert(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        <BookMarked className="h-4 w-4" />
        Import from Zotero
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !loading && setShowModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl p-6 w-[600px] max-h-[80vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Import Zotero Annotations</h2>
              <button
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!results ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Zotero Item Key
                  </label>
                  <input
                    type="text"
                    value={zoteroItemKey}
                    onChange={e => setZoteroItemKey(e.target.value)}
                    placeholder="e.g., ABC123XYZ"
                    disabled={loading}
                    className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Find this in Zotero: right-click item → Copy Item Link → use the last part of the URL
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-sm">
                  <p className="font-medium mb-1">How this works:</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-700">
                    <li>Fetches all highlights from your Zotero item</li>
                    <li>Tries exact text matching first</li>
                    <li>Falls back to fuzzy matching if needed</li>
                    <li>Creates annotations in Rhizome</li>
                  </ol>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowModal(false)}
                    disabled={loading}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={loading || !zoteroItemKey.trim()}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Importing...' : 'Import Annotations'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded">
                    <Check className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">
                        {results.imported} annotations imported
                      </p>
                      <p className="text-sm text-green-700">
                        Successfully matched and created
                      </p>
                    </div>
                  </div>

                  {results.needsReview > 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <div className="flex items-center gap-3 mb-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                        <p className="font-medium text-yellow-900">
                          {results.needsReview} need manual review
                        </p>
                      </div>
                      <p className="text-sm text-yellow-700 mb-2">
                        Fuzzy matches with confidence 70-100%. Check import_pending table to review.
                      </p>
                      <div className="space-y-2 max-h-48 overflow-auto">
                        {results.reviewItems.map((item, i) => (
                          <div key={i} className="text-xs bg-white p-2 rounded border">
                            <p className="font-mono text-gray-600 mb-1">
                              "{item.text}..."
                            </p>
                            <p className="text-yellow-700">
                              Confidence: {(item.confidence * 100).toFixed(0)}%
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.failed > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded">
                      <div className="flex items-center gap-3 mb-2">
                        <X className="h-5 w-5 text-red-600" />
                        <p className="font-medium text-red-900">
                          {results.failed} failed to import
                        </p>
                      </div>
                      <p className="text-sm text-red-700 mb-2">
                        No matching text found in document
                      </p>
                      <div className="space-y-2 max-h-48 overflow-auto">
                        {results.failedItems.map((item, i) => (
                          <div key={i} className="text-xs bg-white p-2 rounded border">
                            <p className="font-mono text-gray-600 mb-1">
                              "{item.text}..."
                            </p>
                            <p className="text-red-700">
                              {item.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setShowModal(false)
                    setResults(null)
                    setZoteroItemKey('')
                  }}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Example usage in your document viewer:
 * 
 * import { ZoteroImportButton } from '@/components/ZoteroImportButton'
 * 
 * <div className="document-toolbar">
 *   <ZoteroImportButton 
 *     documentId={documentId}
 *     onImportComplete={() => {
 *       // Refresh annotations list
 *       refetch()
 *     }}
 *   />
 * </div>
 */