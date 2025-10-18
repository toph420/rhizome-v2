# Rhizome V2 Claude Code Skills

Custom skills for enforcing architectural patterns, naming conventions, and best practices in the Rhizome V2 codebase.

## What Are Skills?

Skills are markdown files that Claude Code automatically loads to understand project-specific patterns and conventions. They use progressive disclosure - only the name and description are loaded initially, with full details loaded when needed.

## Available Skills

### 1. **rhizome-architecture** 🏗️
**Enforces**: Server Components by default, Server Actions for mutations, dual-module separation

**Triggers**: Creating pages, components, Server Actions, reviewing architecture

**Key Patterns**:
- Server Components (no 'use client') unless hooks/events/browser APIs needed
- ALL mutations via Server Actions in `src/app/actions/*.ts`
- NEVER cross-import between `src/` and `worker/`

### 2. **rhizome-no-modals** 🚫
**Enforces**: No blocking modals (Dialog, AlertDialog, Modal)

**Triggers**: Creating UI components, implementing user interactions

**Key Patterns**:
- Use ProcessingDock (bottom-right) for background jobs
- Use RightPanel (6 tabs) for connections, annotations, sparks
- Use AdminPanel (Cmd+Shift+A overlay) for admin operations
- ONLY QuickSparkModal allowed (custom portal, not Dialog component)

### 3. **rhizome-naming** 📝
**Enforces**: Three-tier naming conventions

**Triggers**: Creating migrations, JSONB schemas, types, files

**Key Patterns**:
- Database columns: `snake_case`
- JSONB contents: `camelCase` (matches frontend)
- TypeScript variables: `camelCase`
- TypeScript types: `PascalCase`
- Files: `kebab-case`
- ALL JSONB validated with Zod

### 4. **rhizome-storage** 💾
**Enforces**: Hybrid storage strategy

**Triggers**: File uploads, storing markdown, exports, storage decisions

**Key Patterns**:
- Supabase Storage: Large files, immutable content (PDFs, markdown, exports)
- PostgreSQL: Queryable data (chunks, embeddings, connections, user data)
- Storage is source of truth, Database is queryable cache

### 5. **rhizome-ecs** 🎯
**Enforces**: Entity-Component-System for user-mutable data

**Triggers**: Creating annotations, flashcards, user-mutable features

**Key Patterns**:
- Use ECS for annotations, flashcards, study data
- Components: annotation, position, source, flashcard, study
- Flexible schema evolution without migrations
- Multi-faceted queries by component combinations

### 6. **rhizome-validation** ✅
**Enforces**: Zod validation for ALL worker outputs

**Triggers**: Creating worker handlers, updating job outputs

**Key Patterns**:
- ALL `output_data` JSONB MUST be validated
- Schemas in `worker/types/job-schemas.ts`
- Use `validateJobOutput(jobType, outputData)` before saving
- Prevents typos, ensures type safety

### 7. **rhizome-testing** 🧪
**Enforces**: Test by replaceability, use real fixtures

**Triggers**: Writing tests, reviewing test organization

**Key Patterns**:
- Critical tests (user work) MUST pass, block deploys
- Stable tests fix within 1 week
- Real fixtures from processed chunks, NOT Lorem Ipsum
- Categorize: critical/stable/flexible/experimental

### 8. **rhizome-worker** ⚙️
**Enforces**: Worker module patterns

**Triggers**: Working with `worker/` directory

**Key Patterns**:
- ProcessorRouter factory for 7 formats
- 3-engine orchestrator (NEVER bypass)
- Zod validation for all outputs
- NEVER cross-import with main app

## How Skills Work

### Automatic Triggering

Claude Code automatically loads skills when:
- File patterns match (e.g., working in `src/app/actions/` triggers rhizome-architecture)
- Keywords appear (e.g., "modal", "dialog" triggers rhizome-no-modals)
- Context matches skill description

You don't need to manually invoke skills - Claude does it automatically!

