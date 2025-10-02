import { Page, Locator, expect } from '@playwright/test'

/**
 * Base page object class with common functionality for all page objects.
 * Provides shared methods for navigation, waiting, and element interactions.
 */
export abstract class BasePage {
  protected page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Navigate to a specific URL
   */
  async goto(url: string): Promise<void> {
    await this.page.goto(url)
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * Wait for an element to be visible
   */
  async waitForVisible(selector: string, timeout = 30000): Promise<Locator> {
    const element = this.page.locator(selector)
    await element.waitFor({ state: 'visible', timeout })
    return element
  }

  /**
   * Wait for an element to be hidden
   */
  async waitForHidden(selector: string, timeout = 30000): Promise<void> {
    const element = this.page.locator(selector)
    await element.waitFor({ state: 'hidden', timeout })
  }

  /**
   * Click an element with retry logic
   */
  async clickElement(selector: string, timeout = 10000): Promise<void> {
    const element = await this.waitForVisible(selector, timeout)
    await element.click()
  }

  /**
   * Fill text input with retry logic
   */
  async fillText(selector: string, text: string, timeout = 10000): Promise<void> {
    const element = await this.waitForVisible(selector, timeout)
    await element.fill(text)
  }

  /**
   * Get text content from an element
   */
  async getText(selector: string, timeout = 10000): Promise<string> {
    const element = await this.waitForVisible(selector, timeout)
    return await element.textContent() || ''
  }

  /**
   * Check if an element exists (without waiting)
   */
  async exists(selector: string): Promise<boolean> {
    try {
      await this.page.locator(selector).waitFor({ state: 'attached', timeout: 1000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Wait for URL to contain a specific path
   */
  async waitForUrl(urlPattern: string | RegExp, timeout = 30000): Promise<void> {
    await this.page.waitForURL(urlPattern, { timeout })
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * Scroll to an element
   */
  async scrollToElement(selector: string): Promise<void> {
    const element = this.page.locator(selector)
    await element.scrollIntoViewIfNeeded()
  }

  /**
   * Take a screenshot for debugging
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/${name}-${Date.now()}.png` })
  }

  /**
   * Verify page title
   */
  async verifyTitle(expectedTitle: string): Promise<void> {
    await expect(this.page).toHaveTitle(expectedTitle)
  }

  /**
   * Verify URL contains pattern
   */
  async verifyUrl(urlPattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(urlPattern)
  }

  /**
   * Wait for processing/loading states to complete
   */
  async waitForProcessingComplete(documentId?: string, timeout = 60000): Promise<void> {
    if (documentId) {
      // Wait for specific document processing
      await this.waitForVisible(`[data-testid="document-${documentId}-processed"]`, timeout)
    } else {
      // Wait for any loading indicators to disappear
      await this.waitForHidden('[data-testid="loading"]', timeout)
      await this.waitForHidden('.animate-spin', timeout)
    }
  }

  /**
   * Handle unexpected errors/alerts
   */
  async handleError(): Promise<string | null> {
    const errorSelectors = [
      '[data-testid="error-message"]',
      '.text-destructive',
      '[role="alert"]'
    ]

    for (const selector of errorSelectors) {
      if (await this.exists(selector)) {
        return await this.getText(selector)
      }
    }
    return null
  }
}