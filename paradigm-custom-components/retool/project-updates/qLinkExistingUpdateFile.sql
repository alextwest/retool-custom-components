-- Manual repair for ONE confirmed file/update association.
-- Supply exact fileId, updateId and workstreamId through additionalScope.
-- Do not assign all project files to the latest update: null is valid for project-level files.
UPDATE retool.mf_ssot_project_files AS f
SET update_id = {{ updateId }}::uuid
WHERE f.file_id = {{ fileId }}::uuid
  AND f.workstream_id = {{ workstreamId }}::uuid
  AND f.update_id IS NULL
  AND EXISTS (
    SELECT 1 FROM retool.mf_ssot_project_updates AS u
    WHERE u.id = {{ updateId }}::uuid
      AND u.workstream_id = f.workstream_id
      AND COALESCE(u.is_deleted, false) = false
  )
RETURNING f.file_id, f.update_id, f.file_name, f.file_size_bytes, f.sharepoint_web_url;
