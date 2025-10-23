/**
 * Theme Wrappers - Scope CSS variables for different component libraries
 *
 * These simple wrappers apply CSS class names that scope theme variables
 * defined in neobrutalism.css and retroui.css, preventing conflicts when
 * multiple libraries are on the same page.
 */

import { ReactNode } from 'react'

interface ThemeWrapperProps {
  children: ReactNode
}

/**
 * Neobrutalism Theme Wrapper
 * Applies .neobrutalism-theme class to scope Neobrutalism CSS variables
 */
export function NeobrutalismTheme({ children }: ThemeWrapperProps) {
  return <div className="neobrutalism-theme">{children}</div>
}

/**
 * RetroUI Theme Wrapper
 * Applies .retroui-theme class to scope RetroUI CSS variables
 */
export function RetroUITheme({ children }: ThemeWrapperProps) {
  return <div className="retroui-theme">{children}</div>
}
