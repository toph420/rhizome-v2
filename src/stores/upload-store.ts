import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChunkerType } from '@/types/chunker'
import type { DetectedMetadata } from '@/types/metadata'

type TabType = 'file' | 'url' | 'paste'
type UploadPhase = 'idle' | 'detecting' | 'preview' | 'uploading' | 'complete'
type ReviewWorkflow = 'none' | 'after_extraction' | 'after_cleanup'

interface CostEstimate {
  tokens: number
  cost: number
  estimatedTime: number
}

interface UploadState {
  // Upload flow state
  activeTab: TabType
  uploadPhase: UploadPhase
  uploadSource: 'file' | 'url' | 'paste' | null

  // File upload
  selectedFile: File | null
  isDragging: boolean

  // URL upload
  urlInput: string
  urlType: 'youtube' | 'web_url' | null

  // Paste upload
  pastedContent: string
  pasteSourceUrl: string

  // Shared upload state
  detectedMetadata: DetectedMetadata | null
  costEstimate: CostEstimate | null
  reviewWorkflow: ReviewWorkflow
  markdownProcessing: 'asis' | 'clean'

  // Document processing options
  cleanMarkdown: boolean
  extractImages: boolean
  chunkerType: ChunkerType
  enrichChunks: boolean
  detectConnections: boolean

  // Progress
  isUploading: boolean
  error: string | null

  // Actions
  setActiveTab: (tab: TabType) => void
  setUploadPhase: (phase: UploadPhase) => void
  setUploadSource: (source: 'file' | 'url' | 'paste' | null) => void
  setSelectedFile: (file: File | null) => void
  setIsDragging: (dragging: boolean) => void
  setUrlInput: (url: string) => void
  setUrlType: (type: 'youtube' | 'web_url' | null) => void
  setPastedContent: (content: string) => void
  setPasteSourceUrl: (url: string) => void
  setDetectedMetadata: (metadata: DetectedMetadata | null) => void
  setCostEstimate: (estimate: CostEstimate | null) => void
  setReviewWorkflow: (workflow: ReviewWorkflow) => void
  setMarkdownProcessing: (processing: 'asis' | 'clean') => void
  setCleanMarkdown: (clean: boolean) => void
  setExtractImages: (extract: boolean) => void
  setChunkerType: (type: ChunkerType) => void
  setEnrichChunks: (enrich: boolean) => void
  setDetectConnections: (detect: boolean) => void
  setIsUploading: (uploading: boolean) => void
  setError: (error: string | null) => void
  resetUpload: () => void
}

export const useUploadStore = create<UploadState>()(
  persist(
    (set) => ({
      // Initial state
      activeTab: 'file',
      uploadPhase: 'idle',
      uploadSource: null,
      selectedFile: null,
      isDragging: false,
      urlInput: '',
      urlType: null,
      pastedContent: '',
      pasteSourceUrl: '',
      detectedMetadata: null,
      costEstimate: null,
      reviewWorkflow: 'none',
      markdownProcessing: 'asis',
      cleanMarkdown: true,
      extractImages: false,
      chunkerType: 'recursive',
      enrichChunks: false,  // Default: skip enrichment (user can enable via checkbox)
      detectConnections: false,
      isUploading: false,
      error: null,

      // Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setUploadPhase: (phase) => set({ uploadPhase: phase }),
      setUploadSource: (source) => set({ uploadSource: source }),
      setSelectedFile: (file) => set({ selectedFile: file }),
      setIsDragging: (dragging) => set({ isDragging: dragging }),
      setUrlInput: (url) => set({ urlInput: url }),
      setUrlType: (type) => set({ urlType: type }),
      setPastedContent: (content) => set({ pastedContent: content }),
      setPasteSourceUrl: (url) => set({ pasteSourceUrl: url }),
      setDetectedMetadata: (metadata) => set({ detectedMetadata: metadata }),
      setCostEstimate: (estimate) => set({ costEstimate: estimate }),
      setReviewWorkflow: (workflow) => set({ reviewWorkflow: workflow }),
      setMarkdownProcessing: (processing) => set({ markdownProcessing: processing }),
      setCleanMarkdown: (clean) => set({ cleanMarkdown: clean }),
      setExtractImages: (extract) => set({ extractImages: extract }),
      setChunkerType: (type) => set({ chunkerType: type }),
      setEnrichChunks: (enrich) => set({ enrichChunks: enrich }),
      setDetectConnections: (detect) => set({ detectConnections: detect }),
      setIsUploading: (uploading) => set({ isUploading: uploading }),
      setError: (error) => set({ error }),
      resetUpload: () => set({
        uploadPhase: 'idle',
        uploadSource: null,
        selectedFile: null,
        isDragging: false,
        urlInput: '',
        urlType: null,
        pastedContent: '',
        pasteSourceUrl: '',
        detectedMetadata: null,
        costEstimate: null,
        isUploading: false,
        error: null,
      }),
    }),
    {
      name: 'upload-storage',
      partialize: (state) => ({
        reviewWorkflow: state.reviewWorkflow,
        markdownProcessing: state.markdownProcessing,
        cleanMarkdown: state.cleanMarkdown,
        extractImages: state.extractImages,
        chunkerType: state.chunkerType,
        enrichChunks: state.enrichChunks,
        detectConnections: state.detectConnections,
      }),
    }
  )
)
