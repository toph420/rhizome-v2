export interface PromptVersion {
  id: string
  version: string
  description: string
  author: string
  date: string
  filepath: string
  tags: string[]
  expectedMetrics?: {
    importanceThreshold: number  // Expected % of chunks >0.6
    avgConceptSpecificity: number  // 0-1 scale
    avgPolarityStrength: number  // Avg abs(polarity)
  }
}

export const METADATA_EXTRACTION_PROMPTS: PromptVersion[] = [
  {
    id: 'v1-baseline',
    version: '1.0',
    description: 'Current generic prompt for all domains',
    author: 'Original implementation',
    date: '2025-01-15',
    filepath: 'v1-baseline.py',
    tags: ['baseline', 'generic', 'all-domains'],
    expectedMetrics: {
      importanceThreshold: 0.30,
      avgConceptSpecificity: 0.5,
      avgPolarityStrength: 0.3
    }
  },
  {
    id: 'v2-philosophy',
    version: '2.0',
    description: 'Calibrated for philosophy/fiction with emotional emphasis',
    author: 'Developer feedback',
    date: '2025-01-21',
    filepath: 'v2-philosophy.py',
    tags: ['philosophy', 'fiction', 'polarity-optimized'],
    expectedMetrics: {
      importanceThreshold: 0.25,
      avgConceptSpecificity: 0.7,
      avgPolarityStrength: 0.5
    }
  }
]
