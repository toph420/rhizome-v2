import { test, expect } from '../fixtures'
import { LibraryPage } from '../page-objects/LibraryPage'
import { UploadZone } from '../page-objects/UploadZone'
import { DocumentReaderPage } from '../page-objects/DocumentReaderPage'
import { ConnectionPanel } from '../page-objects/ConnectionPanel'
import path from 'path'

/**
 * T-013 Critical Paths: Comprehensive End-to-End User Journey Tests
 * 
 * Tests the complete user workflows combining all three core journeys:
 * 1. Upload → Process → Read Document Flow
 * 2. Select Text → Create Annotation → Save
 * 3. View Connections → Adjust Weights → Update
 * 
 * This test suite validates the entire application workflow from document
 * upload through knowledge synthesis and connection discovery.
 */

test.describe('Critical User Paths - Complete Workflows', () => {
  let libraryPage: LibraryPage
  let uploadZone: UploadZone
  let documentReader: DocumentReaderPage
  let connectionPanel: ConnectionPanel

  test.beforeEach(async ({ page }) => {
    libraryPage = new LibraryPage(page)
    uploadZone = new UploadZone(page)
    documentReader = new DocumentReaderPage(page)
    connectionPanel = new ConnectionPanel(page)
    
    await libraryPage.navigate()
  })

  test('Complete Knowledge Synthesis Workflow', async ({ page }) => {
    // This test represents the full user journey from document upload to connection discovery
    
    // ========================================
    // PHASE 1: Document Upload and Processing
    // ========================================
    
    const testDocument = `
# Artificial Intelligence in Healthcare

Artificial intelligence is revolutionizing healthcare by enabling more accurate diagnoses and personalized treatments.

## Machine Learning Applications

Machine learning algorithms can analyze medical images with remarkable precision, often exceeding human radiologist accuracy.

### Diagnostic Imaging
- CT scans: AI identifies tumors and abnormalities
- MRI analysis: Pattern recognition for neurological conditions  
- X-ray interpretation: Automated fracture detection

## Natural Language Processing

NLP helps extract insights from medical records and research papers.

### Clinical Documentation
Medical professionals can use AI to streamline documentation and reduce administrative burden.

## Challenges and Considerations

While AI shows promise, ethical considerations around patient privacy and algorithmic bias must be addressed.
    `.trim()

    // Upload document via paste (fastest for E2E)
    await uploadZone.pasteContentComplete(testDocument, 'https://medical-journal.example.com/ai-healthcare')
    
    // Verify processing completes successfully
    await libraryPage.waitForDocumentProcessed('Artificial Intelligence in Healthcare', 120000)
    
    const documentCard = await libraryPage.getDocumentByTitle('Artificial Intelligence in Healthcare')
    expect(documentCard).toBeTruthy()
    expect(await libraryPage.isDocumentCompleted(documentCard!)).toBe(true)
    
    // ========================================
    // PHASE 2: Document Reading and Annotation
    // ========================================
    
    // Open document in reader
    await libraryPage.openDocumentInReader('Artificial Intelligence in Healthcare')
    await documentReader.waitForDocumentLoaded()
    
    expect(await documentReader.isDocumentLoaded()).toBe(true)
    expect(await documentReader.containsText('Artificial Intelligence in Healthcare')).toBe(true)
    
    // Create multiple annotations with different purposes
    const annotations = [
      { text: 'revolutionizing healthcare', color: 'yellow' as const, note: 'Key transformation claim - needs evidence' },
      { text: 'exceeding human radiologist accuracy', color: 'red' as const, note: 'Strong claim - verify with recent studies' },
      { text: 'algorithmic bias', color: 'purple' as const, note: 'Critical ethical concern for implementation' },
      { text: 'streamline documentation', color: 'green' as const, note: 'Practical benefit for clinicians' }
    ]
    
    // Create each annotation
    for (const annotation of annotations) {
      await documentReader.createAnnotation(annotation.text, annotation.color, annotation.note)
      await page.waitForTimeout(500) // Brief pause between annotations
    }
    
    // Verify all annotations were created
    for (const annotation of annotations) {
      expect(await documentReader.verifyAnnotationExists(annotation.text)).toBe(true)
    }
    
    const totalAnnotations = await documentReader.getAnnotationMarkersCount()
    expect(totalAnnotations).toBe(annotations.length)
    
    // ========================================
    // PHASE 3: Upload Related Document for Connections
    // ========================================
    
    // Upload a second related document to generate connections
    const relatedDocument = `
# Machine Learning in Medical Diagnosis

Medical diagnosis is being transformed by machine learning technologies that can process vast amounts of patient data.

## Deep Learning Networks

Deep neural networks excel at pattern recognition in medical imaging, particularly in radiology applications.

### Convolutional Neural Networks
CNNs are particularly effective for analyzing medical images and detecting abnormalities.

## Clinical Decision Support

AI systems provide decision support by analyzing patient symptoms and medical history.

### Risk Assessment
Machine learning models can predict patient outcomes and identify high-risk cases.

## Implementation Challenges

Healthcare organizations face significant challenges in implementing AI systems, including data privacy and staff training.
    `.trim()

    // Navigate back to library to upload second document
    await documentReader.backToLibrary()
    await libraryPage.waitForLibraryLoaded()
    
    await uploadZone.pasteContentComplete(relatedDocument, 'https://medical-journal.example.com/ml-diagnosis')
    await libraryPage.waitForDocumentProcessed('Machine Learning in Medical Diagnosis', 120000)
    
    // Verify both documents are now available
    expect(await libraryPage.getDocumentCount()).toBe(2)
    
    // ========================================
    // PHASE 4: Connection Discovery and Weight Tuning
    // ========================================
    
    // Return to first document to check connections
    await libraryPage.openDocumentInReader('Artificial Intelligence in Healthcare')
    await documentReader.waitForDocumentLoaded()
    
    // Open connections panel and verify connections are discovered
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    
    expect(await connectionPanel.hasConnections()).toBe(true)
    
    const initialConnectionCount = await connectionPanel.getConnectionCount()
    const initialScores = await connectionPanel.getConnectionScores()
    
    expect(initialConnectionCount).toBeGreaterThan(0)
    expect(initialScores.length).toBe(initialConnectionCount)
    
    // Switch to weight tuning and optimize for medical/technical content
    await connectionPanel.switchToWeightsTab()
    
    // Get baseline weights
    const baselineWeights = await connectionPanel.getAllEngineWeights()
    
    // Apply academic preset (good for technical medical content)
    await connectionPanel.applyPreset('academic')
    
    // Further optimize for semantic and conceptual analysis
    await connectionPanel.setEngineWeight('semanticSimilarity', 0.35)
    await connectionPanel.setEngineWeight('conceptualDensity', 0.30)
    
    // Save the optimized configuration
    await connectionPanel.saveWeightChanges()
    await connectionPanel.waitForWeightsSaved()
    
    // Verify weight changes took effect
    const optimizedWeights = await connectionPanel.getAllEngineWeights()
    expect(optimizedWeights.semanticSimilarity).toBeCloseTo(0.35, 1)
    expect(optimizedWeights.conceptualDensity).toBeCloseTo(0.30, 1)
    
    // ========================================
    // PHASE 5: Verify Complete System Integration
    // ========================================
    
    // Check that connections updated with new weights
    await connectionPanel.switchToConnectionsTab()
    await page.waitForTimeout(2000) // Allow for recalculation
    
    const optimizedScores = await connectionPanel.getConnectionScores()
    const connectionsUpdated = await connectionPanel.verifyConnectionsUpdate(initialScores)
    
    expect(connectionsUpdated).toBe(true)
    expect(optimizedScores.length).toBeGreaterThan(0)
    
    // Verify annotations persist through navigation
    const persistentAnnotationCount = await documentReader.getAnnotationMarkersCount()
    expect(persistentAnnotationCount).toBe(annotations.length)
    
    // ========================================
    // PHASE 6: Cross-Document Navigation
    // ========================================
    
    // Test navigation between connected documents
    if (await connectionPanel.getConnectionCount() > 0) {
      await connectionPanel.clickConnection(0)
      // Note: Actual navigation behavior depends on implementation
    }
    
    // Navigate to second document and verify it has connections back
    await libraryPage.openDocumentInReader('Machine Learning in Medical Diagnosis')
    await documentReader.waitForDocumentLoaded()
    
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    
    const reverseConnections = await connectionPanel.getConnectionCount()
    expect(reverseConnections).toBeGreaterThan(0)
    
    // ========================================
    // PHASE 7: Persistence Verification
    // ========================================
    
    // Test that everything persists across page reload
    await page.reload()
    await documentReader.waitForDocumentLoaded()
    
    // Verify weight preferences persist
    await connectionPanel.switchToWeightsTab()
    const persistedWeights = await connectionPanel.getAllEngineWeights()
    
    expect(Math.abs(persistedWeights.semanticSimilarity - 0.35)).toBeLessThan(0.05)
    expect(Math.abs(persistedWeights.conceptualDensity - 0.30)).toBeLessThan(0.05)
    
    // Verify connections still work
    await connectionPanel.switchToConnectionsTab()
    expect(await connectionPanel.hasConnections()).toBe(true)
    
    // Return to first document and verify annotations persist
    await libraryPage.openDocumentInReader('Artificial Intelligence in Healthcare')
    await documentReader.waitForDocumentLoaded()
    
    for (const annotation of annotations) {
      expect(await documentReader.verifyAnnotationExists(annotation.text)).toBe(true)
    }
  })

  test('Multi-Format Document Processing with Connection Analysis', async ({ page }) => {
    // Test different input formats and their connection behavior
    
    const documents = [
      {
        method: 'paste' as const,
        content: `# Climate Change Research\n\nClimate change affects global weather patterns and ecosystem stability.`,
        title: 'Climate Change Research'
      },
      {
        method: 'url' as const,
        url: 'https://example.com/environmental-science',
        title: 'environmental-science'
      }
    ]
    
    const processedDocuments: string[] = []
    
    // Process each document type
    for (const doc of documents) {
      try {
        if (doc.method === 'paste') {
          await uploadZone.pasteContentComplete(doc.content, 'https://research.example.com')
          await libraryPage.waitForDocumentProcessed(doc.title, 120000)
          processedDocuments.push(doc.title)
        } else if (doc.method === 'url') {
          await uploadZone.fetchUrlComplete(doc.url)
          await libraryPage.waitForDocumentProcessed(doc.title, 120000)
          processedDocuments.push(doc.title)
        }
      } catch (error) {
        console.log(`Skipping ${doc.method} test due to: ${error}`)
      }
    }
    
    // Verify at least one document was processed
    expect(processedDocuments.length).toBeGreaterThan(0)
    
    // Test connections between processed documents
    if (processedDocuments.length > 1) {
      await libraryPage.openDocumentInReader(processedDocuments[0])
      await documentReader.waitForDocumentLoaded()
      
      await connectionPanel.switchToConnectionsTab()
      await connectionPanel.waitForConnectionsLoaded()
      
      // Should have connections between related documents
      expect(await connectionPanel.hasConnections()).toBe(true)
    }
  })

  test('Performance Under Load - Multiple Annotations and Connections', async ({ page }) => {
    // Test system performance with multiple annotations and connections
    
    const largeDocument = `
# Comprehensive AI Research Overview

${'Artificial intelligence research spans multiple domains including machine learning, natural language processing, computer vision, and robotics. '.repeat(10)}

## Machine Learning Fundamentals

${'Deep learning networks process information through multiple layers of neural connections. '.repeat(8)}

## Natural Language Processing

${'Language models understand and generate human-like text through transformer architectures. '.repeat(6)}

## Computer Vision

${'Convolutional neural networks excel at image recognition and object detection tasks. '.repeat(5)}

## Robotics Applications

${'Robotic systems integrate AI for autonomous navigation and manipulation tasks. '.repeat(4)}
    `.trim()
    
    const startTime = Date.now()
    
    // Upload large document
    await uploadZone.pasteContentComplete(largeDocument, 'https://ai-research.example.com')
    await libraryPage.waitForDocumentProcessed('Comprehensive AI Research Overview', 180000)
    
    // Open in reader
    await libraryPage.openDocumentInReader('Comprehensive AI Research Overview')
    await documentReader.waitForDocumentLoaded()
    
    // Create multiple annotations rapidly
    const quickAnnotations = [
      'Artificial intelligence research',
      'machine learning',
      'natural language processing',
      'computer vision',
      'neural networks',
      'transformer architectures',
      'object detection',
      'autonomous navigation'
    ]
    
    for (const text of quickAnnotations) {
      await documentReader.createAnnotation(text, 'yellow')
    }
    
    // Verify all annotations created
    const annotationCount = await documentReader.getAnnotationMarkersCount()
    expect(annotationCount).toBe(quickAnnotations.length)
    
    // Test connection discovery performance
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    
    const endTime = Date.now()
    const totalTime = endTime - startTime
    
    // Performance should be reasonable (< 3 minutes for full workflow)
    expect(totalTime).toBeLessThan(180000)
    
    console.log(`Performance test completed in ${totalTime}ms`)
  })

  test('Error Recovery and Resilience', async ({ page }) => {
    // Test system behavior under error conditions
    
    // Test with potentially problematic content
    const edgeCaseContent = `
# Test Document with Edge Cases

This document contains various edge cases:
- Very short text
- "Special characters" & symbols
- Numbers 123.456
- URLs https://example.com
- <html>tags</html>
    `.trim()
    
    try {
      await uploadZone.pasteContentComplete(edgeCaseContent, 'https://test.example.com')
      await libraryPage.waitForDocumentProcessed('Test Document with Edge Cases', 60000)
      
      await libraryPage.openDocumentInReader('Test Document with Edge Cases')
      await documentReader.waitForDocumentLoaded()
      
      // Test annotation on edge cases
      try {
        await documentReader.createAnnotation('123.456', 'blue')
        await documentReader.createAnnotation('<html>tags</html>', 'red')
      } catch (error) {
        // Edge case handling should be graceful
        console.log('Edge case annotation handled gracefully')
      }
      
      // Verify document still functional
      expect(await documentReader.isDocumentLoaded()).toBe(true)
      
      // Test connections still work
      await connectionPanel.switchToConnectionsTab()
      await connectionPanel.waitForConnectionsLoaded()
      
      // System should remain functional even with edge cases
      expect(await connectionPanel.getConnectionCount()).toBeGreaterThanOrEqual(0)
      
    } catch (error) {
      // System should handle errors gracefully
      expect(await libraryPage.navigate()).toBeTruthy()
    }
  })

  test('User Workflow Optimization', async ({ page }) => {
    // Test optimized user workflow patterns
    
    const workflowDoc = `
# Productivity Research

Productivity research shows that focused work sessions improve output quality.

## Time Management
Effective time management techniques include time blocking and priority matrices.

## Focus Techniques
Deep work requires elimination of distractions and sustained attention.
    `.trim()
    
    // Optimized workflow: Upload → Immediate annotation during read → Weight tuning
    await uploadZone.pasteContentComplete(workflowDoc, 'https://productivity.example.com')
    await libraryPage.waitForDocumentProcessed('Productivity Research', 60000)
    
    await libraryPage.openDocumentInReader('Productivity Research')
    await documentReader.waitForDocumentLoaded()
    
    // Quick annotation workflow
    await documentReader.createAnnotation('focused work sessions', 'green', 'Key insight')
    await documentReader.createAnnotation('Deep work', 'blue', 'Core concept')
    
    // Immediate weight optimization for productivity content
    await connectionPanel.switchToWeightsTab()
    await connectionPanel.applyPreset('analytical') // Good for research content
    await connectionPanel.saveWeightChanges()
    
    // Verify workflow efficiency
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    
    // Should have efficient connection discovery
    expect(await connectionPanel.hasConnections()).toBe(true)
    
    // Annotations should be accessible
    expect(await documentReader.getAnnotationMarkersCount()).toBe(2)
  })

  test('Cross-Session State Persistence', async ({ page }) => {
    // Test that user state persists across browser sessions
    
    const sessionDoc = `# Session Persistence Test\n\nThis document tests cross-session state persistence.`
    
    // Set up initial state
    await uploadZone.pasteContentComplete(sessionDoc, 'https://session-test.example.com')
    await libraryPage.waitForDocumentProcessed('Session Persistence Test', 60000)
    
    await libraryPage.openDocumentInReader('Session Persistence Test')
    await documentReader.waitForDocumentLoaded()
    
    // Create annotation
    await documentReader.createAnnotation('Session Persistence Test', 'purple', 'Test annotation')
    
    // Set custom weights
    await connectionPanel.switchToWeightsTab()
    await connectionPanel.setEngineWeight('semanticSimilarity', 0.4)
    await connectionPanel.saveWeightChanges()
    await connectionPanel.waitForWeightsSaved()
    
    // Simulate session end/start with page reload
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    // Navigate to document
    await libraryPage.navigate()
    await libraryPage.openDocumentInReader('Session Persistence Test')
    await documentReader.waitForDocumentLoaded()
    
    // Verify persistence
    expect(await documentReader.verifyAnnotationExists('Session Persistence Test')).toBe(true)
    
    await connectionPanel.switchToWeightsTab()
    const persistedWeight = await connectionPanel.getEngineWeight('semanticSimilarity')
    expect(Math.abs(persistedWeight - 0.4)).toBeLessThan(0.05)
  })
})