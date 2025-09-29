/**
 * Test fixtures for all document source types.
 * Provides realistic test data for integration testing.
 */

import type { DocumentProcessorJob } from '../../types/processor'

/**
 * Sample PDF test data configurations.
 */
export const PDF_FIXTURES = {
  small: {
    name: 'small-academic-paper.pdf',
    pages: 10,
    expectedChunks: 8,
    content: 'Academic paper on software testing methodologies',
    metadata: {
      title: 'Integration Testing Best Practices',
      author: 'Test Author',
      subject: 'Software Engineering'
    }
  },
  medium: {
    name: 'medium-technical-doc.pdf',
    pages: 50,
    expectedChunks: 35,
    content: 'Technical documentation for a software system',
    metadata: {
      title: 'System Architecture Guide',
      author: 'Engineering Team'
    }
  },
  large: {
    name: 'large-textbook.pdf',
    pages: 100,
    expectedChunks: 75,
    content: 'Comprehensive textbook on computer science',
    metadata: {
      title: 'Computer Science Fundamentals',
      author: 'Multiple Authors'
    }
  },
  corrupted: {
    name: 'corrupted.pdf',
    pages: 0,
    expectedError: 'PDF_EXTRACTION_FAILED',
    content: 'Invalid PDF data'
  }
}

/**
 * Sample YouTube video test data.
 */
export const YOUTUBE_FIXTURES = {
  shortVideo: {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    duration: 213, // 3:33
    title: 'Test Video - Short',
    expectedChunks: 5,
    transcript: [
      { text: "Welcome to this test video", offset: 0, duration: 3000 },
      { text: "[[00:03](url)] Today we'll discuss integration testing", offset: 3000, duration: 4000 },
      { text: "[[00:07](url)] It's important for software quality", offset: 7000, duration: 3500 },
      { text: "[[00:10](url)] Let's look at some examples", offset: 10500, duration: 3500 },
      { text: "[[00:14](url)] First, unit tests vs integration tests", offset: 14000, duration: 4000 }
    ]
  },
  longVideo: {
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    videoId: 'jNQXAC9IVRw',
    duration: 7200, // 2 hours
    title: 'Test Video - Long Conference Talk',
    expectedChunks: 45,
    hasChapters: true
  },
  restrictedVideo: {
    url: 'https://www.youtube.com/watch?v=restricted123',
    videoId: 'restricted123',
    expectedError: 'YOUTUBE_TRANSCRIPT_DISABLED',
    errorMessage: 'Transcript is disabled for this video'
  },
  invalidUrl: {
    url: 'https://www.youtube.com/not-a-video',
    expectedError: 'YOUTUBE_INVALID_URL',
    errorMessage: 'Invalid YouTube URL format'
  }
}

/**
 * Sample web article test data.
 */
export const WEB_FIXTURES = {
  newsArticle: {
    url: 'https://example.com/news/test-article',
    title: 'Breaking: Integration Tests Save the Day',
    author: 'Jane Developer',
    publishedDate: '2024-01-15',
    expectedChunks: 6,
    content: `
      <article>
        <h1>Breaking: Integration Tests Save the Day</h1>
        <p class="byline">By Jane Developer | January 15, 2024</p>
        <p>In a stunning turn of events, comprehensive integration tests prevented a major production incident.</p>
        <h2>The Discovery</h2>
        <p>Engineers at TechCorp discovered a critical bug during routine testing.</p>
        <h2>The Solution</h2>
        <p>Thanks to thorough integration tests, the issue was caught before deployment.</p>
        <h2>Lessons Learned</h2>
        <p>This incident highlights the importance of comprehensive test coverage.</p>
      </article>
    `
  },
  blogPost: {
    url: 'https://blog.example.com/posts/testing-strategies',
    title: 'Modern Testing Strategies for 2024',
    expectedChunks: 8,
    hasCodeBlocks: true,
    content: `
      <article>
        <h1>Modern Testing Strategies for 2024</h1>
        <p>Testing has evolved significantly over the years.</p>
        <h2>Unit Testing</h2>
        <p>Start with solid unit tests.</p>
        <pre><code>
        describe('Calculator', () => {
          it('should add numbers', () => {
            expect(add(2, 3)).toBe(5);
          });
        });
        </code></pre>
        <h2>Integration Testing</h2>
        <p>Connect the pieces together.</p>
      </article>
    `
  },
  paywallArticle: {
    url: 'https://paywall.example.com/premium-content',
    expectedError: 'WEB_PAYWALL',
    errorMessage: 'Article is behind a paywall'
  },
  notFound: {
    url: 'https://example.com/404-not-found',
    expectedError: 'WEB_NOT_FOUND',
    errorMessage: 'Page not found'
  }
}

