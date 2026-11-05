# Legacy Updates UI removal audit

Source inspected: `C:/Users/AlexWest/Downloads/MF%20SSOT (1).json` (1,139 plugin records). Assumption confirmed by the user: current `customProjectUpdates` and `postProjectUpdate` use the wiring developed in this repository. The export is used to trace legacy references, not to replace the newer live app. No live app or original export was modified during this audit.

## The five deletion warnings

Deleting `projectUpdatesSectionContainer` removes 37 widget records including the container. These five surviving properties account for the screenshot's warnings:

| Surviving property | Reference to the deleted UI | Action |
| --- | --- | --- |
| `qUpdateNotificationInsert.query` | `newProjectUpdateTextArea.value` supplies the notification body | Retire this unused legacy insert query rather than pointing it at the new component. |
| `qUpdateNotificationInsert.events[0].params.src` | Its success handler reads `newProjectUpdateTextArea.value` and invokes the notification workflow using legacy parameter names | Remove with the obsolete insert query. Do not move this handler onto the new posting script. |
| `submitProjectUpdateReplyButton2.events[0].params.src` | Calls `projectUpdateRepliesContainer.hide()` instead of its own suffixed container | This belongs to the second Updates UI on `singleProjectPage`; remove that UI if retired, or migrate its posting path. |
| `newProjectUpdateTextArea2.events[0].params.src` | Reads and writes `newProjectUpdateTextArea` instead of its own textarea | Same second-page migration/removal requirement. |
| `submitNewProjectUpdateButton2.events[0].params.src` | Reads/clears `newProjectUpdateTextArea` and invokes the old parsing/upload helpers | Same second-page migration/removal requirement. |

The second UI's parent is `projectUpdatesSectionContainer2`, inside `projectDetailsTabbedContainer2` on `singleProjectPage`. It is not a child of the container being deleted. Removing the first container will not remove these three handlers automatically.

The older snapshot also contains three references whose replacements/removal were already part of the new setup: `qNewProjectUpdate.query` reads the original textarea/tag selector, `commitUpdateMention.query` reads the original textarea/mention selector, and `parseUpdateMentions.query` reads the original textarea. Under the agreed current-wiring assumption, keep the new scope-based insert SQL and remove the old helpers only after the second legacy UI is retired too.

## Notification path

The current path is:

`customProjectUpdates.post` → `postProjectUpdate` → insert update/reply with structured mentions → uploads/link verification → `workflowSendTeamsNotification` with `updateId`, `mentions`, actor and project context → refresh and completion acknowledgment.

No plugin template or preloaded app JavaScript in the export calls `qUpdateNotificationInsert`. Its `runWhenPageLoads` and `runWhenModelUpdates` settings are both false. It is a dormant legacy query in the audited snapshot.

Its old success handler passes `email`, `project_id`, `project_name`, `message`, and `project_url`, whereas the exported `workflowSendTeamsNotification.workflowParams` expects the current `updateId`, `mentions`, `updateText`, actor and camelCase project fields. Copying that old handler into the new path is unnecessary and can introduce duplicate or malformed sends.

The user's successful Teams tests and three supplied database notification rows match the new update/reply text and source IDs. Along with the absence of a legacy insert caller, this supports the conclusion that the existing notification workflow persists the notification records. The hosted workflow's internal blocks are not in this app export, so this is an inference supported by runtime evidence, not a direct inspection of its INSERT block. Do not add a second database notification insert to `postProjectUpdate`.

Keep `workflowSendTeamsNotification`. Keep `qCurrentUserNotifications`, `notificationsDrawer`, and `notificationList`: the drawer's read query selects from `retool.mf_ssot_notifications`, and the list binds to that read query; neither depends on the old update textarea or `qUpdateNotificationInsert`.

Also keep `qSendUpdateToTeamsDev`'s success handler that invokes `qUpdateTeamsMessageId`. It saves the Teams message ID and is distinct from the obsolete insert-query success notifications/duplicate sends.

## Shared legacy helpers: second-page dependencies

These cannot all be removed while the old second Updates section remains in use:

| Helper/state | Surviving second-page dependents in the export |
| --- | --- |
| `commitUpdateMention` | `mentionSelect2` |
| `parseUpdateMentions` | `submitNewProjectUpdateButton2` |
| `selectedMentions` | `newProjectUpdateTextArea2`, `submitNewProjectUpdateButton2` |
| `tempUpdateFiles` | `submitNewProjectUpdateButton2`, `updatesUploadButton2`, `listUpdatesUploadedFiles2`, `updatesFileDeleteButton2` |
| `removedUploadFileKeys` | `updatesUploadButton2`, `updatesFileDeleteButton2` |

If `singleProjectPage` is retired, remove its old Updates section and event handlers as well. If that page remains supported, replace its old Updates section with another ProjectUpdates instance and an event handler using that instance's own request/project context. Do not simply reuse a handler that reads the first component instance. Keeping the old second-page buttons requires adapting them to the new additional-scope SQL inputs; changing just one textarea/container name is insufficient.

## Removal sequence

1. Confirm the new custom component is outside the old container.
2. Retire `qUpdateNotificationInsert` and its success event.
3. Remove or migrate the second page's Updates UI before deleting its shared helpers/states.
4. Delete the original Updates container and obsolete handlers; retain the new posting/refresh queries, database/upload/Teams queries, `updatesPostResult`, and `updatesPostCheckpoint`.
5. Check update/reply, attachments, mention delivery, database notification rows and the global notification drawer on every page still supported. Run a reference search for deleted component/helper names. One intentional mention should have one notification row for each recipient/update pair, not two.

Do not reimport the older JSON export over the current app; that could overwrite the new component and query changes. This report is a dependency audit, not an executed cleanup.
