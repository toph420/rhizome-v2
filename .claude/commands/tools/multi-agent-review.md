---
model: sonnet
---

Perform comprehensive multi-agent code review with specialized reviewers:

[Extended thinking: This tool command invokes multiple review-focused agents to provide different perspectives on code quality, security, and architecture. Each agent reviews independently, then findings are consolidated.]

## Review Process

### 1. Codebase Analysis & Pattern Review
Use Task tool with subagent_type="codebase-analyst" to examine:
- Code organization and patterns
- Architectural pattern adherence
- Code duplication and reusability opportunities
- Naming conventions and coding standards
- Integration patterns between components
- Testing approaches and validation

Prompt: "Perform comprehensive codebase analysis of: $ARGUMENTS. Identify patterns, conventions, duplicate code, and reusability opportunities. Focus on maintainability and consistency. Provide specific file paths and line numbers."

### 2. Refactoring & Code Quality Review
Use Task tool with subagent_type="refactoring-expert" to examine:
- Code complexity and technical debt
- SOLID principles adherence
- Design patterns and anti-patterns
- Refactoring opportunities (without over-abstraction)
- Code simplification possibilities
- Quality metrics and improvements

Prompt: "Review code quality and identify refactoring opportunities for: $ARGUMENTS. Focus on reducing complexity, eliminating duplication, and improving maintainability. Provide specific recommendations with file paths."

### 3. Security Review
Use Task tool with subagent_type="security-engineer" to check:
- Authentication and authorization flaws
- Input validation and sanitization
- SQL injection and XSS vulnerabilities
- Sensitive data exposure
- Security misconfigurations
- OWASP compliance issues

Prompt: "Conduct comprehensive security review of: $ARGUMENTS. Identify vulnerabilities, assess risk severity, and provide remediation steps. Focus on Server Actions, ECS operations, and worker handlers."

### 4. Architecture Review
Use Task tool with subagent_type="architect-review" to evaluate:
- Architectural pattern compliance
- Service boundaries and coupling
- Scalability and performance considerations
- Design pattern appropriateness
- Data flow and dependencies
- Long-term maintainability

Prompt: "Review system architecture and design of: $ARGUMENTS. Evaluate architectural integrity, identify violations of stated patterns (ECS, dual-module, Server Actions, storage-first). Provide architectural recommendations."

## Consolidated Review Output

After all agents complete their reviews, consolidate findings into:

1. **Critical Issues** - Must fix before merge
   - Security vulnerabilities
   - Broken functionality
   - Major architectural flaws

2. **Important Issues** - Should fix soon
   - Performance problems
   - Code quality issues
   - Missing tests

3. **Minor Issues** - Nice to fix
   - Style inconsistencies
   - Documentation gaps
   - Refactoring opportunities

4. **Positive Findings** - Good practices to highlight
   - Well-designed components
   - Good test coverage
   - Security best practices

Target for review: $ARGUMENTS