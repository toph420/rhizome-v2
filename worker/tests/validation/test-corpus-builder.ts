#!/usr/bin/env tsx

/**
 * Test Corpus Builder
 * 
 * Builds a diverse corpus of test documents with ground truth annotations
 * for validating the metadata extraction system.
 * 
 * @module validation/test-corpus-builder
 */

import * as fs from 'fs'
import * as path from 'path'
import type { ProcessedChunk } from '../../types/processor'
import type { GroundTruth } from './metadata-quality-framework'

/**
 * Test document with chunks and ground truth.
 */
interface TestDocument {
  id: string
  name: string
  category: 'technical' | 'narrative' | 'academic' | 'code' | 'mixed'
  format: 'pdf' | 'youtube' | 'web' | 'markdown' | 'text' | 'paste'
  chunks: ProcessedChunk[]
  groundTruth: GroundTruth[]
}

/**
 * Test Corpus Builder
 */
export class TestCorpusBuilder {
  private documents: TestDocument[] = []

  /**
   * Builds the standard test corpus.
   */
  buildStandardCorpus(): TestDocument[] {
    // Clear existing documents
    this.documents = []

    // Add diverse test documents
    this.addTechnicalDocument()
    this.addNarrativeDocument()
    this.addAcademicDocument()
    this.addCodeDocument()
    this.addYouTubeTranscript()
    this.addWebArticle()
    this.addMixedContent()

    return this.documents
  }

  /**
   * Adds a technical documentation sample.
   */
  private addTechnicalDocument(): void {
    const doc: TestDocument = {
      id: 'tech-001',
      name: 'React Hooks Documentation',
      category: 'technical',
      format: 'markdown',
      chunks: [
        {
          content: `# React Hooks

React Hooks are functions that let you "hook into" React state and lifecycle features from function components.

## useState Hook

The useState Hook lets you add state to function components. When you call useState, you declare a "state variable".

\`\`\`javascript
const [count, setCount] = useState(0);
\`\`\`

### Rules of Hooks

1. Only call Hooks at the top level
2. Only call Hooks from React functions
3. Use the ESLint plugin for enforcement`,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 500,
          documentId: 'tech-001',
          themes: ['React', 'Hooks', 'State Management']
        },
        {
          content: `## useEffect Hook

The Effect Hook lets you perform side effects in function components. It serves the same purpose as componentDidMount, componentDidUpdate, and componentWillUnmount combined.

\`\`\`javascript
useEffect(() => {
  document.title = \`You clicked \${count} times\`;
  
  return () => {
    // Cleanup function
    console.log('Component unmounting');
  };
}, [count]);
\`\`\`

### Dependencies Array

- Empty array []: Effect runs once after initial render
- No array: Effect runs after every render
- With dependencies: Effect runs when dependencies change`,
          chunkIndex: 1,
          startOffset: 501,
          endOffset: 1000,
          documentId: 'tech-001',
          themes: ['useEffect', 'Side Effects', 'Lifecycle']
        }
      ],
      groundTruth: [
        {
          chunkId: 'tech-001-0',
          expectedMetadata: {
            structural: {
              headingLevel: 1,
              listItems: 3,
              codeBlocks: 1,
              tableRows: 0,
              confidence: 0.95
            },
            conceptual: {
              concepts: [
                { text: 'React Hooks', type: 'technology', importance: 1.0 },
                { text: 'useState', type: 'function', importance: 0.9 },
                { text: 'state variable', type: 'concept', importance: 0.8 }
              ],
              relations: [
                { from: 'useState', to: 'React Hooks', type: 'part-of' }
              ],
              confidence: 0.9
            },
            methods: [
              {
                signature: 'useState(initialValue)',
                language: 'javascript',
                returnType: '[state, setState]',
                confidence: 0.95
              }
            ],
            domain: {
              field: 'software-engineering',
              subfield: 'web-development',
              confidence: 0.95
            }
          },
          requiredFields: [
            'structural.headingLevel',
            'structural.listItems',
            'structural.codeBlocks',
            'conceptual.concepts',
            'methods',
            'domain.field'
          ],
          optionalFields: [
            'structural.confidence',
            'conceptual.relations',
            'domain.subfield'
          ],
          minimumScore: 85
        },
        {
          chunkId: 'tech-001-1',
          expectedMetadata: {
            structural: {
              headingLevel: 2,
              listItems: 3,
              codeBlocks: 1,
              tableRows: 0,
              confidence: 0.95
            },
            conceptual: {
              concepts: [
                { text: 'useEffect', type: 'function', importance: 1.0 },
                { text: 'side effects', type: 'concept', importance: 0.9 },
                { text: 'dependencies array', type: 'concept', importance: 0.85 }
              ],
              confidence: 0.9
            },
            methods: [
              {
                signature: 'useEffect(callback, dependencies?)',
                language: 'javascript',
                returnType: 'void',
                confidence: 0.95
              }
            ],
            domain: {
              field: 'software-engineering',
              subfield: 'web-development',
              confidence: 0.95
            }
          },
          requiredFields: [
            'structural.headingLevel',
            'structural.listItems',
            'structural.codeBlocks',
            'conceptual.concepts',
            'methods',
            'domain.field'
          ],
          optionalFields: [
            'structural.confidence',
            'conceptual.confidence',
            'domain.subfield'
          ],
          minimumScore: 85
        }
      ]
    }

    this.documents.push(doc)
  }

