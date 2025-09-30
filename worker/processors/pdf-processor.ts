/**
 * PDF processor for document extraction using Gemini Files API.
 * Handles PDF upload, extraction, chunking, and metadata generation.
 */

import { Type } from '@google/genai'
import { jsonrepair } from 'jsonrepair'
import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { simpleMarkdownChunking } from '../lib/markdown-chunking.js'
import { GeminiFileCache } from '../lib/gemini-cache.js'

// Model configuration
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
const MAX_OUTPUT_TOKENS = 65536

/**
 * Extraction prompt for PDF processing.
 * Instructs Gemini to extract full text and create semantic chunks.
 */
const EXTRACTION_PROMPT = `
You are a PDF extraction assistant. Your task is to:
1. Extract ALL text from this PDF document and convert it to clean markdown format
2. Break the content into logical chunks for semantic search (200-500 words each)
3. Return the result as JSON

IMPORTANT: Read the ENTIRE PDF document. Extract ALL pages, ALL paragraphs, ALL text.
Do not summarize or skip any content. The markdown field should contain the COMPLETE document text.

For the chunks, break the document at natural boundaries like:
- Section headings
- Topic changes  
- Paragraph groups that discuss the same concept

Return JSON in this exact format:
{
  "markdown": "The complete document text in markdown format with proper headings, lists, etc",
  "chunks": [
    {
      "content": "A logical section of the document (200-500 words)",
      "themes": ["main topic 1", "main topic 2"],
      "importance_score": 0.7,
      "summary": "One sentence describing this chunk"
    }
  ]
}

Rules:
- The markdown field MUST contain the FULL document text
- Each chunk should be a meaningful unit of content
- importance_score is 0.0 to 1.0 (higher = more important)
- Return valid JSON without any markdown code blocks
`

/**
 * JSON schema for extraction response validation.
 */
const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    markdown: { type: Type.STRING },
    chunks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING },
          themes: { type: Type.ARRAY, items: { type: Type.STRING }},
          importance_score: { type: Type.NUMBER },
          summary: { type: Type.STRING }
        },
        required: ['content', 'themes', 'importance_score', 'summary']
      }
    }
  },
  required: ['markdown', 'chunks']
}

/**
 * PDF processor for extracting content using Gemini Files API.
 * Handles large PDFs by uploading to Gemini's file storage.
 * 
 * @example
 * const processor = new PDFProcessor(ai, supabase, job)
 * const result = await processor.process()
 */
