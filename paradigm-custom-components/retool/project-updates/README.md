# One ProjectUpdates component in MF SSOT

Add **ProjectUpdates** from **Paradigm Custom Components**, version `dev:alex@paradigm-esco.com`. This is the full section; `UpdatesComposer` remains available for standalone text editors. No new backend service is needed.

The component owns update/reply drafts, selected mentions, multiple file picks/removal, tag selection, the feed, reply toggles, and search. The host Retool app runs database, SharePoint, and Teams queries through two component events. Query/action names are configured through Retool event handlers; entering query names as text in the Inspector would not make them callable inside the component iframe.

## 1. Bind the component (instance name `customProjectUpdates`)

| Inspector field   | Expression                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `project`         | `{{ selectedProjectRow.value ?? {} }}`                                                                         |
| `title`           | `{{ (selectedProjectRow.value?.project_name ?? 'Project') + ' Updates' }}`                                     |
| `users`           | `{{ formatDataAsArray(qMentionUsers.data ?? {}) }}`                                                            |
| `updates`         | `{{ formatDataAsArray(qProjectUpdates.data ?? {}) }}`                                                          |
| `replies`         | `{{ formatDataAsArray(qProjectReplies.data ?? {}) }}`                                                          |
| `attachments`     | `{{ formatDataAsArray(qProjectUpdateFiles.data ?? {}) }}`                                                      |
| `appTheme`        | `{{ theme }}`                                                                                                  |
| `postResult`      | `{{ updatesPostResult.value }}`                                                                                |
| `disabled`        | `{{ postProjectUpdate.isFetching }}`                                                                           |
| `loading`         | `{{ [qProjectUpdates.isFetching, qProjectReplies.isFetching, qProjectUpdateFiles.isFetching].some(Boolean) }}` |
| `maxAttachmentMB` | `20` by default; set to your workflow's supported total raw file size                                          |

Load the **full authorized mention directory**, not the old dropdown's filtered search. Run the feed/reply/file queries on project selection. Supply every reply you want searchable; rows missing from the bound queries cannot be searched. A reply whose parent is absent is displayed as a conversation so it remains accessible. The three source values are `general_retool`, `teams_dev_channel`, and `teams_sales_channel`; legacy/unknown sources display under General. Dev updates continue threading under the existing Dev root, as in your live SQL.

Use a height of about **800px** or more; the section scrolls inside its frame. The mention picker stays inside the frame, moves above the caret when necessary, and follows scrolling. General/Dev/Sales groups collapse independently. Search opens all groups, searches whole conversations including replies, authors, selected mention metadata, and filenames, and restores collapsed states when cleared.

### Plain text and imported HTML

Update and reply bodies automatically recognize common HTML markup. Plain text keeps its line breaks and literal comparison symbols. Imported HTML displays paragraphs, nonbreaking spaces, bold/italic text, lists, quotes, code, tables, and safe absolute web/email links. Mentions remain blue, including Teams `<at>` tags and known names split across inline formatting. Search uses decoded, visible text rather than raw tags.