  /**
   * Adds a narrative/story document.
   */
  private addNarrativeDocument(): void {
    const doc: TestDocument = {
      id: 'narr-001',
      name: 'The Discovery',
      category: 'narrative',
      format: 'text',
      chunks: [
        {
          content: `The laboratory was silent except for the hum of machinery. Dr. Sarah Chen stared at the screen, her heart racing with excitement. After three years of research, the breakthrough had finally come.

"This changes everything," she whispered to herself, barely able to contain her enthusiasm.

The data was unmistakable. The quantum entanglement experiment had succeeded beyond their wildest dreams. Not only had they achieved stable entanglement at room temperature, but the particles remained connected across distances that defied conventional understanding.`,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 450,
          documentId: 'narr-001',
          themes: ['scientific discovery', 'quantum physics', 'breakthrough']
        }
      ],
      groundTruth: [
        {
          chunkId: 'narr-001-0',
          expectedMetadata: {
            emotional: {
              sentiment: 'positive',
              intensity: 0.8,
              emotions: ['excitement', 'wonder', 'anticipation'],
              confidence: 0.85
            },
            narrative: {
              pacing: 'moderate',
              perspective: 'third-person',
              tense: 'past',
              dialogueRatio: 0.15,
              confidence: 0.9
            },
            conceptual: {
              concepts: [
                { text: 'Dr. Sarah Chen', type: 'person', importance: 0.9 },
                { text: 'quantum entanglement', type: 'concept', importance: 1.0 },
                { text: 'laboratory', type: 'location', importance: 0.7 }
              ],
              confidence: 0.85
            },
            domain: {
              field: 'fiction',
              subfield: 'science-fiction',
              confidence: 0.8
            }
          },
          requiredFields: [
            'emotional.sentiment',
            'emotional.intensity',
            'narrative.perspective',
            'narrative.tense',
            'conceptual.concepts'
          ],
          optionalFields: [
            'emotional.emotions',
            'narrative.dialogueRatio',
            'domain.subfield'
          ],
          minimumScore: 80
        }
      ]
    }

    this.documents.push(doc)
  }

  /**
   * Adds an academic paper excerpt.
   */
  private addAcademicDocument(): void {
    const doc: TestDocument = {
      id: 'acad-001',
      name: 'Machine Learning in Healthcare',
      category: 'academic',
      format: 'pdf',
      chunks: [
        {
          content: `Abstract

This paper presents a comprehensive analysis of machine learning applications in modern healthcare systems. We examine 127 studies published between 2018-2023, focusing on diagnostic accuracy, treatment optimization, and predictive modeling. Our meta-analysis reveals that deep learning models achieve an average diagnostic accuracy of 94.3% (95% CI: 92.1-96.5%) across various medical imaging tasks, significantly outperforming traditional methods (p < 0.001).

Keywords: machine learning, healthcare, deep learning, diagnostic accuracy, meta-analysis

References:
[1] Smith et al. (2022). "Deep Learning in Medical Imaging." Nature Medicine, 28(4), 512-524.
[2] Johnson, M. (2023). "AI-Driven Diagnostics: A Systematic Review." The Lancet Digital Health, 5(3), e145-e157.`,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 750,
          documentId: 'acad-001',
          themes: ['machine learning', 'healthcare', 'medical imaging', 'research']
        }
      ],
      groundTruth: [
        {
          chunkId: 'acad-001-0',
          expectedMetadata: {
            structural: {
              headingLevel: 1,
              listItems: 0,
              citations: 2,
              keywords: 5,
              confidence: 0.95
            },
            references: {
              citations: [
                { text: 'Smith et al. (2022)', type: 'academic', confidence: 0.95 },
                { text: 'Johnson, M. (2023)', type: 'academic', confidence: 0.95 }
              ],
              confidence: 0.9
            },
            conceptual: {
              concepts: [
                { text: 'machine learning', type: 'technology', importance: 1.0 },
                { text: 'deep learning', type: 'technology', importance: 0.95 },
                { text: 'diagnostic accuracy', type: 'metric', importance: 0.9 },
                { text: '94.3%', type: 'statistic', importance: 0.85 }
              ],
              confidence: 0.9
            },
            domain: {
              field: 'medical-informatics',
              subfield: 'ai-diagnostics',
              confidence: 0.95
            }
          },
          requiredFields: [
            'structural.citations',
            'references.citations',
            'conceptual.concepts',
            'domain.field'
          ],
          optionalFields: [
            'structural.keywords',
            'domain.subfield'
          ],
          minimumScore: 90
        }
      ]
    }

    this.documents.push(doc)
  }

