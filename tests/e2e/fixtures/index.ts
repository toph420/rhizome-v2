import { test as base, expect } from '@playwright/test'
import { authFile } from '../setup/auth.setup'

/**
 * Custom test fixtures for Rhizome V2 E2E tests
 * Extends Playwright test with app-specific helpers
 */

export const test = base.extend({
  // Use authentication state (will be created by auth.setup.ts)
  // For now, tests will run without auth state
})

// Custom page object helpers
export const helpers = {
  /**
   * Wait for document processing to complete
   */
  async waitForProcessing(page: any, documentId: string) {
    await page.waitForSelector(`[data-testid="document-${documentId}-processed"]`, {
      timeout: 30000
    })
  },

  /**
   * Upload a test document
   */
  async uploadDocument(page: any, filePath: string) {
    await page.locator('[data-testid="upload-button"]').click()
    await page.locator('input[type="file"]').setInputFiles(filePath)
    await page.locator('[data-testid="upload-submit"]').click()
  },

  /**
   * Navigate to document reader
   */
  async openDocument(page: any, documentId: string) {
    await page.goto(`/read/${documentId}`)
    await page.waitForLoadState('networkidle')
  },

  /**
   * Create an annotation
   */
  async createAnnotation(page: any, text: string, note: string) {
    // Select text
    await page.locator(`text=${text}`).first().dblclick()
    
    // Open annotation toolbar
    await page.locator('[data-testid="create-annotation"]').click()
    
    // Add note
    await page.locator('[data-testid="annotation-note"]').fill(note)
    
    // Save
    await page.locator('[data-testid="save-annotation"]').click()
  }
}

export { expect }
