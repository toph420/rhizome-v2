/**
 * Docling Pipeline Configuration System
 *
 * Provides flexible control over Docling's feature set via environment variables.
 * Enables/disables: image extraction, AI enrichment, OCR, table processing, etc.
 *
 * Philosophy:
 * - Quality-first defaults (figures + tables enabled)
 * - Opt-in for expensive AI features (classification, description)
 * - Auto-optimization for large documents (page batching)
 * - Transparent logging of configuration decisions
 *
 * Based on Docling 2.x API:
 * - PdfPipelineOptions for feature control
 * - PdfFormatOption for pipeline integration
 * - DocumentConverter for pipeline execution
 */

/**
 * Complete Docling pipeline configuration.
 *
 * Covers all features exposed by PdfPipelineOptions:
 * - Image extraction (figures, tables, page images)
 * - AI enrichment (classification, description, code analysis)
 * - OCR for scanned documents
 * - Performance optimization (page batching)
 */
export interface DoclingPipelineConfig {
  // === Image Extraction ===
  do_picture_classification: boolean  // AI: Classify image type (figure, chart, etc.)
  do_picture_description: boolean     // AI: Generate image descriptions
  generate_page_images: boolean       // Extract page-level images
  generate_picture_images: boolean    // Extract individual figures
  generate_table_images: boolean      // Extract table images
  images_scale: number                // Image DPI scaling (1.0 = 72 DPI, 2.0 = 144 DPI)

  // === Code Analysis ===
  do_code_enrichment: boolean         // AI: Analyze code blocks (language, syntax)

  // === Document Processing ===
  do_ocr: boolean                     // OCR for scanned PDFs
  do_table_structure: boolean         // Extract table structure (rows/cols)

  // === Performance ===
  page_batch_size?: number            // Process in batches (large docs only)
}

/**
 * Feature guide for configuration decisions.
 *
 * Explains each feature, when to enable it, cost, and recommendation.
 */
export const FEATURE_GUIDE = {
  do_picture_classification: {
    description: 'AI classification of image types (figure, chart, diagram, etc.)',
    enableFor: ['Academic papers', 'Technical documentation', 'Reports with many figures'],
    skipFor: ['Novels', 'Text-heavy documents', 'Documents without images'],
    cost: 'Medium (AI call per image)',
    recommendation: 'Opt-in (disabled by default)'
  },
  do_picture_description: {
    description: 'AI-generated natural language descriptions of images',
    enableFor: ['Accessibility', 'Visual summaries', 'Research analysis'],
    skipFor: ['Fast processing', 'Cost-sensitive workflows', 'Text-focused documents'],
    cost: 'High (AI call per image with vision model)',
    recommendation: 'Opt-in (disabled by default)'
  },
  generate_picture_images: {
    description: 'Extract figure images as separate files',
    enableFor: ['Figure export', 'Visual reference', 'Citation support'],
    skipFor: ['Text-only extraction', 'Minimal storage'],
    cost: 'Low (local processing)',
    recommendation: 'Enabled by default (quality-first)'
  },
  generate_table_images: {
    description: 'Extract table images as separate files',
    enableFor: ['Complex tables', 'Visual table reference', 'Layout preservation'],
    skipFor: ['Text-only extraction', 'Structure extraction sufficient'],
    cost: 'Low (local processing)',
    recommendation: 'Enabled by default (quality-first)'
  },
  do_code_enrichment: {
    description: 'AI analysis of code blocks (language detection, syntax highlighting)',
    enableFor: ['Programming books', 'Technical tutorials', 'API documentation'],
    skipFor: ['Non-technical content', 'Fast processing'],
    cost: 'Medium (AI call per code block)',
    recommendation: 'Opt-in (disabled by default)'
  },
  do_ocr: {
    description: 'Optical Character Recognition for scanned PDFs',
    enableFor: ['Scanned documents', 'Image-based PDFs', 'Historical documents'],
    skipFor: ['Native digital PDFs (text layer present)', 'Fast processing'],
    cost: 'Very High (OCR per page)',
    recommendation: 'Opt-in (disabled by default, only when needed)'
  },
  do_table_structure: {
    description: 'Extract table structure (rows, columns, cells)',
    enableFor: ['Data extraction', 'Table analysis', 'Structured content'],
    skipFor: ['Visual tables only', 'Minimal processing'],
    cost: 'Low (local processing)',
    recommendation: 'Enabled by default (quality-first)'
  },
  page_batch_size: {
    description: 'Process document in batches to reduce memory usage',
    enableFor: ['Large documents (>200 pages)', 'Memory-constrained systems'],
    skipFor: ['Small documents (<100 pages)', 'Maximum speed'],
    cost: 'None (actually saves memory)',
    recommendation: 'Auto-enabled for documents >200 pages'
  }
} as const

/**
 * Get default pipeline configuration.
 *
 * Philosophy: Quality-first defaults
 * - Enable: figure extraction, table extraction (low cost, high value)
 * - Disable: AI features (opt-in, high cost)
 * - Disable: OCR (opt-in, very high cost)
 * - Auto: page batching (enabled for large docs)
 *
 * Users can override via environment variables.
 */