  /**
   * Adds a code-heavy document.
   */
  private addCodeDocument(): void {
    const doc: TestDocument = {
      id: 'code-001',
      name: 'Python Data Processing Script',
      category: 'code',
      format: 'markdown',
      chunks: [
        {
          content: `## Data Processing Pipeline

This module implements a robust data processing pipeline with error handling and logging.

\`\`\`python
import pandas as pd
import numpy as np
from typing import Optional, Dict, List
import logging

class DataProcessor:
    """Processes raw data for machine learning models."""
    
    def __init__(self, config: Dict[str, any]):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
    def process_batch(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Process a batch of data.
        
        Args:
            data: Input dataframe
            
        Returns:
            Processed dataframe
        """
        try:
            # Remove duplicates
            data = data.drop_duplicates()
            
            # Handle missing values
            data = self.handle_missing(data)
            
            # Normalize features
            data = self.normalize_features(data)
            
            return data
            
        except Exception as e:
            self.logger.error(f"Processing failed: {e}")
            raise
\`\`\``,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 900,
          documentId: 'code-001',
          themes: ['Python', 'data processing', 'machine learning']
        }
      ],
      groundTruth: [
        {
          chunkId: 'code-001-0',
          expectedMetadata: {
            structural: {
              headingLevel: 2,
              codeBlocks: 1,
              codeLanguage: 'python',
              confidence: 0.95
            },
            methods: [
              {
                signature: '__init__(self, config: Dict[str, any])',
                language: 'python',
                className: 'DataProcessor',
                confidence: 0.95
              },
              {
                signature: 'process_batch(self, data: pd.DataFrame) -> pd.DataFrame',
                language: 'python',
                className: 'DataProcessor',
                returnType: 'pd.DataFrame',
                confidence: 0.95
              }
            ],
            conceptual: {
              concepts: [
                { text: 'DataProcessor', type: 'class', importance: 1.0 },
                { text: 'pandas', type: 'library', importance: 0.9 },
                { text: 'error handling', type: 'pattern', importance: 0.8 }
              ],
              confidence: 0.9
            },
            domain: {
              field: 'software-engineering',
              subfield: 'data-engineering',
              confidence: 0.95
            }
          },
          requiredFields: [
            'structural.codeBlocks',
            'structural.codeLanguage',
            'methods',
            'conceptual.concepts',
            'domain.field'
          ],
          optionalFields: [
            'domain.subfield'
          ],
          minimumScore: 90
        }
      ]
    }

    this.documents.push(doc)
  }

  /**
   * Adds a YouTube transcript sample.
   */
  private addYouTubeTranscript(): void {
    const doc: TestDocument = {
      id: 'yt-001',
      name: 'Introduction to Neural Networks',
      category: 'mixed',
      format: 'youtube',
      chunks: [
        {
          content: `Welcome back to the channel! Today we're diving deep into neural networks.

So, what exactly is a neural network? Think of it like your brain - you have billions of neurons connected together, passing signals back and forth. 

A neural network works in a similar way. We have these artificial neurons, or nodes, arranged in layers. You've got your input layer, hidden layers, and output layer.

Let me show you a quick example. Say we want to recognize handwritten digits. The input layer would take in the pixel values - maybe a 28 by 28 image. Those values get passed through the hidden layers, where the magic happens. Each connection has a weight, and we're constantly adjusting these weights during training.

The really cool part? The network learns patterns on its own! We don't tell it "look for curves" or "find edges" - it figures that out through backpropagation.`,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 850,
          documentId: 'yt-001',
          themes: ['neural networks', 'machine learning', 'tutorial']
        }
      ],
      groundTruth: [
        {
          chunkId: 'yt-001-0',
          expectedMetadata: {
            structural: {
              paragraphs: 5,
              hasGreeting: true,
              hasExample: true,
              confidence: 0.85
            },
            emotional: {
              sentiment: 'positive',
              intensity: 0.7,
              tone: 'educational',
              confidence: 0.8
            },
            narrative: {
              style: 'conversational',
              perspective: 'first-person',
              audience: 'learners',
              confidence: 0.85
            },
            conceptual: {
              concepts: [
                { text: 'neural network', type: 'concept', importance: 1.0 },
                { text: 'neurons', type: 'component', importance: 0.9 },
                { text: 'backpropagation', type: 'algorithm', importance: 0.85 },
                { text: 'handwritten digits', type: 'example', importance: 0.7 }
              ],
              confidence: 0.9
            },
            domain: {
              field: 'artificial-intelligence',
              subfield: 'deep-learning',
              confidence: 0.9
            }
          },
          requiredFields: [
            'structural.paragraphs',
            'emotional.sentiment',
            'narrative.style',
            'conceptual.concepts',
            'domain.field'
          ],
          optionalFields: [
            'structural.hasExample',
            'emotional.tone',
            'narrative.audience',
            'domain.subfield'
          ],
          minimumScore: 80
        }
      ]
    }

    this.documents.push(doc)
  }

