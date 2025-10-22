import { THEMATIC_BRIDGE_PROMPTS, type BridgePromptVersion } from './thematic-bridge/registry'

/**
 * Load thematic bridge prompt builder function by version ID.
 */
export async function loadBridgePrompt(versionId: string) {
  const promptInfo = THEMATIC_BRIDGE_PROMPTS.find(p => p.id === versionId)

  if (!promptInfo) {
    throw new Error(`Unknown prompt version: ${versionId}`)
  }

  // Dynamic import of prompt file
  const module = await import(`./thematic-bridge/${promptInfo.filepath}`)

  if (!module.buildPrompt) {
    throw new Error(`Prompt module missing buildPrompt function: ${versionId}`)
  }

  return module.buildPrompt
}

/**
 * Get metadata about a prompt version.
 */
export function getPromptInfo(versionId: string): BridgePromptVersion | null {
  return THEMATIC_BRIDGE_PROMPTS.find(p => p.id === versionId) || null
}
