DELETE FROM foods
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM foods
  ORDER BY name, created_at ASC
);