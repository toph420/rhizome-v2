'use client'

import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ProductCardProps {
  title: string
  description: string
  price: string
  image?: string
  badges?: string[]
  variant?: 'light' | 'dark'
  className?: string
  onAddToCart?: () => void
}

export function ProductCard({
  title,
  description,
  price,
  image,
  badges = [],
  variant = 'light',
  className,
  onAddToCart,
}: ProductCardProps) {
  const isDark = variant === 'dark'

  return (
    <motion.div
      className={cn(
        'rounded-3xl overflow-hidden shadow-xl max-w-sm w-full',
        isDark ? 'bg-gray-900' : 'bg-white',
        className
      )}
      whileHover={{ y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Image Section */}
      <div className="relative aspect-square overflow-hidden">
        {/* Placeholder gradient image */}
        <div className={cn(
          'w-full h-full',
          image ? '' : 'bg-gradient-to-br from-teal-700 via-teal-600 to-teal-800'
        )}>
          {image ? (
            <img src={image} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center relative">
              {/* Mountain silhouette effect */}
              <svg
                className="absolute bottom-0 w-full h-2/3 opacity-40"
                viewBox="0 0 400 300"
                fill="none"
              >
                <path
                  d="M 0 300 L 0 150 L 100 80 L 150 120 L 200 50 L 280 140 L 350 100 L 400 160 L 400 300 Z"
                  fill="currentColor"
                  className="text-gray-900"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Carousel Dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          <div className="w-8 h-1 bg-white rounded-full" />
          <div className="w-1 h-1 bg-white/50 rounded-full" />
          <div className="w-1 h-1 bg-white/50 rounded-full" />
        </div>

        {/* Price Badge */}
        <div className="absolute top-4 right-4">
          <div className={cn(
            'px-3 py-1 rounded-full text-sm font-semibold',
            isDark ? 'bg-white/20 text-white backdrop-blur-sm' : 'bg-gray-800/80 text-white backdrop-blur-sm'
          )}>
            {price}
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className={cn(
        'p-6 space-y-4',
        isDark ? 'text-white' : 'text-gray-900'
      )}>
        <div>
          <h3 className="text-2xl font-bold mb-2">{title}</h3>
          <p className={cn(
            'text-sm leading-relaxed',
            isDark ? 'text-gray-300' : 'text-gray-600'
          )}>
            {description}
          </p>
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {badges.map((badge, index) => (
              <span
                key={index}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium',
                  isDark
                    ? 'bg-white/10 text-gray-200'
                    : 'bg-gray-100 text-gray-700'
                )}
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {/* CTA Button */}
        <motion.button
          className={cn(
            'w-full py-4 rounded-full font-semibold text-base transition-colors',
            isDark
              ? 'bg-white text-gray-900 hover:bg-gray-100'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onAddToCart}
        >
          Add to Cart
        </motion.button>
      </div>
    </motion.div>
  )
}

export function ProductCardGrid() {
  const products = [
    {
      title: 'Deep Blue Nights',
      description: "For those who crave peace louder than the city. This view isn't just scenery, it's a whole reset.",
      price: '$2,999',
      badges: ['Top Pick', 'Only 9 vibes left'],
      variant: 'light' as const,
    },
    {
      title: 'Deep Blue Nights',
      description: "For those who crave peace louder than the city. This view isn't just scenery, it's a whole reset.",
      price: '$2,999',
      badges: ['Top Pick', 'Only 9 vibes left'],
      variant: 'dark' as const,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {products.map((product, index) => (
        <ProductCard
          key={index}
          {...product}
          onAddToCart={() => alert('Added to cart!')}
        />
      ))}
    </div>
  )
}
