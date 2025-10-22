/**
 * Engine Registry for dynamic collision detection engine management.
 *
 * Provides a centralized registry for registering and retrieving engines,
 * making it easy to add/remove/swap engines without modifying orchestrator code.
 *
 * Usage:
 * ```typescript
 * import { engineRegistry } from './engine-registry'
 *
 * // Register engines
 * engineRegistry.register('semantic_similarity', new SemanticSimilarityEngineAdapter())
 *
 * // Get engine
 * const engine = engineRegistry.get('semantic_similarity')
 *
 * // Get multiple engines
 * const engines = engineRegistry.getEnabled(['semantic_similarity', 'contradiction_detection'])
 * ```
 */

import { DocumentEngine } from './adapters'

/**
 * Registry for managing collision detection engines.
 * Singleton pattern ensures one global registry across the worker.
 */
export class EngineRegistry {
  private engines: Map<string, DocumentEngine> = new Map()

  /**
   * Register a new engine.
   *
   * @param name - Engine identifier (e.g., 'semantic_similarity')
   * @param engine - Engine implementation
   * @throws Error if engine already registered
   */
  register(name: string, engine: DocumentEngine): void {
    if (this.engines.has(name)) {
      console.warn(`[EngineRegistry] Overwriting existing engine: ${name}`)
    }

    console.log(`[EngineRegistry] Registered engine: ${name}`)
    this.engines.set(name, engine)
  }

  /**
   * Unregister an engine.
   *
   * @param name - Engine identifier to remove
   * @returns True if engine was removed, false if not found
   */
  unregister(name: string): boolean {
    const existed = this.engines.delete(name)
    if (existed) {
      console.log(`[EngineRegistry] Unregistered engine: ${name}`)
    }
    return existed
  }

  /**
   * Get a specific engine.
   *
   * @param name - Engine identifier
   * @returns Engine implementation
   * @throws Error if engine not found
   */
  get(name: string): DocumentEngine {
    const engine = this.engines.get(name)
    if (!engine) {
      throw new Error(
        `Engine '${name}' not found in registry. ` +
        `Available engines: ${this.listRegistered().join(', ')}`
      )
    }
    return engine
  }

  /**
   * Get multiple engines by name.
   *
   * @param names - Array of engine identifiers
   * @returns Array of engine implementations
   * @throws Error if any engine not found
   */
  getEnabled(names: string[]): DocumentEngine[] {
    return names.map(name => this.get(name))
  }

  /**
   * Check if an engine is registered.
   *
   * @param name - Engine identifier to check
   * @returns True if engine is registered
   */
  has(name: string): boolean {
    return this.engines.has(name)
  }

  /**
   * List all registered engine names.
   *
   * @returns Array of engine identifiers
   */
  listRegistered(): string[] {
    return Array.from(this.engines.keys())
  }

  /**
   * Get count of registered engines.
   *
   * @returns Number of registered engines
   */
  count(): number {
    return this.engines.size
  }

  /**
   * Clear all engines from registry.
   * Useful for testing or cleanup.
   */
  clear(): void {
    console.log(`[EngineRegistry] Clearing all ${this.engines.size} engines`)
    this.engines.clear()
  }

  /**
   * Cleanup all registered engines.
   * Calls cleanup() on each engine if implemented.
   */
  async cleanup(): Promise<void> {
    console.log(`[EngineRegistry] Cleaning up ${this.engines.size} engines`)

    const cleanupPromises: Promise<void>[] = []
    for (const [name, engine] of this.engines.entries()) {
      if (engine.cleanup) {
        console.log(`[EngineRegistry] Cleaning up engine: ${name}`)
        cleanupPromises.push(engine.cleanup())
      }
    }

    await Promise.all(cleanupPromises)
  }
}

/**
 * Global singleton registry instance.
 * Import and use this directly instead of creating new instances.
 */
export const engineRegistry = new EngineRegistry()
