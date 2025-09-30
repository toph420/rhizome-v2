import { test as setup, expect } from '@playwright/test'

/**
 * Authentication setup for E2E tests
 * This file handles user authentication state for Playwright tests
 */

const authFile = 'tests/e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  // For now, we'll implement a basic auth flow
  // In the future, this will handle Supabase auth
  
  await page.goto('/auth/login')
  
  // Mock authentication for development
  // TODO: Replace with actual Supabase auth flow when auth is implemented
  await page.evaluate(() => {
    localStorage.setItem('auth-user', JSON.stringify({
      id: 'test-user-id',
      email: 'test@example.com'
    }))
  })
  
  // Save signed-in state to authFile
  await page.context().storageState({ path: authFile })
})

export { authFile }