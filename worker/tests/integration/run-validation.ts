#!/usr/bin/env node

/**
 * Comprehensive validation runner for the refactored document processor system.
 * Executes all integration tests and generates detailed performance reports.
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import chalk from 'chalk'

interface TestResult {
  name: string
  passed: boolean
  duration: number
  metrics?: {
    processingTime?: number
    databaseCalls?: number
    cacheHitRate?: number
    memoryUsed?: number
  }
  errors?: string[]
}

interface ValidationReport {
  timestamp: Date
  summary: {
    total: number
    passed: number
    failed: number
    duration: number
  }
  performanceTargets: {
    databaseReduction: boolean
    cacheHitRate: boolean
    processingSpeed: boolean
    fileSize: boolean
  }
  results: TestResult[]
}

class IntegrationValidator {
  private results: TestResult[] = []
  private startTime: number = Date.now()

  /**
   * Run all validation tests.
   */
  async runValidation(): Promise<ValidationReport> {
    console.log(chalk.cyan.bold('\n🚀 Starting Document Processor Validation Suite\n'))
    console.log(chalk.gray('=' .repeat(60)))

    // Step 1: Build TypeScript
    await this.runStep('TypeScript Build', async () => {
      execSync('npm run build', { cwd: process.cwd(), stdio: 'pipe' })
    })

    // Step 2: Lint Check
    await this.runStep('Linting', async () => {
      execSync('npm run lint', { cwd: process.cwd(), stdio: 'pipe' })
    })

    // Step 3: Run Unit Tests
    await this.runStep('Unit Tests', async () => {
      execSync('npm test -- __tests__', { cwd: process.cwd(), stdio: 'pipe' })
    })

    // Step 4: Run Integration Tests
    await this.runStep('Integration Tests', async () => {
      execSync('npm test -- tests/integration', { cwd: process.cwd(), stdio: 'pipe' })
    })

    // Step 5: Check File Sizes
    const fileSizeCheck = await this.checkFileSizes()
    
    // Step 6: Performance Benchmarks
    const performanceCheck = await this.runPerformanceBenchmarks()

    // Step 7: Cache Effectiveness
    const cacheCheck = await this.verifyCacheEffectiveness()

    // Step 8: Database Optimization
    const dbCheck = await this.verifyDatabaseOptimization()

    // Generate report
    const report = this.generateReport({
      fileSize: fileSizeCheck,
      performance: performanceCheck,
      cache: cacheCheck,
      database: dbCheck
    })

    this.printReport(report)
    this.saveReport(report)

    return report
  }

  /**
   * Run a single validation step.
   */
  private async runStep(name: string, fn: () => Promise<void> | void): Promise<void> {
    const stepStart = Date.now()
    process.stdout.write(chalk.yellow(`⏳ ${name}...`))
    
    try {
      await fn()
      const duration = Date.now() - stepStart
      this.results.push({
        name,
        passed: true,
        duration
      })
      process.stdout.write(chalk.green(` ✅ (${duration}ms)\n`))
    } catch (error) {
      const duration = Date.now() - stepStart
      this.results.push({
        name,
        passed: false,
        duration,
        errors: [error.message]
      })
      process.stdout.write(chalk.red(` ❌ (${duration}ms)\n`))
      console.error(chalk.red(`  Error: ${error.message}`))
    }
  }

  /**
   * Check that main handler is under 250 lines.
   */
  private async checkFileSizes(): Promise<boolean> {
    const handlerPath = path.join(process.cwd(), 'handlers/process-document.ts')
    
    try {
      const content = fs.readFileSync(handlerPath, 'utf-8')
      const lines = content.split('\n').length
      
      const passed = lines < 250
      
      this.results.push({
        name: 'File Size Check',
        passed,
        duration: 0,
        metrics: {
          processingTime: lines
        }
      })
      
      if (!passed) {
        console.error(chalk.red(`  Main handler is ${lines} lines (target: <250)`))
      } else {
        console.log(chalk.green(`  ✅ Main handler: ${lines} lines (target: <250)`))
      }
      
      return passed
    } catch (error) {
      console.error(chalk.red('  Could not check file size:', error.message))
      return false
    }
  }

  /**
   * Run performance benchmarks.
   */
  private async runPerformanceBenchmarks(): Promise<boolean> {
    console.log(chalk.cyan('\n📊 Running Performance Benchmarks...\n'))
    
    try {
      // Run benchmark suite
      const output = execSync('npm run benchmark:all', { 
        cwd: process.cwd(), 
        encoding: 'utf-8' 
      })
      
      // Parse benchmark results
      const pdfMatch = output.match(/PDF Processing: (\d+)x improvement/i)
      const batchMatch = output.match(/Batch Operations: (\d+)x improvement/i)
      const cacheMatch = output.match(/Cache Hit Rate: (\d+)%/i)
      
      const pdfImprovement = pdfMatch ? parseInt(pdfMatch[1]) : 0
      const batchImprovement = batchMatch ? parseInt(batchMatch[1]) : 0
      const cacheHitRate = cacheMatch ? parseInt(cacheMatch[1]) : 0
      
      const passed = pdfImprovement >= 50 && batchImprovement >= 25 && cacheHitRate >= 80
      
      this.results.push({
        name: 'Performance Benchmarks',
        passed,
        duration: 0,
        metrics: {
          databaseCalls: batchImprovement,
          cacheHitRate: cacheHitRate / 100,
          processingTime: pdfImprovement
        }
      })
      
      console.log(chalk.gray('  PDF Processing: ') + 
                  (pdfImprovement >= 50 ? chalk.green : chalk.red)(`${pdfImprovement}x (target: 50x)`))
      console.log(chalk.gray('  Batch Operations: ') + 
                  (batchImprovement >= 25 ? chalk.green : chalk.red)(`${batchImprovement}x (target: 25x)`))
      console.log(chalk.gray('  Cache Hit Rate: ') + 
                  (cacheHitRate >= 80 ? chalk.green : chalk.red)(`${cacheHitRate}% (target: 80%)`))
      
      return passed
    } catch (error) {
      console.error(chalk.red('  Benchmark failed:', error.message))
      return false
    }
  }

  /**
   * Verify cache effectiveness.
   */
  private async verifyCacheEffectiveness(): Promise<boolean> {
    console.log(chalk.cyan('\n🔄 Verifying Cache Effectiveness...\n'))
    
    try {
      const output = execSync('npm run benchmark:cache', { 
        cwd: process.cwd(), 
        encoding: 'utf-8' 
      })
      
      const hitRateMatch = output.match(/Overall hit rate: ([\d.]+)%/i)
      const hitRate = hitRateMatch ? parseFloat(hitRateMatch[1]) : 0
      
      const passed = hitRate >= 80
      
      console.log(chalk.gray('  Cache hit rate: ') + 
                  (passed ? chalk.green : chalk.red)(`${hitRate.toFixed(1)}% (target: 80%)`))
      
      return passed
    } catch (error) {
      console.error(chalk.red('  Cache verification failed:', error.message))
      return false
    }
  }

  /**
   * Verify database optimization achieved 50x improvement.
   */
  private async verifyDatabaseOptimization(): Promise<boolean> {
    console.log(chalk.cyan('\n💾 Verifying Database Optimization...\n'))
    
    try {
      const output = execSync('npm run benchmark:batch', { 
        cwd: process.cwd(), 
        encoding: 'utf-8' 
      })
      
      const reductionMatch = output.match(/Database calls reduced by: (\d+)x/i)
      const reduction = reductionMatch ? parseInt(reductionMatch[1]) : 0
      
      const passed = reduction >= 50
      
      console.log(chalk.gray('  Database call reduction: ') + 
                  (passed ? chalk.green : chalk.red)(`${reduction}x (target: 50x)`))
      
      return passed
    } catch (error) {
      console.error(chalk.red('  Database verification failed:', error.message))
      return false
    }
  }

  /**
   * Generate validation report.
   */
  private generateReport(checks: {
    fileSize: boolean
    performance: boolean
    cache: boolean
    database: boolean
  }): ValidationReport {
    const duration = Date.now() - this.startTime
    const passed = this.results.filter(r => r.passed).length
    const failed = this.results.filter(r => !r.passed).length
    
    return {
      timestamp: new Date(),
      summary: {
        total: this.results.length,
        passed,
        failed,
        duration
      },
      performanceTargets: {
        databaseReduction: checks.database,
        cacheHitRate: checks.cache,
        processingSpeed: checks.performance,
        fileSize: checks.fileSize
      },
      results: this.results
    }
  }

  /**
   * Print formatted report to console.
   */
  private printReport(report: ValidationReport): void {
    console.log(chalk.cyan.bold('\n' + '='.repeat(60)))
    console.log(chalk.cyan.bold('       VALIDATION REPORT'))
    console.log(chalk.cyan.bold('='.repeat(60) + '\n'))
    
    // Summary
    const passRate = (report.summary.passed / report.summary.total * 100).toFixed(1)
    const statusColor = report.summary.failed === 0 ? chalk.green : 
                       report.summary.failed <= 2 ? chalk.yellow : chalk.red
    
    console.log(chalk.white.bold('Summary:'))
    console.log(chalk.gray(`  Total Tests: ${report.summary.total}`))
    console.log(chalk.green(`  Passed: ${report.summary.passed} ✅`))
    console.log(report.summary.failed > 0 ? 
                chalk.red(`  Failed: ${report.summary.failed} ❌`) :
                chalk.gray(`  Failed: ${report.summary.failed}`))
    console.log(statusColor(`  Pass Rate: ${passRate}%`))
    console.log(chalk.gray(`  Duration: ${(report.summary.duration / 1000).toFixed(1)}s\n`))
    
    // Performance Targets
    console.log(chalk.white.bold('Performance Targets:'))
    const targets = [
      { name: 'Database Reduction (50x)', passed: report.performanceTargets.databaseReduction },
      { name: 'Cache Hit Rate (80%)', passed: report.performanceTargets.cacheHitRate },
      { name: 'Processing Speed', passed: report.performanceTargets.processingSpeed },
      { name: 'File Size (<250 lines)', passed: report.performanceTargets.fileSize }
    ]
    
    targets.forEach(target => {
      console.log(`  ${target.passed ? chalk.green('✅') : chalk.red('❌')} ${target.name}`)
    })
    
    // Individual Results
    console.log(chalk.white.bold('\nTest Results:'))
    report.results.forEach(result => {
      const icon = result.passed ? chalk.green('✅') : chalk.red('❌')
      const time = chalk.gray(`(${result.duration}ms)`)
      console.log(`  ${icon} ${result.name} ${time}`)
      
      if (result.metrics) {
        if (result.metrics.databaseCalls) {
          console.log(chalk.gray(`     DB Reduction: ${result.metrics.databaseCalls}x`))
        }
        if (result.metrics.cacheHitRate) {
          console.log(chalk.gray(`     Cache Hit: ${(result.metrics.cacheHitRate * 100).toFixed(1)}%`))
        }
      }
      
      if (result.errors) {
        result.errors.forEach(error => {
          console.log(chalk.red(`     Error: ${error}`))
        })
      }
    })
    
    // Final Verdict
    console.log(chalk.cyan.bold('\n' + '='.repeat(60)))
    if (report.summary.failed === 0 && 
        Object.values(report.performanceTargets).every(v => v)) {
      console.log(chalk.green.bold('✅ ALL VALIDATION CHECKS PASSED!'))
      console.log(chalk.green('The refactored document processor is ready for production.'))
    } else {
      console.log(chalk.yellow.bold('⚠️  VALIDATION PARTIALLY PASSED'))
      console.log(chalk.yellow('Some checks failed. Review the report and fix issues.'))
    }
    console.log(chalk.cyan.bold('='.repeat(60) + '\n'))
  }

  /**
   * Save report to file.
   */
  private saveReport(report: ValidationReport): void {
    const reportsDir = path.join(process.cwd(), 'tests/reports')
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const reportPath = path.join(reportsDir, `validation-${timestamp}.json`)
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(chalk.gray(`Report saved to: ${reportPath}`))
  }
}

// Main execution
async function main() {
  const validator = new IntegrationValidator()
  
  try {
    const report = await validator.runValidation()
    
    // Exit with appropriate code
    if (report.summary.failed === 0 && 
        Object.values(report.performanceTargets).every(v => v)) {
      process.exit(0)
    } else {
      process.exit(1)
    }
  } catch (error) {
    console.error(chalk.red.bold('\n❌ Validation failed with error:'))
    console.error(chalk.red(error.message))
    console.error(error.stack)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}

export { IntegrationValidator, ValidationReport }