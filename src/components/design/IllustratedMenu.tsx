'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { ChevronDown, ChevronUp, X, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MenuItem {
  title: string
  description: string
  icon: string // emoji
  href?: string
}

interface MenuSection {
  title: string
  icon?: string
  items: MenuItem[]
}

export function IllustratedMenu() {
  const [expandedSection, setExpandedSection] = useState<string>('Product')
  const [isOpen, setIsOpen] = useState(true)

  const menuSections: MenuSection[] = [
    {
      title: 'Product',
      items: [
        {
          title: 'Meet the product',
          description: 'Explore our core capabilities to transform your workflows.',
          icon: '📦',
        },
        {
          title: 'Library',
          description: 'Be inspired by over 500 pre-built workflows.',
          icon: '📚',
        },
        {
          title: "What's new",
          description: 'Discover our latest updates and releases.',
          icon: '📢',
        },
      ],
    },
    {
      title: 'Solutions',
      items: [
        {
          title: 'Security',
          description: 'Protect your organization',
          icon: '🔒',
        },
        {
          title: 'IT',
          description: 'Streamline IT operations',
          icon: '💻',
        },
        {
          title: 'Infrastructure',
          description: 'Manage cloud infrastructure',
          icon: '🏗️',
        },
        {
          title: 'Engineering',
          description: 'Automate development workflows',
          icon: '⚙️',
        },
      ],
    },
    {
      title: 'Resources',
      items: [
        {
          title: 'Documentation',
          description: 'Guides and API references',
          icon: '📖',
        },
        {
          title: 'Community',
          description: 'Join our community',
          icon: '👥',
        },
        {
          title: 'Blog',
          description: 'Latest news and insights',
          icon: '✍️',
        },
      ],
    },
  ]

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? '' : section)
  }

  if (!isOpen) return null

  return (
    <motion.div
      className="fixed inset-0 bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 z-50 overflow-y-auto"
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <span className="text-2xl">🎯</span>
            </div>
            <span className="text-white text-xl font-bold">tines</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-white/90 hover:text-white font-medium">
              Book a demo
            </button>
            <button className="text-white/70 hover:text-white">
              <Search className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Menu Sections */}
        <div className="space-y-4">
          {menuSections.map((section) => (
            <div key={section.title} className="space-y-2">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.title)}
                className="w-full flex items-center justify-between text-left text-white py-2"
              >
                <span className="font-semibold text-lg">{section.title}</span>
                {expandedSection === section.title ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>

              {/* Section Content */}
              <AnimatePresence>
                {expandedSection === section.title && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 space-y-3">
                      {section.items.map((item, index) => (
                        <motion.a
                          key={index}
                          href={item.href || '#'}
                          className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/10 transition-colors group"
                          whileHover={{ x: 4 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        >
                          {/* Icon */}
                          <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-2xl">
                            {item.icon}
                          </div>

                          {/* Content */}
                          <div className="flex-1">
                            <h3 className="text-white font-semibold mb-1 group-hover:text-purple-100">
                              {item.title}
                            </h3>
                            <p className="text-purple-200 text-sm">
                              {item.description}
                            </p>
                          </div>
                        </motion.a>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Footer CTA (Optional) */}
        <div className="mt-8 pt-6 border-t border-white/20">
          <motion.button
            className="w-full bg-white text-purple-700 font-semibold py-4 rounded-full hover:bg-purple-50 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Get Started Free
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

// Trigger button component
export function IllustratedMenuTrigger() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(true)}
        className="bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        Open Illustrated Menu
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <div onClick={() => setIsOpen(false)}>
            <IllustratedMenu />
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
