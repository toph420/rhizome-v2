import { GoogleGenAI, Type } from '@google/genai'
import { getUserFriendlyError, classifyError } from '../lib/errors.js'
import { jsonrepair } from 'jsonrepair'
import { extractVideoId, fetchTranscriptWithRetry, formatTranscriptToMarkdown } from '../lib/youtube.js'
import { extractArticle, isValidUrl } from '../lib/web-extraction.js'
import { simpleMarkdownChunking, extractTimestampsWithContext } from '../lib/markdown-chunking.js'
import type { SourceType, TimestampContext } from '../types/multi-format.js'

const STAGES = {
  DOWNLOAD: { name: 'download', percent: 10 },
  EXTRACT: { name: 'extract', percent: 30 },
  SAVE_MARKDOWN: { name: 'save_markdown', percent: 50 },
  EMBED: { name: 'embed', percent: 99 },
  COMPLETE: { name: 'complete', percent: 100 }
}

interface ChunkData {
  content: string
  themes: string[]
  importance_score: number
  summary: string
  timestamps?: TimestampContext[]
}

interface ExtractionResponse {
  markdown: string
  chunks: ChunkData[]
}

export async function processDocumentHandler(supabase: any, job: any) {
  const { document_id } = job.input_data
  
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY is not configured')
  }
  
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GOOGLE_AI_API_KEY,
    httpOptions: {
      timeout: 600000 // 10 minutes for HTTP-level timeout
    }
  })

  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path, user_id')
    .eq('id', document_id)
    .single()

  const storagePath = doc.storage_path

  try {
    const completedStages = job.progress?.completed_stages || []
    let markdown: string
    let chunks: ChunkData[]

    if (!completedStages.includes(STAGES.SAVE_MARKDOWN.name)) {
      // Get source metadata from job input
      const sourceType = (job.input_data.source_type as SourceType) || 'pdf'
      const sourceUrl = job.input_data.source_url as string | undefined
      const processingRequested = (job.input_data.processing_requested as boolean) ?? true
      const pastedContent = job.input_data.pasted_content as string | undefined

      // Route by source type
      switch (sourceType) {
        case 'youtube': {
          await updateProgress(supabase, job.id, 10, 'download', 'fetching', 'Fetching YouTube transcript')
          
          if (!sourceUrl) {
            throw new Error('Source URL required for YouTube processing')
          }
          
          const videoId = extractVideoId(sourceUrl)
          if (!videoId) {
            throw new Error('YOUTUBE_INVALID_ID: Invalid YouTube URL format')
          }
          
          const transcript = await fetchTranscriptWithRetry(videoId)
          markdown = formatTranscriptToMarkdown(transcript, sourceUrl)
          
          await updateProgress(supabase, job.id, 30, 'extract', 'chunking', 'Creating semantic chunks')
          chunks = await rechunkMarkdown(ai, markdown)
          
          // Extract timestamps from chunks for YouTube videos
          for (const chunk of chunks) {
            const timestamps = extractTimestampsWithContext(chunk.content)
            if (timestamps.length > 0) {
              // Store timestamps in chunk metadata (will be added to DB later)
              ;(chunk as any).timestamps = timestamps
            }
          }
          
          await updateProgress(supabase, job.id, 45, 'extract', 'complete', `Created ${chunks.length} chunks with timestamps`)
          break
        }
        
        case 'web_url': {
          await updateProgress(supabase, job.id, 10, 'download', 'fetching', 'Fetching web article')
          
          if (!sourceUrl) {
            throw new Error('Source URL required for web article processing')
          }
          
          if (!isValidUrl(sourceUrl)) {
            throw new Error('WEB_INVALID_URL: Invalid web URL format')
          }
          
          const article = await extractArticle(sourceUrl)
          
          await updateProgress(supabase, job.id, 25, 'extract', 'cleaning', 'Cleaning article content with AI')
          
          // Convert article to markdown with Gemini
          const articleResult = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{
              parts: [{
                text: `Convert this web article to clean, well-formatted markdown. Preserve structure but remove ads, navigation, and boilerplate.

Title: ${article.title}
Author: ${article.byline || 'Unknown'}

Content:
${article.textContent}`
              }]
            }]
          })
          
          markdown = articleResult.text || ''
          
          await updateProgress(supabase, job.id, 40, 'extract', 'chunking', 'Creating semantic chunks')
          chunks = await rechunkMarkdown(ai, markdown)
          await updateProgress(supabase, job.id, 45, 'extract', 'complete', `Created ${chunks.length} chunks`)
          break
        }
        
        case 'markdown_asis': {
          await updateProgress(supabase, job.id, 10, 'download', 'reading', 'Reading markdown file')
          
          // Download file from storage
          const { data: markdownBlob, error: markdownError } = await supabase.storage
            .from('documents')
            .download(`${storagePath}/source.md`)
          
          if (markdownError) throw markdownError
          
          markdown = await markdownBlob.text()
          
          await updateProgress(supabase, job.id, 30, 'extract', 'chunking', 'Chunking by headings (no AI)')
          
          // No AI processing - chunk by headings
          chunks = simpleMarkdownChunking(markdown)
          await updateProgress(supabase, job.id, 45, 'extract', 'complete', `Created ${chunks.length} chunks`)
          break
        }
        
        case 'markdown_clean': {
          await updateProgress(supabase, job.id, 10, 'download', 'reading', 'Reading markdown file')
          
          // Download file from storage
          const { data: mdBlob, error: mdError } = await supabase.storage
            .from('documents')
            .download(`${storagePath}/source.md`)
          
          if (mdError) throw mdError
          
          const rawMarkdown = await mdBlob.text()
          
          await updateProgress(supabase, job.id, 25, 'extract', 'cleaning', 'Cleaning markdown with AI')
          
          // Clean markdown with Gemini
          const cleanResult = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{
              parts: [{
                text: `Clean and improve this markdown formatting. Fix any issues with headings, lists, emphasis, etc. Preserve all content but enhance readability.

${rawMarkdown}`
              }]
            }]
          })
          
          markdown = cleanResult.text || ''
          
          await updateProgress(supabase, job.id, 40, 'extract', 'chunking', 'Creating semantic chunks')
          chunks = await rechunkMarkdown(ai, markdown)
          await updateProgress(supabase, job.id, 45, 'extract', 'complete', `Created ${chunks.length} chunks`)
          break
        }
        
        case 'txt': {
          await updateProgress(supabase, job.id, 10, 'download', 'reading', 'Reading text file')
          
          // Download file from storage
          const { data: txtBlob, error: txtError } = await supabase.storage
            .from('documents')
            .download(`${storagePath}/source.txt`)
          
          if (txtError) throw txtError
          
          const textContent = await txtBlob.text()
          
          await updateProgress(supabase, job.id, 25, 'extract', 'formatting', 'Converting to markdown with AI')
          
          // Convert text to markdown with Gemini
          const txtResult = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{
              parts: [{
                text: `Convert this plain text to well-formatted markdown. Add appropriate headings, lists, emphasis, and structure.

${textContent}`
              }]
            }]
          })
          
          markdown = txtResult.text || ''
          
          await updateProgress(supabase, job.id, 40, 'extract', 'chunking', 'Creating semantic chunks')
          chunks = await rechunkMarkdown(ai, markdown)
          await updateProgress(supabase, job.id, 45, 'extract', 'complete', `Created ${chunks.length} chunks`)
          break
        }
        
        case 'paste': {
          await updateProgress(supabase, job.id, 10, 'extract', 'processing', 'Processing pasted content')
          
          if (!pastedContent) {
            throw new Error('Pasted content required for paste processing')
          }
          
          // Check if it has timestamps (might be YouTube transcript)
          const hasTimestamps = /\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(pastedContent)
          
          if (hasTimestamps && sourceUrl) {
            // Treat as YouTube transcript
            markdown = pastedContent
            
            await updateProgress(supabase, job.id, 30, 'extract', 'chunking', 'Creating semantic chunks')
            chunks = await rechunkMarkdown(ai, markdown)
            
            // Extract timestamps
            for (const chunk of chunks) {
              const timestamps = extractTimestampsWithContext(chunk.content)
              if (timestamps.length > 0) {
                chunk.timestamps = timestamps
              }
            }
            
            await updateProgress(supabase, job.id, 45, 'extract', 'complete', `Created ${chunks.length} chunks with timestamps`)
          } else {
            // Generic text processing
            await updateProgress(supabase, job.id, 25, 'extract', 'formatting', 'Converting to markdown with AI')
            
            const pasteResult = await ai.models.generateContent({
              model: 'gemini-2.0-flash',
              contents: [{
                parts: [{
                  text: `Convert this text to clean, well-formatted markdown. Add structure and formatting as appropriate.

${pastedContent}`
                }]
              }]
            })
            
            markdown = pasteResult.text || ''
            
            await updateProgress(supabase, job.id, 40, 'extract', 'chunking', 'Creating semantic chunks')
            chunks = await rechunkMarkdown(ai, markdown)
            await updateProgress(supabase, job.id, 45, 'extract', 'complete', `Created ${chunks.length} chunks`)
          }
          break
        }
        
        case 'pdf':
        default: {
          // Existing PDF processing logic
          await updateProgress(supabase, job.id, STAGES.DOWNLOAD.percent, 'download', 'fetching', 'Retrieving file from storage')
          
          const { data: signedUrlData } = await supabase.storage
            .from('documents')
            .createSignedUrl(`${storagePath}/source.pdf`, 3600)
          
          const fileResponse = await fetch(signedUrlData.signedUrl)
          const fileBuffer = await fileResponse.arrayBuffer()
          
          const fileSizeKB = Math.round(fileBuffer.byteLength / 1024)
          const fileSizeMB = fileBuffer.byteLength / (1024 * 1024)

          await updateProgress(supabase, job.id, 12, 'download', 'complete', `Downloaded ${fileSizeKB} KB file`)
          
          // PDF processing with Gemini Files API
          try {
            // Step 1: Upload to Files API
            await updateProgress(supabase, job.id, 15, 'extract', 'uploading', `Uploading ${fileSizeKB} KB PDF to Gemini`)
          
          const uploadStart = Date.now();
          // Convert ArrayBuffer to Blob for Files API
          const pdfBlob = new Blob([fileBuffer], { type: 'application/pdf' });
          const uploadedFile = await ai.files.upload({
            file: pdfBlob,
            config: { mimeType: 'application/pdf' }
          });
          const uploadTime = Math.round((Date.now() - uploadStart) / 1000);
          
          await updateProgress(supabase, job.id, 20, 'extract', 'validating', `Upload complete (${uploadTime}s), validating file...`)
          
          let fileState = await ai.files.get({ name: uploadedFile.name || '' });
          let attempts = 0;
          const maxAttempts = 30; // 60 seconds max (2s per attempt)
          
          while (fileState.state === 'PROCESSING' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            fileState = await ai.files.get({ name: uploadedFile.name || '' });
            attempts++;
            
            if (attempts % 5 === 0) {
              await updateProgress(supabase, job.id, 20, 'extract', 'validating', `Validating file... (${attempts * 2}s)`);
            }
          }
          
          if (fileState.state !== 'ACTIVE') {
            throw new Error(`File validation failed. The file may be corrupted or in an unsupported format.`);
          }
          
          // Step 3: Generate content with timeout wrapper
          const estimatedTime = fileSizeMB < 1 ? '1-2 min' : fileSizeMB < 5 ? '2-5 min' : '5-10 min';
          await updateProgress(supabase, job.id, 25, 'extract', 'analyzing', `AI analyzing document (~${estimatedTime})...`);
          
          const generateStart = Date.now();
          const GENERATION_TIMEOUT = 8 * 60 * 1000; // 8 minutes
          
          // Update progress every 30 seconds during generation
          const progressInterval = setInterval(async () => {
            const elapsed = Math.round((Date.now() - generateStart) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            await updateProgress(supabase, job.id, 30, 'extract', 'analyzing', `Still analyzing... (${timeStr} elapsed)`);
          }, 30000);
          
          let result;
          try {
            const generationPromise = ai.models.generateContent({
              model: 'gemini-2.0-flash',
              contents: [{
                parts: [
                  { fileData: { fileUri: uploadedFile.uri || uploadedFile.name, mimeType: 'application/pdf' } },
                  { text: EXTRACTION_PROMPT }
                ]
              }],
              config: {
                responseMimeType: 'application/json',
                responseSchema: EXTRACTION_SCHEMA
              }
            });
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => {
                reject(new Error(`Analysis timeout after 8 minutes. PDF may be too complex. Try splitting into smaller documents.`));
              }, GENERATION_TIMEOUT)
            );
            
            result = await Promise.race([generationPromise, timeoutPromise]) as any;
          } finally {
            clearInterval(progressInterval);
          }
          
          const generateTime = Math.round((Date.now() - generateStart) / 1000);
          
          if (!result || !result.text) {
            throw new Error('AI returned empty response. Please try again.');
          }
          
          // Parse with error handling and recovery
          let extracted: ExtractionResponse;
          try {
            extracted = JSON.parse(result.text);
          } catch (parseError: any) {
            // Try to repair common JSON issues
            try {
              // Attempt to fix unescaped quotes and newlines
              const repairedJson = repairCommonJsonIssues(result.text);
              extracted = JSON.parse(repairedJson);
              console.warn('⚠️ JSON repair was needed (unescaped characters detected)');
            } catch (repairError) {
              // If repair fails, provide detailed error
              const errorPos = parseError.message.match(/position (\d+)/)?.[1];
              const context = errorPos ? result.text.substring(Math.max(0, parseInt(errorPos) - 100), Math.min(result.text.length, parseInt(errorPos) + 100)) : '';
              throw new Error(
                `AI generated invalid JSON response. This usually happens with complex PDFs containing special characters. ` +
                `Error: ${parseError.message}. ` +
                (context ? `Context: ...${context}...` : '')
              );
            }
          }
          
          // Validate response structure
          if (!extracted.markdown || !Array.isArray(extracted.chunks)) {
            throw new Error('AI response missing required fields (markdown or chunks). Please try again.');
          }
          
          markdown = extracted.markdown;
          chunks = extracted.chunks;
          
            const markdownKB = Math.round(markdown.length / 1024);
            await updateProgress(supabase, job.id, 40, 'extract', 'complete', `Extracted ${chunks.length} chunks (${markdownKB} KB, took ${generateTime}s)`)
            
          } catch (error: any) {
            // Convert to user-friendly error before throwing
            const friendlyMessage = getUserFriendlyError(error);
            throw new Error(friendlyMessage);
          }
          break
        }
      }

      await updateProgress(supabase, job.id, STAGES.SAVE_MARKDOWN.percent, 'save_markdown', 'uploading', 'Saving markdown to storage')
      
      const markdownBlob = new Blob([markdown], { type: 'text/markdown' })
      await supabase.storage
        .from('documents')
        .upload(`${storagePath}/content.md`, markdownBlob, { 
          contentType: 'text/markdown',
          upsert: true 
        })

      await supabase
        .from('documents')
        .update({ 
          processing_status: 'extracted',
          markdown_available: true,
          processing_stage: 'save_markdown'
        })
        .eq('id', document_id)

      await updateProgress(supabase, job.id, STAGES.SAVE_MARKDOWN.percent, 'save_markdown', 'complete', 'Markdown saved', {
        completed_stages: [...completedStages, STAGES.SAVE_MARKDOWN.name]
      })
    } else {
      await updateProgress(supabase, job.id, 52, 'save_markdown', 'resuming', 'Resuming from checkpoint')
      const { data: mdBlob } = await supabase.storage
        .from('documents')
        .download(`${storagePath}/content.md`)
      
      markdown = await mdBlob.text()
      chunks = await rechunkMarkdown(ai, markdown)
    }

    await updateProgress(supabase, job.id, STAGES.EMBED.percent, 'embed', 'starting', `Generating embeddings for ${chunks.length} chunks`)
    
    const chunkCount = chunks.length
    for (let i = 0; i < chunkCount; i++) {
      const chunk = chunks[i]
      
      // Rate limiting: Add delay every 10 requests to avoid API quota issues
      if (i > 0 && i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      const embedResult = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: chunk.content,
        config: { outputDimensionality: 768 }
      })

      // Extract embedding vector from API response
      // API returns: { embeddings: [{ values: number[] }] }
      const embeddingVector = embedResult.embeddings?.[0]?.values
      
      if (!embeddingVector || !Array.isArray(embeddingVector)) {
        throw new Error(`Invalid embedding response for chunk ${i}: Missing embedding.values`)
      }

      const chunkData: any = {
        document_id,
        content: chunk.content,
        embedding: embeddingVector,
        chunk_index: i,
        themes: chunk.themes,
        importance_score: chunk.importance_score,
        summary: chunk.summary
      }

      // Add timestamp data if present (YouTube videos)
      if (chunk.timestamps) {
        chunkData.timestamps = chunk.timestamps
      }

      await supabase.from('chunks').insert(chunkData)

      if (i % 5 === 0 || i === chunkCount - 1) {
        const embedPercent = STAGES.EMBED.percent + (i / chunkCount) * 49
        const progressPercent = Math.floor((i / chunkCount) * 100)
        await updateProgress(
          supabase, 
          job.id, 
          Math.floor(embedPercent), 
          'embed',
          'embedding',
          `Processing chunk ${i + 1}/${chunkCount} (${progressPercent}%)`
        )
      }
    }

    // Update job to completed status WITH final progress in single operation
    // This prevents race condition where progress is 100% but status is still 'processing'
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: {
          percent: STAGES.COMPLETE.percent,
          stage: 'complete',
          substage: 'done',
          details: 'Processing complete',
          updated_at: new Date().toISOString()
        }
      })
      .eq('id', job.id)
    
    await supabase
      .from('documents')
      .update({
        processing_status: 'completed',
        embeddings_available: true,
        processing_stage: 'complete',
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', document_id)

  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error occurred')
    const friendlyMessage = getUserFriendlyError(err)
    const errorType = classifyError(err)
    
    // Update job with error details
    await supabase
      .from('background_jobs')
      .update({ 
        status: 'failed',
        error_message: friendlyMessage,
        error_type: errorType,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)
    
    // Update document with error message
    await supabase
      .from('documents')
      .update({
        processing_status: 'failed',
        processing_error: friendlyMessage
      })
      .eq('id', document_id)
    
    throw new Error(friendlyMessage)
  }
}

async function updateProgress(
  supabase: any, 
  jobId: string, 
  percent: number, 
  stage: string,
  substage?: string,
  details?: string,
  additionalData: any = {}
) {
  await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent,
        stage,
        substage,
        details,
        updated_at: new Date().toISOString(),
        ...additionalData
      }
    })
    .eq('id', jobId)
}

