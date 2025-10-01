import { UploadZone } from '@/components/library/UploadZone'
import { DocumentList } from '@/components/library/DocumentList'
import { ProcessingDock } from '@/components/layout/ProcessingDock'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { GeminiDebugPanel } from '@/components/admin/GeminiDebugPanel'
import { createClient } from '@/lib/supabase/server'

/**
 * Main library page with document upload and processing.
 * @returns Home page component.
 */
export default async function Home() {
  const supabase = await createClient()

  // Fetch documents for admin panel
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <>
      <main className="container mx-auto p-8 pb-32">
        <div className="max-w-6xl mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Rhizome V2</h1>
            <p className="text-muted-foreground">
              Document Reader & Knowledge Synthesis
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <UploadZone />

              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Your Documents</h2>
                <DocumentList />
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Admin</h2>
              <AdminPanel documents={documents || []} />
              <GeminiDebugPanel />
            </div>
          </div>
        </div>
      </main>

      <ProcessingDock />
    </>
  )
}