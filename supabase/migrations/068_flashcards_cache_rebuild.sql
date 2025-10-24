-- Flashcards Cache Rebuild Function
-- Creates function to rebuild flashcards_cache table from ECS components

CREATE OR REPLACE FUNCTION rebuild_flashcards_cache(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Delete existing cache for user
  DELETE FROM flashcards_cache WHERE user_id = p_user_id;

  -- Rebuild from ECS components
  INSERT INTO flashcards_cache (
    entity_id, user_id, card_type, question, answer, content,
    cloze_index, cloze_count, status, deck_id, deck_added_at,
    next_review, last_review, stability, difficulty, reps, lapses,
    srs_state, is_mature, document_id, chunk_ids, connection_id,
    annotation_id, generation_job_id, tags, storage_path,
    created_at, updated_at
  )
  SELECT
    e.id as entity_id,
    e.user_id,
    (card_comp.data->>'type')::text as card_type,
    (card_comp.data->>'question')::text as question,
    (card_comp.data->>'answer')::text as answer,
    (card_comp.data->>'content')::text as content,
    (card_comp.data->>'clozeIndex')::integer as cloze_index,
    (card_comp.data->>'clozeCount')::integer as cloze_count,
    CASE
      WHEN card_comp.data->>'srs' IS NULL THEN 'draft'
      ELSE 'active'
    END as status,
    (card_comp.data->>'deckId')::uuid as deck_id,
    (card_comp.data->>'deckAddedAt')::timestamptz as deck_added_at,
    (card_comp.data->'srs'->>'due')::timestamptz as next_review,
    (card_comp.data->'srs'->>'last_review')::timestamptz as last_review,
    (card_comp.data->'srs'->>'stability')::double precision as stability,
    (card_comp.data->'srs'->>'difficulty')::double precision as difficulty,
    (card_comp.data->'srs'->>'reps')::integer as reps,
    (card_comp.data->'srs'->>'lapses')::integer as lapses,
    (card_comp.data->'srs'->>'state')::integer as srs_state,
    (card_comp.data->'srs'->>'isMature')::boolean as is_mature,
    (chunk_ref_comp.data->>'documentId')::uuid as document_id,
    ARRAY(SELECT jsonb_array_elements_text(chunk_ref_comp.data->'chunkIds'))::uuid[] as chunk_ids,
    (chunk_ref_comp.data->>'connectionId')::uuid as connection_id,
    (chunk_ref_comp.data->>'annotationId')::uuid as annotation_id,
    (chunk_ref_comp.data->>'generationJobId')::uuid as generation_job_id,
    ARRAY(SELECT jsonb_array_elements_text(content_comp.data->'tags'))::text[] as tags,
    p_user_id || '/flashcards/card_' || e.id || '.json' as storage_path,
    (temporal_comp.data->>'createdAt')::timestamptz as created_at,
    (temporal_comp.data->>'updatedAt')::timestamptz as updated_at
  FROM entities e
  JOIN components card_comp ON card_comp.entity_id = e.id
    AND card_comp.component_type = 'Card'
  LEFT JOIN components content_comp ON content_comp.entity_id = e.id
    AND content_comp.component_type = 'Content'
  LEFT JOIN components temporal_comp ON temporal_comp.entity_id = e.id
    AND temporal_comp.component_type = 'Temporal'
  LEFT JOIN components chunk_ref_comp ON chunk_ref_comp.entity_id = e.id
    AND chunk_ref_comp.component_type = 'ChunkRef'
  WHERE e.user_id = p_user_id
    AND e.entity_type = 'flashcard';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION rebuild_flashcards_cache TO authenticated;
