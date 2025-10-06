import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

/**
 * POST /api/readwise/import
 *
 * Imports highlights from Readwise for a given document
 * Spawns worker script and returns results
 */
export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json()

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'documentId is required' },
        { status: 400 }
      )
    }

    // Run worker script from worker directory for correct module resolution
    const workerDir = path.join(process.cwd(), 'worker')
    const scriptPath = 'scripts/import-readwise.ts'

    // Spawn worker process from worker directory
    const workerProcess = spawn('npx', ['tsx', scriptPath, documentId], {
      cwd: workerDir, // Run from worker directory so .js imports resolve correctly
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV,
      }
    })

    console.log('[Readwise Import] Starting worker for document:', documentId)

    let stdout = ''
    let stderr = ''

    // Capture output
    workerProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    workerProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // Wait for process to complete
    const exitCode = await new Promise<number>((resolve) => {
      workerProcess.on('close', resolve)
    })

    console.log('[Readwise Import] Worker finished with exit code:', exitCode)
    console.log('[Readwise Import] stdout length:', stdout.length)
    console.log('[Readwise Import] stderr length:', stderr.length)

    // Parse JSON output from worker
    // Worker outputs progress logs, so grab the last line which contains the JSON result
    try {
      const lines = stdout.trim().split('\n')
      const lastLine = lines[lines.length - 1]
      const result = JSON.parse(lastLine)

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        )
      }

      return NextResponse.json({
        success: true,
        imported: result.imported,
        needsReview: result.needsReview,
        failed: result.failed,
        bookTitle: result.bookTitle,
        bookAuthor: result.bookAuthor
      })

    } catch (parseError) {
      // Worker output wasn't valid JSON
      console.error('[Readwise Import] Failed to parse worker output')
      console.error('stdout:', stdout)
      console.error('stderr:', stderr)

      return NextResponse.json(
        {
          success: false,
          error: 'Import failed: Invalid worker response',
          stdout: stdout.slice(-500), // Last 500 chars for debugging
          stderr: stderr.slice(-500)
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('[Readwise Import] API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
