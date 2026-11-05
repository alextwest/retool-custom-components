-- Bind the component's attachments field to formatDataAsArray(qProjectUpdateFiles.data ?? {}).
-- Include files for the whole project so both update and reply attachments are returned.
SELECT
  file_id,
  update_id,
  file_name,
  file_extension,
  mime_type,
  file_size_bytes,
  sharepoint_web_url,
  uploaded_by,
  uploaded_at,
  file_status
FROM retool.mf_ssot_project_files
WHERE workstream_id = {{ selectedProjectRow.value.workstream_id }}::uuid
ORDER BY uploaded_at DESC;
