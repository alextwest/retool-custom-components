// Attach to the ProjectUpdates component's refresh event.
await Promise.all([
  qProjectUpdates.trigger(),
  qProjectReplies.trigger(),
  qProjectUpdateFiles.trigger(),
]);

// Recovery only acknowledges a matching post whose entire pipeline already completed.
// Refresh never inserts an update or sends notifications.
const checkpoint = updatesPostCheckpoint.value ?? {};
if (
  checkpoint.complete === true &&
  !checkpoint.busy &&
  checkpoint.requestId === customProjectUpdates.postRequest?.requestId
) {
  await updatesPostResult.setValue({
    requestId: checkpoint.requestId,
    success: true,
  });
}