### Progressive Disclosure

1. **Startup**: Claude loads only name + description (few dozen tokens each)
2. **Trigger**: When context matches, Claude loads full skill content
3. **Efficiency**: Skills add ~200-300 tokens total, but individual skills only load when needed

### Skill Structure

Each skill is a directory with a `SKILL.md` file:

```
rhizome-architecture/
└── SKILL.md          # YAML frontmatter + instructions + examples
```

SKILL.md format:
```markdown
---
name: Skill Name
description: What this does and when to use it (max 1024 chars)
---

# Skill Name

## Instructions
[Step-by-step guidance]

## Examples
[Correct vs incorrect patterns]
```

## Using Skills in Development

### When Creating Components

Claude will automatically trigger **rhizome-architecture** and **rhizome-no-modals**:

```typescript
// ✅ Claude approves - Server Component, no modal
export default async function Page() {
  const data = await getData()
  return <List data={data} />
}

// ❌ Claude catches - unnecessary 'use client'
'use client'
export function StaticList({ items }) {
  return <ul>{items.map(i => <li>{i}</li>)}</ul>
}

// ❌ Claude blocks - forbidden modal
import { Dialog } from '@/components/ui/dialog'
<Dialog><Form /></Dialog>
```

### When Creating Mutations

Claude will automatically trigger **rhizome-architecture** and **rhizome-validation**:

```typescript
// ✅ Claude approves - Server Action with Zod validation
'use server'
const Schema = z.object({ text: z.string() })
export async function saveData(data: z.infer<typeof Schema>) {
  const validated = Schema.parse(data)
  await supabase.from('table').insert(validated)
}

// ❌ Claude catches - API route for mutation
export async function POST(request: Request) {
  await supabase.from('table').insert(data)
}
```

### When Working with Worker

Claude will automatically trigger **rhizome-worker** and **rhizome-validation**:

```typescript
// ✅ Claude approves - Through orchestrator with validation
const result = await processDocument(docId, {
  enabledEngines: ['semantic_similarity', 'thematic_bridge']
})
validateJobOutput('process_document', outputData)

// ❌ Claude catches - Bypassing orchestrator
await runSemanticSimilarity(docId)
await runThematicBridge(docId)
```

## Benefits

### 1. Automatic Pattern Enforcement

Claude automatically checks for violations:
- No modals → Suggests RightPanel or ProcessingDock
- Wrong naming → Corrects snake_case vs camelCase
- Missing validation → Adds Zod schema requirement

### 2. Reduced Context Usage

Skills use progressive disclosure:
- Only ~200-300 tokens total for all 8 skills
- Individual skills load only when triggered
- No need to paste documentation repeatedly

### 3. Consistent Code Quality

Every PR automatically follows:
- Architectural patterns (Server Components, Server Actions)
- Naming conventions (JSONB camelCase, files kebab-case)
- Storage strategy (Storage for files, DB for queries)
- Testing strategy (real fixtures, categorization)

### 4. Onboarding Efficiency

New developers (or AI agents) learn patterns automatically:
- Claude explains WHY patterns exist
- Shows correct vs incorrect examples
- Suggests fixes when violations detected

## Testing Skills

### Verify Skills Are Loaded

```bash
# Check skill directory structure
ls -la .claude/skills/*/SKILL.md

# Should show:
# rhizome-architecture/SKILL.md
# rhizome-no-modals/SKILL.md
# rhizome-naming/SKILL.md
# rhizome-storage/SKILL.md
# rhizome-ecs/SKILL.md
# rhizome-validation/SKILL.md
# rhizome-testing/SKILL.md
# rhizome-worker/SKILL.md
```

### Test Skill Triggering

Try these prompts to see skills in action:

