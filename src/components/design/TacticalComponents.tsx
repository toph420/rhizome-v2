'use client'

import { motion } from 'framer-motion'
import { Activity, AlertTriangle, CheckCircle, Clock, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

/* =====================================================
   TACTICAL PANEL
   ===================================================== */

interface TacticalPanelProps {
  title?: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  scanning?: boolean
}

export function TacticalPanel({ title, subtitle, children, className, scanning = false }: TacticalPanelProps) {
  return (
    <div className={cn('tactical-panel tactical-corners relative', scanning && 'tactical-scan', className)}>
      {title && (
        <div className="mb-4">
          <h3 className="tactical-text text-sm font-semibold uppercase tracking-wider">
            {title}
          </h3>
          {subtitle && (
            <p className="tactical-text-dim text-xs mt-1">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

/* =====================================================
   AGENT PROFILE
   ===================================================== */

interface AgentProfileProps {
  agentId: string
  codeName: string
  age?: number
  activeUntil?: string
  avatar?: string
}

export function AgentProfile({ agentId, codeName, age, activeUntil }: AgentProfileProps) {
  return (
    <TacticalPanel title="Agent Details" subtitle="Detailed dossier of intelligence personnel">
      <div className="space-y-4">
        {/* Agent Avatar Placeholder */}
        <div className="w-24 h-32 border border-tactical-border bg-tactical-grid flex items-center justify-center">
          <div className="text-tactical-text-dim text-xs">
            PHOTO
          </div>
        </div>

        {/* Agent ID */}
        <div>
          <h4 className="tactical-code text-lg font-bold tracking-wider">
            AGENT {agentId}
          </h4>
        </div>

        {/* Agent Data */}
        <div className="space-y-2 tactical-text text-sm">
          <div className="tactical-data-block">
            <span className="tactical-data-label">» AGE</span>
            <span className="tactical-data-value">: {age || 'null'}</span>
          </div>
          <div className="tactical-data-block">
            <span className="tactical-data-label">» CODE NAME</span>
            <span className="tactical-data-value">: {codeName}</span>
          </div>
          <div className="tactical-data-block">
            <span className="tactical-data-label">» ACTIVE UNTIL</span>
            <span className="tactical-data-value">: {activeUntil}</span>
          </div>
        </div>
      </div>
    </TacticalPanel>
  )
}

/* =====================================================
   RISK INDICATOR
   ===================================================== */

interface RiskLevel {
  level: 'high' | 'medium' | 'low'
  count: number
  label: string
}

interface RiskIndicatorProps {
  total: number
  success: number
  failed: number
  risks: RiskLevel[]
}

export function RiskIndicator({ total, success, failed, risks }: RiskIndicatorProps) {
  return (
    <TacticalPanel title="Agent Activity">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="tactical-text-dim text-xs">Total ▼</div>
            <div className="tactical-text text-4xl font-bold">{total}</div>
          </div>
          <div>
            <div className="tactical-text-dim text-xs">Success ▼</div>
            <div className="tactical-text text-4xl font-bold">{success}</div>
          </div>
          <div>
            <div className="tactical-text-dim text-xs">Failed ▼</div>
            <div className="tactical-text text-4xl font-bold">{failed}</div>
          </div>
        </div>

        <div className="tactical-divider" />

        {/* Risk Levels */}
        <div className="space-y-3">
          {risks.map((risk, index) => {
            const riskClass =
              risk.level === 'high'
                ? 'tactical-risk-high'
                : risk.level === 'medium'
                ? 'tactical-risk-medium'
                : 'tactical-risk-low'

            return (
              <div key={index} className="flex items-center gap-4">
                <div
                  className={cn(
                    'w-12 h-12 flex items-center justify-center border font-bold text-lg',
                    riskClass
                  )}
                >
                  {risk.count}
                </div>
                <div className="flex-1">
                  <div className={cn('tactical-code text-sm uppercase', riskClass)}>
                    {risk.label}
                  </div>
                  {/* Progress bars */}
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          'h-2 w-2',
                          i < Math.floor((risk.count / total) * 10) ? riskClass : 'bg-tactical-border'
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </TacticalPanel>
  )
}

/* =====================================================
   MISSION CARD
   ===================================================== */

interface MissionCardProps {
  code: string
  title: string
  location: string
  status?: 'active' | 'pending' | 'completed'
}

export function MissionCard({ code, title, location, status = 'pending' }: MissionCardProps) {
  return (
    <motion.div
      className="border border-tactical-border bg-tactical-panel p-4 hover:border-tactical-accent-red transition-colors"
      whileHover={{ x: 4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="space-y-2">
        <div className="tactical-text-dim text-xs">Mission Code: {code}</div>
        <h4 className="tactical-text text-sm font-semibold">{title}</h4>
        <div className="flex items-center justify-between pt-2">
          <button className="border border-tactical-border px-3 py-1 text-xs tactical-text hover:border-tactical-text-dim transition-colors">
            Details
          </button>
          <button className="border border-tactical-accent-red px-3 py-1 text-xs tactical-text-red hover:bg-tactical-accent-red hover:text-black transition-colors">
            Join Mission »
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* =====================================================
   OPERATIONS LIST
   ===================================================== */

interface Operation {
  code: string
  title: string
  location: string
}

interface OperationsListProps {
  operations: Operation[]
  timeRange?: '1 Day' | '1 Week' | '1 Month'
  updateCount?: number
}

export function OperationsList({ operations, timeRange = '1 Day', updateCount = 0 }: OperationsListProps) {
  return (
    <TacticalPanel
      title={`Operations List (${operations.length})`}
      subtitle={`${updateCount} updates in the previous 24 hours`}
      scanning
    >
      {/* Time range tabs */}
      <div className="flex gap-2 mb-4">
        {['1 Day', '1 Week', '1 Month'].map((range) => (
          <button
            key={range}
            className={cn(
              'border px-3 py-1 text-xs tactical-code',
              range === timeRange
                ? 'border-tactical-accent-red tactical-text-red'
                : 'border-tactical-border tactical-text-dim hover:border-tactical-text-dim'
            )}
          >
            {range}
          </button>
        ))}
      </div>

      {/* Missions list */}
      <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-hide">
        {operations.map((op, index) => (
          <MissionCard key={index} code={op.code} title={op.title} location={op.location} />
        ))}
      </div>
    </TacticalPanel>
  )
}

/* =====================================================
   TACTICAL MAP
   ===================================================== */

interface MapMarker {
  x: number // percentage
  y: number // percentage
  label: string
  color?: 'red' | 'green' | 'blue'
}

interface TacticalMapProps {
  title?: string
  markers?: MapMarker[]
  regions?: string[]
}

export function TacticalMap({ title, markers = [], regions = [] }: TacticalMapProps) {
  return (
    <TacticalPanel title={title} className="tactical-map">
      <div className="relative aspect-video tactical-grid-lg overflow-hidden">
        {/* Map overlay effect */}
        <div className="tactical-map-overlay" />

        {/* Wireframe globe representation */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-64 h-64">
            {/* Horizontal lines */}
            {[20, 40, 60, 80].map((y) => (
              <div
                key={`h-${y}`}
                className="absolute left-0 right-0 h-px bg-tactical-border opacity-30"
                style={{ top: `${y}%` }}
              />
            ))}
            {/* Vertical lines */}
            {[20, 40, 60, 80].map((x) => (
              <div
                key={`v-${x}`}
                className="absolute top-0 bottom-0 w-px bg-tactical-border opacity-30"
                style={{ left: `${x}%` }}
              />
            ))}

            {/* Center circle */}
            <div className="absolute inset-0 rounded-full border border-tactical-border opacity-40" />
            <div className="absolute inset-8 rounded-full border border-tactical-border opacity-30" />
          </div>
        </div>

        {/* Markers */}
        {markers.map((marker, index) => {
          const colorClass =
            marker.color === 'red'
              ? 'bg-tactical-accent-red tactical-glow-red'
              : marker.color === 'green'
              ? 'bg-tactical-accent-green tactical-glow-green'
              : 'bg-tactical-accent-blue'

          return (
            <motion.div
              key={index}
              className="absolute"
              style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className={cn('w-2 h-2 rounded-full', colorClass)} />
              <div className="tactical-text-dim text-xs absolute left-3 -top-1 whitespace-nowrap">
                {marker.label}
              </div>
            </motion.div>
          )
        })}

        {/* Region labels */}
        {regions.map((region, index) => (
          <div
            key={index}
            className="absolute tactical-text-red text-sm font-bold uppercase"
            style={{
              left: index % 2 === 0 ? '10%' : '70%',
              top: `${20 + index * 30}%`,
            }}
          >
            {region}
          </div>
        ))}
      </div>
    </TacticalPanel>
  )
}

/* =====================================================
   DATA VISUALIZATION (Simple)
   ===================================================== */

export function DataVisualization() {
  return (
    <TacticalPanel title="Brief Announcement..">
      <div className="grid grid-cols-2 gap-4">
        {/* Circle chart placeholders */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-16 h-16 rounded-full border border-tactical-border bg-tactical-grid flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border border-tactical-accent-green opacity-30" />
            </div>
            <div className="tactical-text-dim text-xs space-y-1">
              <div>1231...</div>
              <div>64.50</div>
              <div>...</div>
              <div>4.</div>
              <div>64</div>
            </div>
          </div>
        ))}
      </div>
    </TacticalPanel>
  )
}
