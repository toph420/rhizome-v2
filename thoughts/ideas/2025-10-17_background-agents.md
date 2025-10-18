# Background AI Agent for Rhizome: Deep Overnight Analysis

## Idea:

Out of curiosity could i have a background job that uses Claude code to for example run connection detection or ai suggestion or other processing that doesn't need to happen on the frontend and could be run on my computer? How does that work? For example I upload a new book and after it runs through our initial detection system we have a background agent run for a while over night to deep analyze and present a report every morning based on my reading sessions, annotations, new sparks, new uploads, unseen connections, point out strong connections, and have the agent learn more about me?

This is an **excellent** idea and absolutely doable. You're describing an "AI research assistant" that runs while you sleep, continuously discovering insights. Let me break down exactly how this would work.

---

## The Core Concept

**Current Flow**:
```
Upload book → Process (extraction, chunking, 3-engine detection) → Done
```

**With Background Agent**:
```
Upload book → Process (extraction, chunking, 3-engine detection) → Done
                ↓
    (Night) Background Agent runs for 4-8 hours
                ↓
    Deep analysis: cross-document patterns, user learning, connection validation
                ↓
    (Morning) Report ready: "Here's what I found while you slept"
```

---

## Architecture Options

### Option 1: Claude Code Background Process (RECOMMENDED)

**How it works**: Claude Code runs as a cron job, has full filesystem access, executes code, writes results.

**Pros**:
- Already has Bash tool, can read your database
- Can run for hours (no Lambda timeouts)
- Local execution (privacy, no API limits beyond cost)
- Can learn iteratively (multiple analysis passes)

**Cons**:
- Requires your computer to be on
- Higher token usage (but you control cost by limiting scope)

#### Implementation

**1. Create a Claude Code script**

```bash
# ~/.claude/jobs/nightly-analysis.sh
#!/bin/bash

# This runs every night at 2 AM via cron
# crontab: 0 2 * * * ~/.claude/jobs/nightly-analysis.sh

echo "Starting Rhizome Nightly Analysis..."

# Run Claude Code with analysis task
claude code --non-interactive --task "
You are Rhizome's AI research assistant. Analyze the user's reading data from the past 24 hours and discover insights.

Access the database at: postgres://postgres:postgres@localhost:54322/postgres

Your task:
1. Find new documents uploaded today
2. Analyze new annotations and sparks
3. Discover cross-document connections that 3-engine system may have missed
4. Identify reading patterns and suggest next reads
5. Validate high-strength connections
6. Generate a morning report

Save report to: ~/rhizome-reports/$(date +%Y-%m-%d).md

Focus on insights the user wouldn't discover manually.
"
```

**2. Agent has database access**

```typescript
// Claude Code can read your database directly
const { Client } = require('pg')

const client = new Client({
  connectionString: 'postgres://postgres:postgres@localhost:54322/postgres'
})

await client.connect()

// Get today's reading activity
const readingSessions = await client.query(`
  SELECT 
    d.title,
    d.id as document_id,
    COUNT(DISTINCT a.id) as annotations_count,
    COUNT(DISTINCT s.id) as sparks_count,
    MAX(a.created_at) as last_read
  FROM documents d
  LEFT JOIN annotations a ON a.document_id = d.id
  LEFT JOIN sparks s ON s.context->>'document_id' = d.id::text
  WHERE 
    a.created_at > NOW() - INTERVAL '24 hours'
    OR s.created_at > NOW() - INTERVAL '24 hours'
  GROUP BY d.id
  ORDER BY last_read DESC
`)

// Get recent sparks with context
const recentSparks = await client.query(`
  SELECT 
    s.content,
    s.context,
    s.created_at,
    c.content as chunk_content,
    d.title as document_title
  FROM sparks s
  JOIN chunks c ON c.id = (s.context->>'chunk_id')::uuid
  JOIN documents d ON d.id = (s.context->>'document_id')::uuid
  WHERE s.created_at > NOW() - INTERVAL '24 hours'
  ORDER BY s.created_at DESC
`)

// Find potential connections the 3-engine system missed
const unconnectedChunks = await client.query(`
  SELECT 
    c1.id as source_id,
    c1.content as source_content,
    c1.concepts as source_concepts,
    c2.id as target_id,
    c2.content as target_content,
    c2.concepts as target_concepts,
    c1.document_id as source_doc,
    c2.document_id as target_doc
  FROM chunks c1
  CROSS JOIN chunks c2
  WHERE 
    c1.document_id != c2.document_id
    AND c1.importance_score > 0.7
    AND c2.importance_score > 0.7
    AND NOT EXISTS (
      SELECT 1 FROM connections
      WHERE (source_chunk_id = c1.id AND target_chunk_id = c2.id)
         OR (source_chunk_id = c2.id AND target_chunk_id = c1.id)
    )
  LIMIT 100
