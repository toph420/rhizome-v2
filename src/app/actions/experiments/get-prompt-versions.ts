'use server'

// Metadata extraction prompt versions
const METADATA_EXTRACTION_PROMPTS = [
  {
    id: 'v1-baseline',
    version: '1.0',
    description: 'Current generic prompt for all domains',
    author: 'Original implementation',
    date: '2025-01-15',
    tags: ['baseline', 'generic', 'all-domains']
  },
  {
    id: 'v2-philosophy',
    version: '2.0',
    description: 'Calibrated for philosophy/fiction with emotional emphasis',
    author: 'Developer feedback',
    date: '2025-01-21',
    tags: ['philosophy', 'fiction', 'polarity-optimized']
  }
]

// Thematic bridge prompt versions
const THEMATIC_BRIDGE_PROMPTS = [
  {
    id: 'v1-baseline',
    version: '1.0',
    description: 'Current prompt for thematic bridge detection',
    author: 'Original implementation',
    date: '2025-01-15',
    tags: ['baseline', 'generic']
  },
  {
    id: 'v2-improved',
    version: '2.0',
    description: 'Intelligent truncation, strength calibration, concise explanations',
    author: 'Developer feedback',
    date: '2025-01-21',
    tags: ['optimized', 'philosophy-fiction']
  }
]

export async function getMetadataPromptVersions() {
  return METADATA_EXTRACTION_PROMPTS
}

export async function getBridgePromptVersions() {
  return THEMATIC_BRIDGE_PROMPTS
}
