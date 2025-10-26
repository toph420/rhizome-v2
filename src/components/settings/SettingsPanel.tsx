'use client'

import { useState, useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/rhizome/button'
import { Input } from '@/components/rhizome/input'
import { Label } from '@/components/rhizome/label'
import { toast } from 'sonner'
import { Loader2, Save, FolderOpen, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/rhizome/alert'
import { Switch } from '@/components/rhizome/switch'
import {
  getObsidianSettings,
  saveObsidianSettings,
  validateVault,
  createVault,
  type ObsidianSettings
} from '@/app/actions/settings'
import { BottomPanel } from '@/components/layout/BottomPanel'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

interface SettingsState {
  vaultName: string
  vaultPath: string
  rhizomePath: string
  syncAnnotations: boolean
  exportSparks: boolean
  exportConnections: boolean
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<SettingsState>({
    vaultName: '',
    vaultPath: '',
    rhizomePath: 'Rhizome/',
    syncAnnotations: true,
    exportSparks: true,
    exportConnections: true
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [structureValid, setStructureValid] = useState<boolean | null>(null)
  const [validationMessage, setValidationMessage] = useState('')

  // Close on Esc
  useHotkeys('esc', () => onClose(), { enabled: isOpen })

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  async function loadSettings() {
    try {
      const result = await getObsidianSettings()

      if (!result.success) {
        toast.error('Failed to load settings')
        console.error('Failed to load settings:', result.error)
        return
      }

      if (result.settings) {
        setSettings({
          vaultName: result.settings.vaultName || '',
          vaultPath: result.settings.vaultPath || '',
          rhizomePath: result.settings.rhizomePath || 'Rhizome/',
          syncAnnotations: result.settings.syncAnnotations ?? true,
          exportSparks: result.settings.exportSparks ?? true,
          exportConnections: result.settings.exportConnections ?? true,
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error('Error loading settings')
    } finally {
      setLoading(false)
    }
  }

  async function validateStructure() {
    setValidating(true)
    setValidationMessage('')

    try {
      const result = await validateVault(settings.vaultPath, settings.rhizomePath)

      if (!result.success) {
        setStructureValid(false)
        setValidationMessage(`Error: ${result.error}`)
        toast.error('Failed to validate structure')
        return
      }

      if (result.valid) {
        setStructureValid(true)
        setValidationMessage('✅ Vault structure is valid')
        toast.success('Vault structure is valid')
      } else {
        setStructureValid(false)
        setValidationMessage(`❌ Missing directories: ${result.missing?.join(', ')}`)
        toast.error('Vault structure is incomplete')
      }
    } catch (error) {
      setStructureValid(false)
      setValidationMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      toast.error('Failed to validate structure')
    } finally {
      setValidating(false)
    }
  }

  async function createStructure() {
    try {
      const result = await createVault(
        settings.vaultPath,
        settings.vaultName,
        settings.rhizomePath
      )

      if (result.success) {
        setStructureValid(true)
        setValidationMessage('✅ Vault structure created successfully')
        toast.success('Vault structure created successfully')
      } else {
        setValidationMessage(`❌ Failed to create structure: ${result.error}`)
        toast.error('Failed to create structure')
      }
    } catch (error) {
      setValidationMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      toast.error('Failed to create structure')
    }
  }

  async function handleSaveSettings() {
    setSaving(true)

    try {
      const result = await saveObsidianSettings(settings)

      if (!result.success) {
        toast.error('Failed to save settings')
        console.error('Failed to save settings:', result.error)
        return
      }

      toast.success('Settings saved successfully')
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomPanel
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Settings"
      description="Configure your Obsidian integration and preferences"
      size="lg"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6 py-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">Obsidian Integration</h2>
              <p className="text-sm text-muted-foreground">
                Connect Rhizome to your Obsidian vault for bidirectional sync.
                Edits made in Obsidian will be synced back with automatic annotation recovery.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vaultName">Vault Name</Label>
                <Input
                  id="vaultName"
                  placeholder="My Vault"
                  value={settings.vaultName || ''}
                  onChange={(e) => setSettings({ ...settings, vaultName: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  The exact name of your Obsidian vault (case-sensitive)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vaultPath">Vault Path</Label>
                <div className="flex gap-2">
                  <Input
                    id="vaultPath"
                    placeholder="/Users/username/Documents/MyVault"
                    value={settings.vaultPath || ''}
                    onChange={(e) => setSettings({ ...settings, vaultPath: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      toast.info('Manual path entry required', {
                        description: 'Enter the absolute path to your Obsidian vault folder'
                      })
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Absolute path to your Obsidian vault folder
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rhizomePath">Rhizome Path (within vault)</Label>
                <Input
                  id="rhizomePath"
                  placeholder="Rhizome/"
                  value={settings.rhizomePath}
                  onChange={(e) => setSettings({ ...settings, rhizomePath: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Subfolder within your vault where documents will be exported (default: Rhizome/)
                </p>
              </div>

              {/* Validation Section */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={validateStructure}
                    disabled={!settings.vaultPath || validating}
                  >
                    {validating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      'Validate Structure'
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={createStructure}
                    disabled={!settings.vaultPath || structureValid === true}
                  >
                    Create Structure
                  </Button>
                </div>

                {validationMessage && (
                  <Alert variant={structureValid ? 'default' : 'destructive'}>
                    {structureValid ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertDescription>{validationMessage}</AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Sync Options */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-sm">Sync Options</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="syncAnnotations">Sync Annotations</Label>
                    <p className="text-xs text-muted-foreground">
                      Export highlights.md alongside content
                    </p>
                  </div>
                  <Switch
                    id="syncAnnotations"
                    checked={settings.syncAnnotations}
                    onCheckedChange={(checked) => setSettings({ ...settings, syncAnnotations: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="exportSparks">Export Sparks</Label>
                    <p className="text-xs text-muted-foreground">
                      Export sparks to daily note files
                    </p>
                  </div>
                  <Switch
                    id="exportSparks"
                    checked={settings.exportSparks}
                    onCheckedChange={(checked) => setSettings({ ...settings, exportSparks: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="exportConnections">Export Connections</Label>
                    <p className="text-xs text-muted-foreground">
                      Generate connection graph markdown files
                    </p>
                  </div>
                  <Switch
                    id="exportConnections"
                    checked={settings.exportConnections}
                    onCheckedChange={(checked) => setSettings({ ...settings, exportConnections: checked })}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                onClick={handleSaveSettings}
                disabled={saving || !settings.vaultName || !settings.vaultPath}
                className="w-full sm:w-auto"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-muted/50">
            <h3 className="font-semibold mb-2 text-sm">How it works</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• <strong>Export</strong>: Documents are exported to your vault as clean markdown</li>
              <li>• <strong>Edit</strong>: Make changes in Obsidian using your preferred editor</li>
              <li>• <strong>Sync</strong>: Changes are imported back with automatic annotation recovery (&gt;90% success)</li>
              <li>• <strong>Recovery</strong>: Fuzzy matching preserves your annotations even after significant edits</li>
            </ul>
          </div>
        </div>
      )}
    </BottomPanel>
  )
}
