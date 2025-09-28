import type { MockConnection } from '@/types/annotations'

/**
 * Mock connection dataset for weight tuning UI testing.
 * Provides realistic connection examples across all 7 synthesis engines.
 * 
 * Schema matches real connections table exactly (snake_case).
 * 
 * **Distribution**:
 * - 7 examples per engine type (7 engines × 7 = 49 connections)
 * - Strength distribution: 10 weak (0.3-0.5), 25 medium (0.5-0.7), 14 strong (0.7-1.0)
 * - Diverse connection types and realistic explanations
 * 
 * **Engine Types**:
 * - semantic: Direct semantic similarity
 * - thematic: Cross-domain conceptual bridges
 * - structural: Pattern and architecture isomorphisms
 * - contradiction: Productive disagreements and challenges
 * - emotional: Mood, tone, and affective resonance
 * - methodological: Similar analytical approaches
 * - temporal: Narrative rhythm and temporal patterns
 * 
 * @returns Array of 49 mock connections for testing
 */
export const MOCK_CONNECTIONS: MockConnection[] = [
  // ===== SEMANTIC ENGINE (7 examples) =====
  {
    id: 'mock-sem-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc2-chunk12',
    target_document_title: 'Deep Learning Fundamentals',
    target_snippet: 'Neural networks learn hierarchical representations by composing simple features into complex patterns...',
    engine_type: 'semantic',
    connection_type: 'supports',
    strength: 0.92,
    explanation: 'Both discuss hierarchical feature learning in neural architectures'
  },
  {
    id: 'mock-sem-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc3-chunk8',
    target_document_title: 'Information Theory',
    target_snippet: 'Entropy measures the uncertainty in a probability distribution...',
    engine_type: 'semantic',
    connection_type: 'extends',
    strength: 0.78,
    explanation: 'Extends discussion with formal information-theoretic framework'
  },
  {
    id: 'mock-sem-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc4-chunk5',
    target_document_title: 'Cognitive Science Perspectives',
    target_snippet: 'The brain processes information through distributed representations across cortical regions...',
    engine_type: 'semantic',
    connection_type: 'parallels',
    strength: 0.65,
    explanation: 'Parallel concepts between artificial and biological neural processing'
  },
  {
    id: 'mock-sem-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc5-chunk19',
    target_document_title: 'Signal Processing Basics',
    target_snippet: 'Fourier transforms decompose signals into frequency components...',
    engine_type: 'semantic',
    connection_type: 'references',
    strength: 0.58,
    explanation: 'References shared mathematical foundations in signal analysis'
  },
  {
    id: 'mock-sem-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc6-chunk3',
    target_document_title: 'Pattern Recognition Methods',
    target_snippet: 'Template matching compares input against stored prototypes...',
    engine_type: 'semantic',
    connection_type: 'supports',
    strength: 0.71,
    explanation: 'Both address pattern matching mechanisms'
  },
  {
    id: 'mock-sem-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc7-chunk14',
    target_document_title: 'Statistical Learning Theory',
    target_snippet: 'Generalization bounds depend on model complexity and sample size...',
    engine_type: 'semantic',
    connection_type: 'extends',
    strength: 0.45,
    explanation: 'Provides theoretical foundation for generalization concepts'
  },
  {
    id: 'mock-sem-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc8-chunk21',
    target_document_title: 'Quantum Computing Primer',
    target_snippet: 'Superposition allows quantum bits to represent multiple states simultaneously...',
    engine_type: 'semantic',
    connection_type: 'parallels',
    strength: 0.38,
    explanation: 'Weak semantic similarity in information representation concepts'
  },

  // ===== THEMATIC ENGINE (7 examples) =====
  {
    id: 'mock-them-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc9-chunk7',
    target_document_title: 'The Structure of Scientific Revolutions',
    target_snippet: 'Paradigm shifts occur when anomalies accumulate and force reconsideration of foundational assumptions...',
    engine_type: 'thematic',
    connection_type: 'parallels',
    strength: 0.87,
    explanation: 'Both explore how fundamental frameworks evolve through crisis and breakthrough'
  },
  {
    id: 'mock-them-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc10-chunk15',
    target_document_title: 'Innovation and Creativity',
    target_snippet: 'Breakthrough innovations emerge from recombining existing ideas in novel configurations...',
    engine_type: 'thematic',
    connection_type: 'supports',
    strength: 0.79,
    explanation: 'Shared theme of emergence from combinatorial processes'
  },
  {
    id: 'mock-them-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc11-chunk4',
    target_document_title: 'Complex Systems Theory',
    target_snippet: 'Self-organization arises from local interactions without central control...',
    engine_type: 'thematic',
    connection_type: 'extends',
    strength: 0.72,
    explanation: 'Extends theme of emergent properties in distributed systems'
  },
  {
    id: 'mock-them-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc12-chunk9',
    target_document_title: 'Historical Patterns in Technology',
    target_snippet: 'General-purpose technologies transform entire economic sectors over decades...',
    engine_type: 'thematic',
    connection_type: 'parallels',
    strength: 0.64,
    explanation: 'Similar themes of transformative impact across domains'
  },
  {
    id: 'mock-them-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc13-chunk18',
    target_document_title: 'Evolution of Language',
    target_snippet: 'Languages evolve through gradual drift and occasional rapid shifts...',
    engine_type: 'thematic',
    connection_type: 'parallels',
    strength: 0.55,
    explanation: 'Thematic parallel in evolutionary dynamics'
  },
  {
    id: 'mock-them-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc14-chunk6',
    target_document_title: 'Social Network Dynamics',
    target_snippet: 'Information cascades propagate through network structures based on connectivity patterns...',
    engine_type: 'thematic',
    connection_type: 'supports',
    strength: 0.48,
    explanation: 'Weak thematic connection around propagation dynamics'
  },
  {
    id: 'mock-them-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc15-chunk11',
    target_document_title: 'Market Efficiency Debates',
    target_snippet: 'Asset prices reflect all available information in efficient markets...',
    engine_type: 'thematic',
    connection_type: 'references',
    strength: 0.35,
    explanation: 'Tangential thematic link through information processing'
  },

  // ===== STRUCTURAL ENGINE (7 examples) =====
  {
    id: 'mock-struct-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc16-chunk13',
    target_document_title: 'Architectural Patterns in Software',
    target_snippet: 'The Model-View-Controller pattern separates concerns into three interconnected components...',
    engine_type: 'structural',
    connection_type: 'parallels',
    strength: 0.85,
    explanation: 'Isomorphic structural decomposition into modular components'
  },
  {
    id: 'mock-struct-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc17-chunk2',
    target_document_title: 'Graph Theory Applications',
    target_snippet: 'Tree structures provide hierarchical organization with parent-child relationships...',
    engine_type: 'structural',
    connection_type: 'supports',
    strength: 0.76,
    explanation: 'Both rely on hierarchical tree structures'
  },
  {
    id: 'mock-struct-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc18-chunk20',
    target_document_title: 'Biological Systems Organization',
    target_snippet: 'Organs compose tissues, tissues compose cells, cells compose molecules...',
    engine_type: 'structural',
    connection_type: 'parallels',
    strength: 0.69,
    explanation: 'Structural similarity in nested compositional hierarchy'
  },
  {
    id: 'mock-struct-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc19-chunk16',
    target_document_title: 'Linguistic Syntax Trees',
    target_snippet: 'Sentences parse into phrase structures with nested constituents...',
    engine_type: 'structural',
    connection_type: 'parallels',
    strength: 0.61,
    explanation: 'Shared tree-structured parsing approach'
  },
  {
    id: 'mock-struct-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc20-chunk8',
    target_document_title: 'Database Normalization',
    target_snippet: 'Third normal form eliminates transitive dependencies between attributes...',
    engine_type: 'structural',
    connection_type: 'extends',
    strength: 0.53,
    explanation: 'Extends structural organization principles to data modeling'
  },
  {
    id: 'mock-struct-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc21-chunk5',
    target_document_title: 'Mathematical Proof Strategies',
    target_snippet: 'Inductive proofs establish base cases then prove recursive steps...',
    engine_type: 'structural',
    connection_type: 'supports',
    strength: 0.44,
    explanation: 'Similar structural approach to building arguments'
  },
  {
    id: 'mock-struct-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc22-chunk17',
    target_document_title: 'Urban Planning Principles',
    target_snippet: 'Neighborhoods organize around central hubs with radial connections...',
    engine_type: 'structural',
    connection_type: 'parallels',
    strength: 0.32,
    explanation: 'Weak structural analogy in hub-spoke organization'
  },

  // ===== CONTRADICTION ENGINE (7 examples) =====
  {
    id: 'mock-contra-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc23-chunk10',
    target_document_title: 'Critique of Pure Reason',
    target_snippet: 'Empiricism alone cannot generate necessary truths about the world...',
    engine_type: 'contradiction',
    connection_type: 'contradicts',
    strength: 0.91,
    explanation: 'Direct contradiction on epistemological foundations'
  },
  {
    id: 'mock-contra-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc24-chunk14',
    target_document_title: 'Alternative Perspectives on Learning',
    target_snippet: 'Explicit instruction outperforms discovery learning in novice domains...',
    engine_type: 'contradiction',
    connection_type: 'challenges',
    strength: 0.82,
    explanation: 'Contradicts assumptions about optimal learning approaches'
  },
  {
    id: 'mock-contra-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc25-chunk7',
    target_document_title: 'Counterexamples in Mathematics',
    target_snippet: "Cantor's diagonal argument proves some infinities are larger than others...",
    engine_type: 'contradiction',
    connection_type: 'contradicts',
    strength: 0.74,
    explanation: 'Provides counterexample to intuitive size assumptions'
  },
  {
    id: 'mock-contra-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc26-chunk19',
    target_document_title: 'Economic Policy Debates',
    target_snippet: 'Evidence suggests minimum wage increases reduce employment opportunities...',
    engine_type: 'contradiction',
    connection_type: 'contradicts',
    strength: 0.67,
    explanation: 'Contradicts policy assumptions with empirical evidence'
  },
  {
    id: 'mock-contra-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc27-chunk3',
    target_document_title: 'Cognitive Biases Research',
    target_snippet: 'Experts exhibit confirmation bias despite methodological training...',
    engine_type: 'contradiction',
    connection_type: 'challenges',
    strength: 0.56,
    explanation: 'Challenges assumptions about expertise and objectivity'
  },
  {
    id: 'mock-contra-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc28-chunk12',
    target_document_title: 'Historical Revisionism',
    target_snippet: 'New archaeological evidence contradicts previous chronologies...',
    engine_type: 'contradiction',
    connection_type: 'contradicts',
    strength: 0.49,
    explanation: 'Evidence-based contradiction of established timelines'
  },
  {
    id: 'mock-contra-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc29-chunk16',
    target_document_title: 'Alternative Explanatory Models',
    target_snippet: 'Correlation does not imply causation in observational studies...',
    engine_type: 'contradiction',
    connection_type: 'challenges',
    strength: 0.37,
    explanation: 'Challenges inferential assumptions weakly'
  },

  // ===== EMOTIONAL ENGINE (7 examples) =====
  {
    id: 'mock-emot-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc30-chunk9',
    target_document_title: 'The Emotional Brain',
    target_snippet: 'Fear responses bypass conscious processing through amygdala pathways...',
    engine_type: 'emotional',
    connection_type: 'supports',
    strength: 0.68,
    explanation: 'Shared emotional resonance around fear and urgency'
  },
  {
    id: 'mock-emot-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc31-chunk6',
    target_document_title: 'Narrative and Empathy',
    target_snippet: 'Stories activate mirror neurons and foster emotional understanding...',
    engine_type: 'emotional',
    connection_type: 'extends',
    strength: 0.61,
    explanation: 'Extends emotional dimension through narrative mechanisms'
  },
  {
    id: 'mock-emot-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc32-chunk18',
    target_document_title: 'Motivation and Goal-Setting',
    target_snippet: 'Intrinsic motivation sustains effort better than external rewards...',
    engine_type: 'emotional',
    connection_type: 'supports',
    strength: 0.54,
    explanation: 'Connected through emotional satisfaction and drive'
  },
  {
    id: 'mock-emot-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc33-chunk11',
    target_document_title: 'Aesthetic Experience',
    target_snippet: 'Beauty elicits pleasure through harmony and proportion...',
    engine_type: 'emotional',
    connection_type: 'parallels',
    strength: 0.47,
    explanation: 'Parallel emotional responses to structured patterns'
  },
  {
    id: 'mock-emot-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc34-chunk4',
    target_document_title: 'Stress and Performance',
    target_snippet: 'Optimal arousal follows an inverted-U curve...',
    engine_type: 'emotional',
    connection_type: 'references',
    strength: 0.42,
    explanation: 'References emotional state impact on cognition'
  },
  {
    id: 'mock-emot-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc35-chunk15',
    target_document_title: 'Social Connection and Well-being',
    target_snippet: 'Loneliness activates pain circuitry in the brain...',
    engine_type: 'emotional',
    connection_type: 'supports',
    strength: 0.39,
    explanation: 'Weak emotional link through social pain'
  },
  {
    id: 'mock-emot-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc36-chunk8',
    target_document_title: 'Decision-Making Under Uncertainty',
    target_snippet: 'Risk aversion intensifies under emotional duress...',
    engine_type: 'emotional',
    connection_type: 'extends',
    strength: 0.31,
    explanation: 'Tangential emotional dimension in decision contexts'
  },

  // ===== METHODOLOGICAL ENGINE (7 examples) =====
  {
    id: 'mock-method-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc37-chunk13',
    target_document_title: 'Experimental Design Principles',
    target_snippet: 'Randomized controlled trials minimize confounding variables...',
    engine_type: 'methodological',
    connection_type: 'supports',
    strength: 0.89,
    explanation: 'Both apply rigorous experimental methodology'
  },
  {
    id: 'mock-method-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc38-chunk7',
    target_document_title: 'Statistical Power Analysis',
    target_snippet: 'Sample size calculations ensure adequate power to detect effects...',
    engine_type: 'methodological',
    connection_type: 'extends',
    strength: 0.81,
    explanation: 'Extends methodological rigor through power considerations'
  },
  {
    id: 'mock-method-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc39-chunk20',
    target_document_title: 'Qualitative Research Methods',
    target_snippet: 'Grounded theory builds concepts inductively from data patterns...',
    engine_type: 'methodological',
    connection_type: 'parallels',
    strength: 0.73,
    explanation: 'Parallel but different methodological approaches'
  },
  {
    id: 'mock-method-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc40-chunk2',
    target_document_title: 'Meta-Analysis Techniques',
    target_snippet: 'Combining effect sizes across studies increases statistical precision...',
    engine_type: 'methodological',
    connection_type: 'extends',
    strength: 0.66,
    explanation: 'Methodologically extends through synthesis techniques'
  },
  {
    id: 'mock-method-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc41-chunk17',
    target_document_title: 'Measurement Validity',
    target_snippet: 'Construct validity requires convergent and discriminant evidence...',
    engine_type: 'methodological',
    connection_type: 'supports',
    strength: 0.59,
    explanation: 'Shared focus on measurement rigor'
  },
  {
    id: 'mock-method-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc42-chunk10',
    target_document_title: 'Replication Studies',
    target_snippet: 'Direct replications test the robustness of original findings...',
    engine_type: 'methodological',
    connection_type: 'extends',
    strength: 0.50,
    explanation: 'Extends methodological validation approaches'
  },
  {
    id: 'mock-method-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc43-chunk14',
    target_document_title: 'Mixed Methods Research',
    target_snippet: 'Triangulation combines qualitative and quantitative evidence...',
    engine_type: 'methodological',
    connection_type: 'references',
    strength: 0.40,
    explanation: 'References multi-method integration weakly'
  },

  // ===== TEMPORAL ENGINE (7 examples) =====
  {
    id: 'mock-temp-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc44-chunk6',
    target_document_title: 'Narrative Structure in Film',
    target_snippet: 'Three-act structure builds tension through rising action to climax...',
    engine_type: 'temporal',
    connection_type: 'parallels',
    strength: 0.80,
    explanation: 'Parallel temporal progression and dramatic arc'
  },
  {
    id: 'mock-temp-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc45-chunk12',
    target_document_title: 'Musical Rhythm and Form',
    target_snippet: 'Sonata form follows exposition, development, and recapitulation...',
    engine_type: 'temporal',
    connection_type: 'supports',
    strength: 0.70,
    explanation: 'Similar temporal organization and structural rhythm'
  },
  {
    id: 'mock-temp-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc46-chunk18',
    target_document_title: 'Product Development Lifecycle',
    target_snippet: 'Iterative cycles move through conception, prototyping, and refinement...',
    engine_type: 'temporal',
    connection_type: 'parallels',
    strength: 0.63,
    explanation: 'Parallel cyclical temporal patterns'
  },
  {
    id: 'mock-temp-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc47-chunk4',
    target_document_title: 'Historical Periodization',
    target_snippet: 'Eras transition through gradual change punctuated by decisive moments...',
    engine_type: 'temporal',
    connection_type: 'extends',
    strength: 0.55,
    explanation: 'Extends temporal analysis to historical scales'
  },
  {
    id: 'mock-temp-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc48-chunk9',
    target_document_title: 'Biological Circadian Rhythms',
    target_snippet: 'Endogenous cycles regulate physiological processes over 24-hour periods...',
    engine_type: 'temporal',
    connection_type: 'references',
    strength: 0.46,
    explanation: 'References cyclical temporal patterns'
  },
  {
    id: 'mock-temp-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc49-chunk16',
    target_document_title: 'Economic Business Cycles',
    target_snippet: 'Expansion and contraction phases alternate in regular patterns...',
    engine_type: 'temporal',
    connection_type: 'parallels',
    strength: 0.38,
    explanation: 'Weak temporal parallel in cyclical dynamics'
  },
  {
    id: 'mock-temp-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc50-chunk7',
    target_document_title: 'Seasonal Migration Patterns',
    target_snippet: 'Species migrate in response to annual environmental changes...',
    engine_type: 'temporal',
    connection_type: 'supports',
    strength: 0.30,
    explanation: 'Tangential temporal pattern in recurring cycles'
  }
]

/**
 * Get connections filtered by engine type.
 * @param engineType - Engine type to filter by
 * @returns Filtered array of connections
 */
export function getConnectionsByEngine(engineType: string): MockConnection[] {
  return MOCK_CONNECTIONS.filter(conn => conn.engine_type === engineType)
}

/**
 * Get connections filtered by strength threshold.
 * @param minStrength - Minimum strength (0.0-1.0)
 * @returns Filtered array of connections
 */
export function getConnectionsByStrength(minStrength: number): MockConnection[] {
  return MOCK_CONNECTIONS.filter(conn => conn.strength >= minStrength)
}

/**
 * Get strength distribution statistics.
 * @returns Object with weak/medium/strong counts
 */
export function getStrengthDistribution(): { weak: number; medium: number; strong: number } {
  const weak = MOCK_CONNECTIONS.filter(c => c.strength < 0.5).length
  const medium = MOCK_CONNECTIONS.filter(c => c.strength >= 0.5 && c.strength < 0.7).length
  const strong = MOCK_CONNECTIONS.filter(c => c.strength >= 0.7).length
  
  return { weak, medium, strong }
}