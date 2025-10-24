'use client'

import { Badge } from '@/components/rhizome/badge'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/rhizome/slider'
import { useConnectionStore } from '@/stores/connection-store'
import type { SynthesisEngine } from '@/types/annotations'

const ENGINE_LABELS: Record<SynthesisEngine, string> = {
  semantic_similarity: 'Semantic Similarity',
  thematic_bridge: 'Thematic Bridges',
  contradiction_detection: 'Contradictions'
}

const ENGINE_COLORS: Record<SynthesisEngine, string> = {
  semantic_similarity: 'bg-blue-500',
  thematic_bridge: 'bg-purple-500',
  contradiction_detection: 'bg-red-500'
}

/**
 * Connection filtering component with engine toggles and strength threshold.
 * Enables users to filter connections by engine type and minimum strength.
 * @returns React element with filter controls.
 */
export function ConnectionFilters() {
  const weights = useConnectionStore(state => state.weights)
  const enabledEngines = useConnectionStore(state => state.enabledEngines)
  const toggleEngine = useConnectionStore(state => state.toggleEngine)
  const strengthThreshold = useConnectionStore(state => state.strengthThreshold)
  const setStrengthThreshold = useConnectionStore(state => state.setStrengthThreshold)
  
  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold">Filter Connections</h3>
      
      {/* Engine Toggles */}
      <div className="space-y-2">
        <Label>Active Engines</Label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(weights) as SynthesisEngine[]).map(engine => {
            const isEnabled = enabledEngines.has(engine)
            return (
              <Badge
                key={engine}
                variant={isEnabled ? 'default' : 'neutral'}
                className={`cursor-pointer transition-all ${
                  isEnabled ? ENGINE_COLORS[engine] : ''
                }`}
                onClick={() => toggleEngine(engine)}
              >
                {ENGINE_LABELS[engine]}
              </Badge>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {enabledEngines.size} of {Object.keys(weights).length} engines active
        </p>
      </div>
      
      {/* Strength Threshold */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="strength-threshold">Strength Threshold</Label>
          <span className="text-sm text-muted-foreground font-mono">
            {strengthThreshold.toFixed(2)}
          </span>
        </div>
        <Slider
          id="strength-threshold"
          value={[strengthThreshold]}
          onValueChange={([value]) => setStrengthThreshold(value)}
          min={0.3}
          max={1}
          step={0.05}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Hide connections with strength below threshold
        </p>
      </div>
    </div>
  )
}