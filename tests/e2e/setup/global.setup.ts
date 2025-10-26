import { test as setup } from '@playwright/test'

/**
 * Global setup for E2E tests
 * Runs once before all tests
 */

setup('global setup', async ({ page }) => {
  // Set up any global state needed for tests
  console.log('Setting up global E2E test environment')
  
  // Ensure the development server is running
  await page.goto('/') // This will wait for the webServer to be ready
  
  // Set up any global test data or configuration
  await page.evaluate(() => {
    // Clear any existing state
    localStorage.clear()
    sessionStorage.clear()
    
    // Set test environment flag
    (window as any).__PLAYWRIGHT_TESTING__ = true
  })
})
