#!/usr/bin/env tsx

/**
 * Metadata Quality Validation Framework
 * 
 * Comprehensive validation system for the 7-engine metadata extraction pipeline.
 * Measures precision, recall, F1 scores, completeness, and performance metrics.
 * 
 * @module validation/metadata-quality-framework
 */

import * as fs from 'fs'
import * as path from 'path'
import type { ProcessedChunk } from '../../types/processor'
import type { ChunkMetadata } from '../../types/metadata'
import { extractMetadata } from '../../lib/metadata-extractor'
import { createGeminiClient } from '../../lib/ai-client'

/**
 * Ground truth annotation for validation.
 */
interface GroundTruth {
  chunkId: string
  expectedMetadata: Partial<ChunkMetadata>
  requiredFields: string[]
  optionalFields: string[]
  minimumScore: number
}

/**
 * Quality metrics for a single chunk.
 */
interface ChunkMetrics {
  chunkId: string
  completeness: number
  precision: number
  recall: number
  f1Score: number
  extractionTime: number
  missingFields: string[]
  incorrectFields: string[]
  passed: boolean
}

/**
 * Aggregate quality metrics.
 */
interface AggregateMetrics {
  totalChunks: number
  averageCompleteness: number
  averagePrecision: number
  averageRecall: number
  averageF1Score: number
  averageExtractionTime: number
  passedChunks: number
  failedChunks: number
  passRate: number
  p90ExtractionTime: number
  p95ExtractionTime: number
  p99ExtractionTime: number
}

/**
 * Validation configuration.
 */
interface ValidationConfig {
  useRealAI: boolean
  geminiApiKey?: string
  targetCompleteness: number
  targetPrecision: number
  targetRecall: number
  targetF1Score: number
  maxExtractionTime: number
  verbose: boolean
}

/**
 * Default validation configuration.
 */
const DEFAULT_CONFIG: ValidationConfig = {
  useRealAI: false,
  targetCompleteness: 90,
  targetPrecision: 85,
  targetRecall: 85,
  targetF1Score: 85,
  maxExtractionTime: 400, // ms per chunk
  verbose: false
}

/**
 * Metadata Quality Validation Framework
 */