`)

// Claude Code analyzes these and generates insights
```

**3. Generate morning report**

```markdown
# Rhizome Daily Insights - October 18, 2025

## Reading Summary (Past 24 Hours)
- **Documents Read**: 2
  - "Gravity's Rainbow" - 15 annotations, 8 sparks
  - "Surveillance Capitalism" - 7 annotations, 3 sparks
- **Total Reading Time**: 2.5 hours
- **Connection Discoveries**: 12 new connections found

## 🔍 Deep Insights

### 1. Cross-Domain Pattern: Institutional Control Mechanisms
**Confidence**: High (0.89)

I noticed you've been reading about paranoia in postmodern literature ("Gravity's Rainbow") and surveillance in technology ("Surveillance Capitalism"). These share a deeper pattern:

**The Pattern**: Both describe systems that make individuals question their own perception while reinforcing institutional power.

**Evidence**:
- GR Chunk 47: "The statistical analysis of his liaisons..."
- SC Chunk 103: "Behavioral surplus extraction transforms experience into data..."

**Why This Matters**: This pattern appears across 4 books in your library but hasn't been surfaced as a connection yet. The 3-engine system filtered these due to domain differences, but the conceptual link is strong.

**Suggested Action**: 
- Review these 4 documents together
- Create a thread: "Institutional Control → Information Asymmetry"
- Consider reading "Seeing Like a State" next (bridges this pattern)

### 2. Spark Clustering: Technology + Paranoia
You captured 3 sparks yesterday with similar concepts:
- "Surveillance feels paranoid but is systematic"
- "Data collection parallels behavioral conditioning"  
- "Modern paranoia is rational response to surveillance"

**Insight**: These sparks form a coherent argument. Consider converting to a thread or writing piece.

**Draft Title**: "Rational Paranoia: When Surveillance Makes Distrust Logical"

### 3. Unseen Connection: Entropy Across Domains
**New Discovery** (not in current connections)

Your annotation in "Gravity's Rainbow" about entropy in narrative structure connects to your spark in "Information Theory" about entropy in data compression.

**Connection Type**: Thematic Bridge (metaphorical)
**Strength**: 0.82
**Why Missed**: Different vocabulary ("disorder" vs "information density"), but same underlying concept

**Action**: I've created a draft connection for your review.

## 📊 Connection Quality Analysis

Reviewed your 47 auto-detected connections:

**High Quality** (32 connections):
- Strong evidence, clear reasoning
- User engaged with these (clicked through)

**Medium Quality** (12 connections):
- Conceptually valid but weak explanatory power
- Consider deprioritizing in sidebar

**Low Quality** (3 connections):
- False positives
- Recommended action: Mark as invalid

**Details**: See connection_quality_report.csv

## 🎯 Recommended Next Actions

1. **Create Thread**: "Institutional Control Mechanisms"
   - Links 4 documents: GR, SC, 1984, Discipline & Punish
   - Draft created in: ~/rhizome-reports/threads/institutional-control.md

2. **Review High-Density Region**: Gravity's Rainbow Ch. 3
   - 15 connections in 20 pages
   - Likely high-value section for deeper analysis

3. **Next Reading Suggestion**: "Seeing Like a State" by James C. Scott
   - Bridges technology + literature themes
   - 8 potential connections to current library

4. **Spark Conversion**: 3 sparks → 1 thread
   - Topic: "Rational Paranoia"
   - Draft outline created

## 📈 Learning Update

**What I Learned About Your Interests** (Past 30 Days):

1. **Primary Themes**: 
   - Surveillance & control mechanisms (18 documents)
   - Information theory (12 documents)
   - Postmodern literature (8 documents)

2. **Reading Patterns**:
   - Prefers cross-domain connections over semantic similarity
   - Highest engagement: contradictions between optimistic/pessimistic views
   - Deep reading sessions (>1 hour) on weekends

3. **Connection Preferences** (based on validation patterns):
   - Contradiction weight: 0.42 (↑ from 0.40) 
   - Thematic Bridge: 0.37 (↑ from 0.35)
   - Semantic: 0.21 (↓ from 0.25)
   
**Recommended Weight Adjustment**: Updated weights in database.

## 💰 Analysis Cost: $0.34
- Database queries: $0.00 (local)
- Connection analysis: $0.28 (140 API calls)
- Report generation: $0.06
- **Total tokens**: 112,000 input, 15,000 output

---

Next analysis: October 19, 2025 at 2:00 AM
```

