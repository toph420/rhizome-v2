# Metadata Quality Validation Report

Generated: 2025-09-30T06:23:30.381Z
Configuration: Mock Extraction

## Executive Summary

- **Total Chunks Tested**: 8
- **Pass Rate**: 0.0% (0/8)
- **Average Completeness**: 35.9% (Target: 90%)
- **Average F1 Score**: 0.0% (Target: 85%)

## Quality Metrics

| Metric | Average | Target | Status |
|--------|---------|--------|--------|
| Completeness | 35.9% | 90% | ❌ |
| Precision | 0.0% | 85% | ❌ |
| Recall | 0.0% | 85% | ❌ |
| F1 Score | 0.0% | 85% | ❌ |

## Performance Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Average Time | 6ms | <400ms | ✅ |
| P90 Time | 25ms | - | - |
| P95 Time | 25ms | - | - |
| P99 Time | 25ms | - | - |

## Detailed Results

### Failed Chunks

- **tech-001-0**
  - Completeness: 33.3%
  - F1 Score: 0.0%
  - Time: 25ms
  - Missing: structural.headingLevel, structural.listItems, structural.codeBlocks, conceptual.concepts, methods, domain.field
- **tech-001-1**
  - Completeness: 33.3%
  - F1 Score: 0.0%
  - Time: 3ms
  - Missing: structural.headingLevel, structural.listItems, structural.codeBlocks, conceptual.concepts, methods, domain.field
- **narr-001-0**
  - Completeness: 37.5%
  - F1 Score: 0.0%
  - Time: 2ms
  - Missing: emotional.sentiment, emotional.intensity, narrative.perspective, narrative.tense, conceptual.concepts
- **acad-001-0**
  - Completeness: 33.3%
  - F1 Score: 0.0%
  - Time: 2ms
  - Missing: structural.citations, references.citations, conceptual.concepts, domain.field
- **code-001-0**
  - Completeness: 16.7%
  - F1 Score: 0.0%
  - Time: 8ms
  - Missing: structural.codeBlocks, structural.codeLanguage, methods, conceptual.concepts, domain.field
- **yt-001-0**
  - Completeness: 55.6%
  - F1 Score: 0.0%
  - Time: 1ms
  - Missing: structural.paragraphs, emotional.sentiment, conceptual.concepts, domain.field
  - Incorrect: narrative.style
- **web-001-0**
  - Completeness: 44.4%
  - F1 Score: 0.0%
  - Time: 4ms
  - Missing: structural.headingLevel, structural.listItems, references.citations, conceptual.concepts, domain.field
- **mixed-001-0**
  - Completeness: 33.3%
  - F1 Score: 0.0%
  - Time: 2ms
  - Missing: structural.headingLevel, structural.codeBlocks, structural.tableRows, methods, conceptual.concepts, domain.field

### Common Issues

Most frequently missing fields:
- conceptual.concepts: 8 occurrences (100.0%)
- domain.field: 7 occurrences (87.5%)
- structural.headingLevel: 4 occurrences (50.0%)
- structural.codeBlocks: 4 occurrences (50.0%)
- methods: 4 occurrences (50.0%)

## Recommendations

- **Improve Completeness**: Current 35.9% is below target 90%
  - Review metadata extraction prompts
  - Ensure all engines are functioning correctly
- **Improve Accuracy**: F1 score 0.0% is below target 85%
  - Fine-tune extraction logic for specific content types
  - Add more context to AI prompts

## Conclusion

❌ **FAILED**: The metadata extraction system does not meet all quality targets.
Please review the recommendations above and iterate on the implementation.
