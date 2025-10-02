#!/usr/bin/env tsx

/**
 * Test Corpus Generator for Metadata Quality Validation
 * Generates 100+ diverse documents for comprehensive validation testing
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface TestDocument {
  id: string
  category: string
  content: string
  metadata?: any
}

/**
 * Document templates for different categories
 */
const templates = {
  technical: [
    {
      title: "API Documentation",
      content: `# {TITLE} API Reference

## Overview
The {SUBJECT} provides a comprehensive interface for {PURPOSE}. This documentation covers version {VERSION}.

## Authentication
All API requests require authentication using Bearer tokens:
\`\`\`bash
curl -H "Authorization: Bearer YOUR_TOKEN" {ENDPOINT}
\`\`\`

## Endpoints

### GET /{RESOURCE}
Returns a list of {RESOURCE} objects with pagination support.

**Parameters:**
- \`limit\` (integer): Maximum number of results
- \`offset\` (integer): Starting position
- \`sort\` (string): Sort field

### Error Codes
| Code | Description |
|------|-------------|
| 400  | Bad Request |
| 401  | Unauthorized |
| 404  | Not Found |
| 500  | Internal Server Error |`
    },
    {
      title: "Framework Guide",
      content: `# Getting Started with {FRAMEWORK}

{FRAMEWORK} is a modern {TYPE} framework designed for {PURPOSE}.

## Installation

\`\`\`{LANGUAGE}
{INSTALL_COMMAND}
\`\`\`

## Core Concepts

1. **{CONCEPT1}**: {DESCRIPTION1}
2. **{CONCEPT2}**: {DESCRIPTION2}
3. **{CONCEPT3}**: {DESCRIPTION3}

## Example Usage

\`\`\`{LANGUAGE}
{CODE_EXAMPLE}
\`\`\`

## Best Practices
- Always {PRACTICE1}
- Never {PRACTICE2}
- Consider {PRACTICE3}

See [documentation]({LINK}) for advanced topics.`
    }
  ],
  
  narrative: [
    {
      title: "Story Opening",
      content: `The {TIME} was {WEATHER}, and {CHARACTER} {ACTION} through the {LOCATION}. {EMOTION} filled the air as {EVENT} unfolded before them. 

"{DIALOGUE}," {CHARACTER} whispered, {ADVERB} aware of the {CONSEQUENCE} that lay ahead.

The {OBJECT} in their {POSSESSION} seemed to {QUALITY}, a reminder of {MEMORY}. Every {TIMEUNIT} that passed brought them closer to {GOAL}, yet the {OBSTACLE} remained {ADJECTIVE}.

As {CHARACTER} {MOVEMENT}, they couldn't help but {THOUGHT} about {REFLECTION}. The {SETTING} around them {TRANSFORMATION}, and with it, their {EMOTION2} {CHANGE}.`
    },
    {
      title: "Blog Post",
      content: `# {NUMBER} Ways to {ACHIEVE} {GOAL}

Have you ever wondered how to {ACHIEVE} {GOAL}? You're not alone. {STATISTIC}% of {DEMOGRAPHIC} struggle with this exact challenge.

## The Problem

Most people think {MISCONCEPTION}. But here's the truth: {REALITY}. This mindset shift alone can {BENEFIT}.

## The Solution

### {STEP1_TITLE}
{STEP1_DESCRIPTION}. Start by {ACTION1}, then gradually {PROGRESSION1}.

### {STEP2_TITLE}
{STEP2_DESCRIPTION}. Remember to {TIP2} and avoid {MISTAKE2}.

### {STEP3_TITLE}
{STEP3_DESCRIPTION}. The key is {KEY_INSIGHT3}.

## Conclusion

{SUMMARY}. If you found this helpful, {CTA}.`
    }
  ],
  
  academic: [
    {
      title: "Research Abstract",
      content: `## Abstract

**Background:** {FIELD} research has shown that {PHENOMENON} plays a crucial role in {CONTEXT}. However, the relationship between {VARIABLE1} and {VARIABLE2} remains poorly understood.

**Methods:** We conducted a {STUDY_TYPE} study involving {N} participants over {DURATION}. Data was collected using {METHOD} and analyzed using {ANALYSIS} (α = {ALPHA}).

**Results:** Our findings indicate a {RELATIONSHIP} relationship between {VARIABLE1} and {VARIABLE2} ({STATISTIC} = {VALUE}, p {PVALUE}). {FINDING1}. Additionally, {FINDING2}.

**Conclusions:** These results suggest that {IMPLICATION1}. Future research should investigate {FUTURE_DIRECTION}. The practical implications include {APPLICATION}.

**Keywords:** {KEYWORD1}, {KEYWORD2}, {KEYWORD3}, {KEYWORD4}`
    },
    {
      title: "Literature Review",
      content: `# {TOPIC}: A Systematic Review

## Introduction

The concept of {CONCEPT} has evolved significantly since {AUTHOR1} ({YEAR1}) first proposed {THEORY}. Recent developments in {FIELD} have challenged traditional understanding (_{AUTHOR2}, {YEAR2}_; _{AUTHOR3}, {YEAR3}_).

## Theoretical Framework

According to {THEORY_NAME} theory, {EXPLANATION}. This framework posits that:

1. {PRINCIPLE1} ({CITATION1})
2. {PRINCIPLE2} ({CITATION2})
3. {PRINCIPLE3} ({CITATION3})

## Current Research

{AUTHOR4} et al. ({YEAR4}) demonstrated that {FINDING}. This finding contradicts earlier work by {AUTHOR5} ({YEAR5}), who argued that {COUNTER_ARGUMENT}.

### Methodological Approaches

Researchers have employed various methods:
- **{METHOD1}**: Used in {PERCENTAGE1}% of studies
- **{METHOD2}**: Particularly effective for {PURPOSE2}
- **{METHOD3}**: Limited by {LIMITATION3}

## Discussion

The evidence suggests {CONCLUSION}. However, {LIMITATION} remains a significant challenge. Future research should address {GAP}.`
    }
  ],
  
  code: [
    {
      title: "Algorithm Implementation",
      content: `\`\`\`{LANGUAGE}
{COMMENT_STYLE} {ALGORITHM_NAME} Implementation
{COMMENT_STYLE} Time Complexity: O({TIME_COMPLEXITY})
{COMMENT_STYLE} Space Complexity: O({SPACE_COMPLEXITY})

{FUNCTION_DEF} {FUNCTION_NAME}({PARAMS}) {RETURN_TYPE} {
    {COMMENT_STYLE} Base case
    if ({BASE_CONDITION}) {
        return {BASE_RETURN};
    }
    
    {COMMENT_STYLE} Initialize variables
    {VAR_TYPE} {VAR1} = {INIT1};
    {VAR_TYPE} {VAR2} = {INIT2};
    
    {COMMENT_STYLE} Main logic
    {LOOP_TYPE} ({LOOP_CONDITION}) {
        {OPERATION1};
        {OPERATION2};
        {UPDATE_STATEMENT};
    }
    
    return {RESULT};
}

{COMMENT_STYLE} Example usage:
{COMMENT_STYLE} {EXAMPLE_CALL}
{COMMENT_STYLE} Expected output: {EXPECTED_OUTPUT}
\`\`\``
    },
    {
      title: "Class Definition",
      content: `\`\`\`{LANGUAGE}
{COMMENT_STYLE} {CLASS_DESCRIPTION}

{CLASS_KEYWORD} {CLASS_NAME} {INHERITANCE} {
    {ACCESS_MODIFIER}:
        {COMMENT_STYLE} Properties
        {PROPERTY_TYPE} {PROPERTY1};
        {PROPERTY_TYPE} {PROPERTY2};
    
    {ACCESS_MODIFIER}:
        {COMMENT_STYLE} Constructor
        {CONSTRUCTOR_NAME}({CONSTRUCTOR_PARAMS}) {
            {INITIALIZATION1};
            {INITIALIZATION2};
        }
        
        {COMMENT_STYLE} {METHOD1_DESCRIPTION}
        {METHOD_TYPE} {METHOD1_NAME}({METHOD1_PARAMS}) {
            {METHOD1_BODY};
        }
        
        {COMMENT_STYLE} {METHOD2_DESCRIPTION}
        {METHOD_TYPE} {METHOD2_NAME}({METHOD2_PARAMS}) {
            {METHOD2_BODY};
        }
};
\`\`\``
    }
  ],
  
  youtube: [
    {
      title: "Tutorial Transcript",
      content: `Hey everyone, welcome back to {CHANNEL}! Today we're going to learn about {TOPIC}, and trust me, by the end of this video, you'll be a pro at {SKILL}.

So let's dive right in. {TOPIC} is basically {SIMPLE_EXPLANATION}. Think of it like {ANALOGY} - {ANALOGY_EXPLANATION}.

Now, there are {NUMBER} main things you need to know:
First, {POINT1}. This is super important because {REASON1}.
Second, {POINT2}. A lot of people get this wrong, but {CLARIFICATION2}.
And finally, {POINT3}. This one's my favorite because {REASON3}.

Let me show you a quick example. So imagine {SCENARIO}. You would {ACTION}, and boom! {RESULT}. Pretty cool, right?

If you found this helpful, make sure to like and subscribe. Drop a comment below if you have any questions. See you in the next one!`
    },
    {
      title: "Educational Content",
      content: `Welcome to today's lesson on {SUBJECT}. I'm {INSTRUCTOR}, and over the next few minutes, we'll explore {LEARNING_OBJECTIVE}.

Let's start with the fundamentals. {CONCEPT} was first discovered in {YEAR} by {DISCOVERER}. What makes this interesting is {INTERESTING_FACT}.

Now, you might be wondering, "{QUESTION}?" Great question! The answer lies in understanding {KEY_PRINCIPLE}. 

Here's how it works:
Step one: {STEP1}
Step two: {STEP2}  
Step three: {STEP3}

Common mistakes to avoid:
- Don't {MISTAKE1}
- Always remember to {TIP1}
- Never forget that {PRINCIPLE1}

For your homework, I want you to {ASSIGNMENT}. This will help reinforce {LEARNING_POINT}.

In our next video, we'll cover {NEXT_TOPIC}. Until then, keep practicing!`
    }
  ]
};

