---
description: Generate implementation spec (PRP) from decision
argument-hint: [decision file path]
allowed-tools: Read, Write, Glob, Grep, WebSearch
---

# Generate Implementation Spec

Read the decision file and:

1. **Extract Pattern Reference** (find exact file/lines to mirror)
2. **List Specific Changes** (which files, what modifications)
3. **Document Gotchas** (from similar code, libraries used)
4. **Create Validation Steps** (from package.json, manual tests)
5. **Add Context** (everything AI needs to implement)

Save to: `docs/prps/{feature-name}.md`

Optimize for: "Can AI implement this without asking questions?"