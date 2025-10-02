interface UserOverrides {
  id?: string
  email?: string
  created_at?: Date
  updated_at?: Date
  metadata?: Record<string, any>
}

export function createUserFactory() {
  let idCounter = 1

  return {
    /**
     * Create a test user
     */
    create(overrides: UserOverrides = {}) {
      const id = overrides.id || `test-user-${idCounter++}`
      const now = new Date()

      return {
        id,
        email: overrides.email || `user${idCounter - 1}@test.com`,
        created_at: overrides.created_at || now,
        updated_at: overrides.updated_at || now,
        metadata: overrides.metadata || {}
      }
    },

    /**
     * Create multiple test users
     */
    createMany(count: number) {
      return Array.from({ length: count }, () => this.create())
    },

    /**
     * Reset the ID counter
     */
    reset() {
      idCounter = 1
    }
  }
}