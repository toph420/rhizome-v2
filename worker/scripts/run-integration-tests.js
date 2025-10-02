#!/usr/bin/env node

/**
 * Integration Test Runner Script
 * 
 * Runs comprehensive integration tests for the 7-engine collision detection system
 * with coverage reporting, performance monitoring, and detailed results.
 * 
 * Usage:
 *   npm run test:integration          # Run all integration tests
 *   npm run test:integration:coverage # Run with coverage report
 *   npm run test:integration:perf     # Run performance tests only
 *   npm run test:integration:stress   # Run stress tests only
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Test suite configurations
const TEST_SUITES = {
  full: {
    name: 'Full System Integration',
    pattern: 'tests/integration/full-system.test.ts',
    timeout: 30000,
    required: true,
  },
  edge: {
    name: 'Edge Cases',
    pattern: 'tests/integration/edge-cases.test.ts', 
    timeout: 20000,
    required: true,
  },
  load: {
    name: 'Load Testing',
    pattern: 'tests/integration/load-test.ts',
    timeout: 60000,
    required: false, // Optional for CI
  },
  recovery: {
    name: 'Failure Recovery',
    pattern: 'tests/integration/failure-recovery.test.ts',
    timeout: 30000,
    required: true,
  },
};

// Configuration
const CONFIG = {
  coverageThreshold: 80,
  performanceBaseline: {
    '50chunks': 5000,  // 5 seconds
    '100chunks': 10000, // 10 seconds
  },
  outputDir: 'test-results',
  coverageDir: 'coverage',
  jestConfig: {
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverage: false, // Will be set dynamically
    coverageDirectory: '../coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coveragePathIgnorePatterns: [
      '/node_modules/',
      '/tests/',
      '/dist/',
    ],
    testTimeout: 30000,
    maxWorkers: Math.max(1, os.cpus().length - 1),
    verbose: true,
  },
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    coverage: args.includes('--coverage') || args.includes('-c'),
    performance: args.includes('--performance') || args.includes('-p'),
    stress: args.includes('--stress') || args.includes('-s'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    suite: null,
    help: args.includes('--help') || args.includes('-h'),
  };
  
  // Check for specific suite
  for (const arg of args) {
    if (arg.startsWith('--suite=')) {
      options.suite = arg.split('=')[1];
    }
  }
  
  return options;
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
Integration Test Runner for 7-Engine Collision Detection System

Usage: node scripts/run-integration-tests.js [options]

Options:
  -h, --help          Show this help message
  -c, --coverage      Run with code coverage reporting
  -p, --performance   Run performance tests only
  -s, --stress        Run stress and load tests only
  -v, --verbose       Enable verbose output
  --suite=<name>      Run specific test suite (full, edge, load, recovery)

Examples:
  npm run test:integration                    # Run all tests
  npm run test:integration -- --coverage      # Run with coverage
  npm run test:integration -- --suite=load    # Run load tests only
  npm run test:integration -- --performance   # Run performance benchmarks

Environment Variables:
  CI                  Set to 'true' to skip optional tests
  TEST_TIMEOUT        Override default test timeout (ms)
  COVERAGE_THRESHOLD  Override minimum coverage percentage
  `);
}

/**
 * Ensure output directories exist
 */
