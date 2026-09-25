-- Read-only audit of test uploads created during 4E.
-- Run this first and review every returned row before deleting anything.
WITH candidates(map_id) AS (
  VALUES
    ('755c7f68-aa44-4bcb-a7fb-9be1ad7cec94'::text),
    ('7cd1a56b-9eb1-4ed3-808a-7a8d1bf098c6'::text),
    ('aaf3c98f-2fdf-413f-8eec-8da93567bfe3'::text),
    ('d0941cd3-2855-4441-8d9f-d73e8e585378'::text)
), map_rows AS (
  SELECT c.map_id, m.name, m.image_path,
         CASE WHEN m.image_path LIKE 'maps/%' THEN substring(m.image_path FROM 6)
              ELSE m.image_path END AS storage_object_path
  FROM candidates c
  LEFT JOIN app_private.maps m ON m.map_id = c.map_id
)
SELECT r.map_id, r.name, r.image_path, r.storage_object_path,
       tp.character_id, tp.x, tp.y
FROM map_rows r
LEFT JOIN public.token_positions tp ON tp.map_id = r.map_id
ORDER BY r.map_id, tp.character_id;

-- Proposed cleanup after review and explicit confirmation. Do not run blindly.
-- DELETE FROM public.token_positions
-- WHERE map_id IN (SELECT map_id FROM candidates);
-- DELETE FROM public.map_config
-- WHERE map_id IN (SELECT map_id FROM candidates);
-- DELETE FROM app_private.maps
-- WHERE map_id IN (SELECT map_id FROM candidates);
-- Storage cleanup must be run separately with the reviewed object paths:
-- SELECT storage.objects.name FROM storage.objects
-- WHERE bucket_id = 'maps' AND name IN ('<reviewed-object-path>');
-- Then remove those exact objects through the Storage API/admin UI.
