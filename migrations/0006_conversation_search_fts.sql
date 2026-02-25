CREATE VIRTUAL TABLE IF NOT EXISTS conversation_search_fts USING fts5 (
  user_id UNINDEXED,
  conversation_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);

DELETE FROM conversation_search_fts;

INSERT INTO conversation_search_fts (user_id, conversation_id, title, body)
SELECT
  m.user_id,
  m.id,
  COALESCE(m.title, ''),
  COALESCE(extracted.body_text, '')
FROM conversation_metas m
LEFT JOIN (
  SELECT
    b.user_id,
    b.id,
    group_concat(
      CASE
        WHEN json_extract(block.value, '$.type') = 'content'
          THEN COALESCE(json_extract(block.value, '$.content'), '')
        WHEN json_extract(block.value, '$.type') = 'error'
          THEN COALESCE(json_extract(block.value, '$.message'), '')
        ELSE NULL
      END,
      ' '
    ) AS body_text
  FROM conversation_bodies b
  LEFT JOIN json_each(b.messages_json) message
  LEFT JOIN json_each(json_extract(message.value, '$.blocks')) block
  GROUP BY b.user_id, b.id
) extracted
  ON extracted.user_id = m.user_id
 AND extracted.id = m.id;
