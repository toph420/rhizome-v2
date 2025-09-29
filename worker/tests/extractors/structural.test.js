/**
 * Tests for structural patterns extractor.
 * Validates pattern detection, performance, and accuracy.
 */

const { 
  extractStructuralPatterns 
} = require('../../lib/extractors/structural-patterns')

const {
  generateStructuralPrompt,
  validateStructuralResponse,
  parseStructuralResponse
} = require('../../lib/extractors/prompts/structural')

describe('Structural Patterns Extractor', () => {
  describe('extractStructuralPatterns', () => {
    it('should detect markdown headings', async () => {
      const content = `# Main Title
## Section 1
### Subsection 1.1
## Section 2
Some content here`

      const result = await extractStructuralPatterns(content)
      
      expect(result.patterns).toContainEqual(
        expect.objectContaining({
          type: 'heading',
          count: 4
        })
      )
      expect(result.hierarchyDepth).toBeGreaterThanOrEqual(3)
    })

    it('should detect bullet lists', async () => {
      const content = `Here's a list:
- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
- Item 3`

      const result = await extractStructuralPatterns(content)
      
      expect(result.listTypes).toContain('bullet')
      expect(result.listTypes).toContain('nested')
      expect(result.patterns).toContainEqual(
        expect.objectContaining({
          type: 'list',
          count: expect.any(Number)
        })
      )
    })

    it('should detect numbered lists', async () => {
      const content = `Steps to follow:
1. First step
2. Second step
3. Third step
   a. Sub-step
   b. Another sub-step`

      const result = await extractStructuralPatterns(content)
      
      expect(result.listTypes).toContain('numbered')
      expect(result.patterns).toContainEqual(
        expect.objectContaining({
          type: 'list'
        })
      )
    })

    it('should detect markdown tables', async () => {
      const content = `| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |`

      const result = await extractStructuralPatterns(content)
      
      expect(result.hasTable).toBe(true)
      expect(result.patterns).toContainEqual(
        expect.objectContaining({
          type: 'table',
          count: 1
        })
      )
    })

    it('should detect code blocks', async () => {
      const content = `Here's some code:
\`\`\`javascript
function hello() {
  console.log('Hello, world!')
}
\`\`\`

And inline \`code\` as well.`

      const result = await extractStructuralPatterns(content)
      
      expect(result.hasCode).toBe(true)
      expect(result.patterns).toContainEqual(
        expect.objectContaining({
          type: 'code'
        })
      )
    })

    it('should detect block quotes', async () => {
      const content = `As someone once said:
> This is a quote
> It can span multiple lines
>> And even be nested

Regular text here.`

      const result = await extractStructuralPatterns(content)
      
      expect(result.patterns).toContainEqual(
        expect.objectContaining({
          type: 'quote'
        })
      )
    })

    it('should detect section breaks', async () => {
      const content = `Section 1

---

Section 2

***

Section 3`

      const result = await extractStructuralPatterns(content)
      
      expect(result.patterns).toContainEqual(
        expect.objectContaining({
          type: 'section',
          count: expect.any(Number)
        })
      )
    })

    it('should detect definition lists', async () => {
      const content = `Term 1:
  Definition of term 1
  
Term 2:
  Definition of term 2
  Can span multiple lines`

      const result = await extractStructuralPatterns(content)
      
      expect(result.patterns).toContainEqual(
        expect.objectContaining({
          type: 'definition',
          count: 2
        })
      )
    })

    it('should calculate appropriate confidence scores', async () => {
      const wellStructured = `# Title
## Introduction
This is the introduction paragraph.

## Main Content
- Point 1
- Point 2
- Point 3

## Conclusion
Final thoughts here.`

      const poorlyStructured = `Some text without structure`

      const wellResult = await extractStructuralPatterns(wellStructured)
      const poorResult = await extractStructuralPatterns(poorlyStructured)
      
      expect(wellResult.confidence).toBeGreaterThan(0.6)
      expect(poorResult.confidence).toBeLessThan(0.5)
    })

    it('should complete within 500ms performance target', async () => {
      const largeContent = `# Title\n${'Lorem ipsum dolor sit amet. '.repeat(100)}\n`.repeat(10)
      
      const startTime = Date.now()
      await extractStructuralPatterns(largeContent)
      const elapsed = Date.now() - startTime
      
      expect(elapsed).toBeLessThan(500)
    })

    it('should handle empty content gracefully', async () => {
      const result = await extractStructuralPatterns('')
      
      expect(result.patterns).toEqual([])
      expect(result.hierarchyDepth).toBe(1)
      expect(result.confidence).toBeLessThan(0.5)
    })

    it('should detect academic paper template', async () => {
      const content = `Abstract
This paper presents...

Introduction
The field of study...

Methods
We conducted experiments...

Results
Our findings show...

Discussion
These results indicate...`

      const aiAnalysis = {
        templateType: 'academic_paper',
        structuralComplexity: 'moderate'
      }

      const result = await extractStructuralPatterns(content, aiAnalysis)
      
      expect(result.templateType).toBe('academic_paper')
    })
  })

  describe('AI Prompt Generation', () => {
    it('should generate valid structural analysis prompt', () => {
      const content = 'Sample content for analysis'
      const prompt = generateStructuralPrompt(content)
      
      expect(prompt).toContain('structural patterns')
      expect(prompt).toContain('Template Type')
      expect(prompt).toContain('Structural Complexity')
      expect(prompt).toContain(content)
    })

    it('should validate correct AI responses', () => {
      const validResponse = {
        structuralComplexity: 'moderate',
        customPatterns: [
          {
            name: 'test_pattern',
            description: 'A test pattern',
            confidence: 0.8
          }
        ]
      }

      expect(validateStructuralResponse(validResponse)).toBe(true)
    })

    it('should reject invalid AI responses', () => {
      const invalidResponses = [
        null,
        {},
        { structuralComplexity: 'invalid' },
        { structuralComplexity: 'simple', customPatterns: 'not-array' },
        { 
          structuralComplexity: 'simple', 
          customPatterns: [{ name: 'test' }] // missing fields
        }
      ]

      invalidResponses.forEach(response => {
        expect(validateStructuralResponse(response)).toBe(false)
      })
    })

    it('should parse AI response from text', () => {
      const responseText = `Based on analysis, here's the result:
{
  "structuralComplexity": "complex",
  "templateType": "research_report",
  "customPatterns": []
}
Additional notes...`

      const parsed = parseStructuralResponse(responseText)
      
      expect(parsed).toBeDefined()
      expect(parsed.structuralComplexity).toBe('complex')
    })
  })

  describe('Pattern Detection Accuracy', () => {
    it('should achieve >85% accuracy for heading detection', async () => {
      const testCases = [
        { content: '# H1\n## H2\n### H3', expectedHeadings: 3 },
        { content: 'INTRODUCTION:\nMETHODS:\nRESULTS:', expectedHeadings: 3 },
        { content: '1. Introduction\n2. Methods\n3. Results', expectedHeadings: 0 }
      ]

      let correct = 0
      for (const testCase of testCases) {
        const result = await extractStructuralPatterns(testCase.content)
        const headingPattern = result.patterns.find(p => p.type === 'heading')
        
        if (testCase.expectedHeadings === 0) {
          if (!headingPattern) correct++
        } else {
          if (headingPattern && headingPattern.count === testCase.expectedHeadings) {
            correct++
          }
        }
      }

      const accuracy = correct / testCases.length
      expect(accuracy).toBeGreaterThan(0.85)
    })

    it('should detect complex nested structures', async () => {
      const complexContent = `# Main Title
## Section 1
- Point A
  - Sub-point A.1
    - Detail A.1.1
  - Sub-point A.2
- Point B

| Col1 | Col2 |
|------|------|
| Data | More |

\`\`\`code
example()
\`\`\`

> Quote level 1
>> Quote level 2`

      const result = await extractStructuralPatterns(complexContent)
      
      expect(result.patterns.length).toBeGreaterThanOrEqual(5)
      expect(result.hierarchyDepth).toBeGreaterThanOrEqual(3)
      expect(result.hasTable).toBe(true)
      expect(result.hasCode).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.7)
    })
  })
})