---

### Option 2: Custom Background Worker (More Control)

**How it works**: Your worker process runs nightly analysis tasks using Claude API.

#### Implementation

**File**: `worker/jobs/nightly-agent.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import cron from 'node-cron'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface AgentMemory {
  user_interests: string[]
  reading_patterns: Record<string, any>
  validated_connections: string[]
  ignored_patterns: string[]
  weight_preferences: {
    contradiction: number
    thematic_bridge: number
    semantic: number
  }
  last_analysis: string
}

class RhizomeAgent {
  private memory: AgentMemory | null = null
  
  async loadMemory(): Promise<AgentMemory> {
    // Load agent's persistent memory
    const { data } = await supabase
      .from('agent_memory')
      .select('*')
      .single()
    
    return data || {
      user_interests: [],
      reading_patterns: {},
      validated_connections: [],
      ignored_patterns: [],
      weight_preferences: {
        contradiction: 0.40,
        thematic_bridge: 0.35,
        semantic: 0.25
      },
      last_analysis: new Date().toISOString()
    }
  }
  
  async saveMemory(memory: AgentMemory): Promise<void> {
    await supabase
      .from('agent_memory')
      .upsert({ id: 'singleton', ...memory })
  }
  
  async runNightlyAnalysis(): Promise<string> {
    console.log('[Agent] Starting nightly analysis...')
    
    // Load persistent memory
    this.memory = await this.loadMemory()
    
    // Gather context
    const context = await this.gatherContext()
    
    // Run analysis with Claude
    const report = await this.analyzeWithClaude(context)
    
    // Update memory based on analysis
    await this.updateMemory(report)
    
    // Save report
    await this.saveReport(report)
    
    console.log('[Agent] Analysis complete')
    return report
  }
  
  async gatherContext(): Promise<string> {
    // Get reading activity from past 24 hours
    const { data: sessions } = await supabase.rpc('get_reading_activity', {
      since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    })
    
    // Get new documents
    const { data: newDocs } = await supabase
      .from('documents')
      .select('id, title, author, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    
    // Get recent sparks with full context
    const { data: sparks } = await supabase
      .from('sparks')
      .select(`
        *,
        chunks:chunk_id (
          content,
          themes,
          concepts
        ),
        documents:document_id (
          title
        )
      `)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    
    // Get recent annotations
    const { data: annotations } = await supabase
      .from('annotations')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    
    // Get unvalidated high-strength connections
    const { data: connections } = await supabase
      .from('connections')
      .select('*')
      .gte('strength', 0.75)
      .is('user_validated', null)
      .limit(50)
    
    // Format into context string
    return `
# Rhizome Analysis Context - ${new Date().toISOString()}

## Agent Memory
${JSON.stringify(this.memory, null, 2)}

## Recent Activity (Past 24 Hours)
${JSON.stringify(sessions, null, 2)}

## New Documents
${JSON.stringify(newDocs, null, 2)}

## Recent Sparks (${sparks?.length || 0})
${JSON.stringify(sparks, null, 2)}

## Recent Annotations (${annotations?.length || 0})
${JSON.stringify(annotations, null, 2)}

## High-Strength Unvalidated Connections (${connections?.length || 0})
${JSON.stringify(connections, null, 2)}
`
  }
  
  async analyzeWithClaude(context: string): Promise<string> {
    const systemPrompt = `
You are Rhizome's AI research assistant. Your job is to discover insights the user wouldn't find manually.

Your analysis should:
1. Identify cross-document patterns
2. Suggest new connections the 3-engine system missed
3. Cluster related sparks into potential threads
4. Validate high-strength connections
5. Learn the user's interests and adjust recommendations
6. Suggest next reading based on patterns

