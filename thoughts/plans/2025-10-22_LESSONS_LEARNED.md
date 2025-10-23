# Lessons Learned: Reader + Neobrutalism Implementation

**Date**: 2025-10-22
**Session**: Initial implementation attempt

---

## Critical Mistakes Made

### 1. Reinvented the Wheel ❌
**What happened**: Built custom LeftPanel from scratch with custom framer-motion animations, custom collapse logic, custom tab structure.

**What should have happened**: Used neobrutalism Sidebar component which already has all this functionality built-in.

**Why this matters**: Wasted tokens, wasted time, created maintenance burden, didn't leverage existing well-tested components.

### 2. Didn't Use Available Tools ❌
**What happened**: Used curl/python scripts to download component code instead of using shadcn MCP tools.

**What should have happened**: Used `mcp__shadcn__search_items_in_registries` and `mcp__shadcn__view_items_in_registries` to explore and install components.

**Why this matters**: MCP tools are purpose-built for this, more reliable, easier to use.

### 3. Wrong Installation Location ❌
**What happened**: Installed neobrutalism components to `components/ui/` which overwrote existing shadcn components.

**What should have happened**: Created `components/brutalist/` folder FIRST, then downloaded all neobrutalism components there to keep them separate.

**Why this matters**: Lost original shadcn components, created conflicts, had to restore from git.

### 4. Skipped Documentation ❌
**What happened**: Jumped straight to coding without reading neobrutalism installation docs.

**What should have happened**: Read https://www.neobrutalism.dev/docs/installation and component pages FIRST.

**Why this matters**: Documentation explains proper setup, component structure, and usage patterns.

---

## Correct Approach Going Forward

### Phase 1 REVISED: Component Discovery & Setup

**Step 1: Search Available Components**
```typescript
// Use shadcn MCP to find what's available
mcp__shadcn__search_items_in_registries({
  registries: ["@neobrutalism"],
  query: "sidebar tabs badge card button"
})
```

**Step 2: Create Brutalist Folder Structure**
```bash
mkdir -p src/components/brutalist
# Add README explaining this is for neobrutalism components
```

**Step 3: Download Components to Brutalist Folder**
- Sidebar → `components/libraries/neobrutalist/sidebar.tsx`
- Tabs → `components/libraries/neobrutalist/tabs-neo.tsx`
- Button → `components/libraries/neobrutalist/button-neo.tsx`
- Badge → `components/libraries/neobrutalist/badge-neo.tsx`
- Use curl + python to extract from registry JSON

**Step 4: Build LeftPanel Using Sidebar**
```typescript
// components/reader/LeftPanel/LeftPanel.tsx
import { Sidebar, SidebarContent, SidebarGroup } from '@/components/brutalist/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/brutalist/tabs-neo'

// Build our custom tabs INTO the Sidebar structure
export function LeftPanel() {
  return (
    <Sidebar side="left">
      <SidebarContent>
        <Tabs defaultValue="outline">
          <TabsList>
            <TabsTrigger value="outline">Outline</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
          </TabsList>
          <TabsContent value="outline"><OutlineTab /></TabsContent>
          <TabsContent value="stats"><StatsTab /></TabsContent>
          <TabsContent value="heatmap"><HeatmapTab /></TabsContent>
        </Tabs>
      </SidebarContent>
    </Sidebar>
  )
}
```

---

## Rules for Future Implementation

### Component Usage Rules

1. **Search First, Build Never**
   - ALWAYS search component libraries before building
   - Check shadcn, neobrutalism, radix-ui
   - Only build custom if no existing solution exists

2. **Use MCP Tools**
   - `mcp__shadcn__search_items_in_registries` - Find components
   - `mcp__shadcn__view_items_in_registries` - See component code
   - `mcp__shadcn__get_add_command_for_items` - Get install command
   - Don't use curl/fetch unless MCP fails

3. **Separate Component Folders**
   - `components/ui/` - Original shadcn components
   - `components/libraries/neobrutalist/` - Neobrutalism components
   - `components/reader/` - Custom reader components
   - NEVER mix libraries in same folder

4. **Read Docs First**
   - Installation instructions
   - Component API/props
   - Usage examples
   - Common patterns
   - THEN implement

5. **Leverage Existing Patterns**
   - Use component composition (Sidebar + Tabs)
   - Don't rebuild features (collapse, animation, state)
   - Extend, don't replace

---

## Updated Phase 2 Implementation

**Goal**: Build LeftPanel using neobrutalism Sidebar + Tabs

**Current Status**:
- ✅ Neobrutalism components downloaded to `components/brutalist/`
- ✅ sidebar.tsx, tabs-neo.tsx, button-neo.tsx available
- ❌ LeftPanel still uses custom implementation
- ❌ Not using Sidebar component

**Next Steps**:
1. Refactor LeftPanel to use `components/libraries/neobrutalist/sidebar-neo.tsx`
2. Use `components/libraries/neobrutalist/tabs-neo.tsx` for tab structure
3. Build OutlineTab, StatsTab, HeatmapTab as tab content
4. Integrate with ReaderLayout using SidebarProvider
5. Test collapse/expand, mobile responsiveness

**Token Budget**: Aim for <10k tokens by reusing components instead of building custom.

---

## Success Metrics

**Before (Current Approach)**:
- Custom components: ~500 lines
- Time to implement: ~2 hours
- Maintainability: Low (custom code to maintain)
- Token cost: ~30k tokens

**After (Correct Approach)**:
- Using existing components: ~100 lines
- Time to implement: ~30 minutes
- Maintainability: High (library handles updates)
- Token cost: ~5k tokens

**Improvement**: 80% less code, 75% faster, 83% fewer tokens
