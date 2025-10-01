'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { getLatestGeminiResponse } from '@/app/actions/admin'

export function GeminiDebugPanel() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedJob, setSelectedJob] = useState<any>(null)

  const loadJobs = async () => {
    setLoading(true)
    const result = await getLatestGeminiResponse()
    if (result.success && result.jobs) {
      setJobs(result.jobs)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadJobs()
  }, [])

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Gemini Debug</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={loadJobs}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Recent jobs (check worker logs for Gemini responses)
        </div>

        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs found</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-3 rounded-lg border cursor-pointer hover:bg-accent"
                onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{job.job_type}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      job.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : job.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : job.status === 'processing'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                {selectedJob?.id === job.id && (
                  <div className="mt-2 space-y-2">
                    <div className="text-xs">
                      <span className="font-medium">Created:</span>{' '}
                      {new Date(job.created_at).toLocaleString()}
                    </div>
                    {job.started_at && (
                      <div className="text-xs">
                        <span className="font-medium">Started:</span>{' '}
                        {new Date(job.started_at).toLocaleString()}
                      </div>
                    )}
                    {job.completed_at && (
                      <div className="text-xs">
                        <span className="font-medium">Completed:</span>{' '}
                        {new Date(job.completed_at).toLocaleString()}
                      </div>
                    )}
                    {job.error && (
                      <div className="text-xs">
                        <span className="font-medium text-red-600">Error:</span>
                        <pre className="mt-1 p-2 bg-red-50 rounded text-xs overflow-x-auto">
                          {job.error}
                        </pre>
                      </div>
                    )}
                    <div className="text-xs">
                      <span className="font-medium">Payload:</span>
                      <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                        {JSON.stringify(job.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground border-t pt-2">
        💡 Tip: Check the worker terminal for detailed Gemini response logs with
        <code className="mx-1 px-1 bg-muted rounded">[AI Metadata]</code>
        prefix
      </div>
    </Card>
  )
}
