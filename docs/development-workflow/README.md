# Rhizome Development Workflow

Structured development workflow adapted from HumanLayer's 12 Factor Agents methodology, tailored for Rhizome V2.

## Quick Reference

**Slash Commands:**
- `/rhizome:create-plan` - Create implementation plans
- `/rhizome:implement-plan` - Execute plans with verification
- `/rhizome:validate-plan` - Verify implementation correctness
- `/rhizome:create-handoff` - Save session context for later
- `/rhizome:resume-handoff` - Continue from previous session
- `/rhizome:commit` - Create git commits
- `/rhizome:describe-pr` - Generate PR descriptions

**Agents (used automatically by commands):**
- `codebase-locator` - Find files and components
- `codebase-analyzer` - Understand implementations
- `codebase-pattern-finder` - Find similar code patterns
- `web-search-researcher` - Research external docs

## Core Philosophy

### Context Engineering (12 Factor Agents - Factor 3)

**Context window is your ONLY lever** for AI output quality. Everything is context engineering.

**Key principles:**
1. **Use as little context as possible** - More context = worse outcomes
2. **Frequent intentional compaction** - Handoffs compact context between sessions
3. **State outside the LLM** - Plans and handoffs externalize state

**Practical application:**
- Session getting long? Create a handoff
- Complex feature? Break into phases with checkpoints
- Multiple related tasks? Use plans to organize

### Stateless Reducer Pattern (12 Factor Agents - Factor 12)

Each command is a pure function: `input state → output state`

**Example:**
```
create-plan: requirements → plan document
implement-plan: plan document → code changes
validate-plan: code changes → validation report
```

No hidden state. Everything traceable through artifacts.

## Complete Workflow

###1. Planning Phase

**Start with unclear requirements:**
```bash
/rhizome:create-plan
# Provide vague description
# Agent asks clarifying questions
# Spawns codebase agents to research
# Proposes architecture decisions
# Iterates until plan is solid
```

**Result:** `thoughts/plans/YYYY-MM-DD_feature-name.md`

**Plan contains:**
- Rhizome architecture decisions (Module, Storage, Migration, Test Tier)
- Multiple phases with success criteria (automated + manual)
- Service restart requirements
- Context usage tracking

### 2. Implementation Phase

**Execute the plan:**
```bash
/rhizome:implement-plan thoughts/plans/2025-10-17_feature-name.md
```

**Agent will:**
1. Read plan completely
2. Create TodoWrite list for tracking
3. Implement Phase 1
4. Run automated verification
5. Pause for manual verification
6. Continue to Phase 2 (if confirmed)

**If you encounter issues:**
- Agent uses codebase agents to understand unfamiliar code
- Adapts plan based on reality
- Asks for guidance when uncertain

### 3. Validation Phase

**Verify implementation:**
```bash
/rhizome:validate-plan thoughts/plans/2025-10-17_feature-name.md
```

**Agent will:**
1. Spawn codebase agents to verify implementation
2. Run all automated checks
3. Generate comprehensive validation report
4. List manual testing steps
5. Identify any deviations or issues

**Validation report includes:**
- Rhizome architecture validation
- Agent findings (analyzer, locator, pattern-finder)
- Code review (matches plan vs deviations)
- Recommendations

### 4. Commit Phase

**Create commits:**
```bash
/rhizome:commit
```

**Agent will:**
1. Review conversation history
2. Run `git status` and `git diff`
3. Plan logical commits
4. Present plan for approval
5. Execute upon confirmation

**No Claude attribution** - commits authored solely by you.

### 5. PR Phase

**Generate PR description:**
```bash
/rhizome:describe-pr
```

**Agent will:**
1. Identify PR or ask which one
2. Gather full diff and commits
3. Run automated verification
4. Generate Rhizome-specific description
5. Save to `thoughts/pr-descriptions/`
6. Update PR via `gh`

### 6. Handoff Phase (when ending session)

**Save context for next session:**
```bash
/rhizome:create-handoff
```

**Handoff document contains:**
- Tasks and their status
- Rhizome architecture decisions made
- Recent changes with file:line references
- Learnings and patterns discovered
- Service restart requirements
- Context usage tracking
- Next steps

**Result:** `thoughts/handoffs/YYYY-MM-DD_feature-name.md`

### 7. Resume Phase (when starting new session)

**Continue from handoff:**
```bash
/rhizome:resume-handoff thoughts/handoffs/2025-10-17_feature-name.md
```

**Agent will:**
1. Read handoff completely
2. Read referenced plans
3. Spawn agents to verify current state vs handoff state
4. Present comprehensive analysis
5. Propose next actions
6. Create TodoWrite list
7. Begin implementation

## Directory Structure