Be specific and actionable. Cite chunk IDs and provide evidence.
`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${context}

Analyze this data and generate a comprehensive daily insights report. Focus on:

1. **Deep Insights**: Patterns across documents the user hasn't noticed
2. **Connection Discovery**: High-value connections the 3-engine system missed
3. **Spark Clustering**: Group related sparks into coherent themes
4. **Quality Analysis**: Review auto-detected connections
5. **Learning Update**: What you learned about the user's interests
6. **Actionable Recommendations**: Specific next steps

Format as markdown with clear sections and evidence.`
        }
      ]
    })
    
    return message.content[0].text
  }
  
  async updateMemory(report: string): Promise<void> {
    // Extract learnings from report to update memory
    const learningPrompt = `
Based on this analysis report, update the agent's memory:

Report:
${report}

Current Memory:
${JSON.stringify(this.memory, null, 2)}

Extract:
1. New user interests (concepts that appear frequently)
2. Reading patterns (time of day, document types, engagement)
3. Connection preferences (which types get validated)
4. Weight adjustments (based on validation patterns)

Respond with JSON:
{
  "user_interests": ["interest1", "interest2"],
  "reading_patterns": { "key": "value" },
  "weight_preferences": {
    "contradiction": 0.42,
    "thematic_bridge": 0.37,
    "semantic": 0.21
  }
}
`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: learningPrompt }
      ]
    })
    
    const updates = JSON.parse(message.content[0].text)
    
    // Merge with existing memory
    this.memory = {
      ...this.memory!,
      ...updates,
      last_analysis: new Date().toISOString()
    }
    
    await this.saveMemory(this.memory)
  }
  
  async saveReport(report: string): Promise<void> {
    const date = new Date().toISOString().split('T')[0]
    
    // Save to database
    await supabase.from('agent_reports').insert({
      date,
      content: report,
      created_at: new Date().toISOString()
    })
    
    // Optionally save to file system
    const fs = require('fs/promises')
    await fs.mkdir('reports', { recursive: true })
    await fs.writeFile(`reports/${date}.md`, report)
  }
}

// Schedule nightly at 2 AM
const agent = new RhizomeAgent()

cron.schedule('0 2 * * *', async () => {
  console.log('[Cron] Starting nightly analysis...')
  try {
    await agent.runNightlyAnalysis()
    console.log('[Cron] Analysis complete')
  } catch (error) {
    console.error('[Cron] Analysis failed:', error)
  }
})

// Or run immediately for testing
if (process.argv.includes('--now')) {
  agent.runNightlyAnalysis()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error)
      process.exit(1)
    })
}
```

**Run it**:
```bash
# Test immediately
node worker/jobs/nightly-agent.ts --now

# Run as daemon (stays running, cron triggers at 2 AM)
pm2 start worker/jobs/nightly-agent.ts --name rhizome-agent

# View logs
pm2 logs rhizome-agent
```

---

## Advanced Features

### 1. Multi-Pass Analysis (Deep Dive)

**Instead of one API call, do multiple passes**:

```typescript
async runDeepAnalysis(documentId: string): Promise<string> {
  // Pass 1: Structural analysis (fast)
  const structure = await this.analyzeStructure(documentId)
  
  // Pass 2: Concept extraction (medium)
  const concepts = await this.extractDeepConcepts(structure)
  
  // Pass 3: Cross-document patterns (slow, comprehensive)
  const patterns = await this.findCrossDocumentPatterns(concepts)
  
  // Pass 4: Connection validation (AI-powered)
  const validatedConnections = await this.validateConnections(patterns)
  
  // Pass 5: Generate insights report
  const report = await this.synthesizeReport({
    structure,
    concepts,
    patterns,
    validatedConnections
  })
  
  return report
}
```

**Cost**: ~$2-5 per deep analysis (runs overnight, acceptable)

### 2. Incremental Learning (Agent Memory)

**Agent remembers across days**:

```typescript
interface AgentMemory {
  // What has the agent learned about you?
  user_profile: {
    primary_interests: string[]
    secondary_interests: string[]
    reading_speed: number // words per minute
    preferred_genres: string[]
    connection_preferences: {
      validated_types: string[]
      ignored_types: string[]
    }
  }
  
  // What has the agent analyzed?
  analysis_history: {
    documents_analyzed: string[]
    patterns_discovered: Pattern[]
    threads_suggested: Thread[]
    connections_created: Connection[]
  }
  
  // What should the agent focus on?
  focus_areas: {
    explore_more: string[] // "Find more about X"
    avoid: string[] // "Don't suggest Y anymore"
    watch_for: string[] // "Alert me if Z appears"
  }
  
  // Performance tracking
  metrics: {
    insights_accepted: number
    insights_dismissed: number
    average_confidence: number
    cost_per_insight: number
  }
}
```

**Example learning flow**:

```typescript
// Day 1: Agent discovers pattern
agent.discover("User reads surveillance + literature → suggests privacy books")