/**
 * Sample markdown test data.
 */
export const MARKDOWN_FIXTURES = {
  clean: {
    name: 'clean-documentation.md',
    processAs: 'markdown_asis',
    expectedChunks: 5,
    content: `# Documentation Guide

## Introduction

This is a well-formatted markdown document.

## Installation

\`\`\`bash
npm install integration-tests
\`\`\`

## Usage

Import the library and start testing:

\`\`\`javascript
import { test } from 'integration-tests';
test('my feature', () => {
  // Test code here
});
\`\`\`

## API Reference

### test(name, callback)

Defines a new test case.

## Contributing

Please read our contributing guidelines.`
  },
  messy: {
    name: 'messy-notes.md',
    processAs: 'markdown_clean',
    expectedChunks: 6,
    expectedImprovement: true,
    content: `# my notes

random thoughts here...

##installation steps
1. dowload the thing
2. run npm instal
3. ??? 
4. profit

### importnt!!
dont forget to test everything

\`\`\`
// broken code
function test() {
console.log("hello")
}
\`\`\`

##todo
- fix typos
-add more docs
- cleanup formatting`
  },
  withTimestamps: {
    name: 'meeting-notes.md',
    processAs: 'markdown_asis',
    hasTimestamps: true,
    expectedChunks: 4,
    content: `# Meeting Notes

[[00:00]] Introduction and agenda

[[05:30]] Discussion of Q1 results
- Revenue up 20%
- New customers: 150

[[15:45]] Product roadmap review
- Feature A launching next month
- Feature B in development

[[30:00]] Q&A and closing remarks`
  }
}

/**
 * Sample plain text test data.
 */
export const TEXT_FIXTURES = {
  simple: {
    name: 'simple-notes.txt',
    expectedChunks: 3,
    needsStructure: true,
    content: `Meeting Notes - January 15, 2024

Attendees: Alice, Bob, Charlie

Topics Discussed:
- Project timeline
- Budget allocation
- Team assignments

Action Items:
1. Alice to prepare timeline
2. Bob to review budget
3. Charlie to assign tasks

Next Meeting: January 22, 2024`
  },
  transcript: {
    name: 'interview-transcript.txt',
    hasTimestamps: true,
    expectedChunks: 5,
    content: `Interview Transcript

00:00 - Interviewer: Thank you for joining us today.
00:05 - Guest: Happy to be here.

00:10 - Interviewer: Let's start with your background.
00:15 - Guest: I've been in software development for 10 years.

00:45 - Interviewer: What are your thoughts on testing?
00:50 - Guest: Integration tests are crucial for quality.

01:30 - Interviewer: Any final thoughts?
01:35 - Guest: Always test your code thoroughly.

01:45 - End of interview`
  }
}

/**
 * Sample paste content test data.
 */
export const PASTE_FIXTURES = {
  mixed: {
    name: 'mixed-content-paste',
    detectFormat: true,
    expectedChunks: 4,
    content: `# Quick Notes

Here's some code I found:

\`\`\`python
def calculate_average(numbers):
    return sum(numbers) / len(numbers)
\`\`\`

Also this SQL query:

SELECT * FROM users WHERE active = true;

Remember to:
- Test the function
- Optimize the query
- Document everything`
  },
  chatLog: {
    name: 'chat-conversation',
    hasTimestamps: true,
    expectedChunks: 6,
    content: `[10:30 AM] Alice: Hey team, ready for standup?
[10:30 AM] Bob: Yes, joining now
[10:31 AM] Charlie: On my way

[10:32 AM] Alice: Let's start. Bob, your updates?
[10:32 AM] Bob: Fixed the integration test failures
[10:33 AM] Bob: Working on performance benchmarks today

[10:34 AM] Charlie: I'm reviewing the PR
[10:34 AM] Charlie: Should be done by noon

[10:35 AM] Alice: Great! Any blockers?
[10:35 AM] Team: None

[10:36 AM] Alice: Perfect, let's sync again tomorrow`
  }
}

/**
 * Error scenario test cases for all processors.
 */
