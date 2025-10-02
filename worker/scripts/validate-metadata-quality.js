#!/usr/bin/env node

/**
 * Metadata Quality Validation Runner
 * 
 * Executes comprehensive validation of metadata extraction across 100+ test documents.
 * Generates quality reports and verifies acceptance criteria for T-023.
 * 
 * Usage:
 *   node scripts/validate-metadata-quality.js [--verbose] [--use-real-ai]
 */

const path = require('path');
const fs = require('fs');

// Import validation framework and test data
const { MetadataQualityFramework } = require('../worker/tests/validation/metadata-quality-framework');

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const useRealAI = args.includes('--use-real-ai');
const outputReport = args.includes('--output-report');

// Color output helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`
};

/**
 * Load test corpus and ground truth data
 */
function loadTestData() {
  const groundTruthPath = path.join(__dirname, '../worker/tests/fixtures/validation-set/ground-truth.json');
  const corpusPath = path.join(__dirname, '../worker/tests/fixtures/validation-set/test-corpus.json');
  
  if (!fs.existsSync(groundTruthPath)) {
    throw new Error(`Ground truth file not found: ${groundTruthPath}`);
  }
  
  if (!fs.existsSync(corpusPath)) {
    throw new Error(`Test corpus file not found: ${corpusPath}`);
  }
  
  const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, 'utf-8'));
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf-8'));
  
  return { groundTruth, corpus };
}

/**
 * Create mock processed chunks for validation
 */
function createProcessedChunk(document) {
  return {
    chunk_index: 0,
    content: document.content,
    start_offset: 0,
    end_offset: document.content.length,
    themes: [],
    importance_score: 0.5,
    summary: '',
    metadata: {} // This will be populated by the extraction
  };
}

/**
 * Main validation function
 */
