// Retool JavaScript query. Uses the component instance name in your MF SSOT app.
// Create temporary states updatesPostResult and updatesPostCheckpoint, both initially {}.
// See README.md before enabling. This replaces the old posting/notification success handlers.
const request = JSON.parse(JSON.stringify(customProjectUpdates.postRequest));
const asRows = (value) =>
  Array.isArray(value) ? value : formatDataAsArray(value ?? {});
const showError = (message) =>
  utils.showNotification({
    title: "Post could not be completed",
    description: message,
    notificationType: "error",
  });
const acknowledge = async (result) => {
  const acknowledgment = { requestId: request.requestId, ...result };
  await updatesPostResult.setValue(acknowledgment);
  return acknowledgment;
};
const previous = updatesPostCheckpoint.value ?? {};
if (previous.busy) return; // Also bind component.disabled and project navigation to this query's isFetching.

if (
  !request.requestId ||
  !request.project?.workstream_id ||
  !request.project?.site_id ||
  !["update", "reply"].includes(request.kind) ||
  !["general_retool", "teams_dev_channel", "teams_sales_channel"].includes(
    request.tag,
  ) ||
  (request.kind === "reply" && !request.parentUpdateId) ||
  (!request.text?.trim() && !request.files?.length)
) {
  return await acknowledge({
    success: false,
    retryOnly: false,
    error: "Select a project and enter text or attach a file before posting.",
  });
}

let checkpoint =
  previous.requestId === request.requestId
    ? { ...previous, uploadedKeys: [...(previous.uploadedKeys ?? [])] }
    : {
        requestId: request.requestId,
        uploadedKeys: [],
        row: null,
        teamsDone: false,
        mentionsDone: false,
      };
const save = async () => updatesPostCheckpoint.setValue({ ...checkpoint });
const p = request.project;
const scope = {
  requestId: request.requestId,
  workstreamId: p.workstream_id,
  siteId: p.site_id,
  projectId: p.project_id ?? null,
  updateText: request.text,
  replyText: request.text,
  updateTag: request.tag,
  parentUpdateId: request.parentUpdateId,
  finalMentions: request.mentionedUsers ?? [],
  mentionedUsers: request.mentionedUsers ?? [],
};