export function getDefaultPipelineConfig(): DoclingPipelineConfig {
  return {
    // Image extraction (quality-first: enabled by default)
    generate_picture_images: true,      // Extract figures
    generate_table_images: true,        // Extract tables
    generate_page_images: false,        // Page images rarely needed
    images_scale: 2.0,                  // 144 DPI (good quality)

    // AI features (opt-in: disabled by default)
    do_picture_classification: false,   // Opt-in (costs API calls)
    do_picture_description: false,      // Opt-in (expensive vision model)
    do_code_enrichment: false,          // Opt-in (costs API calls)

    // Document processing
    do_ocr: false,                      // Opt-in (very expensive)
    do_table_structure: true,           // Enabled (low cost, high value)

    // Performance (auto-configured based on document)
    page_batch_size: undefined          // Set automatically based on page count
  }
}

/**
 * Apply environment variable overrides to configuration.
 *
 * Environment variables:
 * - EXTRACT_IMAGES=true/false          (affects generate_picture_images)
 * - IMAGE_SCALE=1.0|2.0|3.0           (affects images_scale)
 * - EXTRACT_TABLES=true/false         (affects generate_table_images)
 * - CLASSIFY_IMAGES=true/false        (affects do_picture_classification)
 * - DESCRIBE_IMAGES=true/false        (affects do_picture_description)
 * - ENRICH_CODE=true/false            (affects do_code_enrichment)
 * - ENABLE_OCR=true/false             (affects do_ocr)
 *
 * @param config - Base configuration to modify
 * @returns Modified configuration with environment overrides
 */
export function applyEnvironmentOverrides(config: DoclingPipelineConfig): DoclingPipelineConfig {
  const env = process.env

  // Image extraction
  if (env.EXTRACT_IMAGES !== undefined) {
    config.generate_picture_images = env.EXTRACT_IMAGES === 'true'
  }

  if (env.IMAGE_SCALE !== undefined) {
    const scale = parseFloat(env.IMAGE_SCALE)
    if (!isNaN(scale) && scale > 0 && scale <= 3.0) {
      config.images_scale = scale
    }
  }

  if (env.EXTRACT_TABLES !== undefined) {
    config.generate_table_images = env.EXTRACT_TABLES === 'true'
  }

  // AI features
  if (env.CLASSIFY_IMAGES !== undefined) {
    config.do_picture_classification = env.CLASSIFY_IMAGES === 'true'
  }

  if (env.DESCRIBE_IMAGES !== undefined) {
    config.do_picture_description = env.DESCRIBE_IMAGES === 'true'
  }

  if (env.ENRICH_CODE !== undefined) {
    config.do_code_enrichment = env.ENRICH_CODE === 'true'
  }

  // OCR
  if (env.ENABLE_OCR !== undefined) {
    config.do_ocr = env.ENABLE_OCR === 'true'
  }

  return config
}

/**
 * Document hints for auto-optimization.
 *
 * Allows callers to provide document characteristics for smart configuration.
 */
export interface DocumentHints {
  pageCount?: number        // Total pages (triggers batching if >200)
  hasImages?: boolean       // Document contains images
  isScanned?: boolean       // Document is scanned (triggers OCR)
  hasCodeBlocks?: boolean   // Document contains code (triggers enrichment)
}

/**
 * Apply document-specific optimizations.
 *
 * Auto-optimization rules:
 * - pageCount > 200 → Enable page batching (batch_size = 50)
 * - pageCount > 400 → Increase batch size (batch_size = 100)
 * - isScanned → Suggest OCR (log warning, don't auto-enable)
 *
 * @param config - Configuration to optimize
 * @param hints - Document characteristics
 * @returns Optimized configuration
 */
export function applyDocumentHints(
  config: DoclingPipelineConfig,
  hints: DocumentHints = {}
): DoclingPipelineConfig {
  const { pageCount, isScanned } = hints

  // Auto-enable page batching for large documents
  if (pageCount && pageCount > 200 && config.page_batch_size === undefined) {
    if (pageCount > 400) {
      config.page_batch_size = 100
      console.log(`[DoclingConfig] Large document (${pageCount} pages) → page_batch_size=100 (memory optimization)`)
    } else {
      config.page_batch_size = 50
      console.log(`[DoclingConfig] Large document (${pageCount} pages) → page_batch_size=50 (memory optimization)`)
    }
  }

  // Suggest OCR for scanned documents (don't auto-enable)
  if (isScanned && !config.do_ocr) {
    console.warn('[DoclingConfig] ⚠️  Scanned document detected, but OCR is disabled')
    console.warn('[DoclingConfig]    Set ENABLE_OCR=true to extract text from scanned pages')
  }

  return config
}

/**
 * Get complete pipeline configuration.
 *
 * Orchestration function that applies:
 * 1. Default configuration (quality-first)
 * 2. Environment variable overrides (user preferences)
 * 3. Document hints (auto-optimization)
 *
 * @param hints - Optional document characteristics
 * @returns Complete pipeline configuration
 */
