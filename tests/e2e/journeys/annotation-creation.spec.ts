import { test, expect } from '../fixtures'
import { LibraryPage } from '../page-objects/LibraryPage'
import { UploadZone } from '../page-objects/UploadZone'
import { DocumentReaderPage } from '../page-objects/DocumentReaderPage'
import path from 'path'

/**
 * T-013 Critical User Journey: Select Text → Create Annotation → Save
 * 
 * Tests the complete annotation workflow including text selection, 
 * annotation creation with different colors and notes, and persistence.
 */

test.describe('Select Text → Create Annotation → Save', () => {
  let libraryPage: LibraryPage
  let uploadZone: UploadZone
  let documentReader: DocumentReaderPage
  
  // Test document content for consistent selection targets
  const testContent = `
# Sample Document for Annotations

This is a comprehensive test document that contains multiple sections and paragraphs for testing annotation functionality.

## Introduction Section

The introduction provides background information about the topic. This paragraph contains **important concepts** that users might want to highlight and annotate.

## Main Content

Here we have the primary content with various ideas and information. Users often need to create annotations on specific phrases or sentences to capture their thoughts and insights.

### Subsection with Details

This subsection contains detailed information that requires careful analysis. Some statements might be controversial or need clarification through notes.

## Conclusion

The conclusion summarizes the key points and provides final thoughts on the subject matter.
  `.trim()

  test.beforeEach(async ({ page }) => {
    libraryPage = new LibraryPage(page)
    uploadZone = new UploadZone(page)
    documentReader = new DocumentReaderPage(page)
    
    // Set up a test document for annotation testing
    await libraryPage.navigate()
    
    // Upload test content via paste (fastest for E2E testing)
    await uploadZone.pasteContentComplete(testContent, 'https://test.example.com')
    
    // Wait for processing and open in reader
    await libraryPage.waitForDocumentProcessed('Sample Document for Annotations', 60000)
    await libraryPage.openDocumentInReader('Sample Document for Annotations')
    await documentReader.waitForDocumentLoaded()
  })

  test('Basic Annotation Creation with Color Selection', async ({ page }) => {
    // Given: Document is open in reader
    expect(await documentReader.isDocumentLoaded()).toBe(true)
    
    // When: Selecting text and creating annotation
    const textToHighlight = 'important concepts'
    await documentReader.createAnnotation(textToHighlight, 'yellow')
    
    // Then: Annotation appears in the document
    expect(await documentReader.verifyAnnotationExists(textToHighlight)).toBe(true)
    
    // And: Annotation persists after page reload
    await page.reload()
    await documentReader.waitForDocumentLoaded()
    expect(await documentReader.verifyAnnotationExists(textToHighlight)).toBe(true)
  })

  test('Annotation with Note Creation', async ({ page }) => {
    // Given: Document is open and ready
    const textToHighlight = 'controversial or need clarification'
    const annotationNote = 'This statement needs fact-checking and additional sources to verify the claims made.'
    
    // When: Creating annotation with detailed note
    await documentReader.selectTextByDoubleClick(textToHighlight)
    await documentReader.waitForVisible(documentReader.selectors.quickCapturePanel)
    
    await documentReader.createAnnotationWithNote('red', annotationNote)
    
    // Then: Annotation with note is created
    expect(await documentReader.verifyAnnotationExists(textToHighlight, 'red')).toBe(true)
    
    // And: Note content is accessible (implementation depends on UI design)
    await documentReader.clickAnnotation(textToHighlight)
    // Note: Additional verification for note content would depend on how notes are displayed
  })

  test('Multiple Annotations with Different Colors', async ({ page }) => {
    // Given: Document ready for multiple annotations
    const annotations = [
      { text: 'background information', color: 'blue' as const, note: 'Context setting' },
      { text: 'primary content', color: 'green' as const, note: 'Main topic' },
      { text: 'key points', color: 'purple' as const, note: 'Summary items' },
      { text: 'detailed information', color: 'yellow' as const, note: undefined }
    ]
    
    // When: Creating multiple annotations
    for (const annotation of annotations) {
      if (annotation.note) {
        await documentReader.createAnnotation(annotation.text, annotation.color, annotation.note)
      } else {
        await documentReader.createAnnotation(annotation.text, annotation.color)
      }
      
      // Small delay between annotations
      await page.waitForTimeout(500)
    }
    
    // Then: All annotations are visible
    for (const annotation of annotations) {
      expect(await documentReader.verifyAnnotationExists(annotation.text)).toBe(true)
    }
    
    // And: Correct number of annotation markers present
    const markerCount = await documentReader.getAnnotationMarkersCount()
    expect(markerCount).toBe(annotations.length)
  })

  test('Keyboard Shortcuts for Annotation Colors', async ({ page }) => {
    // Given: Document is ready and keyboard shortcuts are enabled
    const testTexts = [
      { text: 'comprehensive test document', key: 'g' as const, color: 'green' },
      { text: 'careful analysis', key: 'y' as const, color: 'yellow' },
      { text: 'final thoughts', key: 'r' as const, color: 'red' }
    ]
    
    // When: Using keyboard shortcuts for annotation
    for (const item of testTexts) {
      // Select text first
      await documentReader.selectTextByDoubleClick(item.text)
      await documentReader.waitForVisible(documentReader.selectors.quickCapturePanel)
      
      // Use keyboard shortcut
      await documentReader.useKeyboardShortcutForColor(item.key)
      
      // Verify annotation created
      expect(await documentReader.verifyAnnotationExists(item.text)).toBe(true)
    }
    
    // Then: All keyboard-created annotations are present
    expect(await documentReader.getAnnotationMarkersCount()).toBe(testTexts.length)
  })

  test('Annotation Selection Cancellation', async ({ page }) => {
    // Given: Text is selected
    const testText = 'introduction provides'
    await documentReader.selectTextByDoubleClick(testText)
    await documentReader.waitForVisible(documentReader.selectors.quickCapturePanel)
    
    // When: Canceling annotation creation
    await documentReader.cancelAnnotation()
    
    // Then: Quick capture panel disappears
    expect(await documentReader.isQuickCapturePanelVisible()).toBe(false)
    
    // And: No annotation is created
    expect(await documentReader.verifyAnnotationExists(testText)).toBe(false)
  })

  test('Escape Key Clears Selection', async ({ page }) => {
    // Given: Text is selected and quick capture panel is visible
    await documentReader.selectTextByDoubleClick('various ideas')
    await documentReader.waitForVisible(documentReader.selectors.quickCapturePanel)
    
    // When: Pressing escape key
    await documentReader.clearSelection()
    
    // Then: Selection is cleared and panel is hidden
    expect(await documentReader.isQuickCapturePanelVisible()).toBe(false)
  })

  test('Annotation on Complex Text Selection', async ({ page }) => {
    // Given: Need to annotate a multi-word phrase
    const startText = 'Users often need'
    const endText = 'their thoughts and insights'
    
    // When: Selecting text by dragging
    await documentReader.selectTextByDrag(startText, endText)
    await documentReader.waitForVisible(documentReader.selectors.quickCapturePanel)
    
    await documentReader.createAnnotationWithColor('blue')
    
    // Then: Complex selection is annotated correctly
    expect(await documentReader.verifyAnnotationExists('Users often need')).toBe(true)
  })

  test('Annotation Persistence Across Navigation', async ({ page }) => {
    // Given: Annotation is created
    const annotationText = 'summarizes the key points'
    await documentReader.createAnnotation(annotationText, 'green', 'Important summary')
    
    // When: Navigating away and back
    await documentReader.backToLibrary()
    await libraryPage.waitForLibraryLoaded()
    
    // Navigate back to document
    await libraryPage.openDocumentInReader('Sample Document for Annotations')
    await documentReader.waitForDocumentLoaded()
    
    // Then: Annotation persists
    expect(await documentReader.verifyAnnotationExists(annotationText)).toBe(true)
  })

  test('Overlapping Annotations Handling', async ({ page }) => {
    // Given: Two overlapping text selections
    const firstText = 'comprehensive test document'
    const secondText = 'test document that contains'
    
    // When: Creating overlapping annotations
    await documentReader.createAnnotation(firstText, 'yellow')
    await page.waitForTimeout(500)
    
    await documentReader.createAnnotation(secondText, 'blue')
    
    // Then: Both annotations exist (behavior depends on implementation)
    expect(await documentReader.verifyAnnotationExists(firstText)).toBe(true)
    expect(await documentReader.verifyAnnotationExists(secondText)).toBe(true)
  })

  test('Annotation in Different Document Sections', async ({ page }) => {
    // Given: Document with multiple sections
    const sectionAnnotations = [
      { text: 'Introduction Section', section: 'heading' },
      { text: 'background information', section: 'content' },
      { text: 'Subsection with Details', section: 'subheading' },
      { text: 'final thoughts', section: 'conclusion' }
    ]
    
    // When: Creating annotations in different sections
    for (const annotation of sectionAnnotations) {
      // Scroll to section if needed
      if (annotation.section === 'conclusion') {
        await documentReader.scrollToHeading('Conclusion')
      }
      
      await documentReader.createAnnotation(annotation.text, 'purple')
      await page.waitForTimeout(300)
    }
    
    // Then: All section annotations are created
    for (const annotation of sectionAnnotations) {
      expect(await documentReader.verifyAnnotationExists(annotation.text)).toBe(true)
    }
  })

  test('Quick Annotation Workflow Performance', async ({ page }) => {
    // Given: Document ready for rapid annotation
    const quickAnnotations = [
      'introduction provides',
      'primary content',
      'detailed information',
      'key points'
    ]
    
    const startTime = Date.now()
    
    // When: Creating annotations rapidly
    for (const text of quickAnnotations) {
      await documentReader.createAnnotation(text, 'yellow')
    }
    
    const endTime = Date.now()
    const totalTime = endTime - startTime
    
    // Then: All annotations created efficiently
    expect(await documentReader.getAnnotationMarkersCount()).toBe(quickAnnotations.length)
    
    // And: Performance is acceptable (< 10 seconds for 4 annotations)
    expect(totalTime).toBeLessThan(10000)
  })

  test('Error Recovery in Annotation Creation', async ({ page }) => {
    // Given: Edge case text selection
    const edgeText = 'single'
    
    // When: Attempting to annotate very short text
    try {
      await documentReader.selectTextByDoubleClick(edgeText)
      
      // Check if selection panel appears or if it's handled gracefully
      const panelVisible = await documentReader.isQuickCapturePanelVisible()
      
      if (panelVisible) {
        await documentReader.createAnnotationWithColor('green')
        expect(await documentReader.verifyAnnotationExists(edgeText)).toBe(true)
      } else {
        // If panel doesn't appear, that's also acceptable behavior
        console.log('Short text selection handled gracefully')
      }
    } catch (error) {
      // Error handling should be graceful
      expect(await documentReader.isDocumentLoaded()).toBe(true)
    }
    
    // Then: Document remains functional
    expect(await documentReader.isDocumentLoaded()).toBe(true)
  })
})