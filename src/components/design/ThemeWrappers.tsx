/**
 * Theme Wrappers - Scope CSS variables for different component libraries
 *
 * Each wrapper sets the CSS variables that its library expects,
 * preventing conflicts when multiple libraries are on the same page.
 */

import { ReactNode } from 'react'

interface ThemeWrapperProps {
  children: ReactNode
}

/**
 * Neobrutalism Theme Wrapper
 * Sets CSS variables expected by Neobrutalism components
 */
export function NeobrutalismTheme({ children }: ThemeWrapperProps) {
  return (
    <div
      className="neobrutalism-theme"
      style={{
        // Neobrutalism color variables
        '--main': 'oklch(0.205 0 0)',
        '--main-foreground': 'oklch(0.985 0 0)',
        '--secondary-background': 'oklch(0.97 0 0)',
        '--border': 'oklch(0.145 0 0)',

        // Shadow system
        '--boxShadowX': '4px',
        '--boxShadowY': '4px',
        '--reverseBoxShadowX': '-4px',
        '--reverseBoxShadowY': '-4px',
        '--shadow': '4px 4px 0px 0px oklch(0.145 0 0)',

        // Fonts
        '--font-base': 'var(--font-geist-sans)',
        '--font-heading': 'var(--font-geist-sans)',
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

/**
 * RetroUI Theme Wrapper
 * Sets CSS variables expected by RetroUI components
 */
export function RetroUITheme({ children }: ThemeWrapperProps) {
  return (
    <div
      className="retroui-theme"
      style={{
        // RetroUI uses HSL format
        '--primary': '50 100% 60%', // Yellow
        '--primary-foreground': '0 0% 0%', // Black text
        '--primary-hover': '50 100% 55%', // Darker yellow

        '--secondary': '0 0% 20%', // Dark gray
        '--secondary-foreground': '0 0% 100%', // White text
        '--secondary-hover': '0 0% 15%', // Darker gray

        '--background': '0 0% 100%', // White
        '--foreground': '0 0% 0%', // Black

        '--border': '0 0% 0%', // Black borders

        // RetroUI shadow system
        '--shadow': '3px 3px 0 0 hsl(0 0% 0%)',
        '--shadow-sm': '2px 2px 0 0 hsl(0 0% 0%)',
        '--shadow-md': '4px 4px 0 0 hsl(0 0% 0%)',
        '--shadow-lg': '6px 6px 0 0 hsl(0 0% 0%)',

        // Fonts
        '--font-head': 'var(--font-geist-sans)',
        '--font-sans': 'var(--font-geist-sans)',
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
