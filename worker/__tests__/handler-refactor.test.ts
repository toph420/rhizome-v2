/**
 * Integration test for refactored process-document handler.
 * Verifies processor routing works correctly for all source types.
 */

import { ProcessorRouter } from '../processors/router'

describe('ProcessorRouter', () => {
  const mockAI = { model: 'test' }
  const mockSupabase = { client: 'test' }
  const mockJob = { 
    id: 'test-job',
    input_data: {
      document_id: 'test-doc',
      source_type: 'pdf'
    }
  }

  describe('createProcessor', () => {
    it('should create PDFProcessor for pdf source type', () => {
      const processor = ProcessorRouter.createProcessor('pdf', mockAI, mockSupabase, mockJob)
      expect(processor.constructor.name).toBe('PDFProcessor')
    })

    it('should create YouTubeProcessor for youtube source type', () => {
      const processor = ProcessorRouter.createProcessor('youtube', mockAI, mockSupabase, mockJob)
      expect(processor.constructor.name).toBe('YouTubeProcessor')
    })

    it('should create WebProcessor for web_url source type', () => {
      const processor = ProcessorRouter.createProcessor('web_url', mockAI, mockSupabase, mockJob)
      expect(processor.constructor.name).toBe('WebProcessor')
    })

    it('should create MarkdownAsIsProcessor for markdown_asis source type', () => {
      const processor = ProcessorRouter.createProcessor('markdown_asis', mockAI, mockSupabase, mockJob)
      expect(processor.constructor.name).toBe('MarkdownAsIsProcessor')
    })

    it('should create MarkdownCleanProcessor for markdown_clean source type', () => {
      const processor = ProcessorRouter.createProcessor('markdown_clean', mockAI, mockSupabase, mockJob)
      expect(processor.constructor.name).toBe('MarkdownCleanProcessor')
    })

    it('should create TextProcessor for txt source type', () => {
      const processor = ProcessorRouter.createProcessor('txt', mockAI, mockSupabase, mockJob)
      expect(processor.constructor.name).toBe('TextProcessor')
    })

    it('should create PasteProcessor for paste source type', () => {
      const processor = ProcessorRouter.createProcessor('paste', mockAI, mockSupabase, mockJob)
      expect(processor.constructor.name).toBe('PasteProcessor')
    })

    it('should throw error for unknown source type', () => {
      expect(() => {
        // @ts-ignore - testing invalid type
        ProcessorRouter.createProcessor('invalid', mockAI, mockSupabase, mockJob)
      }).toThrow('Unknown source type: invalid')
    })
  })

  describe('isValidSourceType', () => {
    it('should return true for valid source types', () => {
      expect(ProcessorRouter.isValidSourceType('pdf')).toBe(true)
      expect(ProcessorRouter.isValidSourceType('youtube')).toBe(true)
      expect(ProcessorRouter.isValidSourceType('web_url')).toBe(true)
      expect(ProcessorRouter.isValidSourceType('markdown_asis')).toBe(true)
      expect(ProcessorRouter.isValidSourceType('markdown_clean')).toBe(true)
      expect(ProcessorRouter.isValidSourceType('txt')).toBe(true)
      expect(ProcessorRouter.isValidSourceType('paste')).toBe(true)
    })

    it('should return false for invalid source types', () => {
      expect(ProcessorRouter.isValidSourceType('invalid')).toBe(false)
      expect(ProcessorRouter.isValidSourceType('')).toBe(false)
      expect(ProcessorRouter.isValidSourceType('PDF')).toBe(false)
    })
  })

  describe('getSourceTypeName', () => {
    it('should return human-readable names for source types', () => {
      expect(ProcessorRouter.getSourceTypeName('pdf')).toBe('PDF Document')
      expect(ProcessorRouter.getSourceTypeName('youtube')).toBe('YouTube Video')
      expect(ProcessorRouter.getSourceTypeName('web_url')).toBe('Web Article')
      expect(ProcessorRouter.getSourceTypeName('markdown_asis')).toBe('Markdown (As-Is)')
      expect(ProcessorRouter.getSourceTypeName('markdown_clean')).toBe('Markdown (Enhanced)')
      expect(ProcessorRouter.getSourceTypeName('txt')).toBe('Plain Text')
      expect(ProcessorRouter.getSourceTypeName('paste')).toBe('Pasted Content')
    })
  })
})

describe('Handler Line Count', () => {
  it('should be less than 250 lines', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const handlerPath = path.join(__dirname, '../handlers/process-document.ts')
    const content = fs.readFileSync(handlerPath, 'utf8')
    const lineCount = content.split('\n').length
    
    expect(lineCount).toBeLessThan(250)
    console.log(`✅ Handler is ${lineCount} lines (target: <250)`)
  })
})