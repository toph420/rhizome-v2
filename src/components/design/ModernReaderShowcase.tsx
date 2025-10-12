'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Network,
  Highlighter,
  Brain,
  Zap,
  Sliders,
  FileQuestion,
  User,
  Eye,
  Type,
  Gauge,
  MessageSquare,
  Sparkles,
  FileText,
  Palette,
  Tag,
  X,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

type HighlightColor = 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'

const COLOR_OPTIONS: Array<{
  key: string
  color: HighlightColor
  label: string
  bgClass: string
  hoverClass: string
}> = [
  {
    key: 'y',
    color: 'yellow',
    label: 'Yellow',
    bgClass: 'bg-yellow-300',
    hoverClass: 'hover:bg-yellow-400',
  },
  {
    key: 'g',
    color: 'green',
    label: 'Green',
    bgClass: 'bg-green-300',
    hoverClass: 'hover:bg-green-400',
  },
  {
    key: 'b',
    color: 'blue',
    label: 'Blue',
    bgClass: 'bg-blue-300',
    hoverClass: 'hover:bg-blue-400',
  },
  {
    key: 'r',
    color: 'red',
    label: 'Red',
    bgClass: 'bg-red-300',
    hoverClass: 'hover:bg-red-400',
  },
  {
    key: 'p',
    color: 'purple',
    label: 'Purple',
    bgClass: 'bg-purple-300',
    hoverClass: 'hover:bg-purple-400',
  },
  {
    key: 'o',
    color: 'orange',
    label: 'Orange',
    bgClass: 'bg-orange-300',
    hoverClass: 'hover:bg-orange-400',
  },
  {
    key: 'k',
    color: 'pink',
    label: 'Pink',
    bgClass: 'bg-pink-300',
    hoverClass: 'hover:bg-pink-400',
  },
]

// Sample markdown document
const SAMPLE_DOCUMENT = `# Gravity's Rainbow: A Study in Paranoia

## Introduction

Thomas Pynchon's *Gravity's Rainbow* presents a sprawling narrative that interweaves themes of technology, paranoia, and conspiracy. The novel's complex structure mirrors the chaotic nature of World War II and its aftermath.

## The Nature of Paranoia

In the post-war landscape, paranoia becomes a lens through which characters interpret reality. **Slothrop's gradual dissolution** represents the ultimate manifestation of this paranoid state—a complete loss of self in the face of overwhelming systemic forces.

> "If they can get you asking the wrong questions, they don't have to worry about answers."

This quote encapsulates the novel's exploration of power and control. The **They** system operates not through direct force, but through the manipulation of perception and understanding.

## Technology as Both Threat and Promise

The V-2 rocket serves as the novel's central symbol, representing:

1. **Military-industrial power** - The convergence of science and warfare
2. **Deterministic systems** - The idea that everything follows predictable patterns
3. **Transcendence** - The possibility of escape or transformation

### The Rocket's Trajectory

The parabolic arc of the rocket becomes a metaphor for the novel itself—a trajectory that begins with promise but ends in destruction. Yet within this arc lies the possibility of understanding, if only we can see the pattern.

## Conclusion

*Gravity's Rainbow* remains one of the most challenging and rewarding texts in American literature. Its paranoid vision speaks to our contemporary moment, where surveillance capitalism and algorithmic control have made Pynchon's fictional systems eerily real.

The novel asks us to consider: **Are we the observers or the observed?** In the end, perhaps both.`

/**
 * ModernReaderShowcase - Complete reader experience with brutalist design
 *
 * Features:
 * - Retro/brutalist navigation with edge panels
 * - Real markdown document rendering
 * - QuickCapture annotation panel with highlight colors, notes, tags
 * - All shadcn components with framer motion animations
 */
