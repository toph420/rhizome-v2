# Quick Start Guide: Prompt Experimentation

**Purpose**: Get started with the Prompt Experimentation Framework in 5 minutes
**Full Documentation**: `docs/EXPERIMENTAL_FRAMEWORK.md`

## Prerequisites (One-Time Setup)

**1. Ensure Ollama is Running**
```bash
# Check if Ollama is running
ollama list

# If not running, start it
ollama serve

# Verify model is available
ollama list | grep qwen2.5:32b
```

**2. Verify Environment Variables**
```bash
# Check your .env.local has:
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b
```

## First Experiment (5 minutes)

**1. Start the App**
```bash
npm run dev
# Navigate to http://localhost:3000/experiments/prompts
```

**2. Test Metadata Extraction**
- Click **"Philosophy"** sample button (loads Foucault text)
- **Prompt A**: Select `v1: Baseline`
- **Prompt B**: Select `v2: Philosophy/Fiction`
- Click **"Run Both Tests"**
- Wait ~3-4 seconds for results

**3. Compare Results**

Look for these key differences:

| Metric | v1-Baseline | v2-Philosophy | What to Look For |
|--------|-------------|---------------|------------------|
| **Concepts** | Generic ("power", "society") | Specific ("disciplinary power", "panopticon design") | ✅ More specific is better |
| **Importance** | Often ~0.5-0.6 | Should be ~0.7-0.9 for philosophy | ✅ Higher for substantive content |
| **Polarity** | Often neutral (~0.0) | Should detect stance (-0.6 for critique, +0.6 for affirmation) | ✅ Captures argumentative tone |
| **Concepts >0.6** | ~30-40% | Should be ~25% (selective) | ✅ Quality over quantity |

**4. Export & Document**
- Click **"Export Comparison"**
- Save markdown file to `thoughts/experiments/` (create folder)
- Document what worked/what didn't

## Testing Bridge Detection

**1. Switch to Bridge Tab**
- Click **"Thematic Bridge"** tab

**2. Use Default Sample** (Sartre → Fiction)
- Pre-loaded: Philosophy (bad faith) + Fiction (role-playing)
- **Prompt Version**: Try `v1: Baseline` first
- **Min Strength**: Keep at 0.6
- Click **"Test Bridge Detection"**

**3. What to Expect**
- ✅ Should find a bridge (both about identity/roles/choice)
- **Strength**: Should be 0.7-0.9 (strong conceptual connection)
- **Bridge Type**: "conceptual" or "argumentative"
- **Explanation**: Should reference both summaries naturally
- **Bridge Concepts**: ["bad faith", "role-playing", "identity"]

**4. Try Different Versions**
- Switch to `v2: Improved`
- Re-run same chunks
- Compare explanation quality and strength calibration

## Iterating on Prompts

**When you want to improve a prompt:**

**1. Identify Problem**
```
Example: "v1-baseline gives everything importance 0.5-0.6, need better calibration"
```

**2. Copy Existing Prompt**
```bash
cp worker/lib/prompts/metadata-extraction/v2-philosophy.py \
   worker/lib/prompts/metadata-extraction/v3-technical.py
```

**3. Make ONE Change**
```python
# Example: Adjust importance scoring for technical content
"""
**importance_score** (0.0-1.0)
- 0.9-1.0: Core API contract, breaking change, security issue
- 0.6-0.8: Feature documentation, configuration, common pattern
- 0.3-0.5: Example code, boilerplate
- 0.0-0.2: Comments, whitespace, formatting
"""
```

**4. Register the Prompt**
```typescript
// worker/lib/prompts/metadata-extraction/registry.ts
{
  id: 'v3-technical',
  version: '3.0',
  description: 'Calibrated for technical documentation',
  // ... rest
}

// src/app/actions/experiments/get-prompt-versions.ts (duplicate entry)

// src/components/experiments/MetadataTestPanel.tsx (add to dropdown)
<SelectItem value="v3-technical">v3: Technical</SelectItem>
```

**5. Test Immediately**
```bash
npx next build  # Verify no errors
npm run dev     # Test in UI
```

## What to Look For

### Good Signs ✅
- **Concepts are specific**: "compatibilist free will" not "philosophy"
- **Importance is selective**: Only ~25% of chunks >0.6
- **Polarity matches tone**: Arguments have strong polarity, analysis is neutral
- **Summaries are precise**: "Argues X" not "Discusses X"
- **Bridges are non-obvious**: Not "both mention time" but "both explore temporal paradox through narrative"

### Red Flags 🚩
- Everything has importance ~0.5 (no calibration)
- All polarity near 0.0 (missing emotional tone)
- Generic concepts ("topic", "idea", "thing")
- Summaries just restate content
- Bridges state the obvious

## Daily Workflow

```bash
# Morning: Start services
ollama serve &
npm run dev

# Test a hypothesis
# 1. Edit prompt file
# 2. Update registry
# 3. Rebuild: npx next build
# 4. Test in UI
# 5. Export results
# 6. Document in thoughts/experiments/

# When satisfied
# → Update production prompts
# → Commit changes
```

## Quick Reference

| Task | Command/Path |
|------|-------------|
| Access UI | `http://localhost:3000/experiments/prompts` |
| Python prompts | `worker/lib/prompts/metadata-extraction/*.py` |
| Bridge prompts | `worker/lib/prompts/thematic-bridge/*.ts` |
| Test Python | `python3 worker/scripts/extract_metadata_pydantic.py --prompt-version=v2-philosophy` |
| Rebuild | `npx next build` |
| Full Docs | `docs/EXPERIMENTAL_FRAMEWORK.md` |

## First Real Experiment: Test Your Domain

**Try this now:**

1. Find a chunk of text from YOUR documents (philosophy, fiction, tech, etc.)
2. Paste into UI
3. Run v1-baseline vs v2-philosophy
4. Ask yourself:
   - Did v2 capture the argument/narrative better?
   - Is the importance score reasonable?
   - Does polarity match the tone?
5. If not → Create v3 with your improvements!

## Troubleshooting

**UI shows "Test failed"**
- Check Ollama is running: `ollama list`
- Check console for errors: Open browser DevTools (F12)

**Prompt not appearing in dropdown**
- Did you rebuild? `npx next build`
- Did you update all 3 places? (worker registry, action registry, UI dropdown)

**Build fails**
- Check for syntax errors in your prompt file
- Verify Python has valid `get_prompt()` function
- Check TypeScript registry syntax

## Next Steps

Once comfortable with the UI:
1. Read full documentation: `docs/EXPERIMENTAL_FRAMEWORK.md`
2. Create your first custom prompt
3. Test on 10+ chunks from your documents
4. Export and document results
5. Deploy to production when confident

---

**Ready to experiment!** Start with the built-in samples, then move to your own content.
