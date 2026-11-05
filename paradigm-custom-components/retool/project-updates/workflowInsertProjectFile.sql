-- Replace the shared upload workflow's existing file INSERT with this query.
-- Adds update_id; preserves the existing final_scope upsert behavior.
INSERT INTO retool.mf_ssot_project_files (
  workstream_id,
  measure_id,
  update_id,
  project_id,
  source_context,
  file_name,
  file_extension,
  mime_type,
  file_size_bytes,
  sharepoint_item_id,
  sharepoint_web_url,
  sharepoint_path,
  uploaded_by,
  uploaded_at,
  file_status
)
VALUES (
  {{ startTrigger.data.workstreamId }}::uuid,
  {{
    Array.isArray(startTrigger.data.measureId)
      ? startTrigger.data.measureId[0]
      : startTrigger.data.measureId
  }}::uuid,
  {{ startTrigger.data.updateId ?? null }}::uuid,
  {{ startTrigger.data.projectId }},
  {{ startTrigger.data.sourceContext }},
  {{ startTrigger.data.file.name }},
  lower(
    split_part(
      {{ startTrigger.data.file.name }},
      '.',
      array_length(
        string_to_array({{ startTrigger.data.file.name }}, '.'),
        1
      )
    )
  ),
  {{ startTrigger.data.file.type }},
  {{ uploadFiles.data.size }}::bigint,
  {{ uploadFiles.data.id }},
  {{ uploadFiles.data.webUrl }},
  {{ uploadFiles.data.parentReference?.path || null }},
  {{ startTrigger.data.uploadedBy }},
  now(),
  'uploaded'
)
ON CONFLICT (
  workstream_id,
  measure_id
)
WHERE source_context = 'final_scope'
  AND measure_id IS NOT NULL
DO UPDATE SET
  project_id = EXCLUDED.project_id,
  source_context = EXCLUDED.source_context,
  file_name = EXCLUDED.file_name,
  file_extension = EXCLUDED.file_extension,
  mime_type = EXCLUDED.mime_type,
  file_size_bytes = EXCLUDED.file_size_bytes,
  sharepoint_item_id = EXCLUDED.sharepoint_item_id,
  sharepoint_web_url = EXCLUDED.sharepoint_web_url,
  sharepoint_path = EXCLUDED.sharepoint_path,
  uploaded_by = EXCLUDED.uploaded_by,
  uploaded_at = now(),
  file_status = EXCLUDED.file_status
RETURNING *;