/**
 * Replacement values for placeholders
 */
const replacements = {
  // Technical
  TITLE: ["REST", "GraphQL", "WebSocket", "Database", "Cache", "Queue"],
  SUBJECT: ["service", "platform", "system", "module", "component"],
  PURPOSE: ["data management", "real-time communication", "authentication", "file processing", "analytics"],
  VERSION: ["2.0", "3.1", "1.5", "4.0-beta", "2.3.1"],
  ENDPOINT: ["https://api.example.com", "http://localhost:3000", "wss://socket.example.com"],
  RESOURCE: ["users", "products", "orders", "messages", "tasks"],
  FRAMEWORK: ["React", "Vue", "Angular", "Express", "Django", "Rails"],
  TYPE: ["frontend", "backend", "full-stack", "mobile", "desktop"],
  LANGUAGE: ["javascript", "python", "java", "typescript", "go", "rust"],
  INSTALL_COMMAND: ["npm install package", "pip install library", "yarn add module"],
  
  // Narrative
  TIME: ["morning", "evening", "night", "dawn", "dusk", "afternoon"],
  WEATHER: ["foggy", "clear", "stormy", "peaceful", "chaotic", "mysterious"],
  CHARACTER: ["Alex", "Jordan", "Morgan", "Casey", "Taylor", "Quinn"],
  ACTION: ["walked", "ran", "crept", "wandered", "rushed", "stumbled"],
  LOCATION: ["forest", "city", "desert", "mountains", "ocean", "ruins"],
  EMOTION: ["Tension", "Joy", "Fear", "Wonder", "Sorrow", "Hope"],
  EVENT: ["the transformation", "the ceremony", "the storm", "the arrival", "the departure"],
  
  // Academic
  FIELD: ["Cognitive", "Behavioral", "Computational", "Environmental", "Social", "Clinical"],
  PHENOMENON: ["neuroplasticity", "emergence", "adaptation", "synchronization", "divergence"],
  VARIABLE1: ["exposure", "frequency", "intensity", "duration", "magnitude"],
  VARIABLE2: ["outcome", "performance", "response", "adaptation", "recovery"],
  STUDY_TYPE: ["longitudinal", "cross-sectional", "experimental", "observational", "meta-analytic"],
  N: ["127", "256", "512", "1024", "2048"],
  METHOD: ["surveys", "interviews", "observations", "experiments", "simulations"],
  ANALYSIS: ["ANOVA", "regression", "factor analysis", "SEM", "mixed models"],
  
  // Code
  ALGORITHM_NAME: ["QuickSort", "BinarySearch", "Dijkstra", "DFS", "BFS", "MergeSort"],
  FUNCTION_NAME: ["process", "calculate", "optimize", "validate", "transform"],
  TIME_COMPLEXITY: ["n", "log n", "n²", "n log n", "1", "2^n"],
  SPACE_COMPLEXITY: ["1", "n", "log n", "n²"],
  LANGUAGE: ["python", "javascript", "java", "cpp", "go", "rust"],
  CLASS_NAME: ["DataProcessor", "RequestHandler", "CacheManager", "EventEmitter"],
  
  // YouTube
  CHANNEL: ["TechExplained", "CodeMasters", "LearnWithMe", "DevTips", "ScienceSimplified"],
  TOPIC: ["cloud computing", "web development", "data science", "cybersecurity", "AI"],
  SKILL: ["debugging", "optimization", "deployment", "testing", "architecting"],
  INSTRUCTOR: ["Professor Smith", "Dr. Johnson", "Coach Williams", "Expert Lee"]
};

