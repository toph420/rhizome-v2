import { UploadZone } from '@/components/library/UploadZone'
import { DocumentList } from '@/components/library/DocumentList'
import { ProcessingDock } from '@/components/layout/ProcessingDock'

/**
 * Main library page with document upload and processing.
 * @returns Home page component.
 */
export default function Home() {
  return (
    <>
      <main className="container mx-auto p-8 pb-32">
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Rhizome V2</h1>
            <p className="text-muted-foreground">
              Document Reader & Knowledge Synthesis
            </p>
          </div>
          
          <UploadZone />
          
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Your Documents</h2>
            <DocumentList />
          </div>
        </div>
      </main>
      
      <ProcessingDock />
    </>
  )
}