export interface BridgePromptVersion {
  id: string
  version: string
  description: string
  author: string
  date: string
  filepath: string
  tags: string[]
  mode: 'gemini' | 'qwen' | 'both'
}

export const THEMATIC_BRIDGE_PROMPTS: BridgePromptVersion[] = [
  {
    id: 'v1-baseline',
    version: '1.0',
    description: 'Current prompt for thematic bridge detection',
    author: 'Original implementation',
    date: '2025-01-15',
    filepath: 'v1-baseline.ts',
    tags: ['baseline', 'generic'],
    mode: 'both'
  },
  {
    id: 'v2-improved',
    version: '2.0',
    description: 'Intelligent truncation, strength calibration, concise explanations',
    author: 'Developer feedback',
    date: '2025-01-21',
    filepath: 'v2-improved.ts',
    tags: ['optimized', 'philosophy-fiction'],
    mode: 'both'
  }
]
