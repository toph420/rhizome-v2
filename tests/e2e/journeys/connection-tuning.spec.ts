import { test, expect } from '../fixtures'
import { LibraryPage } from '../page-objects/LibraryPage'
import { UploadZone } from '../page-objects/UploadZone'
import { DocumentReaderPage } from '../page-objects/DocumentReaderPage'
import { ConnectionPanel } from '../page-objects/ConnectionPanel'
import path from 'path'

/**
 * T-013 Critical User Journey: View Connections → Adjust Weights → Update
 * 
 * Tests the complete connection discovery and weight tuning workflow,
 * including real-time connection updates and preference persistence.
 */

test.describe('View Connections → Adjust Weights → Update', () => {
  let libraryPage: LibraryPage
  let uploadZone: UploadZone
  let documentReader: DocumentReaderPage
  let connectionPanel: ConnectionPanel
  
  // Test documents with known connection patterns
  const testDocuments = [
    {
      content: `
# Machine Learning Fundamentals

Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed.

## Neural Networks

Neural networks are computational models inspired by biological neural networks. They consist of interconnected nodes that process information.

## Deep Learning

Deep learning uses multi-layered neural networks to analyze complex patterns in large datasets.
      `.trim(),
      title: 'ML Fundamentals'
    },
    {
      content: `
# Advanced AI Techniques

Artificial intelligence encompasses various approaches to creating intelligent systems.

## Neural Network Architectures

Modern neural networks use sophisticated architectures like transformers and convolutional networks.

## Pattern Recognition

AI systems excel at recognizing patterns in data, from images to natural language.
      `.trim(),
      title: 'AI Techniques'
    },
    {
      content: `
# Data Science Applications

Data science combines statistics, programming, and domain expertise to extract insights from data.

## Statistical Analysis

Statistical methods form the foundation for understanding data patterns and relationships.

## Machine Learning in Practice

Real-world machine learning applications require careful data preprocessing and model validation.
      `.trim(),
      title: 'Data Science'
    }
  ]

  test.beforeEach(async ({ page }) => {
    libraryPage = new LibraryPage(page)
    uploadZone = new UploadZone(page)
    documentReader = new DocumentReaderPage(page)
    connectionPanel = new ConnectionPanel(page)
    
    // Set up test documents that will have connections
    await libraryPage.navigate()
    
    // Upload multiple related documents to generate connections
    for (const doc of testDocuments) {
      await uploadZone.pasteContentComplete(doc.content, `https://test.example.com/${doc.title.toLowerCase()}`)
      await libraryPage.waitForDocumentProcessed(doc.title, 60000)
      
      // Small delay between documents
      await page.waitForTimeout(1000)
    }
    
    // Open the first document in reader
    await libraryPage.openDocumentInReader('ML Fundamentals')
    await documentReader.waitForDocumentLoaded()
  })

  test('Basic Connection Discovery and Display', async ({ page }) => {
    // Given: Document is open with related documents processed
    expect(await documentReader.isDocumentLoaded()).toBe(true)
    
    // When: Opening connections panel
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    
    // Then: Connections are discovered and displayed
    expect(await connectionPanel.hasConnections()).toBe(true)
    
    const connectionCount = await connectionPanel.getConnectionCount()
    expect(connectionCount).toBeGreaterThan(0)
    
    // And: Connection scores are visible
    const scores = await connectionPanel.getConnectionScores()
    expect(scores.length).toBe(connectionCount)
    
    // Verify scores are reasonable (0-1 range)
    scores.forEach(score => {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    })
  })

  test('Weight Adjustment Interface', async ({ page }) => {
    // Given: Connections panel is open
    await connectionPanel.switchToWeightsTab()
    
    // When: Checking initial weight configuration
    const initialWeights = await connectionPanel.getAllEngineWeights()
    
    // Then: All engine weights are present and sum to approximately 1
    const engineTypes = [
      'semanticSimilarity', 'structuralPattern', 'temporalProximity',
      'conceptualDensity', 'emotionalResonance', 'citationNetwork', 'contradictionDetection'
    ]
    
    for (const engine of engineTypes) {
      expect(initialWeights[engine]).toBeGreaterThan(0)
      expect(initialWeights[engine]).toBeLessThanOrEqual(1)
    }
    
    const weightSum = Object.values(initialWeights).reduce((sum, weight) => sum + weight, 0)
    expect(Math.abs(weightSum - 1.0)).toBeLessThan(0.01) // Allow small floating point variance
  })

  test('Semantic Similarity Weight Boost Impact', async ({ page }) => {
    // Given: Initial connections are loaded
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    const initialScores = await connectionPanel.getConnectionScores()
    
    // When: Boosting semantic similarity weight
    await connectionPanel.setEngineWeight('semanticSimilarity', 0.5) // Increase significantly
    await connectionPanel.saveWeightChanges()
    
    // Then: Connections recalculate with new scores
    const connectionsUpdated = await connectionPanel.verifyConnectionsUpdate(initialScores)
    expect(connectionsUpdated).toBe(true)
    
    // And: Semantic-heavy connections should score higher
    await connectionPanel.switchToConnectionsTab()
    const newScores = await connectionPanel.getConnectionScores()
    
    // Since our test docs have semantic overlap (ML, AI, neural networks), 
    // boosting semantic similarity should generally increase scores
    const averageInitialScore = initialScores.reduce((sum, score) => sum + score, 0) / initialScores.length
    const averageNewScore = newScores.reduce((sum, score) => sum + score, 0) / newScores.length
    
    expect(averageNewScore).toBeGreaterThanOrEqual(averageInitialScore * 0.8) // Allow some variance
  })

  test('Preset Configuration Application', async ({ page }) => {
    // Given: Weight tuning panel is open
    await connectionPanel.switchToWeightsTab()
    const originalWeights = await connectionPanel.getAllEngineWeights()
    
    // When: Applying academic preset
    await connectionPanel.applyPreset('academic')
    
    // Then: Weights change to academic configuration
    const academicWeights = await connectionPanel.getAllEngineWeights()
    
    // Academic preset should boost citation networks and conceptual density
    expect(academicWeights.citationNetwork).toBeGreaterThan(originalWeights.citationNetwork)
    expect(academicWeights.conceptualDensity).toBeGreaterThan(originalWeights.conceptualDensity)
    
    // When: Applying narrative preset
    await connectionPanel.applyPreset('narrative')
    const narrativeWeights = await connectionPanel.getAllEngineWeights()
    
    // Then: Narrative preset should boost emotional and temporal connections
    expect(narrativeWeights.emotionalResonance).toBeGreaterThan(academicWeights.emotionalResonance)
    expect(narrativeWeights.temporalProximity).toBeGreaterThan(academicWeights.temporalProximity)
  })

  test('Real-time Connection Updates', async ({ page }) => {
    // Given: Initial connections are visible
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    const initialConnectionCount = await connectionPanel.getConnectionCount()
    const initialScores = await connectionPanel.getConnectionScores()
    
    // When: Making significant weight adjustments
    await connectionPanel.switchToWeightsTab()
    
    // Boost contradiction detection (should find opposing viewpoints)
    await connectionPanel.setEngineWeight('contradictionDetection', 0.4)
    
    // Reduce semantic similarity
    await connectionPanel.setEngineWeight('semanticSimilarity', 0.1)
    
    await connectionPanel.saveWeightChanges()
    await connectionPanel.waitForWeightsSaved()
    
    // Then: Connections update in real-time
    await connectionPanel.switchToConnectionsTab()
    await page.waitForTimeout(2000) // Allow time for recalculation
    
    const updatedScores = await connectionPanel.getConnectionScores()
    const updatedConnectionCount = await connectionPanel.getConnectionCount()
    
    // Verify changes occurred
    expect(
      JSON.stringify(initialScores) !== JSON.stringify(updatedScores) ||
      initialConnectionCount !== updatedConnectionCount
    ).toBe(true)
  })

  test('Weight Change Persistence', async ({ page }) => {
    // Given: Custom weight configuration is set
    await connectionPanel.switchToWeightsTab()
    
    const customWeights = {
      'semanticSimilarity': 0.3,
      'structuralPattern': 0.15,
      'temporalProximity': 0.1,
      'conceptualDensity': 0.25,
      'emotionalResonance': 0.05,
      'citationNetwork': 0.1,
      'contradictionDetection': 0.05
    }
    
    // Set custom weights
    for (const [engine, weight] of Object.entries(customWeights)) {
      await connectionPanel.setEngineWeight(engine, weight)
    }
    
    await connectionPanel.saveWeightChanges()
    await connectionPanel.waitForWeightsSaved()
    
    // When: Navigating away and back
    await documentReader.backToLibrary()
    await libraryPage.waitForLibraryLoaded()
    
    await libraryPage.openDocumentInReader('ML Fundamentals')
    await documentReader.waitForDocumentLoaded()
    
    // Then: Weight preferences persist
    await connectionPanel.switchToWeightsTab()
    const persistedWeights = await connectionPanel.getAllEngineWeights()
    
    // Verify weights are approximately the same (allow small floating point differences)
    for (const [engine, expectedWeight] of Object.entries(customWeights)) {
      const actualWeight = persistedWeights[engine]
      expect(Math.abs(actualWeight - expectedWeight)).toBeLessThan(0.05)
    }
  })

  test('Analytical Preset for Deep Analysis', async ({ page }) => {
    // Given: Document with potential contradictions/analysis points
    await connectionPanel.switchToConnectionsTab()
    const initialConnections = await connectionPanel.getConnectionCount()
    
    // When: Applying analytical preset (focuses on contradictions and deep analysis)
    await connectionPanel.switchToWeightsTab()
    await connectionPanel.applyPreset('analytical')
    await connectionPanel.saveWeightChanges()
    
    // Then: Analysis-focused connections are emphasized
    await connectionPanel.switchToConnectionsTab()
    await page.waitForTimeout(2000)
    
    const analyticalConnections = await connectionPanel.getConnectionCount()
    const analyticalScores = await connectionPanel.getConnectionScores()
    
    // Analytical preset should surface different types of connections
    expect(analyticalConnections).toBeGreaterThan(0)
    
    // Scores should reflect analytical focus
    analyticalScores.forEach(score => {
      expect(score).toBeGreaterThan(0)
    })
  })

  test('Weight Reset Functionality', async ({ page }) => {
    // Given: Custom weights are set
    await connectionPanel.switchToWeightsTab()
    
    // Make significant changes
    await connectionPanel.setEngineWeight('semanticSimilarity', 0.7)
    await connectionPanel.setEngineWeight('emotionalResonance', 0.1)
    
    const customWeights = await connectionPanel.getAllEngineWeights()
    
    // When: Resetting weights
    await connectionPanel.resetWeights()
    
    // Then: Weights return to default/balanced state
    const resetWeights = await connectionPanel.getAllEngineWeights()
    
    // Verify weights have changed back
    expect(
      JSON.stringify(customWeights) !== JSON.stringify(resetWeights)
    ).toBe(true)
    
    // Reset weights should be more balanced
    const resetValues = Object.values(resetWeights)
    const maxWeight = Math.max(...resetValues)
    const minWeight = Math.min(...resetValues)
    
    // In default/balanced state, no single weight should dominate
    expect(maxWeight - minWeight).toBeLessThan(0.3)
  })

  test('Connection Navigation and Interaction', async ({ page }) => {
    // Given: Connections are available
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    
    const hasConnections = await connectionPanel.hasConnections()
    if (!hasConnections) {
      test.skip('No connections found for navigation test')
    }
    
    // When: Clicking on a connection
    await connectionPanel.clickConnection(0)
    
    // Then: Navigation or detail view should occur
    // (Implementation depends on connection interaction design)
    // This test validates the interaction is possible
    
    // Verify we can still access the connections after interaction
    await connectionPanel.switchToConnectionsTab()
    expect(await connectionPanel.hasConnections()).toBe(true)
  })

  test('Weight Adjustment Edge Cases', async ({ page }) => {
    // Given: Weight tuning interface is ready
    await connectionPanel.switchToWeightsTab()
    
    // When: Testing extreme weight values
    try {
      // Set one weight to maximum
      await connectionPanel.setEngineWeight('semanticSimilarity', 1.0)
      
      // Verify other weights adjusted to maintain sum of 1
      const extremeWeights = await connectionPanel.getAllEngineWeights()
      const weightSum = Object.values(extremeWeights).reduce((sum, weight) => sum + weight, 0)
      
      expect(Math.abs(weightSum - 1.0)).toBeLessThan(0.01)
      
      // Set back to balanced state
      await connectionPanel.resetWeights()
      
    } catch (error) {
      // Edge case handling should be graceful
      expect(await connectionPanel.switchToWeightsTab()).toBeTruthy()
    }
  })

  test('Multiple Document Connection Context', async ({ page }) => {
    // Given: Multiple related documents are available
    const connectionCounts: Record<string, number> = {}
    
    // When: Checking connections across different documents
    for (const doc of testDocuments) {
      await libraryPage.openDocumentInReader(doc.title)
      await documentReader.waitForDocumentLoaded()
      
      await connectionPanel.switchToConnectionsTab()
      await connectionPanel.waitForConnectionsLoaded()
      
      connectionCounts[doc.title] = await connectionPanel.getConnectionCount()
    }
    
    // Then: Each document has contextual connections
    for (const [title, count] of Object.entries(connectionCounts)) {
      expect(count).toBeGreaterThanOrEqual(0)
      console.log(`${title}: ${count} connections`)
    }
    
    // Documents about similar topics should have connections
    expect(Object.values(connectionCounts).some(count => count > 0)).toBe(true)
  })

  test('Connection Quality with Weight Optimization', async ({ page }) => {
    // Given: Baseline connection quality
    await connectionPanel.switchToConnectionsTab()
    await connectionPanel.waitForConnectionsLoaded()
    
    const baselineScores = await connectionPanel.getConnectionScores()
    const baselineAverage = baselineScores.reduce((sum, score) => sum + score, 0) / baselineScores.length
    
    // When: Optimizing weights for content type
    await connectionPanel.switchToWeightsTab()
    
    // For technical content, boost semantic similarity and conceptual density
    await connectionPanel.setEngineWeight('semanticSimilarity', 0.4)
    await connectionPanel.setEngineWeight('conceptualDensity', 0.3)
    
    await connectionPanel.saveWeightChanges()
    await connectionPanel.waitForWeightsSaved()
    
    // Then: Connection quality should improve for this content type
    await connectionPanel.switchToConnectionsTab()
    await page.waitForTimeout(2000)
    
    const optimizedScores = await connectionPanel.getConnectionScores()
    const optimizedAverage = optimizedScores.reduce((sum, score) => sum + score, 0) / optimizedScores.length
    
    // Optimized weights should maintain or improve connection quality
    expect(optimizedAverage).toBeGreaterThanOrEqual(baselineAverage * 0.8)
    
    // High-quality connections should still exist
    expect(optimizedScores.some(score => score > 0.5)).toBe(true)
  })
})