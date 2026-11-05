-- Run once in a temporary Retool SQL query using the MF SSOT database resource.
-- Only fills missing associations for these two confirmed files.
WITH links (file_id, update_id) AS (
  VALUES
    ('2151677b-8bae-4862-af23-7671f98ff5a7'::uuid,
     'bd0667d6-7dd7-4d04-815f-620f1fd789a4'::uuid),
    ('23f31e50-1e8c-4fd2-9996-bdfa0da709e2'::uuid,
     '9f33a311-4a30-4d36-8894-8325d3ee2371'::uuid)
)
UPDATE retool.mf_ssot_project_files AS f
SET update_id = links.update_id,
    updated_at = now()
FROM links
JOIN retool.mf_ssot_project_updates AS u ON u.id = links.update_id
WHERE f.file_id = links.file_id
  AND f.workstream_id = '70acfd9f-58d5-4f77-b4ef-7508cbe1ad1a'::uuid
  AND u.workstream_id = f.workstream_id
  AND COALESCE(u.is_deleted, false) = false
  AND f.update_id IS NULL
RETURNING f.file_id, f.update_id, f.file_name, f.sharepoint_web_url;
