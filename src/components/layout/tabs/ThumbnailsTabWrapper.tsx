'use client'

import dynamic from 'next/dynamic'

// Lazy load ThumbnailsTab only when tab is active
export const ThumbnailsTab = dynamic(
  () => import('./ThumbnailsTab').then(mod => ({ default: mod.ThumbnailsTab })),
  {
    ssr: false,
    loading: () => (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading thumbnails...</p>
      </div>
    ),
  }
)
