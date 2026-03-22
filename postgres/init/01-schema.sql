-- Core thoughts table (ongewijzigd qua structuur)
CREATE TABLE IF NOT EXISTS thoughts (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  content     text NOT NULL,
  embedding   vector(1536),
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index voor vector similarity search
CREATE INDEX IF NOT EXISTS thoughts_embedding_idx
  ON thoughts USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index voor metadata filtering
CREATE INDEX IF NOT EXISTS thoughts_metadata_idx
  ON thoughts USING gin (metadata);

-- match_thoughts functie voor semantic search
CREATE OR REPLACE FUNCTION match_thoughts(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int,
  filter          jsonb DEFAULT '{}'
)
RETURNS TABLE (
  id          uuid,
  content     text,
  metadata    jsonb,
  similarity  float,
  created_at  timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.content,
    t.metadata,
    1 - (t.embedding <=> query_embedding) AS similarity,
    t.created_at
  FROM thoughts t
  WHERE
    t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
    AND (filter = '{}' OR t.metadata @> filter)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
