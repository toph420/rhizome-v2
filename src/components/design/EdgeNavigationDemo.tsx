'use client'

import { useState } from 'react'
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
  FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Edge-based navigation demo inspired by Front Line design.
 * Features clickable edge panels that expand to reveal navigation options.
 * @returns React component with interactive edge navigation demo.
 */
export function EdgeNavigationDemo() {
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'explore' | 'focus' | 'study'>('explore')

  return (
    <div className="relative w-full h-[800px] bg-[#e8f5e9] overflow-hidden border-8 border-black rounded-lg">
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
              className={cn(
                'flex-1',
                i % 2 === 0 ? 'bg-black' : 'bg-white'
              )}
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
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
        >
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

                {/* Mock outline */}
                <div className="space-y-2">
                  {[
                    { level: 1, title: 'Introduction', page: 1 },
                    { level: 2, title: 'Background', page: 3 },
                    { level: 2, title: 'Motivation', page: 5 },
                    { level: 1, title: 'Methodology', page: 8 },
                    { level: 2, title: 'Data Collection', page: 10 },
                    { level: 2, title: 'Analysis', page: 15 },
                    { level: 1, title: 'Results', page: 22 },
                  ].map((item, i) => (
                    <button
                      key={i}
                      className={cn(
                        'w-full text-left p-2 hover:bg-yellow-200 transition-colors border-2 border-transparent hover:border-black',
                        item.level === 2 && 'pl-6'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{item.title}</span>
                        <Badge variant="outline" className="font-mono text-xs">
                          {item.page}
                        </Badge>
                      </div>
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
                    { icon: Highlighter, label: 'Annotations', badge: null },
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

                {/* Tab content placeholder */}
                <div className="flex-1 p-6 overflow-y-auto">
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="border-4 border-black p-4 bg-white hover:bg-yellow-100 transition-colors cursor-pointer"
                        style={{
                          boxShadow: '6px 6px 0 0 rgba(0,0,0,1)',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                            <Network className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-sm mb-1">
                              Connection {i + 1}
                            </h4>
                            <p className="text-xs text-gray-600">
                              This chunk relates to another section discussing similar concepts.
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <Badge className="bg-red-600 text-white text-xs">
                                0.{85 + i}
                              </Badge>
                              <span className="text-[10px] font-mono text-gray-500">
                                THEMATIC_BRIDGE
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
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
                viewMode === mode
                  ? 'bg-yellow-300'
                  : 'bg-white hover:bg-gray-100'
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
          <Button
            variant="outline"
            size="icon"
            className="border-4 border-black"
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="border-4 border-black"
          >
            <Gauge className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs font-mono font-bold">PROGRESS</span>
            <span className="text-lg font-black">37%</span>
          </div>
          <div className="w-32 h-3 border-4 border-black bg-white overflow-hidden">
            <motion.div
              className="h-full bg-red-600"
              initial={{ width: 0 }}
              animate={{ width: '37%' }}
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

      {/* Center Content - Mock Document */}
      <div className="absolute top-16 left-12 right-12 bottom-36 overflow-hidden">
        <div className="h-full flex items-center justify-center p-12">
          <div className="max-w-3xl bg-white border-4 border-black p-12 shadow-2xl">
            {/* Halftone circle decoration (like Statue of Liberty halo) */}
            <div className="relative mb-8">
              <div
                className="w-32 h-32 mx-auto rounded-full border-4 border-red-600 relative overflow-hidden"
                style={{
                  background: 'radial-gradient(circle, rgba(239, 68, 68, 0.2) 0%, transparent 70%)',
                }}
              >
                {/* Dot pattern */}
                <div className="absolute inset-0 opacity-40">
                  {[...Array(8)].map((_, ring) => {
                    const radius = 10 + ring * 8
                    const count = 8 + ring * 4
                    return [...Array(count)].map((_, i) => {
                      const angle = (i / count) * 2 * Math.PI
                      const x = 50 + radius * Math.cos(angle)
                      const y = 50 + radius * Math.sin(angle)
                      return (
                        <div
                          key={`${ring}-${i}`}
                          className="absolute w-1 h-1 bg-red-600 rounded-full"
                          style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                      )
                    })
                  })}
                </div>

                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileText className="h-12 w-12 text-red-600" />
                </div>
              </div>
            </div>

            <h1 className="text-4xl font-black mb-4 text-center">
              Defense<sup className="text-sm">®</sup><br />
              Intelligence
            </h1>

            <p className="text-center text-sm font-bold mb-8 max-w-md mx-auto">
              Rhizome builds software and reader systems that give operators,
              analysts, and commanders the advantage in contested reading environments.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Button
                className="bg-red-600 hover:bg-red-700 text-white font-black border-4 border-black px-8 py-3 h-auto"
                style={{
                  boxShadow: '6px 6px 0 0 rgba(0,0,0,1)',
                }}
              >
                START READING
              </Button>
              <Button
                variant="outline"
                className="font-black border-4 border-black px-8 py-3 h-auto bg-white hover:bg-gray-100"
                style={{
                  boxShadow: '6px 6px 0 0 rgba(0,0,0,1)',
                }}
              >
                VIEW LIBRARY &gt;&gt;&gt;
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-white border-t-4 border-black z-50 flex items-center justify-between px-4 text-xs font-black">
        <span>NYC</span>
        <span>FIELD TESTED IN READING ROOMS</span>
        <span className="flex items-center gap-2">
          <span>&gt;&gt;&gt;&gt;&gt;</span>
          <span>OPEN SOURCE</span>
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
