import { UploadZone } from '@/components/library/UploadZone'
import { DocumentList } from '@/components/library/DocumentList'

/**
 * Main library page with document upload and processing.
 * @returns Home page component.
 */
export default async function Home() {
  return (
    <main className="container mx-auto p-8 pb-32">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">Rhizome</h1>
        </div>

        <UploadZone />

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Books and Shit</h2>
          <DocumentList />
        </div>
      </div>
    </main>
  )
}