  /**
   * Adds a web article sample.
   */
  private addWebArticle(): void {
    const doc: TestDocument = {
      id: 'web-001',
      name: 'Climate Change Impact on Agriculture',
      category: 'academic',
      format: 'web',
      chunks: [
        {
          content: `# Climate Change's Growing Impact on Global Agriculture

Published: March 15, 2024 | By Jennifer Martinez, Environmental Science Reporter

Rising temperatures and shifting precipitation patterns are fundamentally altering agricultural systems worldwide, according to a comprehensive new study published in Nature Climate Change.

## Key Findings

The research, which analyzed data from over 10,000 farms across 50 countries, reveals:

- Crop yields have declined by 12% globally since 2000
- Water stress affects 2.3 billion people in agricultural regions
- Extreme weather events have doubled in frequency

"We're seeing unprecedented changes in growing seasons," explains Dr. Robert Kim, lead author of the study. "Farmers who have relied on traditional planting calendars for generations are having to completely reimagine their approach."

[Read the full study](https://example.com/study)
[Climate data dashboard](https://example.com/dashboard)`,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 950,
          documentId: 'web-001',
          themes: ['climate change', 'agriculture', 'environmental impact']
        }
      ],
      groundTruth: [
        {
          chunkId: 'web-001-0',
          expectedMetadata: {
            structural: {
              headingLevel: 1,
              listItems: 3,
              links: 2,
              hasAuthor: true,
              hasDate: true,
              confidence: 0.95
            },
            references: {
              citations: [
                { text: 'Nature Climate Change', type: 'journal', confidence: 0.9 },
                { text: 'Dr. Robert Kim', type: 'person', confidence: 0.95 }
              ],
              links: [
                { text: 'Read the full study', url: 'https://example.com/study', confidence: 0.9 },
                { text: 'Climate data dashboard', url: 'https://example.com/dashboard', confidence: 0.9 }
              ],
              confidence: 0.9
            },
            conceptual: {
              concepts: [
                { text: 'climate change', type: 'phenomenon', importance: 1.0 },
                { text: 'agricultural systems', type: 'system', importance: 0.95 },
                { text: 'crop yields', type: 'metric', importance: 0.9 },
                { text: '12% decline', type: 'statistic', importance: 0.85 }
              ],
              confidence: 0.9
            },
            domain: {
              field: 'environmental-science',
              subfield: 'climate-agriculture',
              confidence: 0.9
            }
          },
          requiredFields: [
            'structural.headingLevel',
            'structural.listItems',
            'references.citations',
            'conceptual.concepts',
            'domain.field'
          ],
          optionalFields: [
            'structural.hasAuthor',
            'structural.hasDate',
            'references.links',
            'domain.subfield'
          ],
          minimumScore: 85
        }
      ]
    }

    this.documents.push(doc)
  }

