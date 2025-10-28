/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')

const pdfDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'))
const publicDir = path.join(__dirname, '../public')

// 1. Copy PDF.js cMaps for non-Latin character support
const cmapsSource = path.join(pdfDistPath, 'cmaps')
const cmapsTarget = path.join(publicDir, 'cmaps')

if (!fs.existsSync(cmapsTarget)) {
  fs.mkdirSync(cmapsTarget, { recursive: true })
}

fs.cpSync(cmapsSource, cmapsTarget, { recursive: true })
console.log('✅ PDF.js cMaps copied to public/cmaps')

// 2. Copy PDF.js worker file
const workerSource = path.join(pdfDistPath, 'build', 'pdf.worker.min.mjs')
const workerTarget = path.join(publicDir, 'pdf.worker.min.mjs')

fs.copyFileSync(workerSource, workerTarget)
console.log('✅ PDF.js worker copied to public/pdf.worker.min.mjs')

// 3. Copy standard fonts (optional, for better font rendering)
const standardFontsSource = path.join(pdfDistPath, 'standard_fonts')
const standardFontsTarget = path.join(publicDir, 'standard_fonts')

if (fs.existsSync(standardFontsSource)) {
  if (!fs.existsSync(standardFontsTarget)) {
    fs.mkdirSync(standardFontsTarget, { recursive: true })
  }
  fs.cpSync(standardFontsSource, standardFontsTarget, { recursive: true })
  console.log('✅ PDF.js standard fonts copied to public/standard_fonts')
}
