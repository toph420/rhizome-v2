'use client'

import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure PDF.js worker - use local file from public/ (copied by scripts)
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

interface ThumbnailsTabProps {
  fileUrl?: string
  numPages?: number
  currentPage?: number
  onPageNavigate?: (page: number) => void
}

export function ThumbnailsTab({
  fileUrl,
  numPages,
  currentPage,
  onPageNavigate,
}: ThumbnailsTabProps) {
  if (!fileUrl || !numPages || numPages === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          No pages available.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <Document file={fileUrl}>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
            const isCurrentPage = pageNum === currentPage

            return (
              <button
                key={pageNum}
                onClick={() => onPageNavigate?.(pageNum)}
                className={`border-2 rounded overflow-hidden transition-all ${
                  isCurrentPage
                    ? 'border-blue-600 ring-2 ring-blue-200'
                    : 'border-gray-300 hover:border-blue-400'
                }`}
              >
                <Page
                  pageNumber={pageNum}
                  width={120}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
                <div className="p-1 text-xs text-center bg-gray-100 dark:bg-gray-800">
                  Page {pageNum}
                </div>
              </button>
            )
          })}
        </div>
      </Document>
    </div>
  )
}