```
"Create a new modal for creating flashcards"
→ Triggers rhizome-no-modals
→ Claude suggests RightPanel tab instead

"Add a new Server Action for saving annotations"
→ Triggers rhizome-architecture, rhizome-ecs, rhizome-validation
→ Claude creates Server Action with Zod validation and ECS

"Store the full markdown content in the database"
→ Triggers rhizome-storage
→ Claude recommends Supabase Storage instead

"Create a worker handler for processing documents"
→ Triggers rhizome-worker, rhizome-validation
→ Claude uses ProcessorRouter and orchestrator patterns
```

## Updating Skills

### When to Update

Update skills when:
- New architectural decisions emerge
- Anti-patterns are discovered
- Best practices evolve
- Team agrees on new conventions

### How to Update

1. Edit the relevant `SKILL.md` file
2. Update frontmatter description if scope changes
3. Add new examples to Instructions section
4. Document new anti-patterns in Examples section

Example:
```bash
# Edit skill
vim .claude/skills/rhizome-architecture/SKILL.md

# Claude Code automatically reloads on next session
```

## Advanced: Adding New Skills

### When to Create New Skill

Create a new skill when:
- Pattern appears in 3+ places
- Violation causes bugs or confusion
- Onboarding requires repeated explanation
- Code reviews catch same mistake repeatedly

### Skill Creation Process

1. **Identify Pattern**
   - What's the pattern?
   - When should it apply?
   - What are common violations?

2. **Create Skill Directory**
   ```bash
   mkdir -p .claude/skills/new-skill
   ```

3. **Write SKILL.md**
   ```markdown
   ---
   name: New Skill Name
   description: What it does and when to use it (max 1024 chars)
   ---

   # New Skill Name

   ## Instructions
   [Clear, step-by-step guidance]

   ## Examples
   ### ✅ Correct
   [Good patterns]

   ### ❌ Anti-Patterns
   [What to avoid]
   ```

4. **Test Skill**
   - Ask Claude questions that should trigger it
   - Verify Claude references the skill
   - Iterate description for better triggering

## Troubleshooting

### Skill Not Triggering

**Problem**: Claude doesn't reference skill when expected

**Solutions**:
1. Check description includes trigger keywords
2. Verify SKILL.md has valid YAML frontmatter
3. Restart Claude Code session
4. Make description more specific about when to use

### Skill Always Triggering

**Problem**: Skill loads even when not relevant

**Solutions**:
1. Make description more specific
2. Add context requirements ("Use when working with worker/ directory")
3. Reduce trigger keyword overlap with other skills

### Skill Content Outdated

**Problem**: Skill references old patterns

**Solutions**:
1. Update SKILL.md with current patterns
2. Add new anti-patterns as discovered
3. Remove deprecated examples

## Migration from CLAUDE.md

These skills replace patterns previously in `docs/CLAUDE.md`:

| CLAUDE.md Section | Skill |
|-------------------|-------|
| "No Modals" rule | rhizome-no-modals |
| Server Components pattern | rhizome-architecture |
| Naming conventions | rhizome-naming |
| Storage patterns | rhizome-storage |
| ECS implementation | rhizome-ecs |
| Zod validation | rhizome-validation |
| Testing rules | rhizome-testing |
| Worker patterns | rhizome-worker |

**Benefits of Migration**:
- Progressive disclosure (less context usage)
- Automatic triggering (no manual reference needed)
- Isolated updates (change one skill without affecting others)
- Better organization (one pattern per skill)

## Resources

### Internal Documentation

- `docs/CLAUDE.md` - Project-level instructions
- `docs/ARCHITECTURE.md` - System architecture
- `docs/UI_PATTERNS.md` - UI patterns
- `docs/STORAGE_PATTERNS.md` - Storage strategy
- `docs/ECS_IMPLEMENTATION.md` - ECS guide
- `docs/testing/TESTING_RULES.md` - Testing strategy

### External Resources

- [Claude Skills Documentation](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
- [Skills Cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/skills)
- [Creating Custom Skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)

---

**Last Updated**: 2025-10-18
**Skills Version**: 1.0
**Rhizome Version**: v2.0
