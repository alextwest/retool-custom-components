-- Replace the existing query body. Disable its old success handlers when using postProjectUpdate.js.
-- requestId is a UUID generated once by the component and reused on Retry.
WITH actor_context AS (
  SELECT
    set_config('app.current_user_name', {{ current_user.fullName || current_user.email }}, true),
    set_config('app.current_user_id', {{ current_user.email }}, true),
    set_config('app.actor_type', 'user', true)
), existing_dev_root AS (
  SELECT id
  FROM retool.mf_ssot_project_updates
  WHERE workstream_id = {{ workstreamId }}::uuid
    AND source = 'teams_dev_channel'
    AND update_type = 'general'
    AND COALESCE(is_deleted, false) = false
  ORDER BY created_at ASC, id ASC
  LIMIT 1
), inserted AS (
  INSERT INTO retool.mf_ssot_project_updates (
    id, workstream_id, site_id, project_id, update_text, update_type,
    parent_update_id, created_by, source, mentioned_users
  )
  SELECT
    {{ requestId }}::uuid,
    {{ workstreamId }}::uuid,
    {{ siteId }}::uuid,
    {{ projectId }},
    {{ updateText }},
    CASE WHEN {{ updateTag }} = 'teams_dev_channel'
      AND EXISTS (SELECT 1 FROM existing_dev_root) THEN 'reply' ELSE 'general' END,
    CASE WHEN {{ updateTag }} = 'teams_dev_channel'
      AND EXISTS (SELECT 1 FROM existing_dev_root) THEN (SELECT id FROM existing_dev_root) ELSE NULL END,
    {{ current_user.fullName || current_user.email }},
    {{ updateTag }},
    {{ JSON.stringify(finalMentions ?? []) }}::jsonb
  FROM actor_context
  ON CONFLICT (id) DO NOTHING
  RETURNING id, workstream_id, project_id, site_id, update_text, update_type,
    parent_update_id, source, source_update_id, created_by, created_at, mentioned_users
)
SELECT * FROM inserted
UNION ALL
SELECT id, workstream_id, project_id, site_id, update_text, update_type,
  parent_update_id, source, source_update_id, created_by, created_at, mentioned_users
FROM retool.mf_ssot_project_updates
WHERE id = {{ requestId }}::uuid
  AND workstream_id = {{ workstreamId }}::uuid
  AND NOT EXISTS (SELECT 1 FROM inserted);
