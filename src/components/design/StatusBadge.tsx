'use client'

import { motion } from 'framer-motion'
import { Edit, Clock, Lock, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusType = 'draft' | 'pending' | 'shipped' | 'completed' | 'failed'
export type StatusVariant = 'filled' | 'subtle' | 'outline'

interface StatusBadgeProps {
  status: StatusType
  variant?: StatusVariant
  className?: string
}

const statusConfig = {
  draft: {
    icon: Edit,
    label: 'Draft',
    filled: 'bg-gray-500 text-white',
    subtle: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    outline: 'border-2 border-gray-500 text-gray-700 dark:text-gray-300',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    filled: 'bg-orange-500 text-white',
    subtle: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    outline: 'border-2 border-orange-500 text-orange-700 dark:text-orange-300',
  },
  shipped: {
    icon: Lock,
    label: 'Shipped',
    filled: 'bg-blue-500 text-white',
    subtle: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    outline: 'border-2 border-blue-500 text-blue-700 dark:text-blue-300',
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    filled: 'bg-green-600 text-white',
    subtle: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    outline: 'border-2 border-green-600 text-green-700 dark:text-green-300',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    filled: 'bg-red-600 text-white',
    subtle: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    outline: 'border-2 border-red-600 text-red-700 dark:text-red-300',
  },
}

export function StatusBadge({ status, variant = 'filled', className }: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <motion.div
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm',
        config[variant],
        className
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Icon className="h-4 w-4" />
      <span>{config.label}</span>
    </motion.div>
  )
}

export function StatusBadgeShowcase() {
  const statuses: StatusType[] = ['draft', 'pending', 'shipped', 'completed', 'failed']
  const variants: StatusVariant[] = ['filled', 'subtle', 'outline']

  return (
    <div className="space-y-6">
      {variants.map((variant) => (
        <div key={variant} className="space-y-3">
          <p className="text-sm font-medium capitalize">{variant} Style</p>
          <div className="flex flex-wrap gap-3">
            {statuses.map((status) => (
              <StatusBadge key={status} status={status} variant={variant} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
