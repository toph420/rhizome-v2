/**
 * Tests for text cleanup utilities
 */

import { cleanPageArtifacts, aggressiveCleanPageArtifacts } from '../text-cleanup'

describe('cleanPageArtifacts', () => {
  describe('standalone page numbers', () => {
    it('should remove standalone page numbers between sentence fragments', () => {
      const input = 'discussing the theory\n\n123\n\nwhich continues here'
      const expected = 'discussing the theory which continues here'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should handle multiple page numbers in same text', () => {
      const input = 'first sentence\n\n45\n\ncontinues and\n\n46\n\nalso continues'
      const expected = 'first sentence continues and also continues'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should work with punctuation before page number', () => {
      const input = 'end of sentence,\n\n302\n\nand it continues'
      const expected = 'end of sentence, and it continues'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })
  })

  describe('page number + header combinations', () => {
    it('should remove page number with author name', () => {
      const input = 'in terms of\n\n303 Author Name\n\nstrict laws'
      const expected = 'in terms of strict laws'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should remove page number with chapter title', () => {
      const input = 'without\n\n302 Henry Somers-Hall\n\nfuss. This explanation'
      const expected = 'without fuss. This explanation'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should handle various header formats', () => {
      const input = 'the concept of\n\n47 Chapter Three: The Theory\n\ndifference as such'
      const expected = 'the concept of difference as such'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })
  })

  describe('running headers without page numbers', () => {
    it('should remove short capitalized headers between sentences', () => {
      const input = 'discussing theory\n\nChapter Title\n\nwhich explores'
      const expected = 'discussing theory which explores'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should preserve content that looks like headers but has sentence-ending punctuation', () => {
      const input = 'first part\n\nThis is a real paragraph.\n\nnext part'
      const expected = 'first part\n\nThis is a real paragraph.\n\nnext part'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should only remove headers shorter than 60 chars', () => {
      const longHeader = 'A'.repeat(70)
      const input = `discussing\n\n${longHeader}\n\ncontinues`
      // Should preserve because it's too long to be a typical header
      expect(cleanPageArtifacts(input)).toContain(longHeader)
    })
  })

  describe('Page N markers', () => {
    it('should remove "Page N" markers', () => {
      const input = 'the concept of\n\nPage 47\n\ndifference as such'
      const expected = 'the concept of difference as such'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should remove "p. N" markers', () => {
      const input = 'discussing theory\n\np. 123\n\nwhich continues'
      const expected = 'discussing theory which continues'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should handle lowercase page markers', () => {
      const input = 'the idea\n\npage 42\n\ncontinues here'
      const expected = 'the idea continues here'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })
  })

  describe('roman numeral page numbers with section labels', () => {
    it('should remove roman numerals with ALL CAPS section labels', () => {
      const input = 'There is a series of features one should take note of here, first among\n\nxii PREFACE\n\nthem the direct link made'
      const expected = 'There is a series of features one should take note of here, first among them the direct link made'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should handle other roman numeral + section combinations', () => {
      const input = 'discussing the topic\n\niv INTRODUCTION\n\nwhich leads to'
      const expected = 'discussing the topic which leads to'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should handle various roman numeral formats', () => {
      const input = 'text before\n\nxvii TABLE OF CONTENTS\n\ntext after'
      const expected = 'text before text after'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should work with mixed case roman numerals', () => {
      const input = 'some text\n\nXII ACKNOWLEDGMENTS\n\ncontinues here'
      const expected = 'some text continues here'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })
  })

  describe('whitespace normalization', () => {
    it('should remove multiple consecutive spaces', () => {
      const input = 'word1   word2    word3'
      const expected = 'word1 word2 word3'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should normalize paragraph breaks to exactly 2 newlines', () => {
      const input = 'paragraph 1\n\n\n\nparagraph 2'
      const expected = 'paragraph 1\n\nparagraph 2'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should remove trailing whitespace from lines', () => {
      const input = 'line 1   \nline 2  \nline 3'
      const expected = 'line 1\nline 2\nline 3'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })
  })

  describe('real-world examples', () => {
    it('should handle the Deleuze example from issue report', () => {
      const input = `...in terms of

303 Deleuze, Freud and the Three Syntheses

strict laws...`
      const expected = '...in terms of strict laws...'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should handle multiple artifacts in sequence', () => {
      const input = `The theory suggests

302 Author Name

that we consider

Page 303

the implications carefully`
      const expected = 'The theory suggests that we consider the implications carefully'
      expect(cleanPageArtifacts(input)).toBe(expected)
    })

    it('should preserve intentional paragraph breaks', () => {
      const input = `First paragraph ends here.

Second paragraph begins here.

Third paragraph follows.`
      const result = cleanPageArtifacts(input)
      // Should maintain paragraph structure
      expect(result.split('\n\n').length).toBe(3)
    })

    it('should preserve markdown headings', () => {
      const input = `Some text here.

# Chapter One

More content follows.`
      const result = cleanPageArtifacts(input)
      expect(result).toContain('# Chapter One')
      expect(result.split('\n\n').length).toBe(3)
    })
  })

  describe('edge cases', () => {
    it('should handle empty input', () => {
      expect(cleanPageArtifacts('')).toBe('')
    })

    it('should handle input with no artifacts', () => {
      const input = 'Just regular text with no page numbers or headers.'
      expect(cleanPageArtifacts(input)).toBe(input)
    })

    it('should not modify uppercase text at start of sentence', () => {
      const input = 'The sentence ends. Another sentence begins here.'
      expect(cleanPageArtifacts(input)).toBe(input)
    })

    it('should preserve numbered lists', () => {
      const input = `Here are the points:

1. First point here
2. Second point here
3. Third point here`
      const result = cleanPageArtifacts(input)
      expect(result).toContain('1. First point')
      expect(result).toContain('2. Second point')
      expect(result).toContain('3. Third point')
    })
  })
})

describe('aggressiveCleanPageArtifacts', () => {
  it('should remove more artifacts than standard cleanup', () => {
    const input = 'discussing\n\n123 Some Random Header Text\n\nthe theory'
    const standard = cleanPageArtifacts(input)
    const aggressive = aggressiveCleanPageArtifacts(input)

    expect(aggressive).toBe('discussing the theory')
    expect(aggressive.length).toBeLessThanOrEqual(standard.length)
  })

  it('should remove any capitalized line between sentences', () => {
    const input = 'sentence ends\n\nAny Capitalized Text Here\n\ncontinues'
    const expected = 'sentence ends continues'
    expect(aggressiveCleanPageArtifacts(input)).toBe(expected)
  })

  it('should handle the same real-world examples', () => {
    const input = `...in terms of

303 Deleuze, Freud and the Three Syntheses

strict laws...`
    const expected = '...in terms of strict laws...'
    expect(aggressiveCleanPageArtifacts(input)).toBe(expected)
  })
})
