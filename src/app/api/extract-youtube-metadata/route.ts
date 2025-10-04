import { NextRequest } from 'next/server'
import type { DetectedMetadata, DocumentType } from '@/types/metadata'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * Extract metadata from YouTube videos using Data API v3.
 * Requires YOUTUBE_API_KEY environment variable.
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url) {
      return Response.json({ error: 'No URL provided' }, { status: 400 })
    }

    console.log('[extract-youtube-metadata] Fetching metadata for URL:', url)

    const videoId = extractVideoId(url)
    const metadata = await fetchYouTubeMetadata(videoId)

    const result: DetectedMetadata = {
      title: metadata.title,
      author: metadata.channelName,
      type: 'article' as DocumentType, // User will refine in preview
      year: new Date(metadata.publishedAt).getFullYear().toString(),
      description: metadata.description.slice(0, 200) +
                  (metadata.description.length > 200 ? '...' : ''),
      coverImage: metadata.thumbnail,
      language: 'en' // YouTube doesn't expose language in snippet
    }

    console.log('[extract-youtube-metadata] Extraction complete:', result.title)

    return Response.json(result)
  } catch (error) {
    console.error('[extract-youtube-metadata] Error:', error)

    // Check for quota errors (403 Forbidden)
    if (error instanceof Error &&
        (error.message.includes('quota') || error.message.includes('403'))) {
      return Response.json({
        error: 'YouTube API quota exceeded',
        fallback: true
      }, { status: 429 })
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch YouTube metadata' },
      { status: 500 }
    )
  }
}

/**
 * Extract video ID from various YouTube URL formats.
 * Supports: youtube.com/watch?v=, youtu.be/, embed/, v/, shorts/
 */
function extractVideoId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) {
      console.log('[extract-youtube-metadata] Extracted video ID:', match[1])
      return match[1]
    }
  }

  throw new Error('Invalid YouTube URL format')
}

/**
 * Fetch video metadata from YouTube Data API v3.
 * Uses YOUTUBE_API_KEY from environment.
 */
async function fetchYouTubeMetadata(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY not configured in environment')
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('id', videoId)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'snippet')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))

    if (response.status === 403) {
      throw new Error('YouTube API quota exceeded')
    }

    throw new Error(`YouTube API error: ${errorData.error?.message || response.statusText}`)
  }

  const data = await response.json()

  if (!data.items || data.items.length === 0) {
    throw new Error('Video not found or is private')
  }

  const snippet = data.items[0].snippet

  return {
    title: snippet.title,
    channelName: snippet.channelTitle,
    description: snippet.description || '',
    // Thumbnail priority: maxres > high > medium > default
    thumbnail: snippet.thumbnails.maxres?.url ||
               snippet.thumbnails.high?.url ||
               snippet.thumbnails.medium?.url ||
               snippet.thumbnails.default?.url,
    publishedAt: snippet.publishedAt
  }
}
