import { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

/**
 * Page object for the connections panel and weight tuning interface.
 * Handles connection display, weight adjustment, and real-time connection updates.
 */
export class ConnectionPanel extends BasePage {
  readonly selectors = {
    // Right panel container
    rightPanel: '[data-testid="right-panel"]',
    toggleButton: '[data-testid="panel-toggle"]',
    
    // Tab navigation
    connectionsTab: '[data-testid="connections-tab"]',
    annotationsTab: '[data-testid="annotations-tab"]',
    weightsTab: '[data-testid="weights-tab"]',
    
    // Connections display
    connectionsList: '[data-testid="connections-list"]',
    connectionItem: '[data-testid="connection-item"]',
    connectionScore: '[data-testid="connection-score"]',
    connectionTitle: '[data-testid="connection-title"]',
    connectionPreview: '[data-testid="connection-preview"]',
    
    // Weight configuration
    weightConfig: '[data-testid="weight-config"]',
    weightSlider: '[data-testid="weight-slider"]',
    
    // Engine sliders (specific)
    semanticSimilaritySlider: '[data-testid="slider-semantic-similarity"]',
    structuralPatternSlider: '[data-testid="slider-structural-pattern"]',
    temporalProximitySlider: '[data-testid="slider-temporal-proximity"]',
    conceptualDensitySlider: '[data-testid="slider-conceptual-density"]',
    emotionalResonanceSlider: '[data-testid="slider-emotional-resonance"]',
    citationNetworkSlider: '[data-testid="slider-citation-network"]',
    contradictionDetectionSlider: '[data-testid="slider-contradiction-detection"]',
    
    // Weight values display
    semanticSimilarityValue: '[data-testid="value-semantic-similarity"]',
    structuralPatternValue: '[data-testid="value-structural-pattern"]',
    temporalProximityValue: '[data-testid="value-temporal-proximity"]',
    conceptualDensityValue: '[data-testid="value-conceptual-density"]',
    emotionalResonanceValue: '[data-testid="value-emotional-resonance"]',
    citationNetworkValue: '[data-testid="value-citation-network"]',
    contradictionDetectionValue: '[data-testid="value-contradiction-detection"]',
    
    // Preset configurations
    presetTabs: '[data-testid="preset-tabs"]',
    balancedPreset: '[data-testid="preset-balanced"]',
    academicPreset: '[data-testid="preset-academic"]',
    narrativePreset: '[data-testid="preset-narrative"]',
    analyticalPreset: '[data-testid="preset-analytical"]',
    customPreset: '[data-testid="preset-custom"]',
    
    // Actions
    saveWeights: '[data-testid="save-weights"]',
    resetWeights: '[data-testid="reset-weights"]',
    applyPreset: '[data-testid="apply-preset"]',
    
    // Status indicators
    savingIndicator: '[data-testid="saving-weights"]',
    hasChanges: '[data-testid="has-changes"]',
    connectionsLoading: '[data-testid="connections-loading"]',
    connectionsEmpty: '[data-testid="connections-empty"]',
    
    // Connection filters
    scoreFilter: '[data-testid="score-filter"]',
    engineFilter: '[data-testid="engine-filter"]',
    sortByScore: '[data-testid="sort-by-score"]',
    sortByRelevance: '[data-testid="sort-by-relevance"]'
  }

  constructor(page: Page) {
    super(page)
  }

  /**
   * Open the right panel if collapsed
   */
  async openPanel(): Promise<void> {
    const panel = this.page.locator(this.selectors.rightPanel)
    const isCollapsed = await panel.evaluate(el => el.clientWidth < 100)
    
    if (isCollapsed) {
      await this.clickElement(this.selectors.toggleButton)
      await this.waitForVisible(this.selectors.connectionsTab)
    }
  }

  /**
   * Close the right panel
   */
  async closePanel(): Promise<void> {
    const panel = this.page.locator(this.selectors.rightPanel)
    const isExpanded = await panel.evaluate(el => el.clientWidth > 200)
    
    if (isExpanded) {
      await this.clickElement(this.selectors.toggleButton)
    }
  }

  /**
   * Switch to connections tab
   */
  async switchToConnectionsTab(): Promise<void> {
    await this.openPanel()
    await this.clickElement(this.selectors.connectionsTab)
    await this.waitForVisible(this.selectors.connectionsList)
  }

  /**
   * Switch to weight tuning tab
   */
  async switchToWeightsTab(): Promise<void> {
    await this.openPanel()
    await this.clickElement(this.selectors.weightsTab)
    await this.waitForVisible(this.selectors.weightConfig)
  }

  /**
   * Get all connection items
   */
  async getConnections(): Promise<Locator[]> {
    await this.switchToConnectionsTab()
    const connections = this.page.locator(this.selectors.connectionItem)
    return await connections.all()
  }

  /**
   * Get connection scores
   */
  async getConnectionScores(): Promise<number[]> {
    const connections = await this.getConnections()
    const scores: number[] = []
    
    for (const connection of connections) {
      const scoreElement = connection.locator(this.selectors.connectionScore)
      const scoreText = await scoreElement.textContent()
      const score = parseFloat(scoreText?.replace(/[^0-9.]/g, '') || '0')
      scores.push(score)
    }
    
    return scores
  }

  /**
   * Click on a specific connection
   */
  async clickConnection(index: number): Promise<void> {
    const connections = await this.getConnections()
    if (connections[index]) {
      await connections[index].click()
    }
  }

  /**
   * Wait for connections to load
   */
  async waitForConnectionsLoaded(): Promise<void> {
    await this.switchToConnectionsTab()
    
    // Wait for either connections to appear or empty state
    await Promise.race([
      this.waitForVisible(this.selectors.connectionItem),
      this.waitForVisible(this.selectors.connectionsEmpty)
    ])
  }

  /**
   * Check if connections are empty
   */
  async hasConnections(): Promise<boolean> {
    await this.waitForConnectionsLoaded()
    return await this.exists(this.selectors.connectionItem)
  }

  /**
   * Get current weight value for an engine
   */
  async getEngineWeight(engineType: string): Promise<number> {
    await this.switchToWeightsTab()
    
    const valueSelector = this.selectors[`${engineType}Value` as keyof typeof this.selectors] as string
    const valueText = await this.getText(valueSelector)
    return parseFloat(valueText.replace(/[^0-9.]/g, ''))
  }

  /**
   * Set weight for a specific engine
   */
  async setEngineWeight(engineType: string, value: number): Promise<void> {
    await this.switchToWeightsTab()
    
    const sliderSelector = this.selectors[`${engineType}Slider` as keyof typeof this.selectors] as string
    const slider = this.page.locator(sliderSelector)
    
    // Get slider bounding box
    const sliderBox = await slider.boundingBox()
    if (!sliderBox) {
      throw new Error(`Could not find slider for ${engineType}`)
    }
    
    // Calculate position for desired value (assuming 0-1 range)
    const targetX = sliderBox.x + (sliderBox.width * value)
    
    // Click to set value
    await this.page.mouse.click(targetX, sliderBox.y + sliderBox.height / 2)
    
    // Wait for value to update
    await this.page.waitForTimeout(500)
  }

  /**
   * Apply a preset configuration
   */
  async applyPreset(presetName: 'balanced' | 'academic' | 'narrative' | 'analytical'): Promise<void> {
    await this.switchToWeightsTab()
    
    const presetSelector = this.selectors[`${presetName}Preset` as keyof typeof this.selectors] as string
    await this.clickElement(presetSelector)
    
    // Wait for weights to update
    await this.page.waitForTimeout(1000)
  }

  /**
   * Save weight changes
   */
  async saveWeightChanges(): Promise<void> {
    await this.clickElement(this.selectors.saveWeights)
    
    // Wait for save to complete
    await this.waitForHidden(this.selectors.savingIndicator, 10000)
  }

  /**
   * Reset weights to default
   */
  async resetWeights(): Promise<void> {
    await this.clickElement(this.selectors.resetWeights)
    await this.page.waitForTimeout(500)
  }

  /**
   * Check if there are unsaved changes
   */
  async hasUnsavedChanges(): Promise<boolean> {
    return await this.exists(this.selectors.hasChanges)
  }

  /**
   * Get all current engine weights
   */
  async getAllEngineWeights(): Promise<Record<string, number>> {
    const engines = [
      'semanticSimilarity',
      'structuralPattern', 
      'temporalProximity',
      'conceptualDensity',
      'emotionalResonance',
      'citationNetwork',
      'contradictionDetection'
    ]
    
    const weights: Record<string, number> = {}
    
    for (const engine of engines) {
      weights[engine] = await this.getEngineWeight(engine)
    }
    
    return weights
  }

  /**
   * Verify connections update after weight change
   */
  async verifyConnectionsUpdate(beforeScores: number[]): Promise<boolean> {
    // Wait for connections to recalculate
    await this.page.waitForTimeout(2000)
    
    await this.switchToConnectionsTab()
    const afterScores = await this.getConnectionScores()
    
    // Check if scores have changed
    if (beforeScores.length !== afterScores.length) {
      return true
    }
    
    for (let i = 0; i < beforeScores.length; i++) {
      if (Math.abs(beforeScores[i] - afterScores[i]) > 0.01) {
        return true
      }
    }
    
    return false
  }

  /**
   * Wait for weight save completion
   */
  async waitForWeightsSaved(): Promise<void> {
    // Check if saving indicator appears and disappears
    try {
      await this.waitForVisible(this.selectors.savingIndicator, 2000)
      await this.waitForHidden(this.selectors.savingIndicator, 10000)
    } catch {
      // If no saving indicator, weights might save instantly
      await this.page.waitForTimeout(500)
    }
  }

  /**
   * Get connection count
   */
  async getConnectionCount(): Promise<number> {
    await this.switchToConnectionsTab()
    
    if (!await this.hasConnections()) {
      return 0
    }
    
    const connections = this.page.locator(this.selectors.connectionItem)
    return await connections.count()
  }

  /**
   * Filter connections by minimum score
   */
  async filterByMinScore(minScore: number): Promise<void> {
    await this.switchToConnectionsTab()
    
    if (await this.exists(this.selectors.scoreFilter)) {
      await this.fillText(this.selectors.scoreFilter, minScore.toString())
      await this.page.waitForTimeout(1000)
    }
  }

  /**
   * Sort connections by score
   */
  async sortByScore(): Promise<void> {
    await this.switchToConnectionsTab()
    
    if (await this.exists(this.selectors.sortByScore)) {
      await this.clickElement(this.selectors.sortByScore)
      await this.page.waitForTimeout(1000)
    }
  }
}