/**
 * Generates a document from a template
 */
function generateDocument(template: any, category: string, index: number): TestDocument {
  let content = template.content;
  
  // Replace all placeholders with random values
  const placeholderRegex = /{([A-Z_0-9]+)}/g;
  content = content.replace(placeholderRegex, (match, placeholder) => {
    const values = replacements[placeholder as keyof typeof replacements];
    if (values && Array.isArray(values)) {
      return values[Math.floor(Math.random() * values.length)];
    }
    // Generate random values for undefined placeholders
    return `value_${Math.floor(Math.random() * 100)}`;
  });
  
  return {
    id: `${category}-${String(index).padStart(3, '0')}`,
    category,
    content
  };
}

/**
 * Main function to generate test corpus
 */
function generateTestCorpus() {
  const corpus: TestDocument[] = [];
  const categories = Object.keys(templates);
  
  // Generate 20 documents per category (5 categories = 100 documents)
  // Plus 5 extra mixed documents
  const docsPerCategory = 20;
  
  categories.forEach(category => {
    const categoryTemplates = templates[category as keyof typeof templates];
    
    for (let i = 0; i < docsPerCategory; i++) {
      const template = categoryTemplates[i % categoryTemplates.length];
      const doc = generateDocument(template, category, i + 1);
      corpus.push(doc);
    }
  });
  
  // Add 5 mixed/hybrid documents
  for (let i = 0; i < 5; i++) {
    const mixedContent = `# Mixed Document ${i + 1}

## Technical Section
\`\`\`javascript
const result = await processData(input);
console.log(result);
\`\`\`

## Analysis
Research shows a correlation (r=0.75, p<0.01) between code quality and maintainability.

## Narrative
The team gathered around the monitor, watching as the deployment pipeline turned green. Years of work had led to this moment.

### Key Points:
1. Performance improved by 40%
2. User satisfaction increased
3. Technical debt reduced

Learn more at [documentation](https://example.com)`;
    
    corpus.push({
      id: `mixed-${String(i + 1).padStart(3, '0')}`,
      category: 'mixed',
      content: mixedContent
    });
  }
  
  // Save corpus to file
  const outputPath = path.join(__dirname, 'test-corpus.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ documents: corpus, total: corpus.length }, null, 2),
    'utf-8'
  );
  
  console.log(`✅ Generated ${corpus.length} test documents`);
  console.log(`📁 Saved to: ${outputPath}`);
  
  // Generate summary
  const summary = categories.reduce((acc, cat) => {
    acc[cat] = docsPerCategory;
    return acc;
  }, {} as Record<string, number>);
  summary['mixed'] = 5;
  
  console.log('\n📊 Document Distribution:');
  Object.entries(summary).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count} documents`);
  });
  
  return corpus;
}

// Execute if run directly
generateTestCorpus();

export { generateTestCorpus, generateDocument };