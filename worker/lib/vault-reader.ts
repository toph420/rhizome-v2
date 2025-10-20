import { promises as fs } from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'

export interface VaultDocument {
  title: string
  folderPath: string
  contentPath: string
  highlightsPath: string | null
  connectionsPath: string | null
  rhizomeFolder: string
  hasChunksJson: boolean
  hasMetadataJson: boolean
  hasManifestJson: boolean
  complete: boolean
}

/**
 * Scan vault for all documents
 */
export async function scanVaultDocuments(
  vaultPath: string,
  rhizomePath: string = 'Rhizome/'
): Promise<VaultDocument[]> {
  const documentsPath = path.join(vaultPath, rhizomePath, 'Documents')

  // Check if Documents directory exists
  try {
    await fs.access(documentsPath)
  } catch {
    console.log('[VaultReader] Documents directory does not exist')
    return []
  }

  // List all directories in Documents/
  const entries = await fs.readdir(documentsPath, { withFileTypes: true })
  const docFolders = entries.filter(e => e.isDirectory())

  const documents: VaultDocument[] = []

  for (const folder of docFolders) {
    const folderPath = path.join(documentsPath, folder.name)
    const doc = await readVaultDocument(folderPath, folder.name)
    documents.push(doc)
  }

  return documents
}

/**
 * Read single vault document
 */
async function readVaultDocument(
  folderPath: string,
  title: string
): Promise<VaultDocument> {
  // Use title-based filenames (Phase 2 pattern)
  const contentPath = path.join(folderPath, `${title}.md`)
  const highlightsPath = path.join(folderPath, `${title} - Highlights.md`)
  const connectionsPath = path.join(folderPath, `${title} - Connections.md`)
  const rhizomeFolder = path.join(folderPath, '.rhizome')

  const chunksJsonPath = path.join(rhizomeFolder, 'chunks.json')
  const metadataJsonPath = path.join(rhizomeFolder, 'metadata.json')
  const manifestJsonPath = path.join(rhizomeFolder, 'manifest.json')

  // Check file existence
  const hasContent = await fileExists(contentPath)
  const hasHighlights = await fileExists(highlightsPath)
  const hasConnections = await fileExists(connectionsPath)
  const hasChunksJson = await fileExists(chunksJsonPath)
  const hasMetadataJson = await fileExists(metadataJsonPath)
  const hasManifestJson = await fileExists(manifestJsonPath)

  // Document is complete if it has: content.md + chunks.json + metadata.json
  const complete = hasContent && hasChunksJson && hasMetadataJson

  return {
    title,
    folderPath,
    contentPath: hasContent ? contentPath : '',
    highlightsPath: hasHighlights ? highlightsPath : null,
    connectionsPath: hasConnections ? connectionsPath : null,
    rhizomeFolder,
    hasChunksJson,
    hasMetadataJson,
    hasManifestJson,
    complete
  }
}

/**
 * Check if file exists
 */
async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath)
    return true
  } catch {
    return false
  }
}

/**
 * Read vault document content and JSON files
 */
export async function readVaultDocumentData(doc: VaultDocument) {
  const markdown = await fs.readFile(doc.contentPath, 'utf-8')
  const chunksJson = await fs.readFile(path.join(doc.rhizomeFolder, 'chunks.json'), 'utf-8')
  const metadataJson = await fs.readFile(path.join(doc.rhizomeFolder, 'metadata.json'), 'utf-8')

  let manifestJson = null
  if (doc.hasManifestJson) {
    manifestJson = await fs.readFile(path.join(doc.rhizomeFolder, 'manifest.json'), 'utf-8')
  }

  // Calculate hash
  const vaultHash = createHash('sha256')
    .update(markdown.trim())
    .digest('hex')
    .substring(0, 16)

  return {
    markdown,
    chunks: JSON.parse(chunksJson),
    metadata: JSON.parse(metadataJson),
    manifest: manifestJson ? JSON.parse(manifestJson) : null,
    vaultHash
  }
}

/**
 * Validate vault document structure
 */
export async function validateVaultDocument(doc: VaultDocument): Promise<{
  valid: boolean
  errors: string[]
}> {
  const errors: string[] = []

  if (!doc.hasChunksJson) {
    errors.push('Missing chunks.json')
  }

  if (!doc.hasMetadataJson) {
    errors.push('Missing metadata.json')
  }

  if (!doc.contentPath || !(await fileExists(doc.contentPath))) {
    errors.push('Missing content.md')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