async function runValidation() {
  console.log(colors.bold('\n🔍 Metadata Quality Validation Runner\n'));
  console.log('=' .repeat(60));
  console.log(`Configuration:`);
  console.log(`  - Verbose: ${verbose ? 'Yes' : 'No'}`);
  console.log(`  - Use Real AI: ${useRealAI ? 'Yes' : 'No (Mock)'}`);
  console.log(`  - Output Report: ${outputReport ? 'Yes' : 'No'}`);
  console.log('=' .repeat(60) + '\n');
  
  try {
    // Load test data
    console.log(colors.cyan('📚 Loading test data...'));
    const { groundTruth, corpus } = loadTestData();
    console.log(`  ✓ Loaded ${groundTruth.testDocuments.length} ground truth annotations`);
    console.log(`  ✓ Loaded ${corpus.documents.length} test documents\n`);
    
    // Initialize validation framework
    const config = {
      useRealAI,
      geminiApiKey: process.env.GEMINI_API_KEY,
      targetCompleteness: groundTruth.thresholds.targetCompleteness,
      targetPrecision: groundTruth.thresholds.targetPrecision,
      targetRecall: groundTruth.thresholds.targetRecall,
      targetF1Score: groundTruth.thresholds.targetF1Score,
      maxExtractionTime: groundTruth.thresholds.maxExtractionTime,
      verbose
    };
    
    const validator = new MetadataQualityFramework(config);
    
    // Process ground truth documents first (they have expected metadata)
    console.log(colors.cyan('🧪 Validating ground truth documents...\n'));
    
    for (const gtDoc of groundTruth.testDocuments) {
      const chunk = createProcessedChunk(gtDoc);
      
      const groundTruthData = {
        chunkId: gtDoc.id,
        expectedMetadata: gtDoc.expectedMetadata,
        requiredFields: gtDoc.requiredFields,
        optionalFields: gtDoc.optionalFields || [],
        minimumScore: 0.8
      };
      
      await validator.validateChunk(chunk, groundTruthData);
      
      if (!verbose) {
        process.stdout.write('.');
      }
    }
    
    if (!verbose) {
      console.log('\n');
    }
    
    // Process corpus documents (larger set, no ground truth)
    console.log(colors.cyan('\n📊 Processing full corpus documents...\n'));
    
    let processedCount = 0;
    for (const doc of corpus.documents) {
      const chunk = createProcessedChunk(doc);
      
      // Create basic ground truth (just check completeness)
      const basicGroundTruth = {
        chunkId: doc.id,
        expectedMetadata: {},
        requiredFields: [
          'structural.headingLevel',
          'emotional.sentiment',
          'conceptual.concepts',
          'narrative.style',
          'domain.field'
        ],
        optionalFields: [
          'methods.signatures',
          'references.citations'
        ],
        minimumScore: 0.7
      };
      
      await validator.validateChunk(chunk, basicGroundTruth);
      
      processedCount++;
      if (!verbose && processedCount % 10 === 0) {
        process.stdout.write(`[${processedCount}/${corpus.documents.length}]`);
      }
    }
    
    if (!verbose) {
      console.log('\n');
    }
    
    // Get aggregate metrics
    console.log(colors.cyan('\n📈 Calculating aggregate metrics...\n'));
    const metrics = validator.getAggregateMetrics();
    
    // Display results
    console.log(colors.bold('📊 Validation Results\n'));
    console.log('=' .repeat(60));
    
    console.log(`Total Chunks Validated: ${metrics.totalChunks}`);
    console.log(`Pass Rate: ${colors.bold(metrics.passRate.toFixed(1) + '%')} (${metrics.passedChunks}/${metrics.totalChunks})`);
    console.log('');
    
    console.log('Quality Metrics:');
    console.log(`  - Completeness: ${formatMetric(metrics.averageCompleteness, config.targetCompleteness)}`);
    console.log(`  - Precision: ${formatMetric(metrics.averagePrecision, config.targetPrecision)}`);
    console.log(`  - Recall: ${formatMetric(metrics.averageRecall, config.targetRecall)}`);
    console.log(`  - F1 Score: ${formatMetric(metrics.averageF1Score, config.targetF1Score)}`);
    console.log('');
    
    console.log('Performance Metrics:');
    console.log(`  - Average Time: ${formatTime(metrics.averageExtractionTime, config.maxExtractionTime)}`);
    console.log(`  - P90 Time: ${metrics.p90ExtractionTime}ms`);
    console.log(`  - P95 Time: ${metrics.p95ExtractionTime}ms`);
    console.log(`  - P99 Time: ${metrics.p99ExtractionTime}ms`);
    
    console.log('\n' + '=' .repeat(60));
    
    // Determine overall pass/fail
    const overallPassed = 
      metrics.averageCompleteness >= config.targetCompleteness &&
      metrics.averagePrecision >= config.targetPrecision &&
      metrics.averageRecall >= config.targetRecall &&
      metrics.averageF1Score >= config.targetF1Score &&
      metrics.averageExtractionTime <= config.maxExtractionTime;
    
    if (overallPassed) {
      console.log(colors.green('\n✅ VALIDATION PASSED - All quality targets met!\n'));
    } else {
      console.log(colors.red('\n❌ VALIDATION FAILED - Some quality targets not met\n'));
      
      // Show what failed
      if (metrics.averageCompleteness < config.targetCompleteness) {
        console.log(colors.yellow(`  ⚠ Completeness: ${metrics.averageCompleteness.toFixed(1)}% < ${config.targetCompleteness}%`));
      }
      if (metrics.averagePrecision < config.targetPrecision) {
        console.log(colors.yellow(`  ⚠ Precision: ${metrics.averagePrecision.toFixed(1)}% < ${config.targetPrecision}%`));
      }
      if (metrics.averageRecall < config.targetRecall) {
        console.log(colors.yellow(`  ⚠ Recall: ${metrics.averageRecall.toFixed(1)}% < ${config.targetRecall}%`));
      }
      if (metrics.averageF1Score < config.targetF1Score) {
        console.log(colors.yellow(`  ⚠ F1 Score: ${metrics.averageF1Score.toFixed(1)}% < ${config.targetF1Score}%`));
      }
      if (metrics.averageExtractionTime > config.maxExtractionTime) {
        console.log(colors.yellow(`  ⚠ Extraction Time: ${metrics.averageExtractionTime.toFixed(0)}ms > ${config.maxExtractionTime}ms`));
      }
    }
    
    // Generate and save report if requested
    if (outputReport) {
      const reportPath = path.join(__dirname, '../docs/metadata-quality-report.md');
      await validator.saveReport(reportPath);
      console.log(`\n📄 Quality report saved to: ${reportPath}`);
    }
    
    // Exit with appropriate code
    process.exit(overallPassed ? 0 : 1);
    
  } catch (error) {
    console.error(colors.red('\n❌ Validation failed with error:'));
    console.error(error);
    process.exit(1);
  }
}

/**
 * Format metric with pass/fail indicator
 */
function formatMetric(value, target) {
  const formatted = `${value.toFixed(1)}%`;
  const passed = value >= target;
  const status = passed ? colors.green('✓') : colors.red('✗');
  return `${formatted} (target: ${target}%) ${status}`;
}

/**
 * Format time metric with pass/fail indicator
 */
function formatTime(value, maxValue) {
  const formatted = `${value.toFixed(0)}ms`;
  const passed = value <= maxValue;
  const status = passed ? colors.green('✓') : colors.red('✗');
  return `${formatted} (max: ${maxValue}ms) ${status}`;
}

// Run validation
runValidation().catch(error => {
  console.error(colors.red('Fatal error:'), error);
  process.exit(1);
});