try {
  checkpoint.busy = true;
  await save();
  if (request.files.length && !checkpoint.row) {
    const registry = await qCheckProjectFolderRegistry.trigger({
      additionalScope: scope,
    });
    const folder = asRows(registry)[0];
    if (!folder?.web_url)
      throw new Error(
        "Add or link a SharePoint project folder before uploading files.",
      );
  }

  if (!checkpoint.row) {
    // Save before sending: if the response is lost, retry keeps the same UUID.
    checkpoint.insertAttempted = true;
    await save();
    const result = await (
      request.kind === "reply" ? qNewUpdateReply : qNewProjectUpdate
    ).trigger({ additionalScope: scope });
    const row = asRows(result)[0];
    if (!row?.id)
      throw new Error(
        "The insert returned no row. Check the project/parent and the supplied SQL query bindings, then retry the same post.",
      );
    checkpoint.row = row;
    await save();
  }

  const row = checkpoint.row;
  const updateId = row.id;
  // Sequential uploads allow retries to skip files already confirmed successful.
  for (const file of request.files) {
    const key = `${file.name}-${file.sizeBytes}`;
    if (checkpoint.uploadedKeys.includes(key)) continue;
    if (checkpoint.awaitingFileLink && checkpoint.awaitingFileLink.key !== key)
      throw new Error(
        "A previous uploaded file still needs its update_id link checked before continuing.",
      );
    if (!checkpoint.awaitingFileLink) {
      const uploadResponse = await qUploadUpdateFilesToSharePoint.trigger({
        additionalScope: {
          workstreamId: p.workstream_id,
          projectId: p.project_id ?? null,
          updateId,
          uploadedBy: current_user.email,
          sourceContext: "update",
          files: [file],
        },
      });
      const uploadBody = uploadResponse?.data?.uploadedFiles
        ? uploadResponse.data
        : uploadResponse;
      if (uploadBody?.success === false)
        throw new Error(
          uploadBody.error || "The upload workflow reported a failure.",
        );
      const receipt = (
        Array.isArray(uploadBody?.uploadedFiles) ? uploadBody.uploadedFiles : []
      ).find(
        (uploaded) =>
          uploaded.fileName === file.name &&
          Number(uploaded.size) === Number(file.sizeBytes),
      );
      // Keep the successful remote upload separate from its database association.
      // Retrying a missing link verifies the metadata instead of uploading the file again.
      checkpoint.awaitingFileLink = {
        key,
        updateId,
        name: file.name,
        sizeBytes: file.sizeBytes,
        // Retain only association metadata, not fileData or its signed download URL.
        receipt: receipt
          ? {
              fileId: receipt.fileId ?? receipt.file_id ?? null,
              fileName: receipt.fileName,
              size: receipt.size,
              webUrl: receipt.webUrl,
              updateId: receipt.updateId ?? uploadBody.updateId,
            }
          : null,
      };
      await save();
    }
    const savedFiles = asRows(
      await qProjectUpdateFiles.trigger({
        additionalScope: { workstreamId: p.workstream_id },
      }),
    );
    const isLinked = (saved) =>
      String(saved.update_id ?? "")
        .trim()
        .toLowerCase() === String(updateId).trim().toLowerCase() &&
      saved.file_name === file.name &&
      Number(saved.file_size_bytes) === Number(file.sizeBytes);
    let linked = savedFiles.some(isLinked);
    if (!linked) {
      const receipt = checkpoint.awaitingFileLink.receipt;
      const normalizeUrl = (value) => {
        try {
          return decodeURI(String(value ?? ""))
            .trim()
            .toLowerCase();
        } catch {
          return String(value ?? "")
            .trim()
            .toLowerCase();
        }
      };
      const confirmedReceipt =
        receipt &&
        String(receipt.updateId).toLowerCase() ===
          String(updateId).toLowerCase() &&
        receipt.fileName === file.name &&
        Number(receipt.size) === Number(file.sizeBytes) &&
        receipt.webUrl;
      if (confirmedReceipt) {
        const candidates = savedFiles.filter(
          (saved) =>
            saved.update_id == null &&
            saved.file_id &&
            saved.file_name === file.name &&
            Number(saved.file_size_bytes) === Number(file.sizeBytes) &&
            normalizeUrl(saved.sharepoint_web_url) ===
              normalizeUrl(receipt.webUrl) &&
            (!receipt.fileId ||
              String(saved.file_id) === String(receipt.fileId)),
        );
        if (candidates.length === 1) {
          if (typeof qLinkExistingUpdateFile === "undefined")
            throw new Error(
              "Add the supplied qLinkExistingUpdateFile SQL query to link the confirmed upload to its update, then Retry same post. The file will not be uploaded again.",
            );
          const linkResult = asRows(
            await qLinkExistingUpdateFile.trigger({
              additionalScope: {
                fileId: candidates[0].file_id,
                updateId,
                workstreamId: p.workstream_id,
              },
            }),
          );
          linked = linkResult.some(isLinked);
        } else if (candidates.length > 1) {
          throw new Error(
            `More than one unlinked record matches "${file.name}". Confirm the correct file_id before linking it; no record has been changed.`,
          );
        }
      }
    }
    if (!linked)
      throw new Error(
        `The upload workflow finished for "${file.name}", but qProjectUpdateFiles returned no matching file linked to update ${updateId}. Check the workflow's updateId input and file INSERT update_id column. Retry checks the link without uploading this file again.`,
      );
    checkpoint.uploadedKeys.push(key);
    checkpoint.awaitingFileLink = null;
    await save();
  }

  let mentions = row.mentioned_users ?? request.mentionedUsers ?? [];
  if (typeof mentions === "string") mentions = JSON.parse(mentions);
  if (!Array.isArray(mentions)) mentions = [];
  const common = {
    updateId,
    workstreamId: row.workstream_id,
    projectId: row.project_id,
    projectName: p.project_name,
    management: p.management || p.hea_management,
    buildingType: p.building_type,
    updateText: row.update_text,
    updateType: row.update_type,
    parentUpdateId: row.parent_update_id,
    source: row.source,
  };
  if (!checkpoint.teamsDone) {
    if (row.source === "teams_dev_channel" && !row.source_update_id) {
      await qSendUpdateToTeamsDev.trigger({
        additionalScope: { ...common, mentionedUsers: mentions },
      });
    }
    checkpoint.teamsDone = true;
    await save();
  }
  if (!checkpoint.mentionsDone) {
    if (mentions.length) {
      const projectUrl = `${url.href.split("?")[0]}?workstream_id=${encodeURIComponent(p.workstream_id)}&project_tab=updates`;
      await workflowSendTeamsNotification.trigger({
        additionalScope: {
          ...common,
          mentions,
          actorEmail: current_user.email,
          actorName: current_user.fullName || current_user.email,
          projectUrl,
        },
      });
    }
    checkpoint.mentionsDone = true;
    await save();
  }

  // Refresh failures should not cause the author to post an already-saved message again.
  const refreshed = await Promise.allSettled([
    qProjectUpdates.trigger(),
    qProjectReplies.trigger(),
    qProjectUpdateFiles.trigger(),
  ]);
  checkpoint.complete = true;
  await save();
  const acknowledgment = await acknowledge({ success: true });
  const refreshFailed = refreshed.some((r) => r.status === "rejected");
  utils.showNotification({
    title: request.kind === "reply" ? "Reply posted" : "Update posted",
    description: refreshFailed
      ? "Your post was saved. Use refresh to reload the conversation."
      : "",
    notificationType: refreshFailed ? "warning" : "success",
  });
  return acknowledgment;
} catch (error) {
  const message = error?.message || String(error);
  // Lock the snapshot after an insert attempt: Retry must use the same UUID and files.
  const acknowledgment = await acknowledge({
    success: false,
    retryOnly: !!checkpoint.insertAttempted,
    error: message,
  });
  showError(message);
  return acknowledgment;
} finally {
  checkpoint.busy = false;
  await save();
}
