-- Reply mentions are now saved as structured data and the parent comes from the request.
WITH actor_context AS (
  SELECT
    set_config('app.current_user_name', {{ current_user.fullName || current_user.email }}, true),
    set_config('app.current_user_id', {{ current_user.email }}, true),
    set_config('app.actor_type', 'user', true)
), parent AS (
  SELECT id, source
  FROM retool.mf_ssot_project_updates
  WHERE id = {{ parentUpdateId }}::uuid
    AND workstream_id = {{ workstreamId }}::uuid
    AND COALESCE(is_deleted, false) = false
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
    {{ replyText }},
    'reply', parent.id,
    {{ current_user.fullName || current_user.email }},
    parent.source,
    {{ JSON.stringify(finalMentions ?? []) }}::jsonb
  FROM actor_context CROSS JOIN parent
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