export class PDFProcessor extends SourceProcessor {
  /**
   * Process PDF document through Gemini Files API.
   * 
   * @returns Processed result with markdown and chunks
   * @throws Error if PDF processing fails
   */
  async process(): Promise<ProcessResult> {
    const storagePath = this.getStoragePath()
    
    // Stage 1: Download PDF from storage
    await this.updateProgress(10, 'download', 'fetching', 'Retrieving PDF from storage')
    
    const { data: signedUrlData } = await this.supabase.storage
      .from('documents')
      .createSignedUrl(`${storagePath}/source.pdf`, 3600)
    
    if (!signedUrlData?.signedUrl) {
      throw new Error('Failed to create signed URL for PDF')
    }
    
    const fileResponse = await fetch(signedUrlData.signedUrl)
    const fileBuffer = await fileResponse.arrayBuffer()
    
    const fileSizeKB = Math.round(fileBuffer.byteLength / 1024)
    const fileSizeMB = fileBuffer.byteLength / (1024 * 1024)
    
    await this.updateProgress(12, 'download', 'complete', `Downloaded ${fileSizeKB} KB file`)
    
    // Stage 2: Upload to Gemini Files API (with caching)
    await this.updateProgress(15, 'extract', 'uploading', `Processing ${fileSizeKB} KB PDF with Gemini`)
    
    const uploadStart = Date.now()
    const cache = GeminiFileCache.getInstance()
    
    // Use cache to avoid re-uploading same PDFs
    const fileUri = await cache.getOrUpload(
      fileBuffer,
      async (buffer) => {
        const pdfBlob = new Blob([buffer], { type: 'application/pdf' })
        return await this.withRetry(
          async () => {
            return await this.ai.files.upload({
              file: pdfBlob,
              config: { mimeType: 'application/pdf' }
            })
          },
          'PDF upload to Gemini'
        )
      }
    )
    
    const uploadTime = Math.round((Date.now() - uploadStart) / 1000)
    await this.updateProgress(20, 'extract', 'validating', `Processing time: ${uploadTime}s, validating file...`)
    
    // Stage 3: Wait for file to become active (only if it's a fresh upload)
    // Cached files are already active
    if (uploadTime > 1) {
      await this.waitForFileActive(fileUri)
    }
    
    // Stage 4: Generate content with structured output
    const estimatedTime = fileSizeMB < 1 ? '1-2 min' : fileSizeMB < 5 ? '2-5 min' : '5-10 min'
    await this.updateProgress(25, 'extract', 'analyzing', `AI analyzing document (~${estimatedTime})...`)
    
    const result = await this.extractContent({ uri: fileUri, name: fileUri })
    
    // Stage 5: Parse and validate response
    const { markdown, chunks } = await this.parseExtractionResult(result)
    
    const markdownKB = Math.round(markdown.length / 1024)
    await this.updateProgress(40, 'extract', 'complete', `Extracted ${chunks.length} chunks (${markdownKB} KB)`)
    
    // Calculate additional metadata
    const wordCount = markdown.split(/\s+/).filter(word => word.length > 0).length
    const outline = this.extractOutline(markdown)
    
    // Stage 6: Enrich chunks with metadata extraction
    await this.updateProgress(85, 'finalize', 'metadata', 'Extracting metadata for collision detection')
    const enrichedChunks = await this.enrichChunksWithMetadata(chunks.map((chunk, index) => ({
      document_id: this.job.document_id,
      content: chunk.content,
      chunk_index: index,
      themes: chunk.themes,
      importance_score: chunk.importance || 0.5,
      summary: chunk.summary
    })))
    
    // Stage 7: Prepare final result
    await this.updateProgress(90, 'finalize', 'complete', 'Processing complete')
    
    // Return complete ProcessResult for handler to save
    return {
      markdown,
      chunks: enrichedChunks,
      metadata: {
        sourceUrl: this.job.metadata?.source_url
      },
      wordCount,
      outline
    }
  }

  /**
   * Wait for uploaded file to become active in Gemini.
   * 
   * @param fileName - Name of uploaded file
   * @throws Error if file validation fails
   */
  private async waitForFileActive(fileName: string): Promise<void> {
    let fileState = await this.ai.files.get({ name: fileName })
    let attempts = 0
    const maxAttempts = 30 // 60 seconds max
    
    while (fileState.state === 'PROCESSING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      fileState = await this.ai.files.get({ name: fileName })
      attempts++
      
      if (attempts % 5 === 0) {
        await this.updateProgress(20, 'extract', 'validating', `Validating file... (${attempts * 2}s)`)
      }
    }
    
    if (fileState.state !== 'ACTIVE') {
      throw new Error('File validation failed. The file may be corrupted or in an unsupported format.')
    }
  }

