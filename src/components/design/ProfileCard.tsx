'use client'

import { motion } from 'framer-motion'
import { Plus, Instagram, Twitter } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProfileCardProps {
  name: string
  title: string
  avatar?: string
  likes: string
  posts: string
  views: string
  experience?: number // 0-100
  variant?: 'default' | 'minimal'
  className?: string
}

export function ProfileCard({
  name,
  title,
  avatar = '/api/placeholder/150/150',
  likes,
  posts,
  views,
  experience = 65,
  variant = 'default',
  className,
}: ProfileCardProps) {
  const circumference = 2 * Math.PI * 48 // radius = 48
  const strokeDashoffset = circumference - (experience / 100) * circumference

  return (
    <motion.div
      className={cn(
        'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-900',
        'rounded-3xl p-6 shadow-lg border border-white/20',
        'max-w-sm w-full',
        className
      )}
      whileHover={{ y: -4, shadow: '0 20px 40px rgba(0,0,0,0.1)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Header */}
      <div className="relative mb-16">
        {/* Background gradient/image placeholder */}
        <div className="h-32 rounded-2xl bg-gradient-to-r from-blue-200 to-blue-300 dark:from-blue-900 dark:to-blue-800 relative overflow-hidden">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-2 right-4 w-20 h-20 bg-white/30 rounded-full blur-2xl" />
            <div className="absolute bottom-2 left-4 w-16 h-16 bg-white/20 rounded-full blur-xl" />
          </div>
        </div>

        {/* Follow Button */}
        <motion.button
          className="absolute top-4 right-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-1 shadow-sm"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Follow <Plus className="h-3 w-3" />
        </motion.button>

        {/* Avatar with Progress Ring */}
        <div className="absolute -bottom-12 left-6">
          <div className="relative">
            {/* Progress Ring SVG */}
            <svg className="absolute -inset-2.5 w-[105px] h-[105px]" style={{ transform: 'rotate(-90deg)' }}>
              {/* Background circle */}
              <circle
                cx="52.5"
                cy="52.5"
                r="48"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-gray-200 dark:text-gray-700"
              />
              {/* Progress circle with gradient */}
              <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="50%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <circle
                cx="52.5"
                cy="52.5"
                r="48"
                fill="none"
                stroke="url(#progressGradient)"
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>

            {/* Avatar */}
            <div className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 shadow-md">
              <div className="w-full h-full flex items-center justify-center text-3xl">
                👤
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{name}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{title}</p>

        {variant === 'default' && experience && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">exp.</span>
            <div className="h-1.5 flex-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-green-500 rounded-full transition-all duration-500"
                style={{ width: `${experience}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className={cn(
        'grid grid-cols-3 gap-4 mb-6 py-4',
        variant === 'default' ? '' : 'bg-white/50 dark:bg-gray-800/50 rounded-2xl px-4'
      )}>
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900 dark:text-white">{likes}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Likes</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900 dark:text-white">{posts}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Posts</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900 dark:text-white">{views}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Views</p>
        </div>
      </div>

      {/* Social Links */}
      <div className="flex justify-center gap-8">
        <motion.button
          className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Instagram className="h-5 w-5" />
        </motion.button>
        <motion.button
          className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Twitter className="h-5 w-5" />
        </motion.button>
        <motion.button
          className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
        </motion.button>
      </div>
    </motion.div>
  )
}
