import { test, expect } from './fixtures'

/**
 * Smoke test to verify Playwright MCP integration
 * This basic test ensures the setup is working correctly
 */

test.describe('Playwright MCP Integration', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/')
    
    // Basic page load verification
    await expect(page).toHaveTitle(/Rhizome/)
    
    // Check that the page loaded successfully
    const body = await page.locator('body')
    await expect(body).toBeVisible()
  })
  
  test('should handle MCP browser commands', async ({ page }) => {
    await page.goto('/')
    
    // Test that we can interact with the page
    const title = await page.title()
    expect(title).toBeTruthy()
    
    // Verify we can take screenshots (MCP functionality)
    const screenshot = await page.screenshot({ type: 'png' })
    expect(screenshot).toBeTruthy()
  })
  
  test('should navigate between pages', async ({ page }) => {
    await page.goto('/')
    
    // Check basic navigation works
    const url = page.url()
    expect(url).toContain('localhost:3000')
  })
})
