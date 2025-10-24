-- Prompt Templates Table
-- Stores flashcard generation prompt templates with variable substitution support

CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  usage_count INTEGER DEFAULT 0 NOT NULL,
  last_used_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_prompt_templates_user ON prompt_templates(user_id);
CREATE INDEX idx_prompt_templates_default ON prompt_templates(user_id, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_prompt_templates_system ON prompt_templates(is_system) WHERE is_system = TRUE;

-- RLS policies (personal tool pattern)
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own prompts"
  ON prompt_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own prompts"
  ON prompt_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own prompts"
  ON prompt_templates FOR UPDATE
  USING (auth.uid() = user_id AND is_system = FALSE);

CREATE POLICY "Users can delete their own prompts"
  ON prompt_templates FOR DELETE
  USING (auth.uid() = user_id AND is_system = FALSE);

-- Function to create default prompts for new users
CREATE OR REPLACE FUNCTION create_default_prompts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO prompt_templates (user_id, name, description, template, variables, is_system, is_default) VALUES
    (
      NEW.id,
      'Comprehensive Concepts',
      'Key definitions, core ideas, and concept relationships',
      E'Generate {{count}} flashcards covering the most important concepts in this text.\n\nFocus on:\n- Key definitions and terminology\n- Core ideas and principles\n- Relationships between concepts\n\nFor each card:\n- Question should be clear and specific\n- Answer should be concise but complete (1-3 sentences)\n- Include keywords from the source text for chunk matching\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["concept1", "concept2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
      ARRAY['count', 'content', 'chunks', 'custom'],
      TRUE,
      TRUE
    ),
    (
      NEW.id,
      'Deep Details',
      'Specific claims, evidence, and precise terminology',
      E'Generate {{count}} flashcards focusing on important details and specifics.\n\nFocus on:\n- Specific claims and arguments\n- Supporting evidence and examples\n- Precise terminology and numbers\n\nFor each card:\n- Test recall of specific information\n- Avoid overly broad questions\n- Link to exact source chunks\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["detail1", "detail2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
      ARRAY['count', 'content', 'chunks', 'custom'],
      TRUE,
      FALSE
    ),
    (
      NEW.id,
      'Connections & Synthesis',
      'How ideas connect, comparisons, and applications',
      E'Generate {{count}} flashcards that synthesize concepts across this text.\n\nFocus on:\n- How ideas connect to each other\n- Comparisons and contrasts\n- Applications and implications\n\nFor each card:\n- Test understanding, not just recall\n- Encourage cross-referencing\n- Link to multiple relevant chunks when possible\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["connection1", "connection2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
      ARRAY['count', 'content', 'chunks', 'custom'],
      TRUE,
      FALSE
    ),
    (
      NEW.id,
      'Contradiction Focus',
      'Conceptual tensions, opposing viewpoints, and paradoxes',
      E'Generate {{count}} flashcards highlighting conceptual tensions in this text.\n\nFocus on:\n- Opposing viewpoints\n- Contradictions and paradoxes\n- Debates and disagreements\n\nFor each card:\n- Present both sides clearly\n- Ask which perspective is supported\n- Link to contrasting chunks\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["contradiction1", "contradiction2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
      ARRAY['count', 'content', 'chunks', 'custom'],
      TRUE,
      FALSE
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create default prompts for new users
CREATE TRIGGER on_user_created_prompts
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_prompts();

-- Create prompts for existing users
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM auth.users LOOP
    -- Check if user already has default prompts
    IF NOT EXISTS (
      SELECT 1 FROM prompt_templates
      WHERE user_id = user_record.id AND is_system = TRUE
    ) THEN
      INSERT INTO prompt_templates (user_id, name, description, template, variables, is_system, is_default)
      VALUES
        (
          user_record.id,
          'Comprehensive Concepts',
          'Key definitions, core ideas, and concept relationships',
          E'Generate {{count}} flashcards covering the most important concepts in this text.\n\nFocus on:\n- Key definitions and terminology\n- Core ideas and principles\n- Relationships between concepts\n\nFor each card:\n- Question should be clear and specific\n- Answer should be concise but complete (1-3 sentences)\n- Include keywords from the source text for chunk matching\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["concept1", "concept2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
          ARRAY['count', 'content', 'chunks', 'custom'],
          TRUE,
          TRUE
        ),
        (
          user_record.id,
          'Deep Details',
          'Specific claims, evidence, and precise terminology',
          E'Generate {{count}} flashcards focusing on important details and specifics.\n\nFocus on:\n- Specific claims and arguments\n- Supporting evidence and examples\n- Precise terminology and numbers\n\nFor each card:\n- Test recall of specific information\n- Avoid overly broad questions\n- Link to exact source chunks\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["detail1", "detail2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
          ARRAY['count', 'content', 'chunks', 'custom'],
          TRUE,
          FALSE
        ),
        (
          user_record.id,
          'Connections & Synthesis',
          'How ideas connect, comparisons, and applications',
          E'Generate {{count}} flashcards that synthesize concepts across this text.\n\nFocus on:\n- How ideas connect to each other\n- Comparisons and contrasts\n- Applications and implications\n\nFor each card:\n- Test understanding, not just recall\n- Encourage cross-referencing\n- Link to multiple relevant chunks when possible\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["connection1", "connection2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
          ARRAY['count', 'content', 'chunks', 'custom'],
          TRUE,
          FALSE
        ),
        (
          user_record.id,
          'Contradiction Focus',
          'Conceptual tensions, opposing viewpoints, and paradoxes',
          E'Generate {{count}} flashcards highlighting conceptual tensions in this text.\n\nFocus on:\n- Opposing viewpoints\n- Contradictions and paradoxes\n- Debates and disagreements\n\nFor each card:\n- Present both sides clearly\n- Ask which perspective is supported\n- Link to contrasting chunks\n\nText:\n{{content}}\n\nChunk metadata:\n{{chunks}}\n\nCustom instructions:\n{{custom}}\n\nReturn ONLY a JSON array of flashcards in this format:\n[\n  {\n    "type": "basic",\n    "question": "...",\n    "answer": "...",\n    "confidence": 0.85,\n    "keywords": ["contradiction1", "contradiction2"]\n  }\n]\n\nGenerate exactly {{count}} flashcards.',
          ARRAY['count', 'content', 'chunks', 'custom'],
          TRUE,
          FALSE
        )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Add comment
COMMENT ON TABLE prompt_templates IS 'Flashcard generation prompt templates with variable substitution support';