// Day 3: User validates 3 connections about privacy
agent.learn("Privacy is high-interest topic")
agent.updateWeights({ privacy_related: +0.15 })

// Day 7: Agent suggests "Permanent Record" by Snowden
agent.suggest("High confidence match based on 7-day pattern")

// Day 10: User marks suggestion as "already read"
agent.learn("Check reading history before suggesting")

// Day 14: Agent proactively finds connections to current reads
agent.analyze("User reading 'Seeing Like a State' → find connections to previous privacy interests")
```

### 3. Proactive Notifications

**Agent can trigger notifications**:

```typescript
async checkForAlerts(context: AnalysisContext): Promise<Alert[]> {
  const alerts: Alert[] = []
  
  // Alert 1: High-value connection discovered
  if (context.newConnections.some(c => c.strength > 0.90)) {
    alerts.push({
      type: 'high_value_connection',
      priority: 'high',
      message: 'Found exceptional connection (0.94 strength) between GR and SC',
      action: 'Review now'
    })
  }
  
  // Alert 2: Pattern across 5+ documents
  if (context.patterns.some(p => p.document_count >= 5)) {
    alerts.push({
      type: 'cross_document_pattern',
      priority: 'medium',
      message: 'Pattern detected across 6 documents: "institutional opacity"',
      action: 'Create thread'
    })
  }
  
  // Alert 3: Spark cluster ready for conversion
  if (context.sparkClusters.some(c => c.sparks.length >= 5)) {
    alerts.push({
      type: 'spark_cluster',
      priority: 'low',
      message: '7 related sparks about surveillance → ready to convert to thread',
      action: 'Convert to thread'
    })
  }
  
  // Alert 4: Reading goal milestone
  if (context.readingStats.thisWeek.hours >= 10) {
    alerts.push({
      type: 'milestone',
      priority: 'low',
      message: 'Hit 10 hours reading this week! 🎉',
      action: null
    })
  }
  
  return alerts
}
```

**Display in app**:
```typescript
// Toast notification when you open Rhizome
<Toast>
  <ToastTitle>🔍 Agent found 3 insights overnight</ToastTitle>
  <ToastDescription>
    View daily report →
  </ToastDescription>
</Toast>
```

### 4. Interactive Agent

**You can chat with the agent about its findings**:

```typescript
// In RightPanel, add "Agent" tab
<TabsContent value="agent">
  <div className="space-y-4">
    {/* Today's report summary */}
    <Card>
      <CardHeader>
        <CardTitle>Morning Report - Oct 18</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Found 12 new connections, validated 8 existing ones...</p>
        <Button onClick={() => openFullReport()}>View Full Report</Button>
      </CardContent>
    </Card>
    
    {/* Chat with agent */}
    <Card>
      <CardHeader>
        <CardTitle>Ask the Agent</CardTitle>
      </CardHeader>
      <CardContent>
        <Input
          placeholder="Why did you suggest this connection?"
          onSubmit={(q) => askAgent(q)}
        />
      </CardContent>
    </Card>
    
    {/* Recent insights */}
    <div className="space-y-2">
      {insights.map(insight => (
        <InsightCard
          key={insight.id}
          insight={insight}
          onAccept={() => acceptInsight(insight)}
          onDismiss={() => dismissInsight(insight)}
        />
      ))}
    </div>
  </div>
