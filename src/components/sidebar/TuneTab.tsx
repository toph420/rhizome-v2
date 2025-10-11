'use client'

import { WeightTuning } from './WeightTuning'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUIStore } from '@/stores/ui-store'

/**
 * Tune tab with engine weights and reader settings.
 * Combines weight tuning with visibility preferences.
 *
 * @returns Settings panel
 */
export function TuneTab() {
  const showChunkBoundaries = useUIStore(state => state.showChunkBoundaries)
  const showHeatmap = useUIStore(state => state.showHeatmap)
  const toggleSetting = useUIStore(state => state.toggleSetting)

  return (
    <div className="p-4 space-y-6">
      {/* Engine Weights */}
      <WeightTuning />

      <Separator />

      {/* Reader Settings */}
      <div className="space-y-4">
        <h4 className="font-semibold text-sm">Reader Settings</h4>

        <div className="space-y-3">
          {/* Chunk Boundaries */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="chunk-boundaries" className="text-sm font-normal">
                Show chunk boundaries
              </Label>
              <p className="text-xs text-muted-foreground">
                Display dashed lines between semantic chunks
              </p>
            </div>
            <Switch
              id="chunk-boundaries"
              checked={showChunkBoundaries}
              onCheckedChange={() => toggleSetting('showChunkBoundaries')}
            />
          </div>

          {/* Connection Heatmap */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="heatmap" className="text-sm font-normal">
                Connection heatmap
              </Label>
              <p className="text-xs text-muted-foreground">
                Visual density indicator in left margin
              </p>
            </div>
            <Switch
              id="heatmap"
              checked={showHeatmap}
              onCheckedChange={() => toggleSetting('showHeatmap')}
            />
          </div>

        </div>
      </div>

      {/* Future Settings Section */}
      <Separator />
      <div className="space-y-2 opacity-50">
        <h4 className="font-semibold text-sm">Advanced (Coming Soon)</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled />
            <span className="text-muted-foreground">Chaos mode (hourly surprises)</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled />
            <span className="text-muted-foreground">Auto-create sparks from highlights</span>
          </div>
        </div>
      </div>
    </div>
  )
}