  /**
   * Extract content from uploaded PDF using Gemini.
   * 
   * @param uploadedFile - File uploaded to Gemini
   * @returns Raw extraction result from AI
   */
  private async extractContent(uploadedFile: any): Promise<any> {
    const generateStart = Date.now()
    const GENERATION_TIMEOUT = 12 * 60 * 1000 // 12 minutes
    
    // Update progress periodically during generation
    const progressInterval = setInterval(async () => {
      const elapsed = Math.round((Date.now() - generateStart) / 1000)
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
      await this.updateProgress(30, 'extract', 'analyzing', `Still analyzing... (${timeStr} elapsed)`)
    }, 30000)
    
    try {
      // Determine if model supports structured output
      // gemini-2.0-flash-exp and gemini-2.0-flash both support structured output
      const useStructuredOutput = GEMINI_MODEL.includes('2.5') || GEMINI_MODEL.includes('gemini-2.0-flash')
      
      const generationConfig = useStructuredOutput ? {
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.1,
      } : {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.1,
      }
      
      const generationPromise = this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          parts: [
            { fileData: { fileUri: uploadedFile.uri || uploadedFile.name, mimeType: 'application/pdf' } },
            { text: EXTRACTION_PROMPT + (useStructuredOutput ? '' : '\n\nIMPORTANT: Return your response as valid JSON matching this structure: {"markdown": "...", "chunks": [{"content": "...", "themes": [...], "importance_score": 0.0-1.0, "summary": "..."}]}') }
          ]
        }],
        config: generationConfig
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => {
          reject(new Error('Analysis timeout after 12 minutes. PDF may be too complex. Try splitting into smaller documents.'))
        }, GENERATION_TIMEOUT)
      )
      
      return await Promise.race([generationPromise, timeoutPromise])
    } finally {
      clearInterval(progressInterval)
    }
  }

  /**
   * Parse and validate extraction result from Gemini.
   * 
   * @param result - Raw result from Gemini
   * @returns Parsed markdown and chunks
   */
  private async parseExtractionResult(result: any): Promise<{ markdown: string; chunks: ProcessedChunk[] }> {
    if (!result || !result.text) {
      throw new Error('AI returned empty response. Please try again.')
    }
    
    let extracted: any
    
    try {
      // Strip markdown code blocks if present
      let jsonText = result.text
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '')
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
      }
      
      extracted = JSON.parse(jsonText)
    } catch (parseError: any) {
      // Try to repair JSON
      try {
        const textToRepair = result.text
          .replace(/^```json\s*\n?/, '')
          .replace(/\n?```\s*$/, '')
          .replace(/^```\s*\n?/, '')
        
        const repairedJson = this.repairJson(textToRepair)
        extracted = JSON.parse(repairedJson)
      } catch (repairError: any) {
        throw new Error(
          `Unable to process this PDF due to complex formatting issues.\n\n` +
          `Suggestions to resolve:\n` +
          `1. Try uploading a smaller section of the PDF (split into parts)\n` +
          `2. Convert the PDF to plain text first using an external tool\n` +
          `3. If the PDF contains tables or complex layouts, consider extracting text content only`
        )
      }
    }
    
    // Validate response structure
    if (!extracted.markdown || !Array.isArray(extracted.chunks)) {
      // Try to salvage what we can
      if (extracted.markdown && (!extracted.chunks || extracted.chunks.length === 0)) {
        // Fall back to simple chunking
        const chunks = simpleMarkdownChunking(extracted.markdown)
        return { 
          markdown: extracted.markdown, 
          chunks: chunks.map(chunk => ({
            content: chunk.content,
            themes: ['general'],
            importance: 5,
            summary: chunk.content.slice(0, 100) + '...'
          }))
        }
      }
      
      throw new Error('AI response missing required fields (markdown or chunks). Please try again.')
    }
    
    return {
      markdown: extracted.markdown,
      chunks: extracted.chunks.map((chunk: any) => ({
        content: chunk.content,
        themes: chunk.themes || ['general'],
        importance: chunk.importance_score || 0.5,
        summary: chunk.summary || chunk.content.slice(0, 100) + '...'
      }))
    }
  }

  /**
   * Repair common JSON formatting issues.
   * 
   * @param jsonString - Potentially malformed JSON
   * @returns Repaired JSON string
   */
  private repairJson(jsonString: string): string {
    try {
      return jsonrepair(jsonString)
    } catch (error) {
      // Manual fallback repairs
      let repaired = jsonString
        .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
        .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
        .replace(/([^"\\])\\n/g, '$1\\\\n')  // Fix unescaped newlines
        .replace(/([^"\\])\\t/g, '$1\\\\t')  // Fix unescaped tabs
        .replace(/([^"\\])\\/g, '$1\\\\')    // Fix unescaped backslashes
      
      return repaired
    }
  }

  /**
   * Extract document outline from markdown.
   * 
   * @param markdown - Processed markdown content
   * @returns Hierarchical outline structure
   */
  private extractOutline(markdown: string): any[] {
    const lines = markdown.split('\n')
    const outline: any[] = []
    const stack: any[] = []
    let offset = 0
    
    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const title = headingMatch[2].trim()
        
        const section = {
          title,
          level,
          offset,
          children: []
        }
        
        // Find parent level
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop()
        }
        
        if (stack.length === 0) {
          outline.push(section)
        } else {
          stack[stack.length - 1].children.push(section)
        }
        
        stack.push(section)
      }
      
      offset += line.length + 1 // +1 for newline
    }
    
    return outline
  }
}