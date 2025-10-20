/**
 * Obsidian vault settings (stored in user_settings.obsidian_settings JSONB)
 */
export interface ObsidianSettings {
  vaultName: string
  vaultPath: string          // Absolute path to vault root
  rhizomePath: string        // Relative path within vault (default: "Rhizome/")
  autoSync: boolean
  syncAnnotations: boolean
  exportSparks: boolean
  exportConnections: boolean  // NEW - export connection graphs
}

/**
 * Vault sync state
 */
export interface VaultSyncState {
  documentId: string
  vaultPath: string
  vaultHash: string | null
  storageHash: string | null
  vaultModifiedAt: Date | null
  storageModifiedAt: Date | null
  lastSyncAt: Date | null
  lastSyncDirection: 'vault_to_storage' | 'storage_to_vault' | null
  conflictState: 'none' | 'detected' | 'resolved'
}

/**
 * Sync conflict information
 */
export interface SyncConflict {
  documentId: string
  documentTitle: string
  vaultModifiedAt: Date
  storageModifiedAt: Date
  vaultHash: string
  storageHash: string
  vaultPreview: string      // First 200 chars of vault version
  storagePreview: string    // First 200 chars of storage version
}
