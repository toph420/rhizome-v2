#!/usr/bin/env node

/**
 * Test script to verify offset tracking in markdown chunking.
 * Tests the developer's requirement for accurate character position tracking.
 */

import { simpleMarkdownChunking } from './worker/lib/markdown-chunking.js';

function testOffsetTracking() {
  console.log('🧪 Testing Offset Tracking Implementation\n');

  // Test case 1: Simple markdown with multiple sections
  const testMarkdown1 = `# Introduction

This is the opening section with some content to explain the basics.

## Chapter 1

The story begins here with more detailed information and examples.

### Subsection

Additional details in a nested section.`;

  console.log('📝 Test 1: Basic heading structure');
  console.log('Markdown content:');
  console.log(testMarkdown1);
  console.log('\n🔍 Character positions:');
  testMarkdown1.split('').forEach((char, index) => {
    if (char === '#' || index % 50 === 0) {
      console.log(`Position ${index}: "${char === '\n' ? '\\n' : char}"`);
    }
  });

  const chunks1 = simpleMarkdownChunking(testMarkdown1);
  console.log('\n📊 Chunks with offsets:');
  chunks1.forEach((chunk, index) => {
    console.log(`Chunk ${index}:`);
    console.log(`  start_offset: ${chunk.start_offset}`);
    console.log(`  end_offset: ${chunk.end_offset}`);
    console.log(`  content length: ${chunk.content.length}`);
    console.log(`  content preview: "${chunk.content.slice(0, 50).replace(/\n/g, '\\n')}..."`);
    
    // Verify offset accuracy
    if (chunk.start_offset !== undefined && chunk.end_offset !== undefined) {
      const extractedContent = testMarkdown1.slice(chunk.start_offset, chunk.end_offset);
      const matches = extractedContent.trim() === chunk.content.trim();
      console.log(`  ✅ Offset accuracy: ${matches ? 'PASS' : 'FAIL'}`);
      if (!matches) {
        console.log(`  ❌ Expected: "${chunk.content.slice(0, 30)}..."`);
        console.log(`  ❌ Got: "${extractedContent.slice(0, 30)}..."`);
      }
    }
    console.log('');
  });

  // Test case 2: Long content that triggers splitting
  const longParagraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50);
  const testMarkdown2 = `# Long Section

${longParagraph}

## Another Section

More content here.`;

  console.log('\n📝 Test 2: Long content splitting');
  console.log(`Content length: ${testMarkdown2.length} characters\n`);

  const chunks2 = simpleMarkdownChunking(testMarkdown2);
  console.log('📊 Chunks from long content:');
  chunks2.forEach((chunk, index) => {
    console.log(`Chunk ${index}:`);
    console.log(`  start_offset: ${chunk.start_offset}`);
    console.log(`  end_offset: ${chunk.end_offset}`);
    console.log(`  content length: ${chunk.content.length}`);
    console.log('');
  });

  // Test case 3: Viewport overlap simulation
  console.log('\n🖥️  Test 3: Viewport overlap simulation');
  const viewportStart = 50;
  const viewportEnd = 150;
  
  console.log(`Viewport: characters ${viewportStart}-${viewportEnd}`);
  const visibleChunks = chunks1.filter(chunk => 
    chunk.start_offset !== undefined && 
    chunk.end_offset !== undefined &&
    chunk.start_offset <= viewportEnd && 
    chunk.end_offset >= viewportStart
  );
  
  console.log(`Visible chunks: ${visibleChunks.length}`);
  visibleChunks.forEach((chunk, index) => {
    console.log(`  Chunk ${index}: offsets ${chunk.start_offset}-${chunk.end_offset}`);
  });

  console.log('\n✅ Offset tracking test completed!');
}

// Run the test
testOffsetTracking();