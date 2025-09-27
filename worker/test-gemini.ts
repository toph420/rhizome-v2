import { GoogleGenAI } from '@google/genai'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') })

async function testGeminiAPI() {
  console.log('🧪 Testing Gemini API Connection...\n')
  
  // Check API key
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    console.error('❌ GOOGLE_AI_API_KEY not found in environment')
    process.exit(1)
  }
  
  console.log('✅ API key found:', apiKey.slice(0, 10) + '...' + apiKey.slice(-4))
  console.log('')
  
  try {
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: { timeout: 30000 }
    })
    
    // Test 1: Simple text generation
    console.log('📝 Test 1: Simple text generation')
    const startTime1 = Date.now()
    const result1 = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Say "Hello from Gemini!" and nothing else.'
    })
    const elapsed1 = Date.now() - startTime1
    console.log('   ✅ Response:', result1.text)
    console.log('   ⏱️  Time:', elapsed1 + 'ms')
    console.log('')
    
    // Test 2: JSON structured output
    console.log('📊 Test 2: JSON structured output')
    const startTime2 = Date.now()
    const result2 = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Return a JSON object with fields: status (string), timestamp (number)',
      config: {
        responseMimeType: 'application/json'
      }
    })
    const elapsed2 = Date.now() - startTime2
    console.log('   ✅ Response:', result2.text)
    const parsed = JSON.parse(result2.text!)
    console.log('   ✅ Parsed:', parsed)
    console.log('   ⏱️  Time:', elapsed2 + 'ms')
    console.log('')
    
    // Test 3: Files API upload capability
    console.log('📤 Test 3: Files API upload test')
    const startTime3 = Date.now()
    const testBlob = new Blob(['This is a test file for Gemini API'], { type: 'text/plain' })
    const uploadedFile = await ai.files.upload({
      file: testBlob,
      config: { mimeType: 'text/plain' }
    })
    const elapsed3 = Date.now() - startTime3
    console.log('   ✅ Upload successful!')
    console.log('   → File name:', uploadedFile.name)
    console.log('   → File URI:', uploadedFile.uri)
    console.log('   → File state:', uploadedFile.state)
    console.log('   ⏱️  Time:', elapsed3 + 'ms')
    console.log('')
    
    // Test 4: Embedding generation
    console.log('🧮 Test 4: Embedding generation')
    const startTime4 = Date.now()
    const embedResult = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: 'Test embedding content',
      config: { outputDimensionality: 768 }
    })
    const elapsed4 = Date.now() - startTime4
    const embedding = embedResult.embeddings?.[0]?.values
    console.log('   ✅ Embedding generated!')
    console.log('   → Dimensions:', embedding?.length || 0)
    console.log('   → First 5 values:', embedding?.slice(0, 5))
    console.log('   ⏱️  Time:', elapsed4 + 'ms')
    console.log('')
    
    console.log('🎉 All tests passed!')
    console.log('')
    console.log('Summary:')
    console.log('  ✅ Text generation: Working')
    console.log('  ✅ JSON output: Working')
    console.log('  ✅ Files API: Working')
    console.log('  ✅ Embeddings: Working')
    console.log('')
    console.log('💡 Your Gemini API is fully functional and ready for PDF processing!')
    
  } catch (error: any) {
    console.error('\n❌ Test Failed!')
    console.error('Error type:', error.constructor?.name)
    console.error('Error message:', error.message)
    if (error.status) console.error('HTTP status:', error.status)
    if (error.statusText) console.error('Status text:', error.statusText)
    if (error.code) console.error('Error code:', error.code)
    console.error('\nStack trace:')
    console.error(error.stack)
    
    if (error.message?.includes('quota')) {
      console.error('\n💡 Hint: API quota exceeded. Check your billing settings.')
    } else if (error.message?.includes('API key')) {
      console.error('\n💡 Hint: Invalid API key. Check GOOGLE_AI_API_KEY in .env.local')
    } else if (error.message?.includes('fetch failed')) {
      console.error('\n💡 Hint: Network connectivity issue. Check internet connection.')
    }
    
    process.exit(1)
  }
}

testGeminiAPI()
