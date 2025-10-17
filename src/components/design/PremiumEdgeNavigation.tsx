'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import {
  Network,
  Highlighter,
  Brain,
  Zap,
  Sliders,
  FileQuestion,
  BookOpen,
  Sparkles,
  Quote,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Focus,
  GraduationCap,
  MessageCircle,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Premium edge-based navigation with product card aesthetics.
 * Features smooth glassmorphic panels, elegant document display,
 * and a beautiful floating annotation capture system.
 */
export function PremiumEdgeNavigation() {
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'explore' | 'focus' | 'study'>('explore')
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [activeTab, setActiveTab] = useState<'connections' | 'annotations' | 'sparks' | 'cards' | 'review' | 'tune'>('connections')

  // Mouse tracking for subtle parallax effects
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set((e.clientX - rect.left - rect.width / 2) / 50)
    mouseY.set((e.clientY - rect.top - rect.height / 2) / 50)
  }

  // Mock document content with highlights
  const documentContent = {
    title: 'Anti-Oedipus: Capitalism and Schizophrenia',
    author: 'Gilles Deleuze & Félix Guattari',
    paragraphs: [
      {
        text: "The unconscious poses no problem of meaning, solely problems of use. The question posed by desire is not 'What does it mean?' but rather 'How does it work?'",
        highlights: [{ start: 92, end: 116, color: 'yellow' }],
        hasAnnotation: false,
      },
      {
        text: "Desire does not lack anything; it does not lack its object. It is, rather, the subject that is missing in desire, or desire that lacks a fixed subject; there is no fixed subject unless there is repression.",
        highlights: [{ start: 0, end: 32, color: 'pink' }, { start: 95, end: 133, color: 'blue' }],
        hasAnnotation: true,
      },
      {
        text: "Desire and its object are one and the same thing: the machine, as a machine of a machine. Desire is a machine, the object of desire is a connected machine, so that the product is lifted from the process of producing, and something detaches itself from producing to product and gives a leftover to the vagabond, nomad subject.",
        highlights: [],
        hasAnnotation: false,
      },
      {
        text: "The real is not impossible; on the contrary, within the real everything is possible, everything becomes possible. Desire does not express a molar lack, but constitutes a molecular positivity.",
        highlights: [{ start: 0, end: 96, color: 'green' }],
        hasAnnotation: true,
      },
    ]
  }

  // Mock connections
  const mockConnections = [
    {
      id: '1',
      targetChunk: 'Chunk 45',
      snippet: 'Discusses the concept of desiring-machines in relation to capitalism...',
      engine: 'SEMANTIC_SIMILARITY',
      score: 0.89,
      icon: Network,
      color: 'from-blue-500 to-purple-500',
    },
    {
      id: '2',
      targetChunk: 'Chunk 67',
      snippet: 'Contradicts the traditional psychoanalytic view of lack and desire...',
      engine: 'CONTRADICTION',
      score: 0.92,
      icon: Zap,
      color: 'from-orange-500 to-red-500',
    },
    {
      id: '3',
      targetChunk: 'Chunk 102',
      snippet: 'Explores themes of deterritorialization and schizophrenic process...',
      engine: 'THEMATIC_BRIDGE',
      score: 0.85,
      icon: Brain,
      color: 'from-green-500 to-teal-500',
    },
  ]

  return (
    <div
      className="relative w-full h-[900px] bg-gradient-to-br from-slate-50 via-white to-slate-100 overflow-hidden rounded-3xl shadow-2xl"
      onMouseMove={handleMouseMove}
    >
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.5, 0.3, 0.5],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* Top Navigation Bar */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-20 backdrop-blur-xl bg-white/80 border-b border-slate-200/50 z-50"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      >
        <div className="h-full flex items-center justify-between px-8">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-3"
            whileHover={{ scale: 1.05 }}
          >
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
                Rhizome
              </h1>
              <p className="text-xs text-slate-500">AI-Powered Reading</p>
            </div>
          </motion.div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-2 bg-slate-100/80 backdrop-blur-sm rounded-full p-1.5">
            {[
              { mode: 'explore' as const, icon: Eye, label: 'Explore' },
              { mode: 'focus' as const, icon: Focus, label: 'Focus' },
              { mode: 'study' as const, icon: GraduationCap, label: 'Study' },
            ].map(({ mode, icon: Icon, label }) => (
              <motion.button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-5 py-2.5 rounded-full font-medium text-sm transition-all flex items-center gap-2',
                  viewMode === mode
                    ? 'bg-white text-slate-900 shadow-lg'
                    : 'text-slate-600 hover:text-slate-900'
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </motion.button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <motion.button
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <MessageCircle className="h-5 w-5 text-slate-700" />
            </motion.button>
            <motion.button
              onClick={() => setShowAnnotationPanel(true)}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-white font-medium shadow-lg flex items-center gap-2"
              whileHover={{ scale: 1.05, boxShadow: '0 10px 30px -10px rgba(251, 191, 36, 0.5)' }}
              whileTap={{ scale: 0.95 }}
            >
              <Sparkles className="h-4 w-4" />
              Quick Capture
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Left Edge Panel - Table of Contents */}
      <div className="absolute left-0 top-20 bottom-0 z-40 flex">
        {/* Edge trigger */}
        <motion.button
          className={cn(
            'w-16 backdrop-blur-xl bg-slate-900/90 border-r border-slate-700/50 flex items-center justify-center transition-all group relative overflow-hidden',
            leftPanelOpen && 'bg-slate-800/90'
          )}
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          whileHover={{ width: 72 }}
        >
          <div className="writing-mode-vertical text-xs font-bold tracking-widest text-white/90 group-hover:text-white transition-colors">
            TABLE OF CONTENTS
          </div>

          {/* Glow effect on hover */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/20 to-blue-500/0"
            initial={{ x: '-100%' }}
            whileHover={{ x: '100%' }}
            transition={{ duration: 0.6 }}
          />
        </motion.button>

        {/* Expanded panel */}
        <AnimatePresence>
          {leftPanelOpen && (
            <motion.div
              className="w-80 backdrop-blur-2xl bg-white/95 border-r border-slate-200/50 shadow-2xl"
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            >
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-200/50">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-slate-900">Contents</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLeftPanelOpen(false)}
                      className="rounded-full"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-slate-500">Navigate through sections</p>
                </div>

                {/* TOC items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {[
                    { level: 1, title: 'Introduction: The Desiring-Machines', page: 1, progress: 100 },
                    { level: 2, title: 'Desiring-Production', page: 5, progress: 100 },
                    { level: 2, title: 'The Body without Organs', page: 12, progress: 75 },
                    { level: 2, title: 'The Subject and Enjoyment', page: 20, progress: 30 },
                    { level: 1, title: 'Psychoanalysis and Capitalism', page: 28, progress: 0 },
                    { level: 2, title: 'Social Machine', page: 32, progress: 0 },
                    { level: 2, title: 'The Civilized Machine', page: 45, progress: 0 },
                  ].map((item, i) => (
                    <motion.button
                      key={i}
                      className={cn(
                        'w-full group relative overflow-hidden rounded-xl transition-all',
                        item.level === 2 && 'ml-6'
                      )}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="relative z-10 p-4 text-left">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className={cn(
                            'font-semibold',
                            item.level === 1 ? 'text-sm text-slate-900' : 'text-sm text-slate-700'
                          )}>
                            {item.title}
                          </span>
                          <Badge variant="secondary" className="text-xs font-mono shrink-0">
                            p.{item.page}
                          </Badge>
                        </div>
                        {item.progress > 0 && (
                          <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${item.progress}%` }}
                              transition={{ duration: 1, delay: i * 0.1 }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Hover gradient background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-purple-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Edge Panel - Connections & Insights */}
      <div className="absolute right-0 top-20 bottom-0 z-40 flex flex-row-reverse">
        {/* Edge trigger */}
        <motion.button
          className={cn(
            'w-16 backdrop-blur-xl bg-slate-900/90 border-l border-slate-700/50 flex items-center justify-center transition-all group relative overflow-hidden',
            rightPanelOpen && 'bg-slate-800/90'
          )}
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          whileHover={{ width: 72 }}
        >
          <div className="writing-mode-vertical text-xs font-bold tracking-widest text-white/90 group-hover:text-white transition-colors">
            CONNECTIONS
          </div>

          {/* Glow effect on hover */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-l from-purple-500/0 via-purple-500/20 to-purple-500/0"
            initial={{ x: '100%' }}
            whileHover={{ x: '-100%' }}
            transition={{ duration: 0.6 }}
          />
        </motion.button>

        {/* Expanded panel */}
        <AnimatePresence>
          {rightPanelOpen && (
            <motion.div
              className="w-96 backdrop-blur-2xl bg-white/95 border-l border-slate-200/50 shadow-2xl"
              initial={{ x: 384, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 384, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            >
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-200/50">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-slate-900">Insights</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRightPanelOpen(false)}
                      className="rounded-full"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-slate-500">AI-discovered connections</p>
                </div>

                {/* Tab navigation */}
                <div className="grid grid-cols-6 border-b border-slate-200/50 bg-slate-50/50">
                  {[
                    { id: 'connections', icon: Network, label: 'Links', badge: 8 },
                    { id: 'annotations', icon: Highlighter, label: 'Notes', badge: null },
                    { id: 'sparks', icon: Zap, label: 'Ideas', badge: 3 },
                    { id: 'cards', icon: Brain, label: 'Cards', badge: null },
                    { id: 'review', icon: FileQuestion, label: 'Quiz', badge: null },
                    { id: 'tune', icon: Sliders, label: 'Tune', badge: null },
                  ].map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <motion.button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                          'relative p-3 flex flex-col items-center justify-center gap-1 transition-all',
                          isActive ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        )}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[9px] font-semibold uppercase tracking-wide">
                          {tab.label}
                        </span>
                        {tab.badge && (
                          <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-gradient-to-br from-red-500 to-pink-500 border-0">
                            {tab.badge}
                          </Badge>
                        )}
                        {isActive && (
                          <motion.div
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500"
                            layoutId="activeTab"
                          />
                        )}
                      </motion.button>
                    )
                  })}
                </div>

                {/* Tab content - Connections */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-3">
                    {mockConnections.map((connection, i) => {
                      const Icon = connection.icon
                      return (
                        <motion.div
                          key={connection.id}
                          className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200/50 shadow-sm hover:shadow-xl transition-all cursor-pointer"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          whileHover={{ scale: 1.02, y: -4 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="p-4">
                            <div className="flex items-start gap-3 mb-3">
                              <div className={cn(
                                'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg',
                                connection.color
                              )}>
                                <Icon className="h-5 w-5 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm text-slate-900 mb-1">
                                  {connection.targetChunk}
                                </h4>
                                <p className="text-xs text-slate-600 line-clamp-2">
                                  {connection.snippet}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <Badge variant="secondary" className="text-[10px] font-mono">
                                {connection.engine.toLowerCase()}
                              </Badge>
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 bg-slate-200 rounded-full overflow-hidden">
                                  <motion.div
                                    className={cn('h-full bg-gradient-to-r', connection.color)}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${connection.score * 100}%` }}
                                    transition={{ duration: 1, delay: i * 0.1 + 0.3 }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-slate-700">
                                  {(connection.score * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Gradient hover overlay */}
                          <div className={cn(
                            'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none',
                            connection.color
                          )} />
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Center Content - Document with Highlights */}
      <div className="absolute top-20 left-16 right-16 bottom-0 overflow-hidden">
        <div className="h-full flex items-center justify-center p-12">
          <motion.div
            className="max-w-3xl w-full backdrop-blur-2xl bg-white/90 rounded-3xl shadow-2xl border border-slate-200/50 overflow-hidden"
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 200, delay: 0.2 }}
          >
            {/* Document header */}
            <div className="p-8 border-b border-slate-200/50 bg-gradient-to-br from-slate-50 to-white">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Badge className="mb-3 bg-slate-900 text-white">Philosophy • 1972</Badge>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                  {documentContent.title}
                </h1>
                <p className="text-slate-600">{documentContent.author}</p>
              </motion.div>
            </div>

            {/* Document content with highlights */}
            <div className="p-8 overflow-y-auto max-h-[600px] space-y-6">
              {documentContent.paragraphs.map((para, i) => (
                <motion.div
                  key={i}
                  className="group relative"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                >
                  <p className="text-slate-800 leading-relaxed text-lg">
                    {para.highlights.length > 0 ? (
                      <>
                        {/* Render text with highlights */}
                        {para.text.split('').map((char, charIndex) => {
                          const highlight = para.highlights.find(
                            h => charIndex >= h.start && charIndex < h.end
                          )

                          if (highlight) {
                            const colorClasses = {
                              yellow: 'bg-yellow-200/70 border-b-2 border-yellow-400',
                              pink: 'bg-pink-200/70 border-b-2 border-pink-400',
                              blue: 'bg-blue-200/70 border-b-2 border-blue-400',
                              green: 'bg-green-200/70 border-b-2 border-green-400',
                            }

                            return (
                              <motion.span
                                key={charIndex}
                                className={cn('px-0.5 py-0.5', colorClasses[highlight.color as keyof typeof colorClasses])}
                                initial={{ backgroundColor: 'transparent' }}
                                animate={{ backgroundColor: undefined }}
                                transition={{ delay: 0.8 + i * 0.1 }}
                              >
                                {char}
                              </motion.span>
                            )
                          }

                          return <span key={charIndex}>{char}</span>
                        })}
                      </>
                    ) : (
                      para.text
                    )}
                  </p>

                  {/* Annotation indicator */}
                  {para.hasAnnotation && (
                    <motion.div
                      className="absolute -left-6 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      initial={{ x: -10 }}
                      whileHover={{ x: 0 }}
                    >
                      <div className="w-2 h-2 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500" />
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Floating Annotation Panel */}
      <AnimatePresence>
        {showAnnotationPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/20 backdrop-blur-sm z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAnnotationPanel(false)}
            />

            {/* Annotation Panel */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl z-50"
              initial={{ opacity: 0, scale: 0.9, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 50 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="mx-4 backdrop-blur-3xl bg-white/95 rounded-3xl shadow-2xl border border-slate-200/50 overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-200/50 bg-gradient-to-r from-yellow-50 to-orange-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">Quick Capture</h2>
                        <p className="text-sm text-slate-600">Save your thoughts instantly</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAnnotationPanel(false)}
                      className="rounded-full"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                {/* Form */}
                <div className="p-6 space-y-4">
                  {/* Selected text preview */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/50">
                    <div className="flex items-start gap-3">
                      <Quote className="h-5 w-5 text-slate-400 shrink-0 mt-1" />
                      <p className="text-sm text-slate-700 italic">
                        "Desire does not lack anything; it does not lack its object. It is, rather, the subject that is missing in desire..."
                      </p>
                    </div>
                  </div>

                  {/* Annotation type selector */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'note', icon: Highlighter, label: 'Note', color: 'from-blue-500 to-blue-600' },
                      { id: 'idea', icon: Zap, label: 'Idea', color: 'from-purple-500 to-purple-600' },
                      { id: 'question', icon: FileQuestion, label: 'Question', color: 'from-orange-500 to-orange-600' },
                    ].map((type) => {
                      const Icon = type.icon
                      return (
                        <motion.button
                          key={type.id}
                          className={cn(
                            'p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2',
                            'border-slate-200 hover:border-slate-300 bg-white hover:shadow-lg'
                          )}
                          whileHover={{ scale: 1.05, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center', type.color)}>
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                          <span className="text-sm font-medium text-slate-700">{type.label}</span>
                        </motion.button>
                      )
                    })}
                  </div>

                  {/* Text area */}
                  <div>
                    <textarea
                      className="w-full h-32 p-4 rounded-2xl border-2 border-slate-200 focus:border-slate-400 outline-none transition-colors resize-none bg-white text-slate-900 placeholder-slate-400"
                      placeholder="Add your thoughts here..."
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Chapter 1, p.12
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        3 connections
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => setShowAnnotationPanel(false)}
                      >
                        Cancel
                      </Button>
                      <motion.button
                        className="px-8 py-3 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-semibold shadow-lg flex items-center gap-2"
                        whileHover={{ scale: 1.05, boxShadow: '0 10px 30px -10px rgba(251, 191, 36, 0.5)' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setShowAnnotationPanel(false)
                          // Toast notification would go here
                        }}
                      >
                        <Save className="h-4 w-4" />
                        Save Annotation
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Custom CSS for vertical text */}
      <style jsx>{`
        .writing-mode-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          transform: rotate(180deg);
        }
      `}</style>
    </div>
  )
}
