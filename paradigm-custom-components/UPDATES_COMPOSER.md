# Updates and replies in Retool

`UpdatesComposer` is a reusable plain-text composer with a caret-positioned mention list. It uses the AI-built MF SSOT app's `{ full_name, email }` mention format. Add separate instances for an update and for each reply editor. It does not replace your feed, tag selector, uploads, database queries, or Teams workflow.

## Install and configure

Run `npm run dev` for a development version or `npm run deploy` to publish this library. Select the resulting library version in your Retool app and add **UpdatesComposer**.

Set these Inspector properties (example instance name: `updateComposer`):

| Property      | Binding / purpose                                                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`       | `{{ formatDataAsArray(getMentionUsers.data) }}` using your actual user query name. Supply the full permitted directory, not just the old dropdown's search results. Rows can be `{full_name, email}` or `{label, value}` where value is the email. |
| `appTheme`    | `{{ theme }}`                                                                                                                                                                                                                                      |
| `contextId`   | `{{ String(selectedProjectId.value ?? '') }}` using your actual project selection                                                                                                                                                                  |
| `loading`     | `{{ postUpdate.isFetching }}` using the entire posting workflow's loading state                                                                                                                                                                    |
| `placeholder` | `Write an update… Type @ to mention someone`                                                                                                                                                                                                       |
| `submitLabel` | `Post update`                                                                                                                                                                                                                                      |
| `resetKey`    | Bind a temporary string state; change it after a successful post                                                                                                                                                                                   |

Give the component at least **310px height**. Suggestions stay inside its iframe, anchored to the caret where space permits and shifted inward at frame edges. The list scrolls. A Retool iframe cannot draw over adjacent native Retool components.

## Wire the submit event

Attach a **submit** event handler to trigger your existing posting JavaScript query. Read a single snapshot at the start of that query:

```js
const draft = updateComposer.submission;
// Adapt these names to the inputs of your existing query.
await newProjectUpdate.trigger({
  additionalScope: {
    updateText: draft.text,
    mentionedUsers: draft.mentionedUsers,
    projectId: draft.contextId,
    parentUpdateId: null,
  },
});
// Only after your posting workflow succeeds:
await updateComposerReset.setValue(draft.requestId);
```

Create `updateComposerReset` as a temporary state, with initial value `""`, and bind `resetKey` to `{{ updateComposerReset.value }}`. Configure the posting workflow to throw on failure; do not reset after a failed query. Preserve your existing tag, file, notification, and Teams inputs and side effects in that workflow. Disable project switching while a post is in flight. `submission` contains `{requestId, contextId, text, mentionedUsers}` and is captured before the submit event fires. The draft stays intact until `resetKey` or `contextId` changes.

The same component can be used as `replyComposer`: set `contextId` to the parent update ID, use `Post reply`, supply the same directory, and wire submit to your reply query. Pass the parent ID from `draft.contextId`; obtain the project ID from your existing project selection. Use a separate reset state for replies. Instances keep their own drafts and selected recipients.

If you keep your existing native Retool post buttons, set `showSubmit` to false and read `value` and `mentionedUsers` from the composer in those queries. The keyboard shortcut still emits `submit`, so wire that event to the same workflow. `change` is available for draft integrations.

## Mention behavior

Type `@`, filter by name or email, then click a person or use Up/Down and Enter. Escape dismisses suggestions; Enter otherwise inserts a newline. Ctrl/Cmd+Enter emits submit. Selected mentions insert `@Full Name` and expose deduplicated `{full_name, email}` recipients. Editing or removing a selected mention removes its recipient; typing a name manually does not create a recipient. The editor tracks selections rather than guessing recipients from names. Existing externally supplied text has no selected recipients until you choose them in the picker.

This is plain text: it does not emit HTML, rich text, or attachment contents. It provides mention metadata but does not itself send notifications. Verify the existing live app's posting query accepts this format before replacing the old composer.

## Acceptance check in Retool

Test both instances with your user directory and theme. Try a mention on the first line, wrapped lines, the middle of existing text, and after scrolling; navigate with the keyboard; select two people and delete one; confirm failed posts preserve the draft and successful posts reset it. Confirm the saved database row and notification recipients match the submitted snapshot. Check a narrow component and dark mode.