export const ERROR_SCENARIOS = {
  network: {
    type: 'NETWORK_ERROR',
    message: 'Network request failed',
    shouldRetry: true,
    maxRetries: 3
  },
  geminiQuota: {
    type: 'GEMINI_QUOTA_EXCEEDED',
    message: 'Gemini API quota exceeded',
    shouldRetry: true,
    backoffMs: 60000
  },
  storageFailure: {
    type: 'STORAGE_ERROR',
    message: 'Failed to upload to storage',
    shouldRetry: true,
    maxRetries: 2
  },
  databaseTimeout: {
    type: 'DATABASE_TIMEOUT',
    message: 'Database operation timed out',
    shouldRetry: true,
    maxRetries: 3
  },
  invalidInput: {
    type: 'INVALID_INPUT',
    message: 'Invalid document format',
    shouldRetry: false
  },
  authFailure: {
    type: 'AUTH_FAILED',
    message: 'Authentication failed',
    shouldRetry: false
  }
}

/**
 * Expected performance benchmarks for validation.
 */
export const PERFORMANCE_TARGETS = {
  pdf: {
    small: { maxTime: 30000, maxDbCalls: 5 },    // 30s, 5 DB calls
    medium: { maxTime: 60000, maxDbCalls: 10 },   // 1min, 10 DB calls
    large: { maxTime: 120000, maxDbCalls: 15 }    // 2min, 15 DB calls
  },
  youtube: {
    short: { maxTime: 20000, maxDbCalls: 5 },     // 20s, 5 DB calls
    long: { maxTime: 90000, maxDbCalls: 10 }      // 1.5min, 10 DB calls
  },
  web: {
    article: { maxTime: 15000, maxDbCalls: 5 }    // 15s, 5 DB calls
  },
  markdown: {
    asis: { maxTime: 5000, maxDbCalls: 3 },       // 5s, 3 DB calls
    clean: { maxTime: 15000, maxDbCalls: 5 }      // 15s, 5 DB calls
  },
  text: {
    simple: { maxTime: 10000, maxDbCalls: 4 }     // 10s, 4 DB calls
  },
  paste: {
    any: { maxTime: 10000, maxDbCalls: 4 }        // 10s, 4 DB calls
  }
}

/**
 * Helper to create test jobs for different scenarios.
 */
export function createTestJobForFixture(
  sourceType: string,
  fixtureKey: string,
  overrides?: Partial<DocumentProcessorJob>
): DocumentProcessorJob {
  const baseJob: DocumentProcessorJob = {
    id: `test-job-${sourceType}-${fixtureKey}`,
    user_id: 'test-user',
    document_id: `test-doc-${Date.now()}`,
    source_type: sourceType,
    source_identifier: '',
    storage_path: '',
    status: 'pending',
    progress: 0,
    stage: 'initializing',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Set source-specific fields
  switch (sourceType) {
    case 'pdf':
      const pdfFixture = PDF_FIXTURES[fixtureKey as keyof typeof PDF_FIXTURES]
      baseJob.source_identifier = pdfFixture.name
      baseJob.storage_path = `test-user/${baseJob.document_id}/source.pdf`
      break
      
    case 'youtube':
      const ytFixture = YOUTUBE_FIXTURES[fixtureKey as keyof typeof YOUTUBE_FIXTURES]
      baseJob.source_identifier = ytFixture.url
      break
      
    case 'web_url':
      const webFixture = WEB_FIXTURES[fixtureKey as keyof typeof WEB_FIXTURES]
      baseJob.source_identifier = webFixture.url
      break
      
    case 'markdown_asis':
    case 'markdown_clean':
      const mdFixture = MARKDOWN_FIXTURES[fixtureKey as keyof typeof MARKDOWN_FIXTURES]
      baseJob.source_identifier = mdFixture.name
      baseJob.source_type = mdFixture.processAs
      baseJob.storage_path = `test-user/${baseJob.document_id}/source.md`
      break
      
    case 'txt':
      const txtFixture = TEXT_FIXTURES[fixtureKey as keyof typeof TEXT_FIXTURES]
      baseJob.source_identifier = txtFixture.name
      baseJob.storage_path = `test-user/${baseJob.document_id}/source.txt`
      break
      
    case 'paste':
      const pasteFixture = PASTE_FIXTURES[fixtureKey as keyof typeof PASTE_FIXTURES]
      baseJob.source_identifier = pasteFixture.name
      break
  }

  return {
    ...baseJob,
    ...overrides
  }
}