export function getPipelineConfig(hints: DocumentHints = {}): DoclingPipelineConfig {
  let config = getDefaultPipelineConfig()
  config = applyEnvironmentOverrides(config)
  config = applyDocumentHints(config, hints)
  return config
}

/**
 * Log pipeline configuration for transparency.
 *
 * Shows all enabled/disabled features, image quality settings,
 * and performance optimizations. Helps users understand what
 * Docling will do with their document.
 *
 * @param config - Configuration to log
 */
export function logPipelineConfig(config: DoclingPipelineConfig): void {
  console.log('\n[Docling Pipeline Configuration]')
  console.log('================================')

  // Image extraction
  console.log('\nImage Extraction:')
  console.log(`  Figures:              ${config.generate_picture_images ? '✅ Enabled' : '❌ Disabled'}`)
  console.log(`  Tables:               ${config.generate_table_images ? '✅ Enabled' : '❌ Disabled'}`)
  console.log(`  Page Images:          ${config.generate_page_images ? '✅ Enabled' : '❌ Disabled'}`)
  console.log(`  Image Quality (DPI):  ${Math.round(config.images_scale * 72)}`)

  // AI features
  console.log('\nAI Features:')
  console.log(`  Image Classification: ${config.do_picture_classification ? '✅ Enabled (costs API calls)' : '❌ Disabled'}`)
  console.log(`  Image Description:    ${config.do_picture_description ? '✅ Enabled (expensive vision model)' : '❌ Disabled'}`)
  console.log(`  Code Enrichment:      ${config.do_code_enrichment ? '✅ Enabled (costs API calls)' : '❌ Disabled'}`)

  // Document processing
  console.log('\nDocument Processing:')
  console.log(`  OCR:                  ${config.do_ocr ? '✅ Enabled (very expensive)' : '❌ Disabled'}`)
  console.log(`  Table Structure:      ${config.do_table_structure ? '✅ Enabled' : '❌ Disabled'}`)

  // Performance
  console.log('\nPerformance:')
  if (config.page_batch_size) {
    console.log(`  Page Batching:        ✅ Enabled (batch_size=${config.page_batch_size})`)
  } else {
    console.log(`  Page Batching:        ❌ Disabled (process all pages at once)`)
  }

  console.log('================================\n')
}

/**
 * Format pipeline configuration for Python script.
 *
 * Converts TypeScript config to JSON format expected by
 * docling_extract.py and docling_extract_epub.py.
 *
 * Python scripts expect flat dictionary with snake_case keys.
 *
 * @param config - Pipeline configuration
 * @returns JSON string for Python consumption
 */
export function formatPipelineConfigForPython(config: DoclingPipelineConfig): string {
  const pythonConfig: Record<string, any> = {
    do_picture_classification: config.do_picture_classification,
    do_picture_description: config.do_picture_description,
    do_code_enrichment: config.do_code_enrichment,
    generate_page_images: config.generate_page_images,
    generate_picture_images: config.generate_picture_images,
    generate_table_images: config.generate_table_images,
    images_scale: config.images_scale,
    ocr: config.do_ocr,  // Note: Python script uses 'ocr' not 'do_ocr'
    do_table_structure: config.do_table_structure
  }

  // Only include page_batch_size if set
  if (config.page_batch_size !== undefined) {
    pythonConfig.page_batch_size = config.page_batch_size
  }

  return JSON.stringify(pythonConfig)
}

/**
 * Get recommended configuration for specific document types.
 *
 * Pre-configured settings for common use cases.
 */
export const RECOMMENDED_CONFIGS = {
  /**
   * Academic Papers
   * - High-quality figures and tables
   * - Image classification for citations
   * - No code enrichment
   */
  academic: (): DoclingPipelineConfig => ({
    ...getDefaultPipelineConfig(),
    do_picture_classification: true,  // Classify figures/charts
    images_scale: 2.0,                // High quality (144 DPI)
    generate_picture_images: true,
    generate_table_images: true
  }),

  /**
   * Programming Books
   * - Code enrichment for syntax
   * - Minimal image processing
   * - Focus on text extraction
   */
  programming: (): DoclingPipelineConfig => ({
    ...getDefaultPipelineConfig(),
    do_code_enrichment: true,         // Analyze code blocks
    generate_picture_images: true,    // Extract diagrams
    generate_table_images: false,     // Usually don't need tables
    images_scale: 1.5                 // Medium quality sufficient
  }),

  /**
   * Novels (Text-Only)
   * - Minimal processing
   * - Fast extraction
   * - No images or AI features
   */
  novels: (): DoclingPipelineConfig => ({
    ...getDefaultPipelineConfig(),
    generate_picture_images: false,   // Novels rarely have figures
    generate_table_images: false,     // Novels don't have tables
    do_table_structure: false,        // No tables
    images_scale: 1.0                 // Low quality sufficient
  }),

  /**
   * Scanned Documents
   * - OCR enabled
   * - High-quality image extraction
   * - All features enabled
   */
  scanned: (): DoclingPipelineConfig => ({
    ...getDefaultPipelineConfig(),
    do_ocr: true,                     // OCR required
    generate_picture_images: true,
    generate_table_images: true,
    images_scale: 2.0                 // High quality for OCR
  })
} as const
