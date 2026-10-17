export const getPreferredModelId = async (db: D1Database, userId: string) => {
  const preference = await db
    .prepare('SELECT preferred_model_id FROM user_preferences WHERE user_id = ?1')
    .bind(userId)
    .first<{ preferred_model_id: string }>();
  return preference?.preferred_model_id ?? null;
};

export const savePreferredModelId = async (
  db: D1Database,
  userId: string,
  preferredModelId: string,
) => {
  await db
    .prepare(
      `INSERT INTO user_preferences(user_id, preferred_model_id) VALUES (?1, ?2)
       ON CONFLICT(user_id) DO UPDATE SET preferred_model_id = excluded.preferred_model_id`,
    )
    .bind(userId, preferredModelId)
    .run();
};
