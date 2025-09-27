/**
 * Unit tests for markdown chunking utilities.
 * Tests heading-based chunking and timestamp extraction with context.
 */

import { simpleMarkdownChunking, extractTimestampsWithContext } from '../markdown-chunking'

describe('Markdown Chunking Utilities', () => {
  describe('simpleMarkdownChunking', () => {
    it('creates one chunk per section for markdown with multiple headings', () => {
      const markdown = `# Introduction

This is the introduction section with some content that explains the topic. We need to add more content here to meet the minimum chunk size requirement of 200 characters. Let's continue with additional sentences to ensure this section is long enough to be included as a valid chunk in the output.

## Details

This section provides detailed information about the subject matter. Again, we need sufficient content to meet the 200 character minimum threshold. The chunking algorithm will skip sections that are too short, so we must ensure each section has enough substance to be processed as a separate chunk.

### Subsection

Even more specific details in this subsection that go beyond the basics. This subsection also needs to have adequate length to be considered a valid chunk. We're adding enough text here to ensure the minimum size requirement is met for proper testing.`

      const chunks = simpleMarkdownChunking(markdown)

      expect(chunks.length).toBeGreaterThan(0)
      const themes = chunks.flatMap(c => c.themes)
      expect(themes).toContain('Introduction')
      expect(themes).toContain('Details')
    })

    it('returns single chunk with default theme for markdown without headings', () => {
      const markdown = 'This is plain content without any headings. Just regular paragraphs of text that should be treated as a single document section. More content here to meet the minimum chunk size requirement.'

      const chunks = simpleMarkdownChunking(markdown)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].themes).toContain('Document Content')
      expect(chunks[0].content).toContain('plain content')
    })

    it('splits long sections exceeding 2000 characters by paragraphs', () => {
      const longSection = '# Long Section\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(100) + '\n\n' + 'More content here. '.repeat(100)

      const chunks = simpleMarkdownChunking(longSection)

      // Should have multiple chunks due to length
      expect(chunks.length).toBeGreaterThan(1)
      
      // Each chunk should be under 2000 characters
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(2000)
      })

      // All chunks should have the same theme
      chunks.forEach(chunk => {
        expect(chunk.themes).toContain('Long Section')
      })
    })

    it('assigns correct importance scores based on heading level', () => {
      const markdown = `# H1 Heading

This is content for the H1 heading section. We need sufficient text here to meet the minimum 200 character requirement for a valid chunk. Adding more sentences to ensure this section is long enough to be processed properly by the chunking algorithm.

## H2 Heading

This is content for the H2 heading section. Similarly, we need adequate text to meet the minimum threshold. The importance score should reflect the H2 level with a value of 0.9 according to the scoring system implemented in the utility function.

### H3 Heading

Content for the H3 heading follows the same pattern. Each section needs to be long enough to qualify as a chunk. The importance score for H3 level headings is set to 0.7 in the utility function, which we will verify in this test case.

#### H4 Heading

Content for H4 heading section needs adequate length as well. The importance score should be 0.6 for H4 level headings. We continue adding text to ensure all sections meet the minimum size requirement for successful chunking and testing.

##### H5 Heading

Content for H5 heading section with sufficient text content. The importance score for H5 headings should be 0.4. We want to verify that all heading levels are correctly assigned their corresponding importance scores by the algorithm.

###### H6 Heading

Content for H6 heading section, the lowest level heading in markdown. This should have an importance score of 0.3. We're ensuring all sections have enough content to be included as valid chunks so we can properly test the importance scoring mechanism.`

      const chunks = simpleMarkdownChunking(markdown)

      // H1 should have highest importance (1.0)
      const h1Chunk = chunks.find(c => c.themes.includes('H1 Heading'))
      expect(h1Chunk?.importance_score).toBe(1.0)

      // H2 should have 0.9
      const h2Chunk = chunks.find(c => c.themes.includes('H2 Heading'))
      expect(h2Chunk?.importance_score).toBe(0.9)

      // H3 should have 0.7
      const h3Chunk = chunks.find(c => c.themes.includes('H3 Heading'))
      expect(h3Chunk?.importance_score).toBe(0.7)

      // H6 should have lowest importance (0.3)
      const h6Chunk = chunks.find(c => c.themes.includes('H6 Heading'))
      expect(h6Chunk?.importance_score).toBe(0.3)
    })

    it('skips sections shorter than minimum threshold', () => {
      const markdown = `# Valid Section With Enough Content

This section has enough content to be included in the chunking output. It contains multiple sentences and provides substantial information that exceeds the minimum requirement of 200 characters for section content. We ensure this section is long enough by adding additional explanatory text that provides meaningful content for the document reader.

## Too Short Section

Brief.

## Another Valid Section With Sufficient Length

This section also has enough content to meet the minimum threshold of 200 characters and will be included in the chunks. We add sufficient text here to ensure proper inclusion and testing of the chunking algorithm. The algorithm requires sections to have at least 200 characters to be considered valid chunks for processing.`

      const chunks = simpleMarkdownChunking(markdown)

      // Should not include the "Too Short" section
      const themes = chunks.flatMap(c => c.themes)
      expect(themes).not.toContain('Too Short Section')
      expect(themes).toContain('Valid Section With Enough Content')
      expect(themes).toContain('Another Valid Section With Sufficient Length')
    })

    it('generates summary for each chunk', () => {
      const markdown = `# Summary Test

This is content that should appear in the summary field of the chunk. The summary should be the first 100 characters or so. We need to add enough text here to meet the minimum chunk size of 200 characters so this section will actually be processed and we can test the summary generation functionality.`

      const chunks = simpleMarkdownChunking(markdown)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].summary).toBeDefined()
      expect(chunks[0].summary.length).toBeGreaterThan(0)
      expect(chunks[0].summary).toContain('This is content')
    })

    it('handles mixed heading levels correctly', () => {
      const markdown = `# Top Level

This is content at the top level with enough text to meet the minimum chunk size requirement. We're adding sufficient content here to ensure this section qualifies as a valid chunk that will be processed by the algorithm.

### Skip H2, go to H3

This section jumps directly to H3 without an intermediate H2 heading. The chunking algorithm should handle this non-sequential heading structure correctly. We need adequate content here to meet the 200 character minimum threshold for chunk inclusion.

## Back to H2

This section returns to the H2 level after an H3. Non-sequential heading levels should be handled gracefully by the chunking function. Again, we ensure sufficient content length to meet the minimum size requirement for a valid chunk.`

      const chunks = simpleMarkdownChunking(markdown)

      expect(chunks.length).toBeGreaterThan(0)
      
      // Should handle non-sequential heading levels
      const themes = chunks.flatMap(c => c.themes)
      expect(themes).toContain('Top Level')
      expect(themes).toContain('Skip H2, go to H3')
      expect(themes).toContain('Back to H2')
    })

    it('handles empty markdown string', () => {
      const chunks = simpleMarkdownChunking('')

      // Empty string still creates a single chunk with empty content
      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('')
      expect(chunks[0].themes).toContain('Document Content')
    })

    it('handles markdown with only whitespace', () => {
      const chunks = simpleMarkdownChunking('   \n\n   \n   ')

      // Whitespace-only content creates a single chunk with empty content after trim
      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('')
    })

    it('preserves markdown formatting in chunk content', () => {
      const markdown = `# Formatted Content

This section includes **bold text**, *italic text*, and \`code snippets\` with various markdown formatting elements that should be preserved in the chunk output.

- List item 1
- List item 2

[Link](https://example.com)

Additional content to meet the minimum character requirement for chunk inclusion.`

      const chunks = simpleMarkdownChunking(markdown)

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0].content).toContain('**bold text**')
      expect(chunks[0].content).toContain('*italic text*')
      expect(chunks[0].content).toContain('`code snippets`')
      expect(chunks[0].content).toContain('- List item')
      expect(chunks[0].content).toContain('[Link]')
    })

    it('handles consecutive headings without content between them', () => {
      const markdown = `# First Heading
## Second Heading
### Third Heading

Finally, some actual content here that is long enough to be included as a chunk. We need to ensure this section meets the minimum 200 character requirement so it will be processed correctly by the chunking algorithm and included in the output.`

      const chunks = simpleMarkdownChunking(markdown)

      // Should skip empty sections and only include the one with content
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[chunks.length - 1].content).toContain('Finally, some actual content')
    })
  })

  describe('extractTimestampsWithContext', () => {
    it('extracts timestamps in [MM:SS] format correctly', () => {
      const content = 'In the beginning [00:30] we discuss basics and later [02:15] advanced topics'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(2)
      expect(timestamps[0].time).toBe(30) // 30 seconds
      expect(timestamps[1].time).toBe(135) // 2 minutes 15 seconds
    })

    it('extracts timestamps in [HH:MM:SS] format correctly', () => {
      const content = 'Introduction starts at [1:23:45] and continues for a while'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(1)
      expect(timestamps[0].time).toBe(5025) // 1 hour 23 minutes 45 seconds
    })

    it('extracts context before timestamp', () => {
      const content = 'We start by discussing the fundamentals [00:30] and then move on'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps[0].context_before).toBeTruthy()
      expect(timestamps[0].context_before).toContain('fundamentals')
    })

    it('extracts context after timestamp', () => {
      const content = 'The introduction begins at [00:30] with an overview of the topic'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps[0].context_after).toBeTruthy()
      expect(timestamps[0].context_after).toContain('with')
    })

    it('extracts multiple timestamps from same content', () => {
      const content = `Transcript with multiple timestamps:
      - [00:00] Introduction
      - [02:30] Main content
      - [05:45] Conclusion
      - [10:00] Q&A session`

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(4)
      expect(timestamps[0].time).toBe(0)
      expect(timestamps[1].time).toBe(150) // 2:30
      expect(timestamps[2].time).toBe(345) // 5:45
      expect(timestamps[3].time).toBe(600) // 10:00
    })

    it('returns empty array when no timestamps present', () => {
      const content = 'This content has no timestamps at all'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(0)
    })

    it('handles timestamp at start of content', () => {
      const content = '[00:00] We begin with an introduction to the topic'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(1)
      expect(timestamps[0].time).toBe(0)
      expect(timestamps[0].context_before).toBeDefined()
      expect(timestamps[0].context_after).toContain('We begin')
    })

    it('handles timestamp at end of content', () => {
      const content = 'The final section concludes at [59:59]'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(1)
      expect(timestamps[0].time).toBe(3599) // 59 minutes 59 seconds
      expect(timestamps[0].context_before).toContain('concludes')
      expect(timestamps[0].context_after).toBeDefined()
    })

    it('extracts 3-5 words for context', () => {
      const content = 'This is a test sentence with many words before [01:00] and after the timestamp marker'

      const timestamps = extractTimestampsWithContext(content)

      const beforeWords = timestamps[0].context_before.split(' ')
      const afterWords = timestamps[0].context_after.split(' ')

      // Should extract between 3-5 words
      expect(beforeWords.length).toBeGreaterThanOrEqual(3)
      expect(beforeWords.length).toBeLessThanOrEqual(5)
      expect(afterWords.length).toBeGreaterThanOrEqual(3)
      expect(afterWords.length).toBeLessThanOrEqual(5)
    })

    it('handles various minute/second formats', () => {
      const content = `Various formats:
      [0:05] - 5 seconds
      [1:30] - 1 minute 30 seconds
      [10:00] - 10 minutes
      [59:59] - almost an hour`

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(4)
      expect(timestamps[0].time).toBe(5)
      expect(timestamps[1].time).toBe(90)
      expect(timestamps[2].time).toBe(600)
      expect(timestamps[3].time).toBe(3599)
    })

    it('handles hours, minutes, and seconds correctly', () => {
      const content = 'Long video timestamp [2:15:30] in the middle'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(1)
      // 2 hours = 7200s, 15 minutes = 900s, 30 seconds = 30s
      expect(timestamps[0].time).toBe(8130)
    })

    it('ignores malformed timestamp-like patterns', () => {
      const content = 'Not a timestamp: [abc:def] invalid format here'

      const timestamps = extractTimestampsWithContext(content)

      // Should ignore patterns that don't match valid timestamp format
      expect(timestamps).toHaveLength(0)
    })

    it('handles timestamps on same line', () => {
      const content = 'Multiple on one line [00:10] then [00:20] and finally [00:30] here'

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(3)
      expect(timestamps[0].time).toBe(10)
      expect(timestamps[1].time).toBe(20)
      expect(timestamps[2].time).toBe(30)
    })

    it('handles content with newlines around timestamps', () => {
      const content = `First paragraph with content.

[01:30] Second section begins here.

More content in the third paragraph.`

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps).toHaveLength(1)
      expect(timestamps[0].time).toBe(90)
    })

    it('trims whitespace from context words', () => {
      const content = '  Multiple   spaces    here   [00:45]  and   after   too  '

      const timestamps = extractTimestampsWithContext(content)

      expect(timestamps[0].context_before).not.toMatch(/\s{2,}/)
      expect(timestamps[0].context_after).not.toMatch(/\s{2,}/)
    })
  })
})