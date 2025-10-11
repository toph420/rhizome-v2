'use client'

import { motion } from 'framer-motion'
import { Quote } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TestimonialCardProps {
  quote: string
  author: string
  role: string
  company?: string
  logo?: React.ReactNode
  variant?: 'cream' | 'white' | 'dark'
  className?: string
}

export function TestimonialCard({
  quote,
  author,
  role,
  company,
  logo,
  variant = 'cream',
  className,
}: TestimonialCardProps) {
  const variantStyles = {
    cream: 'bg-[#f5f1e8] text-gray-900',
    white: 'bg-white text-gray-900 border border-gray-200',
    dark: 'bg-gray-900 text-white',
  }

  return (
    <motion.div
      className={cn(
        'rounded-2xl p-8 md:p-12 shadow-lg max-w-2xl',
        variantStyles[variant],
        className
      )}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Logo/Brand */}
      {logo && (
        <div className="mb-8 flex items-center gap-3">
          {logo}
        </div>
      )}

      {/* Decorative Line */}
      <div className={cn(
        'w-16 h-0.5 mb-8',
        variant === 'dark' ? 'bg-white/20' : 'bg-gray-900/20'
      )} />

      {/* Quote Icon */}
      <div className="mb-6">
        <Quote className={cn(
          'h-10 w-10',
          variant === 'dark' ? 'text-white/40' : 'text-gray-900/40'
        )} />
      </div>

      {/* Quote Text */}
      <blockquote className="mb-8">
        <p className={cn(
          'text-lg md:text-xl leading-relaxed font-serif',
          variant === 'dark' ? 'text-gray-100' : 'text-gray-800'
        )}>
          {quote}
        </p>
      </blockquote>

      {/* Attribution */}
      <div className="space-y-1">
        <p className={cn(
          'font-semibold text-base',
          variant === 'dark' ? 'text-white' : 'text-gray-900'
        )}>
          {author}
        </p>
        <p className={cn(
          'text-sm',
          variant === 'dark' ? 'text-gray-400' : 'text-gray-600'
        )}>
          {role}
          {company && `, ${company}`}
        </p>
      </div>
    </motion.div>
  )
}

// Testimonial grid for multiple quotes
export function TestimonialGrid() {
  const testimonials = [
    {
      quote: "For Devin, Claude Sonnet 4.5 increased planning performance by 18% and end-to-end eval scores by 12%—the biggest jump we've seen since the release of Claude Sonnet 3.6. It excels at testing its own code, enabling Devin to run longer, handle harder tasks, and deliver production-ready code.",
      author: "Scott Wu",
      role: "Co-Founder and CEO",
      company: "Cognition",
      logo: (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-900 rounded-md flex items-center justify-center">
            <span className="text-white text-lg">⚙️</span>
          </div>
          <span className="font-bold text-gray-900">Cognition</span>
        </div>
      ),
      variant: 'cream' as const,
    },
    {
      quote: "The ability to iterate quickly and maintain high code quality has transformed our development process. We're shipping features faster than ever before.",
      author: "Jane Smith",
      role: "Head of Engineering",
      company: "TechCorp",
      variant: 'white' as const,
    },
    {
      quote: "Integration was seamless, and the impact was immediate. Our team productivity increased significantly within the first month.",
      author: "Mike Johnson",
      role: "CTO",
      company: "StartupXYZ",
      variant: 'dark' as const,
    },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {testimonials.map((testimonial, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <TestimonialCard {...testimonial} />
        </motion.div>
      ))}
    </div>
  )
}