async function ensureDirectories() {
  const dirs = [CONFIG.outputDir, CONFIG.coverageDir];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(path.join(__dirname, '..', dir), { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
}

/**
 * Generate Jest configuration file
 */
async function generateJestConfig(options) {
  const config = {
    ...CONFIG.jestConfig,
    collectCoverage: options.coverage,
  };
  
  // Add test patterns based on options
  const patterns = [];
  
  if (options.suite) {
    const suite = TEST_SUITES[options.suite];
    if (!suite) {
      throw new Error(`Unknown test suite: ${options.suite}`);
    }
    patterns.push(suite.pattern);
  } else if (options.performance || options.stress) {
    patterns.push(TEST_SUITES.load.pattern);
  } else {
    // Run all required tests, skip optional in CI
    for (const [key, suite] of Object.entries(TEST_SUITES)) {
      if (suite.required || (!process.env.CI || process.env.CI === 'false')) {
        patterns.push(suite.pattern);
      }
    }
  }
  
  config.testMatch = patterns.map(p => `<rootDir>/${p}`);
  
  // Set timeout based on test type
  if (options.stress || options.performance) {
    config.testTimeout = 60000;
  }
  
  const configPath = path.join(__dirname, '..', 'jest.integration.config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  
  return configPath;
}

/**
 * Run Jest with specified configuration
 */
function runJest(configPath, options) {
  return new Promise((resolve, reject) => {
    const args = [
      'jest',
      '--config',
      configPath,
      '--runInBand', // Run tests sequentially for integration tests
    ];
    
    if (options.verbose) {
      args.push('--verbose');
    }
    
    if (process.env.TEST_TIMEOUT) {
      args.push('--testTimeout', process.env.TEST_TIMEOUT);
    }
    
    const jest = spawn('npx', args, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      shell: true,
    });
    
    jest.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Jest exited with code ${code}`));
      }
    });
    
    jest.on('error', reject);
  });
}

/**
 * Parse coverage report and check threshold
 */
async function checkCoverage() {
  try {
    const coveragePath = path.join(__dirname, '..', CONFIG.coverageDir, 'coverage-summary.json');
    const coverageData = JSON.parse(await fs.readFile(coveragePath, 'utf-8'));
    
    const threshold = process.env.COVERAGE_THRESHOLD || CONFIG.coverageThreshold;
    const statements = coverageData.total.statements.pct;
    const branches = coverageData.total.branches.pct;
    const functions = coverageData.total.functions.pct;
    const lines = coverageData.total.lines.pct;
    
    console.log('\n📊 Coverage Report:');
    console.log(`  Statements: ${statements.toFixed(2)}%`);
    console.log(`  Branches:   ${branches.toFixed(2)}%`);
    console.log(`  Functions:  ${functions.toFixed(2)}%`);
    console.log(`  Lines:      ${lines.toFixed(2)}%`);
    
    const overall = (statements + branches + functions + lines) / 4;
    
    if (overall >= threshold) {
      console.log(`✅ Coverage ${overall.toFixed(2)}% exceeds threshold of ${threshold}%\n`);
      return true;
    } else {
      console.log(`❌ Coverage ${overall.toFixed(2)}% below threshold of ${threshold}%\n`);
      return false;
    }
  } catch (error) {
    console.warn('⚠️  Could not parse coverage report:', error.message);
    return null;
  }
}

/**
 * Generate test report
 */
async function generateTestReport(options, startTime, success) {
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const report = {
    timestamp: new Date().toISOString(),
    duration: `${(duration / 1000).toFixed(2)}s`,
    success,
    options,
    environment: {
      node: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
    },
    testSuites: [],
  };
  
  // Add test suite information
  for (const [key, suite] of Object.entries(TEST_SUITES)) {
    if (!options.suite || options.suite === key) {
      report.testSuites.push({
        name: suite.name,
        pattern: suite.pattern,
        required: suite.required,
      });
    }
  }
  
  // Add coverage if available
  if (options.coverage) {
    try {
      const coveragePath = path.join(__dirname, '..', CONFIG.coverageDir, 'coverage-summary.json');
      const coverageData = JSON.parse(await fs.readFile(coveragePath, 'utf-8'));
      report.coverage = {
        statements: coverageData.total.statements.pct,
        branches: coverageData.total.branches.pct,
        functions: coverageData.total.functions.pct,
        lines: coverageData.total.lines.pct,
      };
    } catch (error) {
      // Coverage not available
    }
  }
  
  const reportPath = path.join(
    __dirname,
    '..',
    CONFIG.outputDir,
    `integration-test-report-${Date.now()}.json`
  );
  
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📋 Test report saved to: ${reportPath}`);
  
  return report;
}

/**
 * Main execution function
 */
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  console.log('🚀 7-Engine Collision Detection - Integration Test Runner\n');
  console.log('Configuration:');
  console.log(`  Coverage:    ${options.coverage ? '✅' : '❌'}`);
  console.log(`  Performance: ${options.performance ? '✅' : '❌'}`);
  console.log(`  Stress:      ${options.stress ? '✅' : '❌'}`);
  console.log(`  Suite:       ${options.suite || 'all'}`);
  console.log(`  CI Mode:     ${process.env.CI === 'true' ? '✅' : '❌'}`);
  console.log('');
  
  const startTime = Date.now();
  let success = true;
  
  try {
    // Prepare environment
    await ensureDirectories();
    
    // Generate Jest configuration
    console.log('📝 Generating test configuration...');
    const configPath = await generateJestConfig(options);
    
    // Run tests
    console.log('🧪 Running integration tests...\n');
    await runJest(configPath, options);
    
    // Check coverage if enabled
    if (options.coverage) {
      const coveragePassed = await checkCoverage();
      if (coveragePassed === false) {
        success = false;
      }
    }
    
    // Generate report
    const report = await generateTestReport(options, startTime, success);
    
    // Display summary
    console.log('\n✨ Integration Test Summary:');
    console.log(`  Duration:    ${report.duration}`);
    console.log(`  Test Suites: ${report.testSuites.length}`);
    console.log(`  Status:      ${success ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (report.coverage) {
      const avgCoverage = Object.values(report.coverage).reduce((a, b) => a + b, 0) / 4;
      console.log(`  Coverage:    ${avgCoverage.toFixed(2)}%`);
    }
    
    // Clean up temporary config
    await fs.unlink(configPath);
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    
    // Generate failure report
    await generateTestReport(options, startTime, false);
    
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runIntegrationTests: main,
  TEST_SUITES,
  CONFIG,
};