export function ModernReaderShowcase() {
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'explore' | 'focus' | 'study'>('explore')
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [annotationPanelOpen, setAnnotationPanelOpen] = useState(false)
  const [note, setNote] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow')

  const documentRef = useRef<HTMLDivElement>(null)

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    if (text && text.length > 0 && documentRef.current?.contains(selection?.anchorNode || null)) {
      setSelectedText(text)
      setAnnotationPanelOpen(true)
    }
  }, [])

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }, [tagInput, tags])

  const handleRemoveTag = useCallback(
    (tag: string) => {
      setTags(tags.filter((t) => t !== tag))
    },
    [tags]
  )

  const handleSaveAnnotation = useCallback((color: HighlightColor) => {
    setSelectedColor(color)
    // In real app: save to database
    console.log('Saving annotation:', { text: selectedText, color, note, tags })
    setAnnotationPanelOpen(false)
    setNote('')
    setTags([])
    setSelectedText(null)
  }, [selectedText, note, tags])

  return (
    <div className="relative w-full h-screen bg-[#e8f5e9] overflow-hidden">
      {/* Retro border decorations */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        {/* Corner squares */}
        <div className="absolute top-4 right-4 w-3 h-3 bg-black" />
        <div className="absolute top-8 right-8 w-2 h-2 bg-black" />
        <div className="absolute top-12 right-12 w-4 h-4 bg-black" />
        <div className="absolute bottom-4 left-4 w-3 h-3 bg-black" />
        <div className="absolute bottom-8 left-8 w-2 h-2 bg-black" />

        {/* Scattered pixels */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-black"
            style={{
              top: `${20 + i * 10}%`,
              right: `${5 + (i % 3) * 15}%`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{
              duration: 2,
              delay: i * 0.2,
              repeat: Infinity,
            }}
          />
        ))}

        {/* Checkered pattern footer */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-black flex">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={cn('flex-1', i % 2 === 0 ? 'bg-black' : 'bg-white')}
            />
          ))}
        </div>
      </div>

      {/* Top Header Bar */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-16 bg-white border-b-4 border-black z-50 flex items-center justify-between px-6"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
            <div className="w-6 h-6 bg-[#e8f5e9] rounded-full" />
          </div>
          <span className="text-2xl font-black tracking-tight">RHIZOME</span>
          <Badge className="bg-red-600 text-white font-bold border-2 border-black">
            V2
          </Badge>
        </div>

        {/* Nav Links */}
        <div className="flex items-center gap-8">
          <button className="font-bold text-sm hover:text-red-600 transition-colors">
            READ
          </button>
          <button className="font-bold text-sm hover:text-red-600 transition-colors">
            WRITE
          </button>
          <button className="font-bold text-sm hover:text-red-600 transition-colors">
            STUDY
          </button>
        </div>

        {/* Profile */}
        <Button variant="ghost" size="icon" className="rounded-full">
          <User className="h-5 w-5" />
        </Button>
      </motion.div>

      {/* Left Edge Panel - Document Outline */}
      <div className="absolute left-0 top-16 bottom-8 z-40 flex">
        {/* Clickable edge trigger */}
        <motion.button
          className="w-12 bg-black text-white flex items-center justify-center border-r-4 border-black hover:bg-red-600 transition-colors relative group"
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          whileHover={{ width: 56 }}
        >
          <div className="writing-vertical text-xs font-black tracking-widest">
            DOCUMENT OUTLINE
          </div>
          <ChevronRight className="absolute opacity-0 group-hover:opacity-100 transition-opacity" />
        </motion.button>

        {/* Expanded panel */}
        <AnimatePresence>
          {leftPanelOpen && (
            <motion.div
              className="w-80 bg-white border-r-4 border-black"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="p-6 border-b-4 border-black">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-black text-lg">OUTLINE</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLeftPanelOpen(false)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>

                {/* Document outline */}
                <div className="space-y-2">
                  {[
                    { level: 1, title: 'Introduction', section: 'intro' },
                    { level: 1, title: 'The Nature of Paranoia', section: 'paranoia' },
                    { level: 1, title: 'Technology as Threat', section: 'tech' },
                    { level: 2, title: 'The Rocket\'s Trajectory', section: 'rocket' },
                    { level: 1, title: 'Conclusion', section: 'conclusion' },
                  ].map((item, i) => (
                    <button
                      key={i}
                      className={cn(
                        'w-full text-left p-2 hover:bg-yellow-200 transition-colors border-2 border-transparent hover:border-black',
                        item.level === 2 && 'pl-6'
                      )}
                    >
                      <span className="font-bold text-sm">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Edge Panel - Reader Sidebar */}
      <div className="absolute right-0 top-16 bottom-8 z-40 flex flex-row-reverse">
        {/* Clickable edge trigger */}
        <motion.button
          className="w-12 bg-black text-white flex items-center justify-center border-l-4 border-black hover:bg-red-600 transition-colors relative group"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          whileHover={{ width: 56 }}
        >
          <div className="writing-vertical text-xs font-black tracking-widest">
            READER SIDEBAR
          </div>
          <ChevronLeft className="absolute opacity-0 group-hover:opacity-100 transition-opacity" />
        </motion.button>

        {/* Expanded panel */}
        <AnimatePresence>
          {rightPanelOpen && (
            <motion.div
              className="w-96 bg-white border-l-4 border-black"
              initial={{ x: 384 }}
              animate={{ x: 0 }}
              exit={{ x: 384 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="h-full flex flex-col">
                {/* Header with close button */}
                <div className="p-4 border-b-4 border-black flex items-center justify-between">
                  <h2 className="font-black text-lg">SIDEBAR</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRightPanelOpen(false)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Icon-only tabs (6 columns) */}
                <div className="grid grid-cols-6 border-b-4 border-black bg-gray-50">
                  {[
                    { icon: Network, label: 'Connections', badge: null },
                    { icon: Highlighter, label: 'Annotations', badge: 5 },
                    { icon: Zap, label: 'Sparks', badge: null },
                    { icon: Brain, label: 'Cards', badge: null },
                    { icon: FileQuestion, label: 'Review', badge: 3 },
                    { icon: Sliders, label: 'Tune', badge: null },
                  ].map((tab, i) => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={i}
                        className="relative p-3 border-r-2 border-black last:border-r-0 hover:bg-yellow-200 transition-colors flex flex-col items-center justify-center gap-1"
                        title={tab.label}
                      >
                        <Icon className="h-5 w-5" />
                        {tab.badge && (
                          <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-red-600">
                            {tab.badge}
                          </Badge>
                        )}
                        <span className="text-[8px] font-bold uppercase">
                          {tab.label.slice(0, 4)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Tab content - Connections */}
                <div className="flex-1 p-6 overflow-y-auto">
                  <div className="space-y-4">
                    {[
                      {
                        title: 'Paranoia & Surveillance',
                        description: 'Similar themes in contemporary tech criticism',
                        strength: 0.89,
                        type: 'THEMATIC_BRIDGE',
                      },
                      {
                        title: 'Military Technology',
                        description: 'Connection to Cold War systems analysis',
                        strength: 0.85,
                        type: 'SEMANTIC_SIMILARITY',
                      },
                      {
                        title: 'Determinism vs Free Will',
                        description: 'Contradicts earlier optimistic view',
                        strength: 0.82,
                        type: 'CONTRADICTION',
                      },
                    ].map((conn, i) => (
                      <motion.div
                        key={i}
                        className="border-4 border-black p-4 bg-white hover:bg-yellow-100 transition-colors cursor-pointer"
                        style={{
                          boxShadow: '6px 6px 0 0 rgba(0,0,0,1)',
                        }}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                            <Network className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-sm mb-1">{conn.title}</h4>
                            <p className="text-xs text-gray-600">{conn.description}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <Badge className="bg-red-600 text-white text-xs">
                                {conn.strength}
                              </Badge>
                              <span className="text-[10px] font-mono text-gray-500">
                                {conn.type}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Control Panel */}
      <motion.div
        className="absolute bottom-8 left-12 right-12 h-20 bg-white border-4 border-black z-50 flex items-center justify-between px-6"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 20, delay: 0.2 }}
        style={{
          boxShadow: '8px 8px 0 0 rgba(0,0,0,1)',
        }}
      >
        {/* Chat with document (bottom left) */}
        <Button
          className="bg-red-600 hover:bg-red-700 text-white font-black border-4 border-black px-6 py-2 h-auto"
          style={{
            boxShadow: '4px 4px 0 0 rgba(0,0,0,1)',
          }}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          CHAT
        </Button>

        {/* View mode controls (center) */}
        <div className="flex items-center gap-2">
          {(['explore', 'focus', 'study'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'px-4 py-2 font-black text-sm border-4 border-black transition-all uppercase',
                viewMode === mode ? 'bg-yellow-300' : 'bg-white hover:bg-gray-100'
              )}
              style={{
                boxShadow: viewMode === mode ? '3px 3px 0 0 rgba(0,0,0,1)' : 'none',
              }}
            >
              {mode === 'explore' && <Eye className="h-4 w-4 inline mr-1" />}
              {mode === 'focus' && <Type className="h-4 w-4 inline mr-1" />}
              {mode === 'study' && <Brain className="h-4 w-4 inline mr-1" />}
              {mode}
            </button>
          ))}
        </div>

        {/* Text options */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-4 border-black">
            <Type className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="border-4 border-black">
            <Gauge className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs font-mono font-bold">PROGRESS</span>
            <span className="text-lg font-black">42%</span>
          </div>
          <div className="w-32 h-3 border-4 border-black bg-white overflow-hidden">
            <motion.div
              className="h-full bg-red-600"
              initial={{ width: 0 }}
              animate={{ width: '42%' }}
              transition={{ duration: 1, delay: 0.5 }}
            />
          </div>
        </div>

        {/* Spark button (bottom right) */}
        <Button
          className="bg-yellow-300 hover:bg-yellow-400 text-black font-black border-4 border-black px-6 py-2 h-auto"
          style={{
            boxShadow: '4px 4px 0 0 rgba(0,0,0,1)',
          }}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          SPARK
        </Button>
      </motion.div>

      {/* Center Content - Document Reader */}
      <div className="absolute top-16 left-12 right-12 bottom-36 overflow-hidden">
        <div className="h-full overflow-y-auto p-8">
          <motion.div
            ref={documentRef}
            className="max-w-3xl mx-auto bg-white border-4 border-black p-12 shadow-2xl"
            style={{
              boxShadow: '12px 12px 0 0 rgba(0,0,0,1)',
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            onMouseUp={handleMouseUp}
          >
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown
                components={{
                h1: ({ children }) => (
                  <h1 className="text-4xl font-black mb-6 border-b-4 border-black pb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-3xl font-black mt-8 mb-4 flex items-center gap-2">
                    <span className="w-2 h-8 bg-red-600" />
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-2xl font-bold mt-6 mb-3">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="mb-4 leading-relaxed text-gray-800">{children}</p>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-8 border-yellow-300 bg-yellow-50 pl-6 py-4 my-6 font-semibold italic">
                    {children}
                  </blockquote>
                ),
                strong: ({ children }) => (
                  <strong className="font-black text-black">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="font-semibold italic">{children}</em>
                ),
                ul: ({ children }) => (
                  <ul className="list-none space-y-2 my-4">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-none space-y-2 my-4">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-black text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                      •
                    </span>
                    <span>{children}</span>
                  </li>
                ),
              }}
              >
                {SAMPLE_DOCUMENT}
              </ReactMarkdown>
            </div>
          </motion.div>
        </div>
      </div>

      {/* QuickCapture Annotation Panel - Brutalist Style */}
      <AnimatePresence>
        {annotationPanelOpen && selectedText && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAnnotationPanelOpen(false)}
          >
            <motion.div
              className="bg-white border-8 border-black p-6 w-[500px] max-w-[90vw]"
              style={{
                boxShadow: '12px 12px 0 0 rgba(0,0,0,1)',
              }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Highlighter className="h-5 w-5" />
                    <h3 className="font-black text-lg">QUICK CAPTURE</h3>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 bg-gray-100 p-2 border-2 border-black">
                    &ldquo;{selectedText}&rdquo;
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAnnotationPanelOpen(false)}
                  className="border-2 border-black"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Color Picker */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  <span className="text-sm font-black uppercase">Highlight Color</span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {COLOR_OPTIONS.map((option) => (
                    <motion.button
                      key={option.color}
                      onClick={() => handleSaveAnnotation(option.color)}
                      className={cn(
                        'aspect-square rounded-none border-4 border-black transition-all flex flex-col items-center justify-center',
                        option.bgClass,
                        option.hoverClass
                      )}
                      style={{
                        boxShadow:
                          selectedColor === option.color
                            ? '4px 4px 0 0 rgba(0,0,0,1)'
                            : '2px 2px 0 0 rgba(0,0,0,1)',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="text-xs font-black">{option.key.toUpperCase()}</span>
                    </motion.button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 font-mono">
                  Press letter key or click color to save
                </p>
              </div>

              {/* Note */}
              <div className="space-y-3 mb-6">
                <label className="text-sm font-black uppercase">Note (optional)</label>
                <Textarea
                  placeholder="Add context, thoughts, questions..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[100px] resize-none border-4 border-black focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                />
              </div>

              {/* Tags */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  <label className="text-sm font-black uppercase">Tags</label>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddTag()
                      }
                    }}
                    placeholder="Add tags (press Enter)..."
                    className="border-4 border-black focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                  />
                  <Button
                    onClick={handleAddTag}
                    className="border-4 border-black bg-black text-white hover:bg-gray-800 font-black"
                  >
                    ADD
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        className="bg-yellow-300 text-black border-2 border-black font-bold hover:bg-yellow-400 gap-2"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => setAnnotationPanelOpen(false)}
                  className="border-4 border-black font-black flex-1"
                >
                  CANCEL
                </Button>
                <Button
                  onClick={() => handleSaveAnnotation(selectedColor)}
                  className="bg-red-600 hover:bg-red-700 text-white border-4 border-black font-black flex-1"
                  style={{
                    boxShadow: '4px 4px 0 0 rgba(0,0,0,1)',
                  }}
                >
                  SAVE WITH NOTE
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Info Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-white border-t-4 border-black z-50 flex items-center justify-between px-4 text-xs font-black">
        <span>DESIGN V2</span>
        <span>SHADCN + FRAMER MOTION</span>
        <span className="flex items-center gap-2">
          <span>&gt;&gt;&gt;&gt;&gt;</span>
          <span>REAL DOCUMENT READER</span>
        </span>
        <div className="flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-6 h-6 bg-black" />
          ))}
        </div>
      </div>

      {/* Custom CSS for vertical text */}
      <style jsx>{`
        .writing-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          transform: rotate(180deg);
        }
      `}</style>
    </div>
  )
}