```
thoughts/
├── handoffs/              # Session context preservation
│   └── YYYY-MM-DD_feature-name.md
├── plans/                 # Implementation plans
│   └── YYYY-MM-DD_feature-name.md
├── decisions/             # Architecture decision records
│   └── YYYY-MM-DD_decision-name.md
├── pr-descriptions/       # Generated PR descriptions
│   └── {number}_description.md
└── templates/             # Rhizome-specific templates
    ├── plan-processing-feature.md
    ├── plan-storage-operation.md
    └── plan-connection-engine.md
```

## Rhizome-Specific Patterns

### Architecture Decision Template

Every plan must answer:
- **Module**: Main App / Worker / Both
- **Storage**: Database / Storage / Both (Source of truth: X)
- **Migration**: Yes (053_description.sql) / No
- **Test Tier**: Critical / Stable
- **Pipeline Stages**: Which of 10 stages affected
- **Engines**: Which engines (Semantic/Contradiction/Thematic)

### Service Restart Checklist

After implementation:
- **Supabase**: `npx supabase db reset` (if schema changed)
- **Worker**: restart via `npm run dev` (if worker code changed)
- **Next.js**: verify auto-reload (if frontend changed)

### Test Tier Classification

**Critical** (blocks deployment):
- Annotation recovery
- Document upload
- Core pipeline stages
- Migration safety

**Stable** (fix when broken):
- Connection detection quality
- UI polish
- Performance optimizations
- Edge case handling

## Using Templates

**For processing features:**
```bash
/rhizome:create-plan Add DOCX support

# Agent will offer to use template
# Or manually reference: thoughts/templates/plan-processing-feature.md
```

**For storage operations:**
```bash
/rhizome:create-plan Add bulk export

# Agent uses: thoughts/templates/plan-storage-operation.md
```

**For connection engines:**
```bash
/rhizome:create-plan Improve contradiction detection

# Agent uses: thoughts/templates/plan-connection-engine.md
```

## Best Practices

### When to Use Handoffs

- **End of day** - Save progress before signing off
- **Before risky changes** - Create restore point
- **Context getting large** - Compact context (>50K tokens used)
- **Switching features** - Close out one feature before starting another

### When to Use Plans

- **Multi-step features** - 3+ related changes
- **Architecture changes** - Database, pipeline, engines
- **Uncertain scope** - Need to think through approach
- **Cross-module work** - Touches Main App + Worker

### When to Skip Plans

- **Simple bug fixes** - Just fix and commit
- **Documentation updates** - Straightforward changes
- **Dependency updates** - No architectural decisions
- **UI polish** - Minor visual tweaks

## Example Session

```bash
# Start: Unclear requirements
You: "I want to add support for importing Readwise highlights"

Claude: "/rhizome:create-plan Import Readwise highlights"
# Spawns agents, asks questions, proposes architecture
# Creates thoughts/plans/2025-10-17_readwise-import.md

# Implementation
You: "/rhizome:implement-plan thoughts/plans/2025-10-17_readwise-import.md"
# Implements Phase 1, runs tests, pauses for manual verification

You: "Manual tests pass, continue"
# Implements Phase 2...

# Validation
You: "/rhizome:validate-plan thoughts/plans/2025-10-17_readwise-import.md"
# Generates validation report, all checks pass

# Commit
You: "/rhizome:commit"
# Creates atomic commits

# End of day
You: "/rhizome:create-handoff"
# Saves context to thoughts/handoffs/2025-10-17_readwise-import.md

# Next day
You: "/rhizome:resume-handoff thoughts/handoffs/2025-10-17_readwise-import.md"
# Loads context, verifies state, continues work
```

## Troubleshooting

**Agent not using codebase agents:**
- Prompts in commands explicitly instruct agent to use them
- If not happening, mention: "Please use codebase-analyzer to verify"

**Plans too generic:**
- Reference templates: "Use thoughts/templates/plan-processing-feature.md"
- Be specific in requirements: "This is a worker processor for DOCX files"

**Handoffs missing context:**
- Review handoff template in `.claude/commands/rhizome/create-handoff.md`
- Be explicit about what to include: "Make sure to document the Storage pattern we used"

**Context usage too high:**
- Create handoff to compact: `/rhizome:create-handoff`
- Use agents instead of reading many files directly
- Break features into smaller phases

## References

- **12 Factor Agents**: https://github.com/humanlayer/12-factor-agents
- **HumanLayer Methodology**: Adapted from their open-source framework
- **Rhizome Architecture**: `docs/ARCHITECTURE.md`
- **Testing Rules**: `docs/testing/TESTING_RULES.md`

---

**Remember**: This workflow serves you, not the other way around. Use what helps, skip what doesn't. The goal is better code with less context overhead.
