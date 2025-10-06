'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Save, FolderOpen } from 'lucide-react'

interface ObsidianSettings {
  vaultName: string | null
  vaultPath: string | null
  autoSync: boolean
  syncAnnotations: boolean
  exportPath: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<ObsidianSettings>({
    vaultName: '',
    vaultPath: '',
    autoSync: false,
    syncAnnotations: true,
    exportPath: 'Rhizome/'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data, error } = await supabase
        .from('user_settings')
        .select('obsidian_settings')
        .eq('user_id', '00000000-0000-0000-0000-000000000000')
        .single()

      if (error) {
        console.error('Failed to load settings:', error)
        toast.error('Failed to load settings')
        return
      }

      if (data?.obsidian_settings) {
        setSettings(data.obsidian_settings as ObsidianSettings)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    setSaving(true)

    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { error } = await supabase
        .from('user_settings')
        .update({ obsidian_settings: settings })
        .eq('user_id', '00000000-0000-0000-0000-000000000000')

      if (error) {
        throw error
      }

      toast.success('Settings saved successfully')
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-10">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure your Obsidian integration and preferences
          </p>
        </div>

        <div className="border rounded-lg p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Obsidian Integration</h2>
            <p className="text-sm text-muted-foreground mb-6">
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
                    // In a real implementation, this would open a file picker
                    toast.info('Manual path entry required', {
                      description: 'Enter the absolute path to your Obsidian vault folder'
                    })
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Absolute path to your Obsidian vault folder (e.g., /Users/you/Documents/MyVault)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exportPath">Export Path (within vault)</Label>
              <Input
                id="exportPath"
                placeholder="Rhizome/"
                value={settings.exportPath}
                onChange={(e) => setSettings({ ...settings, exportPath: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Subfolder within your vault where documents will be exported
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="syncAnnotations"
                checked={settings.syncAnnotations}
                onChange={(e) => setSettings({ ...settings, syncAnnotations: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="syncAnnotations" className="font-normal cursor-pointer">
                Export annotations alongside markdown (.annotations.json)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="autoSync"
                checked={settings.autoSync}
                onChange={(e) => setSettings({ ...settings, autoSync: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="autoSync" className="font-normal cursor-pointer">
                Auto-sync changes from Obsidian (experimental)
              </Label>
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button
              onClick={saveSettings}
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

        <div className="border rounded-lg p-6 bg-muted/50">
          <h3 className="font-semibold mb-2">How it works</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• <strong>Export</strong>: Documents are exported to your vault as clean markdown</li>
            <li>• <strong>Edit</strong>: Make changes in Obsidian using your preferred editor</li>
            <li>• <strong>Sync</strong>: Changes are imported back with automatic annotation recovery (&gt;90% success)</li>
            <li>• <strong>Recovery</strong>: Fuzzy matching preserves your annotations even after significant edits</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
