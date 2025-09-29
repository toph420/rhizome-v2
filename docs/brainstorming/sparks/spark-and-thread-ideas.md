## Spark & Thread Systems Breakdown

### Sparks (Quick Capture System)
**Purpose**: Capture fleeting thoughts WITH their full context

**Components**:
- **Content**: The actual thought/idea
- **ContextRef**: What you were doing when it hit (reading chunk X, viewing connection Y, exploring thread Z)
- **Timestamp**: When this occurred
- **Mood/Energy**: Optional - your mental state

**Key Design Choice**: Sparks aren't isolated notes - they're **contextualized reactions** to your knowledge graph. The system knows you weren't just randomly thinking about capitalism, but specifically reacting to Deleuze while having Pynchon connections visible.

### Threads (Synthesis System)
**Purpose**: Grow connections into actual creative output

**Components**:
- **ConnectionRef[]**: Array of relevant connections
- **SparkRef[]**: Related sparks that fed into this thread
- **ChunkRef[]**: Direct chunk references
- **State**: `embryonic → growing → mature → archived`
- **OutputRef**: Link to any writing/creation that emerged

**Key Design Choice**: Threads grow **aggressively** - the system promotes connections to threads quickly rather than waiting for "enough" evidence.

## The Relationship Chain

```
Chunks → Connections → Collisions → Sparks → Threads → Creation
```

1. **Chunks** exist (from documents)
2. **Connections** form between chunks (via detection engines)
3. **Collisions** surface high-value connections based on your scoring
4. **Sparks** capture your reactions to these collisions
5. **Threads** aggregate related sparks/connections into workable projects
6. **Creation** happens when threads mature into actual output

## Example Flow: The Deleuze-Pynchon-Capitalism Thread

### Day 1: Initial Reading
```
09:00 - Upload "Gravity's Rainbow" notes
        → 47 chunks created
        → 200+ connections detected (all stored)

09:30 - Reading chunk about "Slothrop's conditioning"
        → Sidebar shows 12 connections
        → Top connection: Deleuze's "Societies of Control" essay
        → Connection type: STRUCTURAL_ISOMORPHISM
        → Strength: 0.89
```

### Day 2: The Spark Moment
```
14:00 - Reading Deleuze chunk on "modulation of control"
        → You see the Pynchon connection is active
        → CREATE SPARK: "Control isn't about confinement anymore - 
          it's about modulation. Slothrop isn't imprisoned, he's 
          frequency-modulated by the system"
        → Spark automatically captures:
          - ChunkRef: Deleuze chunk #34
          - ConnectionRef: Deleuze-Pynchon connection
          - Context: "reading_mode"
          - Related visible connections: 5 others
```

### Day 3: Thread Formation
```
10:00 - System notices:
        - 3 sparks reference capitalism + control
        - 8 high-strength connections between related chunks
        - Your validation pattern shows interest
        
        → AUTO-CREATES THREAD: "Control-Modulation-Capitalism"
        → Initial state: embryonic
        → Includes: 3 sparks, 8 connections, 12 relevant chunks

10:15 - You open the thread
        → Add manual connection to Burroughs "Control Machine"
        → Thread state → growing
        → System aggressively suggests more connections
        → You validate/dismiss, training the weights
```

### Day 7: Thread Matures
```
Thread now contains:
- 15 sparks
- 34 connections (different types)
- 3 contradiction tensions you're working through
- 1 draft essay (linked as OutputRef)

System notifications:
- "New Foucault upload has 4 connections to Control-Modulation thread"
- "Contradiction detected: Your March notes on 'Freedom' conflict with thread thesis"
```

## Critical Design Decisions

1. **Sparks without connections are valid** - Sometimes you just need to capture a thought while reading, even if it doesn't connect yet

2. **Threads can merge** - Two growing threads that share enough connections can suggest merger

3. **Anti-patterns** - You can mark "this spark DOESN'T belong in this thread" to train the system

4. **Thread decay** - Threads you don't touch for 30 days get archived but retain their connections

The whole system is built to **capture thinking in motion** rather than just store static knowledge.