export class MetadataQualityFramework {
  private config: ValidationConfig
  private aiClient: any
  private metrics: ChunkMetrics[] = []
  
  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    
    if (this.config.useRealAI && this.config.geminiApiKey) {
      this.aiClient = createGeminiClient(this.config.geminiApiKey)
    }
  }

  /**
   * Validates a single chunk against ground truth.
   */
  async validateChunk(
    chunk: ProcessedChunk,
    groundTruth: GroundTruth
  ): Promise<ChunkMetrics> {
    const startTime = Date.now()
    
    try {
      // Extract metadata
      const metadata = await extractMetadata(chunk, {
        skipMetadataExtraction: false,
        aiClient: this.aiClient
      } as any)
      
      const extractionTime = Date.now() - startTime
      
      // Calculate metrics
      const metrics = this.calculateMetrics(
        metadata,
        groundTruth,
        extractionTime
      )
      
      this.metrics.push(metrics)
      
      if (this.config.verbose) {
        this.logChunkMetrics(chunk, metrics)
      }
      
      return metrics
      
    } catch (error) {
      // Handle extraction failure
      const failureMetrics: ChunkMetrics = {
        chunkId: groundTruth.chunkId,
        completeness: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        extractionTime: Date.now() - startTime,
        missingFields: groundTruth.requiredFields,
        incorrectFields: [],
        passed: false
      }
      
      this.metrics.push(failureMetrics)
      return failureMetrics
    }
  }

  /**
   * Calculates quality metrics for extracted metadata.
   */
  private calculateMetrics(
    extracted: ChunkMetadata | undefined,
    groundTruth: GroundTruth,
    extractionTime: number
  ): ChunkMetrics {
    const missingFields: string[] = []
    const incorrectFields: string[] = []
    
    let truePositives = 0
    let falsePositives = 0
    let falseNegatives = 0
    
    // Check required fields
    for (const field of groundTruth.requiredFields) {
      const fieldValue = this.getFieldValue(extracted, field)
      const expectedValue = this.getFieldValue(groundTruth.expectedMetadata, field)
      
      if (!fieldValue) {
        missingFields.push(field)
        falseNegatives++
      } else if (expectedValue && !this.valuesMatch(fieldValue, expectedValue)) {
        incorrectFields.push(field)
        falsePositives++
      } else {
        truePositives++
      }
    }
    
    // Check optional fields if present
    for (const field of groundTruth.optionalFields) {
      const fieldValue = this.getFieldValue(extracted, field)
      const expectedValue = this.getFieldValue(groundTruth.expectedMetadata, field)
      
      if (fieldValue && expectedValue) {
        if (this.valuesMatch(fieldValue, expectedValue)) {
          truePositives++
        } else {
          incorrectFields.push(field)
          falsePositives++
        }
      }
    }
    
    // Calculate completeness
    const totalExpectedFields = groundTruth.requiredFields.length + 
      groundTruth.optionalFields.filter(f => 
        this.getFieldValue(groundTruth.expectedMetadata, f) !== undefined
      ).length
    
    const completeness = totalExpectedFields > 0 
      ? ((totalExpectedFields - missingFields.length) / totalExpectedFields) * 100 
      : 0
    
    // Calculate precision, recall, F1
    const precision = (truePositives + falsePositives) > 0 
      ? truePositives / (truePositives + falsePositives) 
      : 0
      
    const recall = (truePositives + falseNegatives) > 0 
      ? truePositives / (truePositives + falseNegatives) 
      : 0
      
    const f1Score = (precision + recall) > 0 
      ? 2 * (precision * recall) / (precision + recall) 
      : 0
    
    // Check if passed
    const passed = 
      completeness >= this.config.targetCompleteness &&
      precision >= (this.config.targetPrecision / 100) &&
      recall >= (this.config.targetRecall / 100) &&
      f1Score >= (this.config.targetF1Score / 100) &&
      extractionTime <= this.config.maxExtractionTime
    
    return {
      chunkId: groundTruth.chunkId,
      completeness,
      precision: precision * 100,
      recall: recall * 100,
      f1Score: f1Score * 100,
      extractionTime,
      missingFields,
      incorrectFields,
      passed
    }
  }

  /**
   * Gets a field value from metadata using dot notation.
   */
  private getFieldValue(obj: any, path: string): any {
    if (!obj) return undefined
    
    const parts = path.split('.')
    let current = obj
    
    for (const part of parts) {
      if (current?.[part] !== undefined) {
        current = current[part]
      } else {
        return undefined
      }
    }
    
    return current
  }

  /**
   * Checks if two values match (with fuzzy matching for strings).
   */
  private valuesMatch(actual: any, expected: any): boolean {
    if (typeof actual !== typeof expected) return false
    
    if (typeof actual === 'string' && typeof expected === 'string') {
      // Fuzzy string matching (case-insensitive, trimmed)
      return actual.toLowerCase().trim() === expected.toLowerCase().trim()
    }
    
    if (typeof actual === 'number' && typeof expected === 'number') {
      // Allow 10% variance for numeric values
      return Math.abs(actual - expected) <= Math.abs(expected * 0.1)
    }
    
    if (Array.isArray(actual) && Array.isArray(expected)) {
      // Check array overlap (at least 50% match)
      const overlap = actual.filter(a => 
        expected.some(e => this.valuesMatch(a, e))
      )
      return overlap.length >= (expected.length * 0.5)
    }
    
    return actual === expected
  }

  /**
   * Logs metrics for a single chunk.
   */
  private logChunkMetrics(chunk: ProcessedChunk, metrics: ChunkMetrics): void {
    const status = metrics.passed ? '✅' : '❌'
    console.log(`\n${status} Chunk ${metrics.chunkId}:`)
    console.log(`  Content: "${chunk.content.substring(0, 50)}..."`)
    console.log(`  Completeness: ${metrics.completeness.toFixed(1)}%`)
    console.log(`  Precision: ${metrics.precision.toFixed(1)}%`)
    console.log(`  Recall: ${metrics.recall.toFixed(1)}%`)
    console.log(`  F1 Score: ${metrics.f1Score.toFixed(1)}%`)
    console.log(`  Extraction Time: ${metrics.extractionTime}ms`)
    
    if (metrics.missingFields.length > 0) {
      console.log(`  Missing: ${metrics.missingFields.join(', ')}`)
    }
    
    if (metrics.incorrectFields.length > 0) {
      console.log(`  Incorrect: ${metrics.incorrectFields.join(', ')}`)
    }
  }

  /**
   * Calculates aggregate metrics across all validated chunks.
   */
  getAggregateMetrics(): AggregateMetrics {
    if (this.metrics.length === 0) {
      return {
        totalChunks: 0,
        averageCompleteness: 0,
        averagePrecision: 0,
        averageRecall: 0,
        averageF1Score: 0,
        averageExtractionTime: 0,
        passedChunks: 0,
        failedChunks: 0,
        passRate: 0,
        p90ExtractionTime: 0,
        p95ExtractionTime: 0,
        p99ExtractionTime: 0
      }
    }
    
    const totalChunks = this.metrics.length
    const passedChunks = this.metrics.filter(m => m.passed).length
    const failedChunks = totalChunks - passedChunks
    
    // Calculate averages
    const sum = (field: keyof ChunkMetrics) => 
      this.metrics.reduce((acc, m) => acc + (m[field] as number), 0)
    
    const averageCompleteness = sum('completeness') / totalChunks
    const averagePrecision = sum('precision') / totalChunks
    const averageRecall = sum('recall') / totalChunks
    const averageF1Score = sum('f1Score') / totalChunks
    const averageExtractionTime = sum('extractionTime') / totalChunks
    
    // Calculate percentiles for extraction time
    const extractionTimes = this.metrics
      .map(m => m.extractionTime)
      .sort((a, b) => a - b)
    
    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * extractionTimes.length) - 1
      return extractionTimes[Math.max(0, index)]
    }
    
    return {
      totalChunks,
      averageCompleteness,
      averagePrecision,
      averageRecall,
      averageF1Score,
      averageExtractionTime,
      passedChunks,
      failedChunks,
      passRate: (passedChunks / totalChunks) * 100,
      p90ExtractionTime: percentile(90),
      p95ExtractionTime: percentile(95),
      p99ExtractionTime: percentile(99)
    }
  }

  /**
   * Generates a detailed quality report.
   */
  generateReport(): string {
    const metrics = this.getAggregateMetrics()
    const timestamp = new Date().toISOString()
    
    let report = `# Metadata Quality Validation Report\n\n`
    report += `Generated: ${timestamp}\n`
    report += `Configuration: ${this.config.useRealAI ? 'Real AI' : 'Mock Extraction'}\n\n`
    
    report += `## Executive Summary\n\n`
    report += `- **Total Chunks Tested**: ${metrics.totalChunks}\n`
    report += `- **Pass Rate**: ${metrics.passRate.toFixed(1)}% (${metrics.passedChunks}/${metrics.totalChunks})\n`
    report += `- **Average Completeness**: ${metrics.averageCompleteness.toFixed(1)}% (Target: ${this.config.targetCompleteness}%)\n`
    report += `- **Average F1 Score**: ${metrics.averageF1Score.toFixed(1)}% (Target: ${this.config.targetF1Score}%)\n\n`
    
    report += `## Quality Metrics\n\n`
    report += `| Metric | Average | Target | Status |\n`
    report += `|--------|---------|--------|--------|\n`
    report += `| Completeness | ${metrics.averageCompleteness.toFixed(1)}% | ${this.config.targetCompleteness}% | ${metrics.averageCompleteness >= this.config.targetCompleteness ? '✅' : '❌'} |\n`
    report += `| Precision | ${metrics.averagePrecision.toFixed(1)}% | ${this.config.targetPrecision}% | ${metrics.averagePrecision >= this.config.targetPrecision ? '✅' : '❌'} |\n`
    report += `| Recall | ${metrics.averageRecall.toFixed(1)}% | ${this.config.targetRecall}% | ${metrics.averageRecall >= this.config.targetRecall ? '✅' : '❌'} |\n`
    report += `| F1 Score | ${metrics.averageF1Score.toFixed(1)}% | ${this.config.targetF1Score}% | ${metrics.averageF1Score >= this.config.targetF1Score ? '✅' : '❌'} |\n\n`
    
    report += `## Performance Metrics\n\n`
    report += `| Metric | Value | Target | Status |\n`
    report += `|--------|-------|--------|--------|\n`
    report += `| Average Time | ${metrics.averageExtractionTime.toFixed(0)}ms | <${this.config.maxExtractionTime}ms | ${metrics.averageExtractionTime <= this.config.maxExtractionTime ? '✅' : '❌'} |\n`
    report += `| P90 Time | ${metrics.p90ExtractionTime}ms | - | - |\n`
    report += `| P95 Time | ${metrics.p95ExtractionTime}ms | - | - |\n`
    report += `| P99 Time | ${metrics.p99ExtractionTime}ms | - | - |\n\n`
    
    report += `## Detailed Results\n\n`
    report += `### Failed Chunks\n\n`
    
    const failedChunks = this.metrics.filter(m => !m.passed)
    if (failedChunks.length > 0) {
      for (const chunk of failedChunks) {
        report += `- **${chunk.chunkId}**\n`
        report += `  - Completeness: ${chunk.completeness.toFixed(1)}%\n`
        report += `  - F1 Score: ${chunk.f1Score.toFixed(1)}%\n`
        report += `  - Time: ${chunk.extractionTime}ms\n`
        if (chunk.missingFields.length > 0) {
          report += `  - Missing: ${chunk.missingFields.join(', ')}\n`
        }
        if (chunk.incorrectFields.length > 0) {
          report += `  - Incorrect: ${chunk.incorrectFields.join(', ')}\n`
        }
      }
    } else {
      report += `All chunks passed validation! 🎉\n`
    }
    
    report += `\n### Common Issues\n\n`
    
    // Analyze common missing fields
    const allMissingFields = this.metrics.flatMap(m => m.missingFields)
    const missingFieldCounts = new Map<string, number>()
    for (const field of allMissingFields) {
      missingFieldCounts.set(field, (missingFieldCounts.get(field) || 0) + 1)
    }
    
    const sortedMissingFields = Array.from(missingFieldCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    
    if (sortedMissingFields.length > 0) {
      report += `Most frequently missing fields:\n`
      for (const [field, count] of sortedMissingFields) {
        const percentage = (count / this.metrics.length) * 100
        report += `- ${field}: ${count} occurrences (${percentage.toFixed(1)}%)\n`
      }
    } else {
      report += `No missing fields detected.\n`
    }
    
    report += `\n## Recommendations\n\n`
    
    if (metrics.averageCompleteness < this.config.targetCompleteness) {
      report += `- **Improve Completeness**: Current ${metrics.averageCompleteness.toFixed(1)}% is below target ${this.config.targetCompleteness}%\n`
      report += `  - Review metadata extraction prompts\n`
      report += `  - Ensure all engines are functioning correctly\n`
    }
    
    if (metrics.averageF1Score < this.config.targetF1Score) {
      report += `- **Improve Accuracy**: F1 score ${metrics.averageF1Score.toFixed(1)}% is below target ${this.config.targetF1Score}%\n`
      report += `  - Fine-tune extraction logic for specific content types\n`
      report += `  - Add more context to AI prompts\n`
    }
    
    if (metrics.averageExtractionTime > this.config.maxExtractionTime) {
      report += `- **Optimize Performance**: Average ${metrics.averageExtractionTime.toFixed(0)}ms exceeds target ${this.config.maxExtractionTime}ms\n`
      report += `  - Consider parallel extraction for independent engines\n`
      report += `  - Cache frequently used patterns\n`
    }
    
    report += `\n## Conclusion\n\n`
    
    const overallPassed = 
      metrics.averageCompleteness >= this.config.targetCompleteness &&
      metrics.averagePrecision >= this.config.targetPrecision &&
      metrics.averageRecall >= this.config.targetRecall &&
      metrics.averageF1Score >= this.config.targetF1Score &&
      metrics.averageExtractionTime <= this.config.maxExtractionTime
    
    if (overallPassed) {
      report += `✅ **PASSED**: The metadata extraction system meets all quality targets!\n`
    } else {
      report += `❌ **FAILED**: The metadata extraction system does not meet all quality targets.\n`
      report += `Please review the recommendations above and iterate on the implementation.\n`
    }
    
    return report
  }

  /**
   * Saves the report to a file.
   */
  async saveReport(outputPath: string): Promise<void> {
    const report = this.generateReport()
    const dir = path.dirname(outputPath)
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    
    fs.writeFileSync(outputPath, report, 'utf-8')
    console.log(`✅ Report saved to: ${outputPath}`)
  }

  /**
   * Gets the raw metrics data.
   */
  getMetrics(): ChunkMetrics[] {
    return this.metrics
  }

  /**
   * Resets all metrics.
   */
  reset(): void {
    this.metrics = []
  }
}

// Export types for use in other modules
export type {
  GroundTruth,
  ChunkMetrics,
  AggregateMetrics,
  ValidationConfig
}