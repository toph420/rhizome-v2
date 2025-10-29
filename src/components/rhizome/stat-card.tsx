'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * StatCard Component
 *
 * Neobrutalist stat display with multiple visual variants.
 * Used for dashboard stats, analytics displays, and homepage metrics.
 *
 * Features:
 * - Multiple color variants (primary, vibrant, neutral, semantic)
 * - Neobrutalist hover animation (translate to shadow position)
 * - Compact mode for dense layouts
 * - Optional click handlers for navigation
 * - Lucide icon support
 *
 * @example
 * ```tsx
 * <StatCard
 *   label="documents"
 *   value={47}
 *   variant="primary"
 *   icon={<FileText className="w-4 h-4" />}
 *   onClick={() => router.push('/documents')}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Compact mode for processing queue
 * <StatCard
 *   label="completed"
 *   value={44}
 *   variant="success"
 *   icon={<CheckCircle2 className="w-3 h-3" />}
 *   compact
 * />
 * ```
 */

export interface StatCardProps {
  /** Display label (will be uppercased with tracking) */
  label: string
  /** Numeric or formatted string value */
  value: string | number
  /** Visual variant for different contexts */
  variant?: 'primary' | 'vibrant-pink' | 'vibrant-purple' | 'vibrant-orange' | 'neutral' | 'success' | 'warning' | 'danger'
  /** Optional Lucide icon (pass sized component like <FileText className="w-4 h-4" />) */
  icon?: React.ReactNode
  /** Optional click handler for navigation */
  onClick?: () => void
  /** Compact mode for smaller cards in dense layouts */
  compact?: boolean
}

export function StatCard({
  label,
  value,
  variant = 'neutral',
  icon,
  onClick,
  compact = false
}: StatCardProps) {
  const Component = onClick ? 'button' : 'div'

  // Variant-specific background colors using CSS variables from globals.css
  const variantStyles = {
    primary: 'bg-main border-border',
    'vibrant-pink': 'bg-[var(--color-vibrant-pink)] border-border text-white',
    'vibrant-purple': 'bg-[var(--color-vibrant-purple)] border-border text-white',
    'vibrant-orange': 'bg-[var(--color-vibrant-orange)] border-border text-white',
    neutral: 'bg-secondary-background border-border',
    success: 'bg-green-100 border-green-600',
    warning: 'bg-orange-100 border-orange-600',
    danger: 'bg-red-100 border-red-600',
  }

  // Compact mode reduces padding and font sizes
  const sizeStyles = compact
    ? 'p-2 gap-1'
    : 'p-3 gap-2'

  // Check if variant uses white text (for vibrant backgrounds)
  const isVibrantVariant = variant === 'vibrant-pink' || variant === 'vibrant-purple' || variant === 'vibrant-orange'

  return (
    <Component
      onClick={onClick}
      className={cn(
        // Base neobrutalist styling
        'rounded-base border-2 shadow-shadow font-base',
        'transition-all duration-200',
        // Neobrutalist hover effect - "push" into shadow position
        onClick && 'cursor-pointer hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none',
        // Variant colors
        variantStyles[variant],
        // Size
        sizeStyles,
        // Layout
        'flex flex-col items-start justify-between'
      )}
    >
      {/* Icon + Value Row */}
      <div className="flex items-center justify-between w-full">
        <div className={cn(
          'font-heading font-black',
          compact ? 'text-lg' : 'text-2xl',
          isVibrantVariant ? 'text-white' : 'text-foreground'
        )}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {icon && (
          <div className={cn(
            'shrink-0',
            isVibrantVariant ? 'text-white/80' : 'text-muted-foreground'
          )}>
            {icon}
          </div>
        )}
      </div>

      {/* Label */}
      <div className={cn(
        'uppercase tracking-wider font-base font-medium',
        compact ? 'text-[10px]' : 'text-xs',
        isVibrantVariant ? 'text-white/70' : 'text-muted-foreground'
      )}>
        {label}
      </div>
    </Component>
  )
}
