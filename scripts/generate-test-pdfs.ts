import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

const testFilesDir = path.join(process.cwd(), 'test-files')

// Ensure test-files directory exists
if (!fs.existsSync(testFilesDir)) {
  fs.mkdirSync(testFilesDir, { recursive: true })
}

// Helper to generate lorem ipsum text
function generateText(paragraphs: number): string {
  const lorem = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`
  
  return Array(paragraphs).fill(lorem).join('\n\n')
}

// Create Tiny PDF (~5KB, 1 page)
function createTinyPDF() {
  const doc = new PDFDocument()
  const filename = path.join(testFilesDir, 'tiny-test.pdf')
  const stream = fs.createWriteStream(filename)
  
  doc.pipe(stream)
  
  doc.fontSize(20).text('Tiny Test PDF', { align: 'center' })
  doc.moveDown()
  doc.fontSize(12).text('Introduction', { underline: true })
  doc.moveDown(0.5)
  doc.fontSize(11).text(generateText(2))
  doc.moveDown()
  doc.fontSize(12).text('Conclusion', { underline: true })
  doc.moveDown(0.5)
  doc.fontSize(11).text('This tiny PDF is designed for quick processing tests.')
  
  doc.end()
  
  return new Promise((resolve) => {
    stream.on('finish', () => {
      const stats = fs.statSync(filename)
      console.log(`✅ Created tiny-test.pdf (${Math.round(stats.size / 1024)} KB)`)
      resolve(filename)
    })
  })
}

// Create Small PDF (~15KB, 2-3 pages)
function createSmallPDF() {
  const doc = new PDFDocument()
  const filename = path.join(testFilesDir, 'small-pdf-test.pdf')
  const stream = fs.createWriteStream(filename)
  
  doc.pipe(stream)
  
  doc.fontSize(24).text('Small Test Document', { align: 'center' })
  doc.moveDown(2)
  
  doc.fontSize(16).text('Chapter 1: Introduction')
  doc.moveDown()
  doc.fontSize(12).text(generateText(5))
  doc.moveDown(2)
  
  doc.fontSize(16).text('Chapter 2: Technical Overview')
  doc.moveDown()
  doc.fontSize(12).text(generateText(5))
  doc.addPage()
  
  doc.fontSize(16).text('Chapter 3: Implementation Details')
  doc.moveDown()
  doc.fontSize(12).text(generateText(6))
  doc.moveDown(2)
  
  doc.fontSize(16).text('Conclusion')
  doc.moveDown()
  doc.fontSize(12).text(generateText(2))
  
  doc.end()
  
  return new Promise((resolve) => {
    stream.on('finish', () => {
      const stats = fs.statSync(filename)
      console.log(`✅ Created small-pdf-test.pdf (${Math.round(stats.size / 1024)} KB)`)
      resolve(filename)
    })
  })
}

// Create Medium PDF (~50KB, 5-7 pages)
function createMediumPDF() {
  const doc = new PDFDocument()
  const filename = path.join(testFilesDir, 'medium-pdf-test.pdf')
  const stream = fs.createWriteStream(filename)
  
  doc.pipe(stream)
  
  // Title page
  doc.fontSize(28).text('Medium Test Document', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(14).text('A Comprehensive Testing Document', { align: 'center' })
  doc.moveDown(3)
  doc.fontSize(12).text('Version 1.0', { align: 'center' })
  doc.text('2025', { align: 'center' })
  doc.addPage()
  
  // Table of contents
  doc.fontSize(20).text('Table of Contents')
  doc.moveDown()
  doc.fontSize(12)
  doc.text('1. Introduction ........................... 3')
  doc.text('2. Background ............................ 3')
  doc.text('3. Methodology ........................... 4')
  doc.text('4. Results ............................... 5')
  doc.text('5. Discussion ............................ 6')
  doc.text('6. Conclusion ............................ 7')
  doc.addPage()
  
  // Content pages
  const chapters = [
    { title: 'Introduction', pages: 1 },
    { title: 'Background', pages: 1 },
    { title: 'Methodology', pages: 2 },
    { title: 'Results', pages: 1 },
    { title: 'Discussion', pages: 1 }
  ]
  
  chapters.forEach((chapter, idx) => {
    doc.fontSize(18).text(`${idx + 1}. ${chapter.title}`)
    doc.moveDown()
    doc.fontSize(12).text(generateText(8 * chapter.pages))
    
    if (idx < chapters.length - 1) {
      doc.addPage()
    }
  })
  
  doc.addPage()
  doc.fontSize(18).text('6. Conclusion')
  doc.moveDown()
  doc.fontSize(12).text(generateText(4))
  
  doc.end()
  
  return new Promise((resolve) => {
    stream.on('finish', () => {
      const stats = fs.statSync(filename)
      console.log(`✅ Created medium-pdf-test.pdf (${Math.round(stats.size / 1024)} KB)`)
      resolve(filename)
    })
  })
}

// Create Large PDF (~150KB, 15-20 pages)
function createLargePDF() {
  const doc = new PDFDocument()
  const filename = path.join(testFilesDir, 'large-pdf-test.pdf')
  const stream = fs.createWriteStream(filename)
  
  doc.pipe(stream)
  
  // Title page
  doc.fontSize(32).text('Large Test Document', { align: 'center' })
  doc.moveDown()
  doc.fontSize(16).text('Extended Testing Material', { align: 'center' })
  doc.moveDown(4)
  doc.fontSize(10).text('This document contains extensive content for testing', { align: 'center' })
  doc.text('large document processing capabilities', { align: 'center' })
  doc.addPage()
  
  // Generate 18 pages of content
  for (let i = 1; i <= 18; i++) {
    doc.fontSize(20).text(`Chapter ${i}`)
    doc.moveDown()
    doc.fontSize(14).text(`Section ${i}.1: Overview`)
    doc.moveDown(0.5)
    doc.fontSize(11).text(generateText(6))
    doc.moveDown()
    
    doc.fontSize(14).text(`Section ${i}.2: Details`)
    doc.moveDown(0.5)
    doc.fontSize(11).text(generateText(6))
    doc.moveDown()
    
    doc.fontSize(14).text(`Section ${i}.3: Analysis`)
    doc.moveDown(0.5)
    doc.fontSize(11).text(generateText(6))
    
    if (i < 18) {
      doc.addPage()
    }
  }
  
  doc.end()
  
  return new Promise((resolve) => {
    stream.on('finish', () => {
      const stats = fs.statSync(filename)
      console.log(`✅ Created large-pdf-test.pdf (${Math.round(stats.size / 1024)} KB)`)
      resolve(filename)
    })
  })
}

// Run all generators
async function main() {
  console.log('📄 Generating test PDFs...\n')
  
  await createTinyPDF()
  await createSmallPDF()
  await createMediumPDF()
  await createLargePDF()
  
  console.log('\n✨ All test PDFs generated successfully!')
  console.log(`\nFiles created in: ${testFilesDir}`)
  console.log('\nTest files:')
  console.log('  - tiny-test.pdf (~5 KB, 1 page) - Quick baseline test')
  console.log('  - small-pdf-test.pdf (~15 KB, 3 pages) - Basic content test')
  console.log('  - medium-pdf-test.pdf (~50 KB, 7 pages) - Standard document test')
  console.log('  - large-pdf-test.pdf (~150 KB, 18 pages) - Stress test')
}

main().catch(console.error)