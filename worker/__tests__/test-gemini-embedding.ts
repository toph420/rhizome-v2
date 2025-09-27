import { GoogleGenAI } from '@google/genai'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: resolve(__dirname, '../../.env.local') })

async function testEmbedding() {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY not found')
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })

  console.log('Testing embedding API...')
  
  const result = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: 'This is a test sentence for embedding.',
    config: { outputDimensionality: 768 }
  })

  console.log('Full result:', JSON.stringify(result, null, 2))
  console.log('\nResult keys:', Object.keys(result))
  
  if (result.embedding) {
    console.log('Embedding keys:', Object.keys(result.embedding))
    console.log('Embedding type:', typeof result.embedding)
    console.log('Is array?:', Array.isArray(result.embedding))
    
    if (result.embedding.values) {
      console.log('✅ Has .values property')
      console.log('Vector length:', result.embedding.values.length)
      console.log('First few values:', result.embedding.values.slice(0, 5))
    }
  }
}

testEmbedding().catch(console.error)