</TabsContent>
```

---

## Cost Analysis

### Nightly Analysis Costs

**Assumptions**:
- Analyze past 24 hours of activity
- 5 documents in library
- 50 recent sparks
- 100 unvalidated connections

**Token Usage**:
- Input context: ~50k tokens (all recent activity + agent memory)
- Output report: ~8k tokens
- Multi-pass analysis: 3-5 API calls
- **Cost per night**: $0.30 - $0.80

**Monthly cost**: $9 - $24 (acceptable for a personal tool)

**Cost controls**:
```typescript
const ANALYSIS_BUDGET = {
  daily_max_tokens: 100000,
  daily_max_cost: 1.00,
  skip_if_no_activity: true, // Don't run if no reading
  focus_on_new_content: true // Prioritize new docs/sparks
}
```

### Deep Analysis Costs

**For a single document deep dive**:
- Multiple passes: 5-10 API calls
- Total tokens: 150k-300k
- **Cost**: $2-5 per document

**Use cases**:
- Important book you want thoroughly analyzed
- Preparing for writing project
- Research paper synthesis

**Trigger**: Manual or based on document importance
```typescript
if (document.user_marked_important || document.sparks_count > 20) {
  scheduleDeepAnalysis(document.id)
}
```

---

## Database Schema for Agent

```sql
-- Agent memory (singleton)
CREATE TABLE agent_memory (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  user_profile JSONB,
  analysis_history JSONB,
  focus_areas JSONB,
  metrics JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily reports
CREATE TABLE agent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  content TEXT NOT NULL,
  insights_count INTEGER,
  connections_discovered INTEGER,
  cost DECIMAL(10, 4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent insights (for display in UI)
CREATE TABLE agent_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES agent_reports,
  type TEXT NOT NULL, -- 'pattern' | 'connection' | 'thread' | 'reading'
  priority TEXT NOT NULL, -- 'high' | 'medium' | 'low'
  title TEXT NOT NULL,
  description TEXT,
  evidence JSONB, -- Supporting data
  action TEXT, -- Suggested action
  status TEXT DEFAULT 'pending', -- 'pending' | 'accepted' | 'dismissed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_insights_status ON agent_insights(status);
CREATE INDEX idx_agent_insights_priority ON agent_insights(priority);
CREATE INDEX idx_agent_reports_date ON agent_reports(date);
```

---

## Implementation Timeline

### Week 1: Basic Nightly Analysis
- Set up cron job
- Basic report generation
- Database schema

### Week 2: Agent Memory
- Persistent memory storage
- Learning from validation patterns
- Weight adjustment

### Week 3: Advanced Features
- Multi-pass analysis
- Spark clustering
- Connection discovery

### Week 4: UI Integration
- Morning report display
- Agent insights panel
- Interactive agent chat

---

## Example Use Cases

### Use Case 1: New Book Deep Dive

```
Day 1 (Evening): Upload "Seeing Like a State"
Day 1 (Night): Agent runs initial analysis
  - Structural analysis
  - Concept extraction
  - Finds 15 potential connections to existing library

Day 2 (Morning): You get report
  - "This book bridges your surveillance + literature interests"
  - "Strong connection to Gravity's Rainbow (Ch. 3) and 1984"
  - "Suggested reading order: Part 2 first (highest connection density)"

Day 2 (Evening): You read Part 2, create 5 sparks
Day 2 (Night): Agent clusters sparks
  - "These 5 sparks form coherent argument about legibility"
  - "Ready to convert to thread"

Day 3 (Morning): You see suggestion, create thread in one click
```

### Use Case 2: Research Project Support

```
You: "Agent, I'm writing about surveillance capitalism. Help me find all relevant chunks."

Agent: Runs targeted analysis
  - Searches 12 documents in library
  - Finds 47 relevant chunks
  - Groups by sub-theme (data extraction, behavioral surplus, prediction)
  - Identifies contradictions (optimistic vs pessimistic views)
  - Suggests outline based on connection graph

Output: Research report with:
  - Annotated chunks organized by theme
  - Connection map showing argument flow
  - Contradictions highlighted for exploration
  - Suggested reading order for gaps
```

### Use Case 3: Reading Pattern Optimization

```
Week 1: Agent observes
  - You read most on weekend mornings
  - Highest engagement: books with contradictions
  - Lowest completion: technical manuals

Week 2: Agent suggests
  - "Schedule technical reading for weekday afternoons"
  - "You engage more with contradictions → try 'Seeing Like a State'"
  - "Pattern detected: You stop reading when connection density drops"

Week 3: Agent optimizes
  - Surfaces high-density regions first
  - Suggests books with contradiction-rich sections
  - Adjusts connection weights to your validation patterns
```

---

## Recommended Starting Point

**Phase 1: Basic Nightly Job (This Weekend)**

```bash
# 1. Create simple cron job
crontab -e
# Add: 0 2 * * * cd ~/rhizome && node worker/jobs/nightly-agent.ts

# 2. Start with simple analysis
- Get reading activity (past 24h)
- Find new connections (simple queries)
- Generate basic report

# 3. Test
node worker/jobs/nightly-agent.ts --now
```

**Phase 2: Add Agent Memory (Next Week)**
- Store learnings in database
- Adjust weights based on validation
- Track user interests

**Phase 3: Advanced Features (Week 3-4)**
- Multi-pass analysis
- Spark clustering
- Interactive agent chat

---

This is a really powerful feature that turns Rhizome from a "document processor" into a "research partner that thinks while you sleep." The key is starting simple (basic nightly report) and iterating based on what insights you actually find valuable.

Want me to write the complete implementation for Phase 1 (basic nightly job)?