  /**
   * Adds mixed content document.
   */
  private addMixedContent(): void {
    const doc: TestDocument = {
      id: 'mixed-001',
      name: 'System Design Document',
      category: 'mixed',
      format: 'markdown',
      chunks: [
        {
          content: `# Distributed Cache System Design

## Overview

This document outlines the design for a high-performance distributed cache system capable of handling 1 million requests per second with sub-millisecond latency.

### Architecture Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| Cache Nodes | Store data | Redis Cluster |
| Load Balancer | Route requests | HAProxy |
| Monitoring | Track metrics | Prometheus + Grafana |

## Implementation

\`\`\`go
type CacheClient struct {
    nodes    []Node
    hashRing *ConsistentHash
}

func (c *CacheClient) Get(key string) ([]byte, error) {
    node := c.hashRing.GetNode(key)
    return node.Fetch(key)
}
\`\`\`

According to benchmark tests (Chen et al., 2023), this design achieves:
- 99.99% availability
- <1ms P99 latency
- Linear scalability up to 100 nodes`,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 850,
          documentId: 'mixed-001',
          themes: ['system design', 'distributed systems', 'caching']
        }
      ],
      groundTruth: [
        {
          chunkId: 'mixed-001-0',
          expectedMetadata: {
            structural: {
              headingLevel: 1,
              codeBlocks: 1,
              tableRows: 3,
              listItems: 3,
              confidence: 0.95
            },
            methods: [
              {
                signature: 'Get(key string) ([]byte, error)',
                language: 'go',
                className: 'CacheClient',
                returnType: '[]byte, error',
                confidence: 0.95
              }
            ],
            references: {
              citations: [
                { text: 'Chen et al., 2023', type: 'academic', confidence: 0.9 }
              ],
              confidence: 0.85
            },
            conceptual: {
              concepts: [
                { text: 'distributed cache', type: 'system', importance: 1.0 },
                { text: 'Redis Cluster', type: 'technology', importance: 0.9 },
                { text: '1 million requests per second', type: 'metric', importance: 0.85 },
                { text: 'consistent hashing', type: 'algorithm', importance: 0.8 }
              ],
              confidence: 0.9
            },
            domain: {
              field: 'software-engineering',
              subfield: 'distributed-systems',
              confidence: 0.95
            }
          },
          requiredFields: [
            'structural.headingLevel',
            'structural.codeBlocks',
            'structural.tableRows',
            'methods',
            'conceptual.concepts',
            'domain.field'
          ],
          optionalFields: [
            'structural.listItems',
            'references.citations',
            'domain.subfield'
          ],
          minimumScore: 85
        }
      ]
    }

    this.documents.push(doc)
  }

  /**
   * Gets all test documents.
   */
  getDocuments(): TestDocument[] {
    return this.documents
  }

  /**
   * Gets all chunks from all documents.
   */
  getAllChunks(): ProcessedChunk[] {
    return this.documents.flatMap(doc => doc.chunks)
  }

  /**
   * Gets all ground truth annotations.
   */
  getAllGroundTruth(): GroundTruth[] {
    return this.documents.flatMap(doc => doc.groundTruth)
  }

  /**
   * Saves the corpus to files for persistent testing.
   */
  async saveCorpus(outputDir: string): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Save documents
    const docsPath = path.join(outputDir, 'documents.json')
    fs.writeFileSync(
      docsPath,
      JSON.stringify(this.documents, null, 2),
      'utf-8'
    )

    // Save summary
    const summary = {
      totalDocuments: this.documents.length,
      totalChunks: this.getAllChunks().length,
      categories: {
        technical: this.documents.filter(d => d.category === 'technical').length,
        narrative: this.documents.filter(d => d.category === 'narrative').length,
        academic: this.documents.filter(d => d.category === 'academic').length,
        code: this.documents.filter(d => d.category === 'code').length,
        mixed: this.documents.filter(d => d.category === 'mixed').length
      },
      formats: {
        pdf: this.documents.filter(d => d.format === 'pdf').length,
        youtube: this.documents.filter(d => d.format === 'youtube').length,
        web: this.documents.filter(d => d.format === 'web').length,
        markdown: this.documents.filter(d => d.format === 'markdown').length,
        text: this.documents.filter(d => d.format === 'text').length,
        paste: this.documents.filter(d => d.format === 'paste').length
      }
    }

    const summaryPath = path.join(outputDir, 'corpus-summary.json')
    fs.writeFileSync(
      summaryPath,
      JSON.stringify(summary, null, 2),
      'utf-8'
    )

    console.log(`✅ Corpus saved to: ${outputDir}`)
    console.log(`   - Documents: ${summary.totalDocuments}`)
    console.log(`   - Chunks: ${summary.totalChunks}`)
  }

  /**
   * Loads a corpus from files.
   */
  async loadCorpus(inputDir: string): Promise<void> {
    const docsPath = path.join(inputDir, 'documents.json')
    
    if (!fs.existsSync(docsPath)) {
      throw new Error(`Corpus file not found: ${docsPath}`)
    }

    const data = fs.readFileSync(docsPath, 'utf-8')
    this.documents = JSON.parse(data)

    console.log(`✅ Loaded ${this.documents.length} documents from: ${inputDir}`)
  }
}

// Export types
export type { TestDocument }