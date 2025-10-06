'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface TexturedCardProps {
  title: string
  description?: string
  badge?: string
  variant?: 'earth' | 'mars' | 'neutral'
  showPlanet?: boolean
  className?: string
  children?: React.ReactNode
}

export function TexturedCard({
  title,
  description,
  badge,
  variant = 'neutral',
  showPlanet = false,
  className,
  children,
}: TexturedCardProps) {
  return (
    <motion.div
      className={cn(
        'card-textured noise-filter',
        `card-textured-${variant}`,
        className
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="card-textured-content space-y-4">
        {/* Planet Graphic (Optional) */}
        {showPlanet && (
          <div className="flex justify-center mb-6">
            <motion.div
              className={cn(
                'planet-circle noise-filter w-32 h-32 shadow-lg',
                variant === 'earth' && 'planet-earth',
                variant === 'mars' && 'planet-mars'
              )}
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        )}

        {/* Title */}
        <h2 className="text-display text-display-lg">
          {title}
        </h2>

        {/* Description */}
        {description && (
          <p className="text-base opacity-90 leading-relaxed">
            {description}
          </p>
        )}

        {/* Badge */}
        {badge && (
          <div className="pt-2">
            <span className="badge-textured">
              {badge}
            </span>
          </div>
        )}

        {/* Custom Children */}
        {children}
      </div>
    </motion.div>
  )
}

interface PlanetCardGridProps {
  cards: Array<{
    id: string
    title: string
    description: string
    badge: string
    variant: 'earth' | 'mars' | 'neutral'
  }>
}

export function PlanetCardGrid({ cards }: PlanetCardGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cards.map((card, index) => (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <TexturedCard
            title={card.title}
            description={card.description}
            badge={card.badge}
            variant={card.variant}
            showPlanet
          />
        </motion.div>
      ))}
    </div>
  )
}