Markup is parsed using [htmlparser2](https://github.com/fb55/htmlparser2) and rebuilt as a small allowlist of React elements; raw HTML is never injected. Scripts, event handlers, source styles, frames, forms, SVG, embedded media and body image tags are discarded. Attachments retain their separate file-card/thumbnail behavior. Plain text containing code-like recognized HTML tags is interpreted as HTML; escaped markup inside an HTML body remains literal text. The composer remains a textarea and stores the submitted text; this is display support for existing/imported HTML, not a rich-text toolbar. Stored database content is not rewritten.

## 2. Create two temporary states

- `updatesPostResult`, initial value `{}`.
- `updatesPostCheckpoint`, initial value `{}`.

The component exposes `hasPendingPost`. Disable your project selector/navigation while `{{ customProjectUpdates.hasPendingPost }}` is true. Drafts reset on a project change. This prevents losing a draft or retry checkpoint while a post is incomplete.

## 3. Update the two SQL queries

Replace the bodies of `qNewProjectUpdate` and `qNewUpdateReply` with the supplied files of the same names. They accept the additional-scope fields passed by the handler instead of reading the old textarea, tag select, or reply-selection state. Keep SQL prepared statements enabled. These scripts assume the existing table's `id` is a UUID primary key that permits explicit values, as the supplied parent-ID casts indicate; verify that schema in dev before enabling writes.

Both queries explicitly insert the component's stable `requestId` as the update ID. A retry returns the same existing row using `ON CONFLICT (id) DO NOTHING`; it cannot insert another row with that request ID. No new table column is needed. Reply inserts now persist `mentioned_users`, inherit the source from the submitted parent, require that parent to belong to the same workstream, and actually reference `actor_context` for audit settings.

## 4. Move the success logic into one handler

Create the JavaScript query **postProjectUpdate**, paste [postProjectUpdate.js](postProjectUpdate.js), and attach the component's **post** event to trigger it. Run this query only from that event, not automatically when inputs change.

**Disable the old posting/notification success handlers on both insert queries** when enabling this handler. The combined script awaits `qSendUpdateToTeamsDev` and `workflowSendTeamsNotification` itself; keeping the old handlers would send duplicates. Also remove old success actions that clear old UI or post additional inserts. Keep your existing query resource configurations and workflow implementations.

The script directly uses the query names you supplied:

- `qCheckProjectFolderRegistry`
- `qNewProjectUpdate` / `qNewUpdateReply`
- `qUploadUpdateFilesToSharePoint`
- `qLinkExistingUpdateFile` — create a SQL query using the supplied file of the same name; repairs a confirmed missing file/update association after upload
- `qSendUpdateToTeamsDev`
- `workflowSendTeamsNotification`
- `qProjectUpdates`, `qProjectReplies`, `qProjectUpdateFiles`

In **qCheckProjectFolderRegistry**, change any `selectedProjectRow.value.workstream_id` reference to `{{ workstreamId }}` so it checks the captured project passed in `additionalScope`. The upload, Dev, and notification queries must use their existing additional-scope inputs, not the removed components. If those queries use extra old-widget bindings, replace them with the matching scope fields. Leave the read queries bound to the selected project. Ensure workflows throw/reject on failure (or configure a failure condition); a resolved response containing an error must not count as a successful upload or notification.

The old `commitUpdateMention`, `parseUpdateMentions`, `selectedMentions`, `tempUpdateFiles`, `removedUploadFileKeys`, upload debug state, and old reply visibility/draft states are no longer used by this section. Recipients come directly from selected mention tokens, so names are not re-guessed with a two-word regex. `workflowSendTeamsNotification` receives `mentions: [{full_name,email}]` for updates **and replies**, matching your existing update notification path.

## 5. Attach refresh

Attach the component's **refresh** event to a JS query containing [refreshProjectUpdates.js](refreshProjectUpdates.js). This reloads all three read queries.

## Request and retry contract

### Saved attachment links and thumbnails

The `attachments` Inspector field must be bound to `{{ formatDataAsArray(qProjectUpdateFiles.data ?? {}) }}`. Running that query does not automatically bind its output to the component. [qProjectUpdateFiles.sql](qProjectUpdateFiles.sql) returns the expected metadata for all project updates and replies. Each file's `update_id` must match its actual saved update/reply `id`; files with a null or unrelated `update_id` cannot appear in that conversation. The renderer also accepts `updateId` and trims/case-normalizes IDs.

Saved files display as clickable cards using `sharepoint_web_url` (or `web_url`, `url`, `download_url`). Without a usable URL, a card shows **Link unavailable**. Optional `thumbnail_url`/`thumbnailUrl` supplies a preview; image files can also use an image `download_url` or `sharepoint_download_url`. A SharePoint page link is not an image thumbnail. The supplied SQL does not invent a thumbnail column: enrich its results with a SharePoint thumbnail/download URL if inline previews are needed. When previews are absent or blocked, a file-type tile and link remain. Selected raster images have local thumbnails before posting.

If a newly uploaded file returns `update_id: null`, the binding is not the issue: its metadata has no association to a conversation. The posting script already passes the saved update/reply ID in `additionalScope.updateId`. Compare the upload query's workflow body to [qUploadUpdateFilesToSharePoint.body.txt](qUploadUpdateFilesToSharePoint.body.txt), then trace that input into the workflow's file INSERT `update_id` column. The workflow export/INSERT is needed to identify its exact expression; it is not included in the AI app's local sources.

The supplied workflow INSERT was subsequently confirmed to omit `update_id`, even though `startTrigger.data.updateId` is populated. **Fix the workflow itself** using [workflowInsertProjectFile.sql](workflowInsertProjectFile.sql): it adds the `update_id` column and matching `{{ startTrigger.data.updateId ?? null }}::uuid` value, preserving the existing `final_scope` conflict clause. Publish the workflow change so normal app calls use it. Other project-level uploads may still leave this field null. The app-side link query is optional fallback/recovery once the workflow saves the association correctly; metadata verification still checks normal uploads. Existing null rows are not backfilled by changing this INSERT.

The revised posting handler reads back file metadata before marking each upload complete. If an uploaded file has no matching name/size/update ID, it retains an `awaitingFileLink` checkpoint and reports the missing link. Retry verifies this association again without uploading that already-successful file a second time. Configure the verification read query to fetch fresh data without query caching and include all file records for the selected project.

When the workflow returns `{data:{success:true,updateId,uploadedFiles:[{fileName,size,webUrl,updateId}]}}` (or the unwrapped body), the handler can complete the missing database association itself. Create **qLinkExistingUpdateFile** from [qLinkExistingUpdateFile.sql](qLinkExistingUpdateFile.sql) and use the current posting script. It matches the receipt's update ID, name, size, and SharePoint web URL to exactly one unlinked file row before updating that row. It refuses ambiguous matches and conflicting associations. A receipt's optional `fileId`/`file_id` can disambiguate if the workflow supplies the actual database file ID. Signed download URLs and raw `fileData` are not retained in the checkpoint.

The November 4 workflow response confirmed that file `2151677b-8bae-4862-af23-7671f98ff5a7` belongs to update `bd0667d6-7dd7-4d04-815f-620f1fd789a4`. [repairConfirmedAttachment.js](repairConfirmedAttachment.js) supplies that exact pairing to the SQL query and refreshes the file rows. Run it once in Retool after creating the SQL query; it does not upload another file. No other historical associations are inferred. These repair scripts have not been executed against the live database by this agent.

For an existing orphaned attachment, [qLinkExistingUpdateFile.sql](qLinkExistingUpdateFile.sql) repairs one **confirmed** file/update association, scoped to the same workstream and only when the old link is null. Supply exact `fileId`, `updateId`, `workstreamId` values. It is not run by the component or handler. Do not bulk-link historical null rows: ordinary project-level uploads can legitimately have no update ID.

### If Posting stays on after a successful query

Set the component's `postResult` Inspector field to `{{ updatesPostResult.value }}`. A successful `postProjectUpdate` run writes `{requestId, success:true}` there, but the component cannot see temporary states unless that field is bound. The updated handler also returns the same object, so `{{ postProjectUpdate.data ?? {} }}` is an alternative binding if you use the updated script.

The posting handler refreshes `qProjectUpdates`, `qProjectReplies`, and `qProjectUpdateFiles` directly. It does not trigger the separately named refresh-button query. Refresh stays available during a pending acknowledgment, except while read queries are loading. The updated `refreshProjectUpdates.js` also restores a completion acknowledgment from a matching, completed, inactive checkpoint; it never inserts another row or sends notifications.

If the completed post is already visible, correct the binding before trying another post. Do not repost the saved message to clear the UI. Legacy `repliesListView.data` expressions referencing an out-of-scope `item` should be removed or corrected separately when replacing the old UI.

`customProjectUpdates.postRequest` is an immutable snapshot for the current post:

```js
{
  requestId: 'uuid',
  contextId: 'workstream UUID',
  kind: 'update', // or 'reply'
  parentUpdateId: null, // parent UUID for replies
  text: 'Please review @Alex West',
  tag: 'general_retool',
  mentionedUsers: [{full_name: 'Alex West', email: 'alex@paradigm-esco.com'}],
  files: [{name: 'scope.pdf', sizeBytes: 1234, type: 'application/pdf', base64Data: '...'}],
  project: {workstream_id: '...', site_id: '...', project_id: '...', project_name: '...'}
}
```

Files use the same `name`, `sizeBytes`, `base64Data` shape as your live upload button; `type` contains the MIME type. Base64 excludes the data-URL prefix. Multiple picks merge by name/size, and removed files can be selected again. Same-name files with different contents must be renamed before attaching to avoid a SharePoint overwrite. Default size limit is 20 MB total before base64 encoding, which adds about one-third. Uploads are sent sequentially, one file per workflow call. Attachment-only updates and replies are allowed and still require the project folder.

`postResult` acknowledges a matching `requestId` with `{success:true}` or `{success:false,error,retryOnly}`. The UI keeps the draft and attachments until success. A pre-insert failure offers **Edit draft**. After an insert attempt, the snapshot stays locked and **Retry same post** reuses the ID; the checkpoint skips the saved row and confirmed upload/notification steps. A feed refresh failure after a successful save clears the draft and shows a refresh warning, instead of inviting a duplicate post.

The temporary checkpoint survives retries within this app session, not page reloads. The SQL provides row idempotency, but exactly-once delivery to external systems also requires workflow idempotency: SharePoint should use `(updateId, file name)` as the attachment key, and notification/Teams workflows should deduplicate by `(updateId, operation/recipient)`. If a workflow succeeds remotely but its response is lost, the handler cannot know that without such a backend guarantee. Do not manually clear the checkpoint during a failed post. If Retool execution is forcibly stopped, confirm the actual query/workflow status before clearing a stuck `busy` checkpoint.

## Dev validation before replacing the old section

Use a test project. Verify General and Dev posts, Dev root threading, a Sales post, multiple files and file removal/reselection, an attachment-only post, a reply with a mention and an attachment, blue mention rendering, and search matching reply text/filenames in a collapsed group. Check small widths and dark/light themes.

Force a missing-folder response, an upload failure, and a notification failure. Confirm drafts remain, Retry uses the same UUID, successful files/notifications are skipped, and only one database row is present. Check the saved reply's `mentioned_users` JSON and that the notification workflow receives email addresses. The supplied SQL and production workflows have not been executed by local unit tests.
