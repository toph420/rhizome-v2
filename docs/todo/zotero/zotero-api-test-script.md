/**
 * Zotero API Test Script
 * 
 * Usage:
 *   npx tsx scripts/test-zotero.ts
 *   npx tsx scripts/test-zotero.ts <ITEM_KEY>
 * 
 * Tests Zotero API connection and displays:
 * 1. Your library items (first 10)
 * 2. Annotations for a specific item (if key provided)
 */

import { ZoteroClient, formatCreators } from '../workers/lib/zotero-api-client.js'

async function testZoteroConnection() {
  console.log('🔍 Testing Zotero API Connection...\n')
  
  try {
    const zotero = new ZoteroClient()
    
    // Test 1: List library items
    console.log('📚 Fetching your Zotero library (first 10 items)...\n')
    const items = await zotero.getAllItems(10)
    
    console.log(`Found ${items.length} items:\n`)
    
    items.forEach((item, i) => {
      console.log(`${i + 1}. ${item.key}`)
      console.log(`   Title: ${item.title}`)
      console.log(`   Type: ${item.itemType}`)
      if (item.creators.length > 0) {
        console.log(`   Authors: ${formatCreators(item.creators)}`)
      }
      if (item.numPages) {
        console.log(`   Pages: ${item.numPages}`)
      }
      console.log('')
    })
    
    // Test 2: Get annotations for specific item (if provided)
    const itemKey = process.argv[2]
    
    if (itemKey) {
      console.log(`\n🔖 Fetching annotations for item: ${itemKey}\n`)
      
      const item = await zotero.getItem(itemKey)
      console.log(`Item: "${item.title}" by ${formatCreators(item.creators)}\n`)
      
      const annotations = await zotero.getAnnotations(itemKey)
      console.log(`Found ${annotations.length} annotations:\n`)
      
      annotations.forEach((ann, i) => {
        console.log(`${i + 1}. [${ann.annotationType}] Page ${ann.annotationPageLabel || '?'}`)
        console.log(`   Text: "${ann.annotationText.slice(0, 100)}${ann.annotationText.length > 100 ? '...' : ''}"`)
        if (ann.annotationComment) {
          console.log(`   Note: "${ann.annotationComment.slice(0, 80)}${ann.annotationComment.length > 80 ? '...' : ''}"`)
        }
        console.log(`   Color: ${ann.annotationColor}`)
        console.log('')
      })
      
      // Summary
      const highlights = annotations.filter(a => a.annotationType === 'highlight')
      const notes = annotations.filter(a => a.annotationType === 'note')
      const images = annotations.filter(a => a.annotationType === 'image')
      
      console.log(`Summary:`)
      console.log(`  Highlights: ${highlights.length}`)
      console.log(`  Notes: ${notes.length}`)
      console.log(`  Images: ${images.length}`)
    } else {
      console.log(`\n💡 To test annotations, run:`)
      console.log(`   npx tsx scripts/test-zotero.ts <ITEM_KEY>`)
      console.log(`\nGet item key by right-clicking item in Zotero → Copy Item Link`)
      console.log(`Example: npx tsx scripts/test-zotero.ts ABC123XYZ`)
    }
    
    console.log('\n✅ Zotero API connection successful!')
    
  } catch (error) {
    console.error('\n❌ Zotero API test failed:', error)
    
    if (error instanceof Error) {
      if (error.message.includes('must be set in .env')) {
        console.log('\n💡 Make sure you have ZOTERO_USER_ID and ZOTERO_API_KEY in your .env file')
      }
    }
    
    process.exit(1)
  }
}

// Run the test
testZoteroConnection()