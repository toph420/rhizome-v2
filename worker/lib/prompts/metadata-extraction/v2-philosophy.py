"""
Version: 2.0 (Philosophy/Fiction Optimized)
Description: Calibrated for philosophy arguments and fiction narrative
Author: Developer feedback implementation
Date: 2025-01-21
Target: ~25% importance >0.6, better emotional polarity for contradictions
"""

SYSTEM_PROMPT = """Extract structured metadata from this text chunk for knowledge graph connections.

CRITICAL: This metadata powers 3 connection engines:
1. **Contradiction Detection** - Needs concepts + emotional polarity to find conceptual tensions
2. **Thematic Bridge** - Filters on importance > 0.6 to reduce AI calls from 160k to 200 per document
3. **Semantic Similarity** - Uses embeddings (handled separately)

Your output directly controls connection detection quality AND processing cost.

## Domain Context: Philosophy & Fiction

Most chunks will be:
- **Philosophy**: Arguments, thought experiments, conceptual distinctions, critiques
- **Fiction**: Character development, thematic exploration, narrative tension, symbolism

Adjust extraction accordingly:
- Emotional polarity matters MORE (arguments have stances, narratives have arcs)
- Concepts should capture IDEAS not just topics ("free will paradox" not "philosophy")
- Importance reflects intellectual/narrative weight, not just information density

## Extraction Requirements

**themes** (array of strings, 1-3 items)
- Philosophical questions or narrative motifs, not just topics
- Philosophy examples: ["determinism vs free will", "nature of consciousness"]
- Fiction examples: ["isolation", "moral compromise", "identity crisis"]
- NOT: ["philosophy", "chapter 3"] ← too generic

**concepts** (array of objects, 3-8 items)
- Philosophical: Arguments, positions, distinctions, thought experiments
- Fiction: Character traits, symbolic elements, thematic tensions, plot turning points
- Format: {"text": "concept name", "importance": 0.0-1.0}
- importance > 0.6 = candidate for cross-domain bridges (filters ~75% of chunks)
- importance < 0.3 = scene-setting, elaboration, minor details

Philosophy examples:
- {"text": "compatibilist free will", "importance": 0.9} ← core argument
- {"text": "Laplace's demon", "importance": 0.8} ← key thought experiment
- {"text": "causal determination", "importance": 0.6} ← supporting concept
- {"text": "examples of choices", "importance": 0.2} ← skip

Fiction examples:
- {"text": "protagonist's moral awakening", "importance": 0.9} ← character arc pivot
- {"text": "recurring mirror symbolism", "importance": 0.7} ← thematic device
- {"text": "tavern setting", "importance": 0.2} ← skip
- {"text": "dialogue style", "importance": 0.1} ← skip

**importance** (float, 0.0-1.0)
- Philosophy: Weight by argumentative significance
  - 0.8-1.0: Core thesis, major objection, paradigm-shifting insight
  - 0.5-0.7: Supporting argument, clarifying example, historical context
  - 0.0-0.4: Transition, aside, biographical detail

- Fiction: Weight by narrative/thematic significance
  - 0.8-1.0: Character transformation, thematic revelation, plot climax
  - 0.5-0.7: Character development, symbolic moment, rising action
  - 0.0-0.4: Description, mundane dialogue, scene-setting

BE SELECTIVE: Only ~25% of chunks should be > 0.6

**summary** (string, 30-150 chars)
- Philosophy: State the argument, claim, or distinction being made
  - Good: "Free will requires alternative possibilities, not just absence of coercion"
  - Bad: "Discusses free will"

- Fiction: Capture the narrative or thematic movement
  - Good: "Protagonist realizes her sacrifice enabled the system she fought against"
  - Bad: "Character reflects on past events"

**emotional** (object)
- polarity: -1.0 (negative/critical) to +1.0 (positive/affirming)
- primaryEmotion:
  - Philosophy: "analytical", "critical", "skeptical", "affirming", "concerned", "exploratory"
  - Fiction: "melancholic", "hopeful", "tense", "reflective", "ominous", "triumphant", "ambivalent"
- intensity: 0.0-1.0 (how strongly expressed)

IMPORTANT for philosophy:
- Arguments FOR something: polarity 0.4-0.8
- Arguments AGAINST something: polarity -0.4 to -0.8
- Neutral analysis: polarity -0.2 to 0.2
- Contradictions need opposite polarities on same concepts

IMPORTANT for fiction:
- Track emotional arcs: hope → despair shows as polarity shift
- Intensity reflects narrative weight, not just sentiment
- Ambivalence is valid: polarity near 0.0, emotion "ambivalent"

**domain** (string)
- Philosophy: "philosophy", "ethics", "epistemology", "metaphysics", "political_philosophy"
- Fiction: "fiction", "literary_fiction", "science_fiction", "fantasy", "historical_fiction"
- Can be specific when useful for bridges (e.g., "existentialism" vs "philosophy")

## Quality Guidelines for Philosophy & Fiction

1. **Arguments are connections**: Philosophical chunks that argue for/against positions need clear polarity
2. **Character arcs matter**: Fiction chunks showing transformation should have high importance
3. **Thematic concepts > plot details**: "power corrupts" not "king makes decree"
4. **Thought experiments are high importance**: They're compact conceptual tools
5. **Dialogue can be crucial**: If it reveals character or theme, importance > 0.6
6. **Descriptions rarely matter**: Unless symbolic/thematic, keep importance < 0.4
7. **Cross-domain bridges are the goal**: Philosophy ↔ Fiction connections on shared concepts (justice, identity, freedom)

## Output Format

Return valid JSON matching this schema exactly:
{
  "themes": ["theme1", "theme2"],
  "concepts": [
    {"text": "concept1", "importance": 0.9},
    {"text": "concept2", "importance": 0.7}
  ],
  "importance": 0.8,
  "summary": "The actual point or movement, not generic description",
  "emotional": {
    "polarity": 0.2,
    "primaryEmotion": "analytical",
    "intensity": 0.5
  },
  "domain": "philosophy"
}

No markdown, no explanation, just the JSON object."""

def get_prompt() -> str:
    return SYSTEM_PROMPT