async function rechunkMarkdown(ai: GoogleGenAI, markdown: string): Promise<ChunkData[]> {
  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [
        { text: `Break this markdown document into semantic chunks:\n\n${markdown}` }
      ]
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING },
                themes: { type: Type.ARRAY, items: { type: Type.STRING }},
                importance_score: { type: Type.NUMBER },
                summary: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  })

  if (!result.text) {
    throw new Error('AI returned empty response during chunking');
  }
  
  try {
    const response = JSON.parse(result.text);
    if (!response.chunks || !Array.isArray(response.chunks)) {
      throw new Error('Invalid chunking response structure');
    }
    return response.chunks;
  } catch (parseError: any) {
    // Try to repair and retry once
    try {
      const repairedJson = repairCommonJsonIssues(result.text);
      const response = JSON.parse(repairedJson);
      return response.chunks;
    } catch (repairError) {
      throw new Error(`Failed to parse chunking response: ${parseError.message}`);
    }
  }
}

/**
 * Attempts to repair common JSON formatting issues from LLM responses.
 * Uses the jsonrepair library for robust handling of malformed JSON.
 */
function repairCommonJsonIssues(jsonString: string): string {
  try {
    // First, try to extract JSON if it's wrapped in markdown code blocks
    const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    }
    
    // Remove any leading/trailing whitespace
    jsonString = jsonString.trim();
    
    // If it starts with text before the JSON, try to extract just the JSON
    const jsonStartMatch = jsonString.match(/^[^{]*({[\s\S]*})\s*$/);
    if (jsonStartMatch) {
      jsonString = jsonStartMatch[1];
    }
    
    // Use jsonrepair library to fix common issues:
    // - Unescaped quotes
    // - Missing commas
    // - Trailing commas
    // - Comments
    // - Single quotes instead of double quotes
    // - Unquoted keys
    // - And many more LLM-specific issues
    return jsonrepair(jsonString);
  } catch (error) {
    // If repair fails, return original
    return jsonString;
  }
}

const EXTRACTION_PROMPT = `
Extract this PDF to perfect markdown preserving all formatting.
Then break into semantic chunks (complete thoughts, 200-500 words each).
For each chunk, identify 1-3 themes and estimate importance (0-1 scale).

IMPORTANT: Return ONLY valid JSON. Ensure all strings are properly escaped.
All quotes within strings must be escaped with backslash.
All newlines within strings must be escaped as \\n.

Return JSON with full markdown and chunk array.
`

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