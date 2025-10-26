import { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

/**
 * Page object for the upload zone component.
 * Handles file uploads, URL fetching, and content pasting across all input methods.
 */
export class UploadZone extends BasePage {
  readonly selectors = {
    // Tab navigation
    tabsList: '[data-testid="upload-tabs"]',
    fileTab: '[data-testid="file-tab"]',
    urlTab: '[data-testid="url-tab"]',
    pasteTab: '[data-testid="paste-tab"]',
    
    // File upload tab
    dropZone: '[data-testid="upload-drop-zone"]',
    fileInput: 'input[type="file"]',
    browseButton: '[data-testid="browse-files"]',
    selectedFileName: '[data-testid="selected-file-name"]',
    fileSize: '[data-testid="file-size"]',
    
    // Markdown processing options
    markdownProcessing: '[data-testid="markdown-processing"]',
    asIsOption: '[data-testid="markdown-as-is"]',
    cleanOption: '[data-testid="markdown-clean"]',
    
    // Cost estimation
    costEstimate: '[data-testid="cost-estimate"]',
    estimatedCost: '[data-testid="estimated-cost"]',
    estimatedTime: '[data-testid="estimated-time"]',
    estimatedTokens: '[data-testid="estimated-tokens"]',
    
    // Upload actions
    processButton: '[data-testid="process-document"]',
    cancelButton: '[data-testid="cancel-upload"]',
    
    // URL fetch tab
    urlInput: '[data-testid="url-input"]',
    urlType: '[data-testid="url-type"]',
    youtubeDetected: '[data-testid="youtube-detected"]',
    webDetected: '[data-testid="web-detected"]',
    fetchButton: '[data-testid="fetch-content"]',
    
    // Paste tab
    pasteContent: '[data-testid="paste-content"]',
    pasteSourceUrl: '[data-testid="paste-source-url"]',
    submitButton: '[data-testid="submit-content"]',
    
    // Status and errors
    uploading: '[data-testid="uploading"]',
    processing: '[data-testid="processing"]',
    errorMessage: '[data-testid="error-message"]',
    successMessage: '[data-testid="success-message"]'
  }

  constructor(page: Page) {
    super(page)
  }

  /**
   * Switch to file upload tab
   */
  async switchToFileTab(): Promise<void> {
    await this.clickElement(this.selectors.fileTab)
  }

  /**
   * Switch to URL fetch tab
   */
  async switchToUrlTab(): Promise<void> {
    await this.clickElement(this.selectors.urlTab)
  }

  /**
   * Switch to paste content tab
   */
  async switchToPasteTab(): Promise<void> {
    await this.clickElement(this.selectors.pasteTab)
  }

  /**
   * Upload file via file input
   */
  async uploadFile(filePath: string): Promise<void> {
    await this.switchToFileTab()
    
    // Use file input
    const fileInput = this.page.locator(this.selectors.fileInput)
    await fileInput.setInputFiles(filePath)
    
    // Wait for file to be selected and cost estimate to appear
    await this.waitForVisible(this.selectors.selectedFileName)
    await this.waitForVisible(this.selectors.costEstimate, 10000)
  }

  /**
   * Upload file via drag and drop
   */
  async dragAndDropFile(filePath: string): Promise<void> {
    await this.switchToFileTab()
    
    // Read file for drag and drop
    const buffer = require('fs').readFileSync(filePath)
    const dataTransfer = await this.page.evaluateHandle((data: number[]) => {
      const dt = new DataTransfer()
      const file = new File([new Uint8Array(data)], 'test-file.pdf', { type: 'application/pdf' })
      dt.items.add(file)
      return dt
    }, Array.from(buffer) as number[])

    // Trigger drag and drop
    const dropZone = this.page.locator(this.selectors.dropZone)
    await dropZone.dispatchEvent('drop', { dataTransfer })
    
    // Wait for file to be processed
    await this.waitForVisible(this.selectors.selectedFileName)
  }

  /**
   * Set markdown processing option
   */
  async setMarkdownProcessing(option: 'asis' | 'clean'): Promise<void> {
    const selector = option === 'asis' ? this.selectors.asIsOption : this.selectors.cleanOption
    await this.clickElement(selector)
  }

  /**
   * Get cost estimate
   */
  async getCostEstimate(): Promise<{
    cost: string
    time: string
    tokens: string
  }> {
    const cost = await this.getText(this.selectors.estimatedCost)
    const time = await this.getText(this.selectors.estimatedTime)
    const tokens = await this.getText(this.selectors.estimatedTokens)
    
    return { cost, time, tokens }
  }

  /**
   * Click process document button
   */
  async processDocument(): Promise<void> {
    await this.clickElement(this.selectors.processButton)
    
    // Wait for upload to start
    await this.waitForVisible(this.selectors.uploading, 5000)
  }

  /**
   * Cancel upload
   */
  async cancelUpload(): Promise<void> {
    await this.clickElement(this.selectors.cancelButton)
  }

  /**
   * Fetch content from URL
   */
  async fetchFromUrl(url: string): Promise<void> {
    await this.switchToUrlTab()
    
    // Enter URL
    await this.fillText(this.selectors.urlInput, url)
    
    // Wait for URL type detection
    await this.page.waitForTimeout(1000)
    
    // Click fetch button
    await this.clickElement(this.selectors.fetchButton)
    
    // Wait for fetching to start
    await this.waitForVisible(this.selectors.uploading, 5000)
  }

  /**
   * Check detected URL type
   */
  async getDetectedUrlType(): Promise<'youtube' | 'web' | null> {
    if (await this.exists(this.selectors.youtubeDetected)) {
      return 'youtube'
    } else if (await this.exists(this.selectors.webDetected)) {
      return 'web'
    }
    return null
  }

  /**
   * Submit pasted content
   */
  async submitPastedContent(content: string, sourceUrl?: string): Promise<void> {
    await this.switchToPasteTab()
    
    // Fill content
    await this.fillText(this.selectors.pasteContent, content)
    
    // Fill source URL if provided
    if (sourceUrl) {
      await this.fillText(this.selectors.pasteSourceUrl, sourceUrl)
    }
    
    // Submit
    await this.clickElement(this.selectors.submitButton)
    
    // Wait for submission to start
    await this.waitForVisible(this.selectors.uploading, 5000)
  }

  /**
   * Wait for upload to complete
   */
  async waitForUploadComplete(timeout = 60000): Promise<void> {
    // Wait for uploading indicator to disappear
    await this.waitForHidden(this.selectors.uploading, timeout)
    
    // Check for success or error
    const hasError = await this.exists(this.selectors.errorMessage)
    if (hasError) {
      const errorText = await this.getText(this.selectors.errorMessage)
      throw new Error(`Upload failed: ${errorText}`)
    }
  }

  /**
   * Complete file upload workflow
   */
  async uploadFileComplete(
    filePath: string,
    markdownProcessing?: 'asis' | 'clean'
  ): Promise<void> {
    await this.uploadFile(filePath)
    
    if (markdownProcessing) {
      await this.setMarkdownProcessing(markdownProcessing)
    }
    
    await this.processDocument()
    await this.waitForUploadComplete()
  }

  /**
   * Complete URL fetch workflow
   */
  async fetchUrlComplete(url: string): Promise<void> {
    await this.fetchFromUrl(url)
    await this.waitForUploadComplete()
  }

  /**
   * Complete paste content workflow
   */
  async pasteContentComplete(content: string, sourceUrl?: string): Promise<void> {
    await this.submitPastedContent(content, sourceUrl)
    await this.waitForUploadComplete()
  }

  /**
   * Get selected file info
   */
  async getSelectedFileInfo(): Promise<{
    name: string
    size: string
  } | null> {
    if (!await this.exists(this.selectors.selectedFileName)) {
      return null
    }
    
    const name = await this.getText(this.selectors.selectedFileName)
    const size = await this.getText(this.selectors.fileSize)
    
    return { name, size }
  }

  /**
   * Check if upload is in progress
   */
  async isUploading(): Promise<boolean> {
    return await this.exists(this.selectors.uploading)
  }

  /**
   * Check if processing is in progress
   */
  async isProcessing(): Promise<boolean> {
    return await this.exists(this.selectors.processing)
  }

  /**
   * Get error message if present
   */
  async getErrorMessage(): Promise<string | null> {
    if (await this.exists(this.selectors.errorMessage)) {
      return await this.getText(this.selectors.errorMessage)
    }
    return null
  }

  /**
   * Check if upload zone is ready for new upload
   */
  async isReadyForUpload(): Promise<boolean> {
    return !await this.isUploading() && !await this.isProcessing()
  }
}