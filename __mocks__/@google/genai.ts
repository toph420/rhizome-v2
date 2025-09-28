/**
 * Mock for @google/genai module to resolve Jest ESM import issues.
 * This mock allows tests to run without encountering "Unexpected token 'export'" errors.
 */

export class GoogleGenAI {
  constructor(config?: any) {}
  
  models = {
    generateContent: jest.fn(),
    embedContent: jest.fn()
  }
  
  files = {
    upload: jest.fn(),
    get: jest.fn(),
    delete: jest.fn()
  }
}

export enum Type {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array'
}

export default GoogleGenAI